//! Fetches a web page for a link card. The desktop app reads pages itself, so no server learns
//! which links a note contains. Only the page's metadata is used (parsed in packages/core).

use std::net::{IpAddr, Ipv4Addr, Ipv6Addr, SocketAddr};
use std::sync::OnceLock;
use std::time::Duration;

use serde::Serialize;

/// Enough of a page to find its <head>; the rest is never read.
const MAX_BYTES: usize = 512 * 1024;
const MAX_REDIRECTS: usize = 5;
const TIMEOUT: Duration = Duration::from_secs(8);
const USER_AGENT: &str = "Mozilla/5.0 (compatible; Fixnote/1.0; +https://fixnote.space)";

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FetchedPage {
    url: String,
    content_type: String,
    html: Option<String>,
}

fn base_client_builder() -> reqwest::ClientBuilder {
    reqwest::Client::builder()
        .timeout(TIMEOUT)
        .redirect(reqwest::redirect::Policy::none())
        .user_agent(USER_AGENT)
}

fn shared_client() -> Result<&'static reqwest::Client, String> {
    static CLIENT: OnceLock<reqwest::Client> = OnceLock::new();
    if let Some(c) = CLIENT.get() {
        return Ok(c);
    }
    let c = base_client_builder().build().map_err(|e| e.to_string())?;
    Ok(CLIENT.get_or_init(|| c))
}

fn is_public_v4(v4: Ipv4Addr) -> bool {
    let o = v4.octets();
    !(o[0] == 0
        || v4.is_loopback()
        || v4.is_private()
        || v4.is_link_local()
        || v4.is_broadcast()
        || v4.is_multicast()
        || v4.is_documentation()
        || (o[0] == 100 && (o[1] & 0b1100_0000) == 64)
        || (o[0] == 192 && o[1] == 0 && o[2] == 0)
        || (o[0] == 198 && (o[1] == 18 || o[1] == 19))
        || o[0] >= 240)
}

fn is_public_v6(v6: Ipv6Addr) -> bool {
    if let Some(v4) = v6.to_ipv4_mapped() {
        return is_public_v4(v4);
    }
    let seg = v6.segments();
    if v6.is_unspecified()
        || v6.is_loopback()
        || v6.is_multicast()
        || (seg[0] & 0xfe00) == 0xfc00
        || (seg[0] & 0xffc0) == 0xfe80
        || (seg[0] & 0xffc0) == 0xfec0
        || seg[..6] == [0, 0, 0, 0, 0, 0]
        || seg[..6] == [0x0064, 0xff9b, 0, 0, 0, 0]
        || (seg[0] == 0x0064 && seg[1] == 0xff9b && seg[2] == 0x0001)
        || (seg[0] == 0x2001 && seg[1] == 0x0db8)
        || (seg[0] == 0x3fff && (seg[1] & 0xf000) == 0)
        || (seg[0] == 0x2001 && seg[1] == 0x0002 && seg[2] == 0)
        || (seg[0] == 0x2001 && (seg[1] & 0xfff0) == 0x0010)
        || (seg[0] == 0x2001 && (seg[1] & 0xfff0) == 0x0020)
    {
        return false;
    }
    if seg[0] == 0x2002 {
        let embedded = Ipv4Addr::from((u32::from(seg[1]) << 16) | u32::from(seg[2]));
        return is_public_v4(embedded);
    }
    (seg[0] & 0xe000) == 0x2000
}

fn is_public_ip(ip: IpAddr) -> bool {
    match ip {
        IpAddr::V4(v4) => is_public_v4(v4),
        IpAddr::V6(v6) => is_public_v6(v6),
    }
}

/// Validates scheme, absence of embedded credentials, allowed port, and host rules.
/// Returns `(host_str, port, is_ip_literal)`.
fn validate_url(url: &reqwest::Url) -> Result<(String, u16, bool), String> {
    if !matches!(url.scheme(), "http" | "https") {
        return Err("only http and https links".into());
    }
    if !url.username().is_empty() || url.password().is_some() {
        return Err("credentials in URL are not allowed".into());
    }
    let port = url
        .port_or_known_default()
        .ok_or_else(|| "missing port".to_string())?;
    if !matches!(port, 80 | 443 | 8080 | 8443) {
        return Err("port not allowed".into());
    }
    let host = url.host_str().ok_or_else(|| "missing host".to_string())?;
    let unbracketed = host
        .strip_prefix('[')
        .and_then(|h| h.strip_suffix(']'))
        .unwrap_or(host);
    if let Ok(ip) = unbracketed.parse::<IpAddr>() {
        if !is_public_ip(ip) {
            return Err("private or local address".into());
        }
        return Ok((host.to_owned(), port, true));
    }
    let normalized = host.trim_end_matches('.').to_ascii_lowercase();
    if normalized.is_empty()
        || normalized == "localhost"
        || normalized.ends_with(".localhost")
        || normalized.ends_with(".local")
    {
        return Err("local host not allowed".into());
    }
    Ok((host.to_owned(), port, false))
}

