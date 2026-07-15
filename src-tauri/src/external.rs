//! Launch external tools: the configured PDF/DjVu viewer and a shell at a directory.
//! Tool paths come from `[tools]` in config.toml, read per call (the same pattern as
//! `files::show_hidden`), so a config edit applies immediately with no plumbing.

use std::process::Command;

fn tool(app: &tauri::AppHandle, key: &str) -> Option<String> {
    let dir = crate::config::writedown_dir(app).ok()?;
    let txt = std::fs::read_to_string(dir.join("config.toml")).ok()?;
    let val: toml::Value = txt.parse().ok()?;
    val.get("tools")?.get(key)?.as_str().map(str::to_string)
}

/// Open `path` in the configured external viewer (`[tools] pdf_viewer`). Used for
/// PDF/DjVu files, which Writedown never renders itself — SumatraPDF reads both.
/// A missing key is a surfaced error, not a silent fallback.
#[tauri::command]
pub fn open_external(app: tauri::AppHandle, path: String) -> Result<(), String> {
    let exe = tool(&app, "pdf_viewer").ok_or_else(|| {
        "no viewer configured — set  [tools] pdf_viewer = 'C:/path/to/SumatraPDF.exe'  \
         in config.toml"
            .to_string()
    })?;
    Command::new(&exe)
        .arg(&path)
        .spawn()
        .map_err(|e| format!("launch {exe}: {e}"))?;
    Ok(())
}
