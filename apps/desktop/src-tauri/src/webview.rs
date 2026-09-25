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
