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
# font_weight is a CSS weight: "light" | "normal" | "bold", or a number 100..900.
font_family = "Source Code Pro"
font_size = 14
# font_weight = "normal"
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
# font_weight = "normal"
# TOC hierarchy guide lines: set a color, or just an opacity (0..1) on a neutral gray.
# guide_color = "rgba(127,127,127,0.5)"
# guide_opacity = 0.5

[tabs]
# Document tab strip. Thin, ST-style: height is the strip height in px; width caps
# how wide a single tab grows before its name ellipsizes.
# height = 24
# width = 180

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

[render]
# Render Document: run {python} cells through this interpreter (explicit path — no
# discovery). Leave empty to render without execution (cells shown as source).
python = ""
timeout_seconds = 30
figure_format = "png" # png | svg
figure_dpi = 150

[tree]
# Left file/project panel font (like ST's sidebar). font_weight as in [editor].
font_family = "Segoe UI"
font_size = 9
# font_weight = "normal"

[files]
extensions = ["md", "qmd", "markdown"]
show_hidden = false

[spelling]
# Prose spellchecker (English US). Only prose is checked — code, math, citation keys, and
# YAML front matter are skipped. Set enabled = false to turn it off.
enabled = true
language = "en_US"
# personal_dictionary: file for words you add via "Add to dictionary". Defaults to
# %APPDATA%\com.mynl.writedown\personal-dictionary.txt. Point it at a synced folder to
# carry your added words across machines.
# personal_dictionary = "C:/Users/steve/Documents/CloudStation/writedown-personal.dic"
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
    font_weight: Option<String>,
    /// Editor word wrap default ([editor] word_wrap). Runtime toggle is session-only.
    word_wrap: Option<bool>,
    outline_font_family: Option<String>,
    outline_font_size: Option<f64>,
    outline_font_weight: Option<String>,
    tree_font_family: Option<String>,
    tree_font_size: Option<f64>,
    tree_font_weight: Option<String>,
    /// TOC guide-line appearance ([outline] guide_color / guide_opacity).
    outline_guide_color: Option<String>,
    outline_guide_opacity: Option<f64>,
    /// Document tab strip sizing ([tabs] height / width), in px.
    tab_height: Option<f64>,
    tab_width: Option<f64>,
    /// Prose spellchecker ([spelling] enabled / language). The personal-dictionary path is
    /// read entirely in Rust (spelling.rs) — the frontend only needs the on/off gate.
    spelling_enabled: Option<bool>,
    spelling_language: Option<String>,
}

/// Parse `[editor]`/`[outline]`/`[tree]` font settings from `config.toml` (spec §5).
/// These override the imported Sublime font. Missing/invalid config yields defaults.
#[tauri::command]
pub fn load_editor_settings(app: tauri::AppHandle) -> Result<EditorSettings, String> {
    let cfg = writedown_dir(&app)?.join("config.toml");
    let txt = std::fs::read_to_string(&cfg).unwrap_or_default();
    let val: toml::Value = txt.parse().map_err(|e: toml::de::Error| e.to_string())?;
    let ed = val.get("editor");
    let ol = val.get("outline");
    let tr = val.get("tree");
    let tb = val.get("tabs");
    let sp = val.get("spelling");
    let num = |v: &toml::Value| v.as_float().or_else(|| v.as_integer().map(|i| i as f64));
    let string = |v: &toml::Value| v.as_str().map(str::to_string);
    // font_weight accepts a CSS keyword ("light"/"bold") or a number (300, 700).
    let weight = |v: &toml::Value| v.as_str().map(str::to_string).or_else(|| v.as_integer().map(|i| i.to_string()));
    Ok(EditorSettings {
        font_size: ed
            .and_then(|e| e.get("font_size"))
            .and_then(|v| v.as_integer())
            .map(|i| i as u32),
        font_family: ed.and_then(|e| e.get("font_family")).and_then(string),
        font_weight: ed.and_then(|e| e.get("font_weight")).and_then(weight),
        word_wrap: ed.and_then(|e| e.get("word_wrap")).and_then(|v| v.as_bool()),
        outline_font_family: ol.and_then(|o| o.get("font_family")).and_then(string),
        outline_font_size: ol.and_then(|o| o.get("font_size")).and_then(num),
        outline_font_weight: ol.and_then(|o| o.get("font_weight")).and_then(weight),
        tree_font_family: tr.and_then(|t| t.get("font_family")).and_then(string),
        tree_font_size: tr.and_then(|t| t.get("font_size")).and_then(num),
        tree_font_weight: tr.and_then(|t| t.get("font_weight")).and_then(weight),
        outline_guide_color: ol.and_then(|o| o.get("guide_color")).and_then(string),
        outline_guide_opacity: ol.and_then(|o| o.get("guide_opacity")).and_then(num),
        tab_height: tb.and_then(|t| t.get("height")).and_then(num),
        tab_width: tb.and_then(|t| t.get("width")).and_then(num),
        spelling_enabled: sp.and_then(|s| s.get("enabled")).and_then(|v| v.as_bool()),
        spelling_language: sp.and_then(|s| s.get("language")).and_then(string),
    })
}
