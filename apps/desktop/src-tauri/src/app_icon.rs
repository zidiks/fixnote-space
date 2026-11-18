//! The app icon a person picked (Settings → General): orange, dark or light. Set while the app
//! runs, on the window (the Windows taskbar and Alt+Tab) and, on macOS, the Dock. The installed
//! icon (Start menu, Finder, a pinned shortcut) stays the orange one: the webview sets the choice
//! again at every launch. The PNGs come from `pnpm icons` (scripts/icon-variants.mjs).

use tauri::image::Image;
use tauri::{AppHandle, Manager};

fn png(variant: &str) -> Option<&'static [u8]> {
    #[cfg(target_os = "macos")]
    return match variant {
        "orange" => Some(include_bytes!("../icons/variants/orange-macos.png")),
        "dark" => Some(include_bytes!("../icons/variants/dark-macos.png")),
        "light" => Some(include_bytes!("../icons/variants/light-macos.png")),
        _ => None,
    };
    #[cfg(not(target_os = "macos"))]
    match variant {
        "orange" => Some(include_bytes!("../icons/variants/orange.png")),
        "dark" => Some(include_bytes!("../icons/variants/dark.png")),
        "light" => Some(include_bytes!("../icons/variants/light.png")),
        _ => None,
    }
}

#[tauri::command]
pub fn set_app_icon(app: AppHandle, variant: String) -> Result<(), String> {
    let bytes = png(&variant).ok_or_else(|| format!("unknown icon {variant}"))?;
    if let Some(window) = app.get_webview_window("main") {
        let image = Image::from_bytes(bytes).map_err(|e| e.to_string())?;
        window.set_icon(image).map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "macos")]
    app.run_on_main_thread(move || dock(bytes))
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// NSApplication's icon: the Dock while the app runs.
#[cfg(target_os = "macos")]
fn dock(bytes: &'static [u8]) {
    use objc2::msg_send;
    use objc2::rc::{Allocated, Retained};
    use objc2::runtime::{AnyClass, AnyObject};

    let (Some(data_class), Some(image_class), Some(app_class)) = (
        AnyClass::get(c"NSData"),
        AnyClass::get(c"NSImage"),
        AnyClass::get(c"NSApplication"),
    ) else {
        return;
    };
    unsafe {
        let data: *mut AnyObject = msg_send![
            data_class,
            dataWithBytes: bytes.as_ptr().cast::<std::ffi::c_void>(),
            length: bytes.len()
        ];
        if data.is_null() {
            return;
        }
        let image: Allocated<AnyObject> = msg_send![image_class, alloc];
        let image: Option<Retained<AnyObject>> = msg_send![image, initWithData: data];
        let Some(image) = image else { return };
        let app: *mut AnyObject = msg_send![app_class, sharedApplication];
        if !app.is_null() {
            let _: () = msg_send![app, setApplicationIconImage: &*image];
        }
    }
}