#[tauri::command]
pub async fn fetch_page(url: String) -> Result<FetchedPage, String> {
    let mut current = reqwest::Url::parse(&url).map_err(|e| e.to_string())?;
    let mut res = None;

    for hops in 0..=MAX_REDIRECTS {
        let (host, port, is_ip) = validate_url(&current)?;
        let response = if is_ip {
            shared_client()?
                .get(current.clone())
                .header(
                    "Accept",
                    "text/html,application/xhtml+xml,image/*;q=0.8,*/*;q=0.5",
                )
                .send()
                .await
                .map_err(|e| e.to_string())?
        } else {
            let addrs: Vec<SocketAddr> = tokio::net::lookup_host((host.as_str(), port))
                .await
                .map_err(|e| e.to_string())?
                .collect();
            if addrs.is_empty() {
                return Err("could not resolve host".into());
            }
            if addrs.iter().any(|addr| !is_public_ip(addr.ip())) {
                return Err("private or local address".into());
            }
            // Pin the validated addresses on this hop to defeat DNS rebinding.
            let pinned = base_client_builder()
                .resolve_to_addrs(&host, &addrs)
                .build()
                .map_err(|e| e.to_string())?;
            pinned
                .get(current.clone())
                .header(
                    "Accept",
                    "text/html,application/xhtml+xml,image/*;q=0.8,*/*;q=0.5",
                )
                .send()
                .await
                .map_err(|e| e.to_string())?
        };

        if response.status().is_redirection() {
            if let Some(location) = response
                .headers()
                .get(reqwest::header::LOCATION)
                .and_then(|v| v.to_str().ok())
            {
                if hops == MAX_REDIRECTS {
                    return Err("too many redirects".into());
                }
                current = current.join(location).map_err(|e| e.to_string())?;
                continue;
            }
        }
        res = Some(response);
        break;
    }

    let mut res = res.ok_or_else(|| "too many redirects".to_string())?;
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
        return Ok(FetchedPage {
            url: final_url,
            content_type,
            html: None,
        });
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
        assert!(contains_head_end(
            b"<html><HEAD><title>x</title></Head><body>"
        ));
        assert!(!contains_head_end(b"<html><head><title>x</title>"));
    }

    #[test]
    fn rejects_non_public_ips() {
        for blocked in [
            "0.0.0.0",
            "0.1.2.3",
            "127.0.0.1",
            "10.0.0.1",
            "172.16.0.1",
            "172.31.255.254",
            "192.168.1.1",
            "169.254.169.254",
            "100.64.0.1",
            "100.127.255.254",
            "224.0.0.1",
            "255.255.255.255",
            "192.0.2.1",
            "198.51.100.1",
            "203.0.113.1",
            "::",
            "::1",
            "fe80::1",
            "fc00::1",
            "fd12:3456::1",
            "ff02::1",
            "2001:db8::1",
            "::ffff:127.0.0.1",
            "::ffff:10.0.0.1",
            "::ffff:169.254.169.254",
            "::ffff:100.64.0.1",
            "2002:7f00:0001::1",
        ] {
            let ip: IpAddr = blocked.parse().unwrap();
            assert!(!is_public_ip(ip), "expected {blocked} to be rejected");
        }
        for allowed in [
            "1.1.1.1",
            "8.8.8.8",
            "93.184.216.34",
            "100.128.0.1",
            "2606:4700:4700::1111",
            "2001:4860:4860::8888",
            "::ffff:93.184.216.34",
        ] {
            let ip: IpAddr = allowed.parse().unwrap();
            assert!(is_public_ip(ip), "expected {allowed} to be allowed");
        }
    }

    #[test]
    fn validates_urls_against_ssrf_rules() {
        for bad in [
            "file:///etc/passwd",
            "ftp://example.com/",
            "https://user:pass@example.com/",
            "https://user@example.com/",
            "http://example.com:22/",
            "http://example.com:6379/",
            "http://localhost/",
            "http://localhost./",
            "http://app.localhost/",
            "http://printer.local/",
            "http://127.0.0.1/",
            "http://169.254.169.254/latest/meta-data/",
            "http://[::1]/",
            "http://[::ffff:127.0.0.1]/",
        ] {
            let parsed = reqwest::Url::parse(bad).unwrap();
            assert!(validate_url(&parsed).is_err(), "expected {bad} to fail");
        }
        for good in [
            "https://example.com/",
            "http://example.com:8080/page",
            "https://example.com:8443/page",
            "https://93.184.216.34/",
        ] {
            let parsed = reqwest::Url::parse(good).unwrap();
            assert!(validate_url(&parsed).is_ok(), "expected {good} to pass");
        }
    }
}
