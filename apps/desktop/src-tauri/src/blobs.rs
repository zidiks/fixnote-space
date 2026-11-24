//! Attachment bytes in the app-data folder (`blobs/`), one file per key. The database keeps the
//! metadata; this is just storage the webview cannot reach on its own.

use std::path::PathBuf;

use tauri::ipc::{InvokeBody, Request, Response};
use tauri::Manager;

/// "att/<id>" → "att_<id>": flat, and never a path outside the folder.
fn file_name(key: &str) -> Result<String, String> {
    if key.is_empty() || key.len() > 200 {
        return Err("bad blob key".into());
    }
    let name = key
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || c == '-' || c == '_' || c == '.' {
                c
            } else {
                '_'
            }
        })
        .collect::<String>()
        .trim_start_matches('.')
        .to_owned();
    if name.is_empty() {
        return Err("bad blob key".into());
    }
    Ok(name)
}

fn dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    Ok(app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("blobs"))
}

fn key_header(request: &Request<'_>) -> Result<String, String> {
    request
        .headers()
        .get("x-blob-key")
        .and_then(|v| v.to_str().ok())
        .map(str::to_owned)
        .ok_or_else(|| "missing x-blob-key".into())
}

/// Body: raw bytes. Header `x-blob-key`.
#[tauri::command]
pub async fn blob_put(app: tauri::AppHandle, request: Request<'_>) -> Result<(), String> {
    let InvokeBody::Raw(data) = request.body() else {
        return Err("expected raw bytes".into());
    };
    let dir = dir(&app)?;
    let name = file_name(&key_header(&request)?)?;
    let bytes = data.clone();
    tokio::task::spawn_blocking(move || {
        std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
        let target = dir.join(name);
        // Write then rename, so a crash never leaves half a file under the real name.
        let tmp = target.with_extension("part");
        std::fs::write(&tmp, bytes).map_err(|e| e.to_string())?;
        std::fs::rename(tmp, target).map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Raw bytes, or the error "missing".
#[tauri::command]
pub async fn blob_get(app: tauri::AppHandle, key: String) -> Result<Response, String> {
    let target = dir(&app)?.join(file_name(&key)?);
    let bytes = tokio::task::spawn_blocking(move || match std::fs::read(target) {
        Ok(bytes) => Ok(bytes),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Err("missing".into()),
        Err(e) => Err(e.to_string()),
    })
    .await
    .map_err(|e| e.to_string())??;
    Ok(Response::new(bytes))
}

#[tauri::command]
pub async fn blob_delete(app: tauri::AppHandle, key: String) -> Result<(), String> {
    let target = dir(&app)?.join(file_name(&key)?);
    tokio::task::spawn_blocking(move || match std::fs::remove_file(target) {
        Err(e) if e.kind() != std::io::ErrorKind::NotFound => Err(e.to_string()),
        _ => Ok(()),
    })
    .await
    .map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::file_name;

    #[test]
    fn keys_stay_inside_the_folder() {
        assert_eq!(file_name("att/abc-1").unwrap(), "att_abc-1");
        assert_eq!(file_name("../../etc/passwd").unwrap(), "_.._etc_passwd");
        assert!(file_name("..").is_err());
        assert!(file_name("").is_err());
    }
}
