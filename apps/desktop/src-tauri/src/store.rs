//! The Microsoft Store build is this same app run from an MSIX package (apps/desktop/msix). The
//! Store installs its updates, and it lives in a folder whose name changes with every version, so
//! MCP clients start its server through the package's `fixnote-mcp` alias instead of by path.

use std::path::PathBuf;

/// True when this process runs from an MSIX package (installed from the Microsoft Store).
#[cfg(windows)]
pub fn packaged() -> bool {
    use windows::Win32::Foundation::APPMODEL_ERROR_NO_PACKAGE;
    use windows::Win32::Storage::Packaging::Appx::GetCurrentPackageFullName;
    let mut len = 0u32;
    // SAFETY: with a zero length and no buffer the call only reports the length it needs.
    let code = unsafe { GetCurrentPackageFullName(&mut len, None) };
    code != APPMODEL_ERROR_NO_PACKAGE
}

#[cfg(not(windows))]
pub fn packaged() -> bool {
    false
}

/// The `fixnote-mcp` alias the package declares (AppxManifest.xml). Windows keeps it in the
/// user's WindowsApps folder and points it at the installed version, so the path survives updates.
pub fn mcp_alias() -> Option<PathBuf> {
    let local = std::env::var_os("LOCALAPPDATA")?;
    Some(
        PathBuf::from(local)
            .join("Microsoft")
            .join("WindowsApps")
            .join("fixnote-mcp.exe"),
    )
}
