//! The local MCP server (apps/mcp) ships next to the app binary. These commands tell the UI where
//! it is and add it to the configuration of MCP clients (Claude Desktop, Cursor) on request.

use std::path::PathBuf;

use serde::Serialize;
use serde_json::{json, Map, Value};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct McpInfo {
    command: String,
    /// False for the development placeholder (see build.rs).
    built: bool,
}

fn server_path() -> Result<PathBuf, String> {
    let exe = std::env::current_exe().map_err(|e| e.to_string())?;
    let dir = exe.parent().ok_or("no app directory")?;
    let name = if cfg!(windows) {
        "fixnote-mcp.exe"
    } else {
        "fixnote-mcp"
    };
    Ok(dir.join(name))
}

#[tauri::command]
pub fn mcp_info() -> Result<McpInfo, String> {
    let path = server_path()?;
    let built = std::fs::metadata(&path)
        .map(|m| m.len() > 1_000_000)
        .unwrap_or(false);
    Ok(McpInfo {
        command: path.to_string_lossy().into_owned(),
        built,
    })
}

fn home() -> Result<PathBuf, String> {
    std::env::var_os(if cfg!(windows) { "USERPROFILE" } else { "HOME" })
        .map(PathBuf::from)
        .ok_or_else(|| "no home directory".into())
}

fn config_path(client: &str) -> Result<PathBuf, String> {
    match client {
        "claude" => {
            let base = if cfg!(windows) {
                std::env::var_os("APPDATA")
                    .map(PathBuf::from)
                    .ok_or("no APPDATA")?
            } else if cfg!(target_os = "macos") {
                home()?.join("Library").join("Application Support")
            } else {
                home()?.join(".config")
            };
            Ok(base.join("Claude").join("claude_desktop_config.json"))
        }
        "cursor" => Ok(home()?.join(".cursor").join("mcp.json")),
        _ => Err(format!("unknown MCP client {client}")),
    }
}

/// macOS: the app runs straight from the mounted .dmg (/Volumes/…) or from a quarantine copy
/// (AppTranslocation). Such a path disappears later, and the MCP client could not start the server.
fn runs_from_temporary_place(command: &str) -> bool {
    cfg!(target_os = "macos")
        && (command.starts_with("/Volumes/") || command.contains("/AppTranslocation/"))
}

/// Adds (or updates) the "fixnote" server in the client's config, keeping everything else.
/// Returns the config file path.
#[tauri::command]
pub fn mcp_connect(client: String) -> Result<String, String> {
    let info = mcp_info()?;
    // Error codes; the UI shows them in the user's language.
    if !info.built {
        return Err("not-built".into());
    }
    if runs_from_temporary_place(&info.command) {
        return Err("not-installed".into());
    }
    let path = config_path(&client)?;
    let existing = std::fs::read_to_string(&path).unwrap_or_default();
    let text =
        with_fixnote(&existing, &info.command).map_err(|e| format!("{}: {e}", path.display()))?;
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }
    std::fs::write(&path, text).map_err(|e| e.to_string())?;
    Ok(path.to_string_lossy().into_owned())
}

/// The config text with `mcpServers.fixnote` set to `command`, other settings untouched.
fn with_fixnote(existing: &str, command: &str) -> Result<String, String> {
    let mut root: Value = if existing.trim().is_empty() {
        json!({})
    } else {
        serde_json::from_str(existing).map_err(|e| e.to_string())?
    };
    let obj = root.as_object_mut().ok_or("config is not a JSON object")?;
    let servers = obj
        .entry("mcpServers")
        .or_insert_with(|| Value::Object(Map::new()))
        .as_object_mut()
        .ok_or("mcpServers is not an object")?;
    servers.insert("fixnote".into(), json!({ "command": command, "args": [] }));
    let text = serde_json::to_string_pretty(&root).map_err(|e| e.to_string())?;
    Ok(format!("{text}\n"))
}

#[cfg(test)]
mod tests {
    use super::with_fixnote;
    use serde_json::Value;

    #[test]
    fn adds_the_server_and_keeps_other_settings() {
        let before = r#"{"theme":"dark","mcpServers":{"other":{"command":"x"}}}"#;
        let after: Value =
            serde_json::from_str(&with_fixnote(before, "C:\\FixNote\\fixnote-mcp.exe").unwrap())
                .unwrap();
        assert_eq!(after["theme"], "dark");
        assert_eq!(after["mcpServers"]["other"]["command"], "x");
        assert_eq!(
            after["mcpServers"]["fixnote"]["command"],
            "C:\\FixNote\\fixnote-mcp.exe"
        );
        let fresh: Value =
            serde_json::from_str(&with_fixnote("", "/app/fixnote-mcp").unwrap()).unwrap();
        assert_eq!(
            fresh["mcpServers"]["fixnote"]["args"],
            serde_json::json!([])
        );
        assert!(with_fixnote("[1]", "x").is_err());
        assert!(with_fixnote("not json", "x").is_err());
    }
}
