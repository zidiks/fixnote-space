//! The tray (Windows) or menu bar (macOS) icon. Closing the window only hides it: a call being
//! recorded goes on, and the app keeps syncing. Quitting is in the icon's menu; while a call is
//! being recorded the app asks first (the webview shows the question, see `QuitDialog`).

use tauri::menu::{MenuBuilder, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager, State, Wry};

/// The menu items, relabeled in the app's language once the webview knows it.
pub struct TrayItems {
    open: MenuItem<Wry>,
    quit: MenuItem<Wry>,
}

pub fn create(app: &AppHandle) -> tauri::Result<()> {
    let open_item = MenuItem::with_id(app, "open", "Open FixNote", true, None::<&str>)?;
    let quit_item = MenuItem::with_id(app, "quit", "Quit FixNote", true, None::<&str>)?;
    let menu = MenuBuilder::new(app)
        .item(&open_item)
        .separator()
        .item(&quit_item)
        .build()?;
    let mut tray = TrayIconBuilder::with_id("main")
        .tooltip("FixNote")
        .menu(&menu)
        // On macOS a menu bar icon opens its menu; on Windows a click opens the app.
        .show_menu_on_left_click(cfg!(target_os = "macos"))
        .on_menu_event(|app, event| match event.id().as_ref() {
            "open" => show(app),
            "quit" => quit(app),
            _ => {}
        })
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
    app.manage(TrayItems {
        open: open_item,
        quit: quit_item,
    });
    Ok(())
}

/// Brings the window back (from the tray, the Dock, or minimized).
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

#[tauri::command]
pub fn tray_labels(items: State<'_, TrayItems>, open: String, quit: String) {
    let _ = items.open.set_text(open);
    let _ = items.quit.set_text(quit);
}

/// The person confirmed quitting during a call.
#[tauri::command]
pub fn app_quit(app: AppHandle) {
    app.exit(0);
}
