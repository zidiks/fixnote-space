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
                    args.SetState(COREWEBVIEW2_PERMISSION_STATE_ALLOW)?;
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
