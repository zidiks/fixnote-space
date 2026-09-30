//! The tray (Windows) or menu bar (macOS) icon. Closing the window only hides it: a call being
//! recorded goes on, and the app keeps syncing. The icon's menu opens the app, has quick actions
//! (a new note, dictation, today's note, search, a call summary) and quits; while a call is being
//! recorded, quitting asks first (the webview shows the question, see `DesktopTray`). The webview
//! sends the menu in the app's language and with the call's state (`tray_menu`), and gets the
//! chosen action back as a `tray-action` event.

use serde::Deserialize;
use tauri::menu::{Menu, MenuBuilder, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager, Wry};

const ID: &str = "main";

pub fn create(app: &AppHandle) -> tauri::Result<()> {
    let open = MenuItem::with_id(app, "open", "Open FixNote", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit FixNote", true, None::<&str>)?;
    let menu = MenuBuilder::new(app)
        .item(&open)
        .separator()
        .item(&quit)
        .build()?;
    let mut tray = TrayIconBuilder::with_id(ID)
        .tooltip("FixNote")
        .menu(&menu)
        // On macOS a menu bar icon opens its menu; on Windows a click opens the app.
        .show_menu_on_left_click(cfg!(target_os = "macos"))
        .on_menu_event(|app, event| chosen(app, event.id().as_ref()))
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                if !cfg!(target_os = "macos") {
                    show(tray.app_handle());
                }
            }
        });
    if cfg!(target_os = "macos") {
        // A black shape that macOS tints for light and dark menu bars.
        tray = tray
            .icon(tauri::image::Image::from_bytes(include_bytes!(
                "../icons/tray-template.png"
            ))?)
            .icon_as_template(true);
    } else if let Some(icon) = app.default_window_icon() {
        tray = tray.icon(icon.clone());
    }
    tray.build(app)?;
    Ok(())
}

fn chosen(app: &AppHandle, id: &str) {
    match id {
        "open" => show(app),
        "quit" => quit(app),
        action => {
            // A call starts in the background (the person is in the call app); everything else,
            // ending a call included, shows the window where it happens.
            if action != "call" || crate::system_audio::recording() {
                show(app);
            }
            let _ = app.emit("tray-action", action);
        }
    }
}

/// Brings the window back (from the tray, the Dock, minimized, or a second launch).
pub fn show(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

/// Quits, unless a call is being recorded: then the app asks first.
pub fn quit(app: &AppHandle) {
    if crate::system_audio::recording() {
        ask_to_quit(app);
    } else {
        app.exit(0);
    }
}

pub fn ask_to_quit(app: &AppHandle) {
    show(app);
    let _ = app.emit("quit-requested", ());
}

/// One line of the menu, as the webview describes it; no `id` is a separator.
#[derive(Deserialize)]
pub struct Item {
    id: Option<String>,
    #[serde(default)]
    text: String,
    #[serde(default = "enabled")]
    enabled: bool,
}

fn enabled() -> bool {
    true
}

fn build(app: &AppHandle, items: &[Item]) -> tauri::Result<Menu<Wry>> {
    let mut menu = MenuBuilder::new(app);
    for item in items {
        menu = match &item.id {
            Some(id) => menu.item(&MenuItem::with_id(
                app,
                id,
                &item.text,
                item.enabled,
                None::<&str>,
            )?),
            None => menu.item(&PredefinedMenuItem::separator(app)?),
        };
    }
    menu.build()
}

/// The menu in the app's language, with the call's state; the tooltip says what is going on.
#[tauri::command]
pub fn tray_menu(app: AppHandle, items: Vec<Item>, tooltip: String) -> Result<(), String> {
    let tray = app.tray_by_id(ID).ok_or("no tray")?;
    let menu = build(&app, &items).map_err(|e| e.to_string())?;
    tray.set_menu(Some(menu)).map_err(|e| e.to_string())?;
    tray.set_tooltip(Some(tooltip)).map_err(|e| e.to_string())
}

/// The person confirmed quitting during a call.
#[tauri::command]
pub fn app_quit(app: AppHandle) {
    app.exit(0);
}
