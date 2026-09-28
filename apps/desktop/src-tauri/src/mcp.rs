//! The local MCP server (apps/mcp) ships next to the app binary. These commands tell the UI where
//! it is and add it to the configuration of MCP clients (Claude Desktop, Cursor, Codex) on request.
//! The Store build hands out its `fixnote-mcp` alias instead (see store.rs).

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
    // The Store build's folder changes with every update: clients start it through the alias.
    let command = if crate::store::packaged() {
        crate::store::mcp_alias().ok_or("no LOCALAPPDATA")?
    } else {
        path
    };
    Ok(McpInfo {
        command: command.to_string_lossy().into_owned(),
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
        "codex" => {
            let base = match std::env::var_os("CODEX_HOME") {
                Some(dir) => PathBuf::from(dir),
                None => home()?.join(".codex"),
            };
            Ok(base.join("config.toml"))
        }
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
    let text = if client == "codex" {
        with_fixnote_toml(&existing, &info.command)
    } else {
        with_fixnote(&existing, &info.command)
    }
    .map_err(|e| format!("{}: {e}", path.display()))?;
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

/// Codex's config.toml with `[mcp_servers.fixnote]` set to `command`, everything else untouched.
fn with_fixnote_toml(existing: &str, command: &str) -> Result<String, String> {
    let mut doc: toml_edit::DocumentMut = existing
        .parse()
        .map_err(|e: toml_edit::TomlError| e.to_string())?;
    let servers = doc
        .entry("mcp_servers")
        .or_insert_with(|| {
            let mut table = toml_edit::Table::new();
            // Only [mcp_servers.fixnote] is written, not an empty [mcp_servers] header.
            table.set_implicit(true);
            toml_edit::Item::Table(table)
        })
        .as_table_mut()
        .ok_or("mcp_servers is not a table")?;
    let mut server = toml_edit::Table::new();
    server.insert("command", toml_edit::value(command));
    server.insert("args", toml_edit::value(toml_edit::Array::new()));
    servers.insert("fixnote", toml_edit::Item::Table(server));
    Ok(doc.to_string())
}

#[cfg(test)]
mod tests {
    use super::{with_fixnote, with_fixnote_toml};

    #[test]
    fn adds_the_server_to_codex_and_keeps_the_rest() {
        let before = "# my settings\nmodel = \"o3\"\n\n[mcp_servers.other]\ncommand = \"x\"\n";
        let after = with_fixnote_toml(before, "C:\\FixNote\\fixnote-mcp.exe").unwrap();
        assert!(after.starts_with("# my settings\nmodel = \"o3\""));
        let doc: toml_edit::DocumentMut = after.parse().unwrap();
        assert_eq!(doc["mcp_servers"]["other"]["command"].as_str(), Some("x"));
        assert_eq!(
            doc["mcp_servers"]["fixnote"]["command"].as_str(),
            Some("C:\\FixNote\\fixnote-mcp.exe")
        );
        let fresh = with_fixnote_toml("", "/app/fixnote-mcp").unwrap();
        assert_eq!(
            fresh,
            "[mcp_servers.fixnote]\ncommand = \"/app/fixnote-mcp\"\nargs = []\n"
        );
        // Connecting again replaces the entry instead of adding a second one.
        assert_eq!(
            with_fixnote_toml(&fresh, "/app/fixnote-mcp").unwrap(),
            fresh
        );
        assert!(with_fixnote_toml("mcp_servers = 1", "x").is_err());
        assert!(with_fixnote_toml("not toml [", "x").is_err());
    }

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
