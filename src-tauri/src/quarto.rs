//! Exact Quarto rendering (spec §16.2). Runs `quarto render <file>` only on an explicit
//! user command — never automatically. Discovers `quarto` from PATH via the shell.

use serde::Serialize;
use std::os::windows::process::CommandExt;
use std::process::Command;

#[derive(Serialize)]
pub struct QuartoResult {
    success: bool,
    log: String,
    output_file: Option<String>,
}

/// True if `quarto` is on PATH.
#[tauri::command]
pub fn find_quarto() -> bool {
    Command::new("cmd")
        .args(["/C", "where", "quarto"])
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
}

/// Render a `.qmd`/`.md` with Quarto, capturing the log. Returns the produced `.html`
/// (next to the source) if it exists.
#[tauri::command]
pub fn render_with_quarto(path: String) -> Result<QuartoResult, String> {
    let file = std::path::Path::new(&path);
    let dir = file
        .parent()
        .ok_or_else(|| format!("no parent directory for {path}"))?;

    // raw_arg avoids Rust's quoting fighting cmd's own parsing (paths with spaces).
    let output = Command::new("cmd")
        .raw_arg(format!("/C quarto render \"{}\"", path.replace('"', "")))
        .current_dir(dir)
        .output()
        .map_err(|e| format!("failed to run quarto: {e}"))?;

    let mut log = String::new();
    log.push_str(&String::from_utf8_lossy(&output.stdout));
    log.push_str(&String::from_utf8_lossy(&output.stderr));

    let output_file = file
        .file_stem()
        .and_then(|s| s.to_str())
        .map(|stem| dir.join(format!("{stem}.html")))
        .filter(|p| p.exists())
        .map(|p| p.to_string_lossy().to_string());

    Ok(QuartoResult {
        success: output.status.success(),
        log,
        output_file,
    })
}
