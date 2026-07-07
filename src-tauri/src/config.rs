//! The `~/.writedown/` application directory (spec §5). Holds derived/disposable app
//! state only — never user documents.

use serde::Serialize;
use std::path::PathBuf;
use tauri::Manager;

/// Default config written on first launch. Writedown does NOT rewrite this file during
/// ordinary use, so the user's edits and comments are safe.
const DEFAULT_CONFIG: &str = r#"# Writedown configuration (~/.writedown/config.toml)
# Created automatically on first launch. Edit freely; Writedown does not rewrite
# this file during ordinary use.

[general]
restore_session = true

[editor]
# font_family/font_size override the imported Sublime font (leave unset to use Sublime's).
font_family = "Source Code Pro"
font_size = 14
tab_size = 4
word_wrap = true
strip_trailing_whitespace = true
preserve_markdown_hard_breaks = true
autosave_on_focus_loss = true
autosave_idle_ms = 1500

[preview]
enabled = true
position = "right"
sync_scroll = true

[outline]
enabled = true
position = "right"
font_family = "Arial Narrow"
font_size = 10

[theme]
name = "default-dark"
source = "builtin"

[bibliography]
enabled = true
default_file = ""
additional_files = []
citation_style = "pandoc"
watch_for_changes = true
read_only = true

[files]
extensions = ["md", "qmd", "markdown"]
show_hidden = false

[quarto]
# How "Render with Quarto" (Ctrl+Shift+Q) runs. {file} is the document path. The command
# runs via cmd, so it can NOT see PowerShell aliases — use the full path to conda.exe (a
# bare "conda" is usually a PowerShell function and will fail). To run inside a conda env
# that has Python (so code cells execute), set e.g.:
#   command = 'C:/Users/steve/miniconda3/Scripts/conda.exe run -n working313 quarto render "{file}"'
command = 'quarto render "{file}"'
"#;

/// `~/.writedown/`.
pub fn writedown_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let home = app.path().home_dir().map_err(|e| e.to_string())?;
    Ok(home.join(".writedown"))
}

/// Create the app directory tree and a default `config.toml` if missing (spec §5).
pub fn ensure_setup(app: &tauri::AppHandle) -> Result<(), String> {
    let dir = writedown_dir(app)?;
    for sub in ["", "cache", "index", "logs", "themes"] {
        let p = if sub.is_empty() { dir.clone() } else { dir.join(sub) };
        std::fs::create_dir_all(&p).map_err(|e| format!("create {}: {e}", p.display()))?;
    }
    let cfg = dir.join("config.toml");
    if !cfg.exists() {
        std::fs::write(&cfg, DEFAULT_CONFIG).map_err(|e| format!("write config.toml: {e}"))?;
    }
    Ok(())
}

/// Raw text of `config.toml` (empty string if absent). Returned verbatim so no
/// comments or formatting are lost.
#[tauri::command]
pub fn load_config(app: tauri::AppHandle) -> Result<String, String> {
    let cfg = writedown_dir(&app)?.join("config.toml");
    match std::fs::read_to_string(&cfg) {
        Ok(s) => Ok(s),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(String::new()),
        Err(e) => Err(format!("read config.toml: {e}")),
    }
}

/// Absolute path to `config.toml` (for the "Edit Config" command).
#[tauri::command]
pub fn config_path(app: tauri::AppHandle) -> Result<String, String> {
    Ok(writedown_dir(&app)?.join("config.toml").to_string_lossy().to_string())
}

/// Append a line to `~/.writedown/logs/writedown.log` (spec §25). Used by the frontend's
/// global error handlers so crashes are recorded instead of vanishing.
#[tauri::command]
pub fn log_error(app: tauri::AppHandle, message: String) {
    let Ok(dir) = writedown_dir(&app) else { return };
    let logs = dir.join("logs");
    let _ = std::fs::create_dir_all(&logs);
    let ts = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    use std::io::Write;
    if let Ok(mut f) = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(logs.join("writedown.log"))
    {
        let _ = writeln!(f, "[{ts}] {message}");
    }
}

#[derive(Serialize, Default)]
pub struct EditorSettings {
    font_size: Option<u32>,
    font_family: Option<String>,
    outline_font_family: Option<String>,
    outline_font_size: Option<f64>,
}

/// Parse `[editor]`/`[outline]` font settings from `config.toml` (spec §5). These
/// override the imported Sublime font. Missing/invalid config yields defaults.
#[tauri::command]
pub fn load_editor_settings(app: tauri::AppHandle) -> Result<EditorSettings, String> {
    let cfg = writedown_dir(&app)?.join("config.toml");
    let txt = std::fs::read_to_string(&cfg).unwrap_or_default();
    let val: toml::Value = txt.parse().map_err(|e: toml::de::Error| e.to_string())?;
    let ed = val.get("editor");
    let ol = val.get("outline");
    let num = |v: &toml::Value| v.as_float().or_else(|| v.as_integer().map(|i| i as f64));
    Ok(EditorSettings {
        font_size: ed
            .and_then(|e| e.get("font_size"))
            .and_then(|v| v.as_integer())
            .map(|i| i as u32),
        font_family: ed
            .and_then(|e| e.get("font_family"))
            .and_then(|v| v.as_str())
            .map(str::to_string),
        outline_font_family: ol
            .and_then(|o| o.get("font_family"))
            .and_then(|v| v.as_str())
            .map(str::to_string),
        outline_font_size: ol.and_then(|o| o.get("font_size")).and_then(num),
    })
}
