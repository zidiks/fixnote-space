//! After an update the Dock and Finder may keep showing the old app icon: LaunchServices caches
//! it by the bundle until the bundle looks changed. On the first launch of a new version, touch the
//! bundle and register it again. (Windows does the same from the installer: windows/installer-hooks.nsh.)

use std::path::Path;

/// Remembers which version last refreshed the icon, so it runs once per update.
const MARKER: &str = "icon-version";

pub fn after_update(data_dir: &Path, version: &str) {
    let marker = data_dir.join(MARKER);
    if std::fs::read_to_string(&marker).ok().as_deref() == Some(version) {
        return;
    }
    let _ = std::fs::write(&marker, version);
    #[cfg(target_os = "macos")]
    std::thread::spawn(refresh_bundle);
}

#[cfg(target_os = "macos")]
fn refresh_bundle() {
    use std::process::Command;
    const LSREGISTER: &str = "/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister";
    const TOUCH: &str = "/usr/bin/touch";
    // …/Fixnote.app/Contents/MacOS/<binary>
    let Ok(exe) = std::env::current_exe() else {
        return;
    };
    let Some(bundle) = exe.ancestors().nth(3) else {
        return;
    };
    if bundle.extension().and_then(|e| e.to_str()) != Some("app") {
        return;
    }
    let _ = Command::new(TOUCH).arg(bundle).status();
    let _ = Command::new(LSREGISTER).arg("-f").arg(bundle).status();
}
