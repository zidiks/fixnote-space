//! The recovery secret lives in the OS credential store, never in files or the webview.
//! Values cross IPC as base64 text; the UI owns the format.

const SERVICE: &str = "space.fixnote.app";
const ACCOUNT: &str = "recovery-secret";

fn entry() -> Result<keyring::Entry, String> {
    keyring::Entry::new(SERVICE, ACCOUNT).map_err(|e| e.to_string())
}

/// Other secrets (an LLM API key) under "secret:<name>"; names are short slugs.
fn named(name: &str) -> Result<keyring::Entry, String> {
    let ok = !name.is_empty()
        && name.len() <= 64
        && name
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '.' || c == '-');
    if !ok {
        return Err("bad secret name".into());
    }
    keyring::Entry::new(SERVICE, &format!("secret:{name}")).map_err(|e| e.to_string())
}

#[tauri::command(async)]
pub fn secret_load(name: String) -> Result<Option<String>, String> {
    match named(&name)?.get_password() {
        Ok(value) => Ok(Some(value)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command(async)]
pub fn secret_save(name: String, value: String) -> Result<(), String> {
    named(&name)?
        .set_password(&value)
        .map_err(|e| e.to_string())
}

#[tauri::command(async)]
pub fn secret_clear(name: String) -> Result<(), String> {
    match named(&name)?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command(async)]
pub fn key_load() -> Result<Option<String>, String> {
    match entry()?.get_password() {
        Ok(value) => Ok(Some(value)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command(async)]
pub fn key_save(value: String) -> Result<(), String> {
    entry()?.set_password(&value).map_err(|e| e.to_string())
}

#[tauri::command(async)]
pub fn key_clear() -> Result<(), String> {
    match entry()?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}
