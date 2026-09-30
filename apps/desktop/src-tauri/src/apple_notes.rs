//! Reads Apple Notes on macOS for the import (Settings → Data → Import): the Notes app answers
//! Apple events (JavaScript for Automation through `osascript`). macOS asks once whether FixNote
//! may control Notes. Only reading; the notes are turned into FixNote notes in the webview.

use std::process::Command;

/// Lists the folders (`folders`), or reads a batch of a folder's notes (`notes <id> <from> <n>`).
/// Prints JSON; the shapes are `AppleNotesFolder` and `AppleNote` in packages/core/src/platform.ts.
const SCRIPT: &str = r#"
function run(argv) {
  const Notes = Application('Notes')
  const time = (d) => { try { return d ? d.getTime() : 0 } catch (e) { return 0 } }
  if (argv[0] === 'folders') {
    const out = []
    const seen = {}
    Notes.accounts().forEach((account) => {
      let home = null
      try { home = account.defaultFolder().id() } catch (e) {}
      const walk = (folder, path) => {
        const id = folder.id()
        if (seen[id]) return
        seen[id] = true
        const here = path.concat([folder.name()])
        let count = 0
        try { count = folder.notes.length } catch (e) {}
        out.push({ id: id, path: here, account: account.name(), count: count, home: id === home })
        folder.folders().forEach((sub) => walk(sub, here))
      }
      // The account lists subfolders too: start from the top ones, so each gets its full path.
      account.folders().forEach((folder) => {
        let top = true
        try { top = folder.container().class() === 'account' } catch (e) {}
        if (top) walk(folder, [])
      })
      // Where `container` is not known, whatever was not reached is listed on its own.
      account.folders().forEach((folder) => walk(folder, []))
    })
    return JSON.stringify(out)
  }
  const find = (list) => {
    for (const folder of list) {
      if (folder.id() === argv[1]) return folder
      const sub = find(folder.folders())
      if (sub) return sub
    }
    return null
  }
  let folder = null
  for (const account of Notes.accounts()) {
    folder = find(account.folders())
    if (folder) break
  }
  if (!folder) throw new Error('folder not found')
  const from = Number(argv[2])
  const to = Math.min(folder.notes.length, from + Number(argv[3]))
  const out = []
  for (let i = from; i < to; i++) {
    const note = folder.notes[i]
    let locked = false
    try { locked = note.passwordProtected() } catch (e) {}
    let files = 0
    try { files = note.attachments.length } catch (e) {}
    out.push({
      id: note.id(),
      title: note.name(),
      html: locked ? '' : note.body(),
      created: time(note.creationDate()),
      modified: time(note.modificationDate()),
      locked: locked,
      files: files,
    })
  }
  return JSON.stringify(out)
}
"#;

/// Runs the script with `args`; "denied" when macOS does not let FixNote control Notes.
fn run(args: &[&str]) -> Result<String, String> {
    if !cfg!(target_os = "macos") {
        return Err("unsupported".into());
    }
    let out = Command::new("/usr/bin/osascript")
        .args(["-l", "JavaScript", "-e", SCRIPT])
        .args(args)
        .output()
        .map_err(|e| e.to_string())?;
    if out.status.success() {
        return Ok(String::from_utf8_lossy(&out.stdout).trim().to_string());
    }
    let err = String::from_utf8_lossy(&out.stderr).to_string();
    // -1743: the user said no (or has not been asked, when the app lacks the usage text).
    if err.contains("-1743") || err.contains("Not authorized") || err.contains("not allowed") {
        return Err("denied".into());
    }
    Err(err.trim().to_string())
}

async fn run_blocking(args: Vec<String>) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let refs: Vec<&str> = args.iter().map(String::as_str).collect();
        run(&refs)
    })
    .await
    .map_err(|e| e.to_string())?
}

/// The folders of every account, with their full path and how many notes each has (JSON).
#[tauri::command]
pub async fn apple_notes_folders() -> Result<String, String> {
    run_blocking(vec!["folders".into()]).await
}

/// Notes `from`..`from + count` of a folder, with their HTML (JSON).
#[tauri::command]
pub async fn apple_notes_read(folder: String, from: u32, count: u32) -> Result<String, String> {
    run_blocking(vec![
        "notes".into(),
        folder,
        from.to_string(),
        count.to_string(),
    ])
    .await
}
