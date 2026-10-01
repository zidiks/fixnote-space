//! fixnote:// links. After paying, the page the browser lands on opens `fixnote://billing/success`,
//! which brings the app back to the front. Links wait here until the webview takes them
//! (`deep_links_take`), so the one that started the app is not lost while the page loads. What a
//! link means is up to the webview; any page can open one, so it only ever triggers a check.

use std::sync::Mutex;

use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_deep_link::DeepLinkExt;

#[derive(Default)]
pub struct Pending(Mutex<Vec<String>>);

/// Links of ours only, and only a few: nothing else is worth keeping.
const SCHEME: &str = "fixnote:";
const MAX_PENDING: usize = 8;

pub fn setup(app: &tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    app.manage(Pending::default());
    // The installers (NSIS, WiX, the bundle's Info.plist, the MSIX manifest) register the scheme;
    // a dev build and Linux packages register it when they start.
    #[cfg(any(target_os = "linux", all(windows, debug_assertions)))]
    app.deep_link().register_all()?;
    let handle = app.handle().clone();
    app.deep_link().on_open_url(move |event| {
        let urls = event.urls().iter().map(ToString::to_string).collect();
        receive(&handle, urls, true);
    });
    // Started by a link (Windows, Linux): the window shows by itself once the page is drawn.
    if let Some(urls) = app.deep_link().get_current()? {
        receive(
            app.handle(),
            urls.iter().map(ToString::to_string).collect(),
            false,
        );
    }
    Ok(())
}

fn receive(app: &AppHandle, urls: Vec<String>, show: bool) {
    let ours: Vec<String> = urls
        .into_iter()
        .filter(|url| url.starts_with(SCHEME))
        .collect();
    if ours.is_empty() {
        return;
    }
    if let Some(pending) = app.try_state::<Pending>() {
        let mut list = pending.0.lock().unwrap_or_else(|e| e.into_inner());
        list.extend(ours);
        let extra = list.len().saturating_sub(MAX_PENDING);
        list.drain(..extra);
    }
    if show {
        crate::tray::show(app);
    }
    let _ = app.emit("deep-link", ());
}

/// The links that came since the last call.
#[tauri::command]
pub fn deep_links_take(pending: State<'_, Pending>) -> Vec<String> {
    std::mem::take(&mut *pending.0.lock().unwrap_or_else(|e| e.into_inner()))
}
