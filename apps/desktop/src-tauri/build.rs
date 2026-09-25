//! The MCP server ships as an external binary built by `pnpm --filter @fixnote/mcp build:sea`
//! (CI does it before `tauri build`). For everyday development a placeholder keeps the build going;
//! Settings then say the connector is not built.

use std::path::Path;

fn main() {
    let target = std::env::var("TARGET").unwrap_or_default();
    let exe = if target.contains("windows") {
        ".exe"
    } else {
        ""
    };
    let path = format!("binaries/fixnote-mcp-{target}{exe}");
    if !Path::new(&path).exists() {
        std::fs::create_dir_all("binaries").expect("create binaries/");
        std::fs::write(
            &path,
            b"placeholder: run pnpm --filter @fixnote/mcp build:sea\n",
        )
        .expect("write MCP placeholder");
        println!("cargo:warning=MCP server not built; using a placeholder ({path})");
    }
    println!("cargo:rerun-if-changed={path}");
    tauri_build::build()
}
