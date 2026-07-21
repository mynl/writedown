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

/// Open the configured shell (`[tools] shell`, default `pwsh`) in its own console
/// window at `dir`. On Windows CREATE_NEW_CONSOLE is required: a console child spawned
/// from a GUI app has no console to inherit and would otherwise run invisibly. Other
/// platforms (untested) spawn plain — the cfg guard keeps the crate compiling there.
/// (Known limit: `shell = "wt"` ignores the directory — Windows Terminal uses its own
/// startingDirectory profile setting, not the spawn cwd.)
#[tauri::command]
pub fn open_shell(app: tauri::AppHandle, dir: String) -> Result<(), String> {
    let exe = tool(&app, "shell").unwrap_or_else(|| "pwsh".to_string());
    let mut cmd = Command::new(&exe);
    cmd.current_dir(&dir);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NEW_CONSOLE: u32 = 0x0000_0010;
        cmd.creation_flags(CREATE_NEW_CONSOLE);
    }
    cmd.spawn().map_err(|e| format!("launch {exe} in {dir}: {e}"))?;
    Ok(())
}
