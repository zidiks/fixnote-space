//! Streaming HTTP for the webview: LLM providers the user configured (their own API key, Ollama on
//! localhost) answer with server-sent events, and browsers would block most of them (CORS, a
//! plain-http localhost from the app origin). The UI wraps this into a fetch-like Response.

use std::collections::HashMap;
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::{Arc, Mutex, OnceLock};
use std::time::Duration;

use base64::Engine;
use serde::{Deserialize, Serialize};
use tauri::ipc::Channel;
use tokio::sync::Notify;

#[derive(Deserialize)]
pub struct HttpRequest {
    url: String,
    method: String,
    headers: Vec<(String, String)>,
    body: Option<String>,
}

#[derive(Serialize, Clone)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum HttpEvent {
    Head {
        status: u16,
        headers: Vec<(String, String)>,
    },
    /// Base64 bytes, exactly as received.
    Chunk {
        data: String,
    },
    End,
    Error {
        message: String,
    },
}

fn cancels() -> &'static Mutex<HashMap<u32, Arc<Notify>>> {
    static MAP: OnceLock<Mutex<HashMap<u32, Arc<Notify>>>> = OnceLock::new();
    MAP.get_or_init(|| Mutex::new(HashMap::new()))
}

static NEXT: AtomicU32 = AtomicU32::new(1);

fn client() -> Result<&'static reqwest::Client, String> {
    static CLIENT: OnceLock<reqwest::Client> = OnceLock::new();
    if let Some(c) = CLIENT.get() {
        return Ok(c);
    }
    let c = reqwest::Client::builder()
        .connect_timeout(Duration::from_secs(10))
        .build()
        .map_err(|e| e.to_string())?;
    Ok(CLIENT.get_or_init(|| c))
}

/// Starts a request and returns its id at once; events follow on `events`.
#[tauri::command]
pub fn http_stream(request: HttpRequest, events: Channel<HttpEvent>) -> Result<u32, String> {
    let url = reqwest::Url::parse(&request.url).map_err(|e| e.to_string())?;
    if !matches!(url.scheme(), "http" | "https") {
        return Err("only http and https".into());
    }
    let method =
        reqwest::Method::from_bytes(request.method.as_bytes()).map_err(|e| e.to_string())?;
    let mut builder = client()?.request(method, url);
    for (name, value) in &request.headers {
        builder = builder.header(name, value);
    }
    if let Some(body) = request.body {
        builder = builder.body(body);
    }
    let id = NEXT.fetch_add(1, Ordering::Relaxed);
    let stop = Arc::new(Notify::new());
    cancels()
        .lock()
        .map_err(|_| "lock")?
        .insert(id, stop.clone());

    tauri::async_runtime::spawn(async move {
        let outcome = tokio::select! {
            r = pump(builder, |e| events.send(e).is_ok()) => r,
            () = stop.notified() => Err("aborted".into()),
        };
        let _ = events.send(match outcome {
            Ok(()) => HttpEvent::End,
            Err(message) => HttpEvent::Error { message },
        });
        if let Ok(mut map) = cancels().lock() {
            map.remove(&id);
        }
    });
    Ok(id)
}

/// Sends the request and forwards the head and body chunks; `send` returns false once the UI is
/// gone, which ends the stream.
async fn pump(
    builder: reqwest::RequestBuilder,
    send: impl Fn(HttpEvent) -> bool,
) -> Result<(), String> {
    let mut res = builder.send().await.map_err(|e| e.to_string())?;
    let headers = res
        .headers()
        .iter()
        .filter_map(|(k, v)| Some((k.to_string(), v.to_str().ok()?.to_string())))
        .collect();
    if !send(HttpEvent::Head {
        status: res.status().as_u16(),
        headers,
    }) {
        return Ok(());
    }
    while let Some(chunk) = res.chunk().await.map_err(|e| e.to_string())? {
        let data = base64::engine::general_purpose::STANDARD.encode(&chunk);
        if !send(HttpEvent::Chunk { data }) {
            break;
        }
    }
    Ok(())
}

/// Stops a running request (the Stop button); dropping the response closes the connection.
#[tauri::command]
pub fn http_cancel(id: u32) {
    if let Some(stop) = cancels().lock().ok().and_then(|mut m| m.remove(&id)) {
        stop.notify_one();
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::{Read, Write};
    use std::sync::Mutex as StdMutex;

    #[test]
    fn streams_head_and_chunks_from_a_local_server() {
        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let port = listener.local_addr().unwrap().port();
        std::thread::spawn(move || {
            let (mut sock, _) = listener.accept().unwrap();
            let mut buf = [0u8; 2048];
            let n = sock.read(&mut buf).unwrap();
            assert!(String::from_utf8_lossy(&buf[..n]).contains("authorization: Bearer k"));
            sock.write_all(b"HTTP/1.1 200 OK\r\ncontent-type: text/event-stream\r\ntransfer-encoding: chunked\r\n\r\n").unwrap();
            for part in ["data: {\"a\":1}\n\n", "data: [DONE]\n\n"] {
                write!(sock, "{:x}\r\n{part}\r\n", part.len()).unwrap();
                sock.flush().unwrap();
            }
            sock.write_all(b"0\r\n\r\n").unwrap();
        });
        let events = StdMutex::new(Vec::new());
        let builder = reqwest::Client::new()
            .post(format!("http://127.0.0.1:{port}/v1/chat/completions"))
            .header("Authorization", "Bearer k")
            .body("{}");
        tauri::async_runtime::block_on(pump(builder, |e| {
            events.lock().unwrap().push(e);
            true
        }))
        .unwrap();
        let events = events.into_inner().unwrap();
        let HttpEvent::Head { status, headers } = &events[0] else {
            panic!("no head")
        };
        assert_eq!(*status, 200);
        assert!(headers
            .iter()
            .any(|(k, v)| k == "content-type" && v == "text/event-stream"));
        let body: Vec<u8> = events[1..]
            .iter()
            .filter_map(|e| match e {
                HttpEvent::Chunk { data } => Some(
                    base64::engine::general_purpose::STANDARD
                        .decode(data)
                        .unwrap(),
                ),
                _ => None,
            })
            .flatten()
            .collect();
        assert_eq!(
            String::from_utf8(body).unwrap(),
            "data: {\"a\":1}\n\ndata: [DONE]\n\n"
        );
    }
}
