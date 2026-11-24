//! Makes the webview behave like an app window rather than a browser tab.

/// WebView2 handles browser shortcuts (Ctrl+P print, Ctrl+F find, F5 reload, Ctrl+± zoom, F12)
/// before the page can cancel them. Editing keys (copy, paste, undo, select all) are not affected.
/// Dev tools stay reachable in debug builds through Shift+right-click → Inspect.
#[cfg(windows)]
pub fn disable_browser_shortcuts(window: &tauri::WebviewWindow) {
    use webview2_com::Microsoft::Web::WebView2::Win32::ICoreWebView2Settings3;
    use windows_core::Interface;

    let _ = window.with_webview(|webview| {
        // SAFETY: plain COM calls on the live controller Tauri hands us, on its UI thread.
        unsafe {
            let Ok(core) = webview.controller().CoreWebView2() else {
                return;
            };
            let Ok(settings) = core.Settings() else {
                return;
            };
            if let Ok(settings) = settings.cast::<ICoreWebView2Settings3>() {
                let _ = settings.SetAreBrowserAcceleratorKeysEnabled(false);
            }
        }
    });
}

/// WKWebView (macOS) and WebKitGTK (Linux) have no browser shortcuts of their own.
#[cfg(not(windows))]
pub fn disable_browser_shortcuts(_window: &tauri::WebviewWindow) {}

/// Verifies that a WebView2 permission request originates from the bundled app itself
/// (`tauri.localhost`, or `http://localhost` during debug builds).
#[cfg(any(windows, test))]
fn is_app_origin(uri: &str) -> bool {
    let Ok(url) = reqwest::Url::parse(uri) else {
        return false;
    };
    let Some(host) = url.host_str() else {
        return false;
    };
    let is_tauri_origin = matches!(url.scheme(), "http" | "https")
        && host.eq_ignore_ascii_case("tauri.localhost")
        && url.port().is_none();
    let is_dev_localhost =
        cfg!(debug_assertions) && url.scheme() == "http" && host.eq_ignore_ascii_case("localhost");
    is_tauri_origin || is_dev_localhost
}

/// Dictation needs the microphone. The page is the app itself, so WebView2's browser-style
/// "allow this site?" prompt makes no sense; Windows still shows its own privacy indicator and
/// honors the system microphone setting. Other permissions keep the default prompt.
#[cfg(windows)]
pub fn grant_microphone(window: &tauri::WebviewWindow) {
    use webview2_com::Microsoft::Web::WebView2::Win32::{
        COREWEBVIEW2_PERMISSION_KIND, COREWEBVIEW2_PERMISSION_KIND_MICROPHONE,
        COREWEBVIEW2_PERMISSION_STATE_ALLOW,
    };
    use webview2_com::PermissionRequestedEventHandler;

    let _ = window.with_webview(|webview| {
        // SAFETY: plain COM calls on the live controller Tauri hands us, on its UI thread.
        unsafe {
            let Ok(core) = webview.controller().CoreWebView2() else {
                return;
            };
            let handler = PermissionRequestedEventHandler::create(Box::new(|_, args| {
                let Some(args) = args else { return Ok(()) };
                let mut kind = COREWEBVIEW2_PERMISSION_KIND::default();
                args.PermissionKind(&mut kind)?;
                if kind == COREWEBVIEW2_PERMISSION_KIND_MICROPHONE {
                    let mut uri = windows_core::PWSTR::null();
                    args.Uri(&mut uri)?;
                    let uri = webview2_com::take_pwstr(uri);
                    if is_app_origin(&uri) {
                        args.SetState(COREWEBVIEW2_PERMISSION_STATE_ALLOW)?;
                    }
                }
                Ok(())
            }));
            let mut token = 0i64;
            let _ = core.add_PermissionRequested(&handler, &mut token);
        }
    });
}

/// WebKitGTK and WKWebView ask through their own system dialogs.
#[cfg(not(windows))]
pub fn grant_microphone(_window: &tauri::WebviewWindow) {}

/// Hints WebView2 to lower its memory usage while hidden in the tray, and restores normal mode
/// when shown again. Older runtimes without `ICoreWebView2_19` safely ignore the cast.
#[cfg(windows)]
pub fn set_low_memory(window: &tauri::WebviewWindow, low: bool) {
    use webview2_com::Microsoft::Web::WebView2::Win32::{
        ICoreWebView2_19, COREWEBVIEW2_MEMORY_USAGE_TARGET_LEVEL_LOW,
        COREWEBVIEW2_MEMORY_USAGE_TARGET_LEVEL_NORMAL,
    };
    use windows_core::Interface;

    let level = if low {
        COREWEBVIEW2_MEMORY_USAGE_TARGET_LEVEL_LOW
    } else {
        COREWEBVIEW2_MEMORY_USAGE_TARGET_LEVEL_NORMAL
    };
    let _ = window.with_webview(move |webview| {
        // SAFETY: plain COM calls on the live controller Tauri hands us, on its UI thread.
        unsafe {
            let Ok(core) = webview.controller().CoreWebView2() else {
                return;
            };
            if let Ok(core19) = core.cast::<ICoreWebView2_19>() {
                let _ = core19.SetMemoryUsageTargetLevel(level);
            }
        }
    });
}

/// WKWebView (macOS) and WebKitGTK (Linux) manage background memory pressure on their own.
#[cfg(not(windows))]
pub fn set_low_memory(_window: &tauri::WebviewWindow, _low: bool) {}

#[cfg(test)]
mod tests {
    use super::is_app_origin;

    #[test]
    fn validates_app_origins_for_microphone() {
        assert!(is_app_origin("http://tauri.localhost/"));
        assert!(is_app_origin("https://tauri.localhost/notes"));
        assert!(!is_app_origin("https://tauri.localhost.evil.com/"));
        assert!(!is_app_origin("http://tauri.localhost:8080/"));
        assert!(!is_app_origin("https://example.com/"));
        assert!(!is_app_origin("file:///C:/index.html"));
        assert_eq!(
            is_app_origin("http://localhost:5173/"),
            cfg!(debug_assertions)
        );
    }
}
