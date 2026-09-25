//! Saving files the UI produced (exports) through the native "Save as" dialog.

use percent_encoding::percent_decode_str;
use tauri::ipc::{InvokeBody, Request};
use tauri_plugin_dialog::DialogExt;

/// Body: raw file bytes. Header `x-file-name`: suggested name, percent-encoded.
/// Returns false when the user cancels the dialog.
#[tauri::command]
pub async fn save_file(app: tauri::AppHandle, request: Request<'_>) -> Result<bool, String> {
    let InvokeBody::Raw(data) = request.body() else {
        return Err("expected raw bytes".into());
    };
    let name = request
        .headers()
        .get("x-file-name")
        .and_then(|v| v.to_str().ok())
        .map(|v| percent_decode_str(v).decode_utf8_lossy().into_owned())
        .unwrap_or_else(|| "export".into());
    let extension = name.rsplit_once('.').map(|(_, ext)| ext.to_owned());

    let mut dialog = app.dialog().file().set_file_name(&name);
    if let Some(ext) = &extension {
        dialog = dialog.add_filter(ext.to_uppercase(), &[ext.as_str()]);
    }
    let Some(target) = dialog.blocking_save_file() else {
        return Ok(false);
    };
    let path = target.into_path().map_err(|e| e.to_string())?;
    std::fs::write(&path, data).map_err(|e| e.to_string())?;
    Ok(true)
}
