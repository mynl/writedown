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

/// The render command line from config `[quarto] command` ({file} = document path).
/// Default runs plain `quarto`; set it to activate a conda/venv that has Python so code
/// cells execute (e.g. `conda run -n myenv quarto render "{file}"`).
fn quarto_command(app: &tauri::AppHandle) -> String {
    let default = || "quarto render \"{file}\"".to_string();
    let Ok(dir) = crate::config::writedown_dir(app) else { return default() };
    let Ok(txt) = std::fs::read_to_string(dir.join("config.toml")) else { return default() };
    let Ok(val) = txt.parse::<toml::Value>() else { return default() };
    val.get("quarto")
        .and_then(|q| q.get("command"))
        .and_then(|v| v.as_str())
        .filter(|s| !s.trim().is_empty())
        .map(str::to_string)
        .unwrap_or_else(default)
}

/// Render a `.qmd`/`.md` with Quarto, capturing the log. Returns the produced `.html`
/// (next to the source) if it exists. The command is configurable (see `quarto_command`).
#[tauri::command]
pub fn render_with_quarto(app: tauri::AppHandle, path: String) -> Result<QuartoResult, String> {
    let file = std::path::Path::new(&path);
    let dir = file
        .parent()
        .ok_or_else(|| format!("no parent directory for {path}"))?;

    let cmdline = quarto_command(&app).replace("{file}", &path.replace('"', ""));
    // raw_arg avoids Rust's quoting fighting cmd's own parsing (paths with spaces).
    let output = Command::new("cmd")
        .raw_arg(format!("/C {cmdline}"))
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
