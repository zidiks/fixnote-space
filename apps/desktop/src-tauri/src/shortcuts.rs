//! System-wide shortcuts: they work while the window is hidden in the tray or another app has
//! focus. The webview owns the bindings (Settings → Shortcuts, kept per device) and sends the
//! whole set with `global_shortcuts`; a press runs the same action as the tray menu item with that
//! id (`tray::chosen`: show the window, then `tray-action` to the webview), or shows/hides the
//! window ("toggle"). A shortcut another app already holds is reported back, not fatal.

use std::collections::HashMap;
use std::sync::Mutex;

use serde::{Deserialize, Serialize};
use tauri::plugin::TauriPlugin;
use tauri::{AppHandle, Manager, State, Wry};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};

/// The registered shortcuts by their id, and the action each runs.
#[derive(Default)]
pub struct Bound(Mutex<HashMap<u32, String>>);

pub fn plugin() -> TauriPlugin<Wry> {
    tauri_plugin_global_shortcut::Builder::new()
        .with_handler(|app, shortcut, event| {
            if event.state != ShortcutState::Pressed {
                return;
            }
            let action = app
                .state::<Bound>()
                .0
                .lock()
                .ok()
                .and_then(|bound| bound.get(&shortcut.id()).cloned());
            if let Some(action) = action {
                crate::tray::chosen(app, &action);
            }
        })
        .build()
}

/// One shortcut as the webview sends it: the action and its keys ("Control+Alt+KeyN").
#[derive(Deserialize)]
pub struct Item {
    id: String,
    keys: String,
}

/// A shortcut that could not be registered (taken by another app, or keys the OS cannot hold).
#[derive(Serialize)]
pub struct Failure {
    id: String,
    error: String,
}

/// Replaces every system-wide shortcut with `items` (none switches them all off).
#[tauri::command]
pub fn global_shortcuts(
    app: AppHandle,
    state: State<'_, Bound>,
    items: Vec<Item>,
) -> Result<Vec<Failure>, String> {
    let manager = app.global_shortcut();
    manager.unregister_all().map_err(|e| e.to_string())?;
    let mut bound = HashMap::new();
    let mut failed = Vec::new();
    for item in items {
        let result = item
            .keys
            .parse::<Shortcut>()
            .map_err(|e| e.to_string())
            .and_then(|shortcut| {
                manager
                    .register(shortcut)
                    .map(|()| shortcut)
                    .map_err(|e| e.to_string())
            });
        match result {
            Ok(shortcut) => {
                bound.insert(shortcut.id(), item.id);
            }
            Err(error) => failed.push(Failure { id: item.id, error }),
        }
    }
    *state.0.lock().map_err(|_| "shortcuts lock poisoned")? = bound;
    Ok(failed)
}
