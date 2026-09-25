//! Desktop shell for FixNote.
//!
//! The UI and all domain logic live in apps/web and packages/core. Rust hosts only what the browser
//! cannot do well: SQLite via plugin-sql (M1), OS keychain (M2), fastembed (M3), whisper.cpp (M4).

use serde::Serialize;

#[derive(Serialize)]
struct AppInfo {
    version: String,
    os: &'static str,
    arch: &'static str,
}

/// Round-trip used by the UI to confirm the Rust bridge works.
#[tauri::command]
fn app_info(app: tauri::AppHandle) -> AppInfo {
    AppInfo {
        version: app.package_info().version.to_string(),
        os: std::env::consts::OS,
        arch: std::env::consts::ARCH,
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![app_info])
        .run(tauri::generate_context!())
        .expect("error while running FixNote");
}
