//! Desktop shell for FixNote.
//!
//! The UI and all domain logic live in apps/web and packages/core. Rust hosts only what the browser
//! cannot do well: the local SQLite database, the OS keychain, native file dialogs and fetching
//! pages for link cards (no CORS). Embeddings and speech run in the webview (transformers.js).

mod db;
mod files;
mod keys;
mod links;
mod webview;

use std::sync::Mutex;

use serde::Serialize;
use serde_json::{Map, Value};
use tauri::{Manager, State};

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

#[tauri::command(async)]
fn db_execute(state: State<'_, db::Db>, sql: String, params: Vec<Value>) -> Result<u64, String> {
    let conn = state.0.lock().map_err(|_| "database lock poisoned")?;
    db::execute(&conn, &sql, &params)
}

#[tauri::command(async)]
fn db_query(
    state: State<'_, db::Db>,
    sql: String,
    params: Vec<Value>,
) -> Result<Vec<Map<String, Value>>, String> {
    let conn = state.0.lock().map_err(|_| "database lock poisoned")?;
    db::query(&conn, &sql, &params)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&dir)?;
            let conn = db::open(&dir.join("fixnote.db"))?;
            app.manage(db::Db(Mutex::new(conn)));
            if let Some(window) = app.get_webview_window("main") {
                webview::disable_browser_shortcuts(&window);
                webview::grant_microphone(&window);
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            app_info,
            db_execute,
            db_query,
            keys::key_load,
            keys::key_save,
            keys::key_clear,
            files::save_file,
            links::fetch_page
        ])
        .run(tauri::generate_context!())
        .expect("error while running FixNote");
}
