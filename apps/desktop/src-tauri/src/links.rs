//! Fetches a web page for a link card. The desktop app reads pages itself, so no server learns
//! which links a note contains. Only the page's metadata is used (parsed in packages/core).

use std::time::Duration;

use serde::Serialize;

/// Enough of a page to find its <head>; the rest is never read.
const MAX_BYTES: usize = 512 * 1024;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FetchedPage {
    url: String,
    content_type: String,
    html: Option<String>,
}

#[tauri::command]
pub async fn fetch_page(url: String) -> Result<FetchedPage, String> {
    let parsed = reqwest::Url::parse(&url).map_err(|e| e.to_string())?;
    if !matches!(parsed.scheme(), "http" | "https") {
        return Err("only http and https links".into());
    }
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(8))
        .redirect(reqwest::redirect::Policy::limited(5))
        .user_agent("Mozilla/5.0 (compatible; FixNote/1.0; +https://fixnote.space)")
        .build()
        .map_err(|e| e.to_string())?;
    let mut res = client
        .get(parsed)
        .header("Accept", "text/html,application/xhtml+xml,image/*;q=0.8,*/*;q=0.5")
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if !res.status().is_success() {
        return Err(format!("HTTP {}", res.status().as_u16()));
    }
    let final_url = res.url().to_string();
    let content_type = res
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("")
        .to_string();
    if !content_type.to_ascii_lowercase().contains("html") {
        return Ok(FetchedPage { url: final_url, content_type, html: None });
    }
    let mut body = Vec::new();
    while let Some(chunk) = res.chunk().await.map_err(|e| e.to_string())? {
        body.extend_from_slice(&chunk);
        if body.len() >= MAX_BYTES || contains_head_end(&body) {
            break;
        }
    }
    body.truncate(MAX_BYTES);
    Ok(FetchedPage {
        url: final_url,
        content_type,
        html: Some(String::from_utf8_lossy(&body).into_owned()),
    })
}

fn contains_head_end(body: &[u8]) -> bool {
    body.windows(7).any(|w| w.eq_ignore_ascii_case(b"</head>"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn finds_the_end_of_head_in_any_case() {
        assert!(contains_head_end(b"<html><HEAD><title>x</title></Head><body>"));
        assert!(!contains_head_end(b"<html><head><title>x</title>"));
    }
}
