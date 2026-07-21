//! The `~/.writedown/` application directory (spec §5). Holds derived/disposable app
//! state only — never user documents.

use serde::Serialize;
use std::collections::HashMap;
use std::path::PathBuf;
use tauri::Manager;

/// Default config written on first launch. Writedown does NOT rewrite this file during
/// ordinary use, so the user's edits and comments are safe.
const DEFAULT_CONFIG: &str = r#"# Writedown configuration (~/.writedown/config.toml)
# Created automatically on first launch. Edit freely; Writedown does not rewrite
# this file during ordinary use. Every key below is one Writedown actually reads.

[editor]
# font_family/font_size override the imported Sublime font (leave unset to use Sublime's).
# font_weight is a CSS weight: "light" | "normal" | "bold", or a number 100..900.
font_family = "Source Code Pro"
font_size = 14
# font_weight = "normal"
# tab_size: spaces per indent level. Indentation is always spaces — never a literal tab.
tab_size = 4
# tab_complete_min_len: shortest nearby word Tab word-completion will offer (default 5).
# tab_complete_min_len = 5
# tab_complete_dict: also offer your frequently-used words — collected in the background
# from every doc you open or save — after the nearby matches (default true).
# tab_complete_dict = true
# tab_complete_dict_min_len: shortest word the frequency dictionary collects (default 5).
# tab_complete_dict_min_len = 5
# font_size_min / font_size_max: px floor and cap for Ctrl+wheel / Ctrl+= zoom (default 6 / 24).
# font_size_min = 6
# font_size_max = 24
word_wrap = true
# trim_trailing_whitespace: strip spaces/tabs from line ends when a file is saved.
# true trims them all (Sublime-style); "keep-hard-breaks" spares markdown two-plus-
# space line breaks (tip: a trailing backslash is the trim-proof hard break); false
# disables. CSV/TSV files are never trimmed.
trim_trailing_whitespace = true

[outline]
# Outline pane side: "left" (between the tree and editor) or "right" (far right, past the preview).
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

[bibliography]
default_file = ""

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
# Show dot files/dirs (.writedown, .github, …) in the tree and quick-open. The tree still
# lists only file types Writedown can open.
show_hidden = true
# quick_file: opened by Ctrl+Shift+Q / palette "Open Quick File" — a running notes or
# issues file you jump to constantly. Absolute path; single quotes keep backslashes literal.
# quick_file = 'C:\path\to\notes.md'

[spelling]
# Prose spellchecker (English US). Only prose is checked — code, math, citation keys, file
# paths, and YAML front matter are skipped. Set enabled = false to turn it off.
enabled = true
# min_length: the shortest word that gets spell-checked. Default 4 — skips short tokens
# like "px", "md", "js" that are almost always deliberate, not typos.
min_length = 4
# skip_proper_nouns: skip a Capitalized word that is NOT at the start of a sentence (treat
# it as a proper noun — "Tauri", "Zustand"). Trade-off: a genuinely misspelled Capitalized
# word mid-sentence won't be flagged. Set false to check those too. Sentence-start words
# (where a typo like "Teh" hides) are always checked.
skip_proper_nouns = true
# personal_dictionary: file for words you add via "Add to dictionary". Defaults to
# %APPDATA%\com.mynl.writedown\personal-dictionary.txt. Point it at a synced folder to
# carry your added words across machines.
# personal_dictionary = "C:/Users/steve/Documents/CloudStation/writedown-personal.dic"

# ── Custom keybindings ───────────────────────────────────────────────────────────────────────
# Remap or add EDITOR keys without a rebuild — edit here, save, and they apply live. Format:
#   "Friendly+Key" = "actionName"
# Press F1 in the app to see every action name and its current key, or run the palette command
# "Keybindings: Write All Shortcuts to Config" to fill a [keys] block below with EVERY current
# binding, ready to edit. Notes:
#   • Set a key to "" to unbind a default:      "Ctrl+D" = ""
#   • Chords use a space:                       "Ctrl+K Ctrl+U" = "upperCase"
#   • Ctrl+Alt+<letter> combos can be flaky on Windows (WebView2 treats Ctrl+Alt as AltGr).
#   • App-level keys (Save, Ctrl+W, palette, F5) are NOT remappable here.
# [keys]
# "Ctrl+Shift+K" = "deleteLine"
# "F9" = "sortLines"
# "Ctrl+Enter" = "insertLineAfter"

# ── Snippets ─────────────────────────────────────────────────────────────────────────────────
# Palette "Insert: <name>" entries. Value = text inserted at the cursor. ${} marks where the
# cursor lands (several = Tab-through stops); ${SELECTION} is replaced with the selected text.
# TOML multi-line strings ('''…''') keep bodies readable. Built-ins ("Aligned Math",
# "Python Code Cell") can be overridden by name, or removed by setting them to "".
# [snippets]
# "Display Math" = '''
# $$
# ${}
# $$
# '''
"#;

/// `~/.writedown/`.
pub fn writedown_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let home = app.path().home_dir().map_err(|e| e.to_string())?;
    Ok(home.join(".writedown"))
}

/// Create the app directory tree and a default `config.toml` if missing (spec §5).
pub fn ensure_setup(app: &tauri::AppHandle) -> Result<(), String> {
    let dir = writedown_dir(app)?;
    for sub in ["", "cache", "index", "logs", "themes", "projects"] {
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
    /// Trim trailing spaces/tabs on save ([editor] trim_trailing_whitespace), normalized
    /// to "all" (true, the default) | "keep-hard-breaks" | "off" (false). CSV/TSV are
    /// always exempt (store.ts saveDoc).
    trim_trailing_whitespace: Option<String>,
    /// Editor indent width in spaces ([editor] tab_size, default 4). Indentation is spaces-only.
    tab_size: Option<u32>,
    /// Shortest nearby word Tab word-completion will offer ([editor] tab_complete_min_len,
    /// default 5) — shorter words aren't worth a Tab.
    tab_complete_min_len: Option<u32>,
    /// Offer frequent words from the background dictionary after nearby matches
    /// ([editor] tab_complete_dict, default true).
    tab_complete_dict: Option<bool>,
    /// Shortest word the frequency dictionary collects ([editor] tab_complete_dict_min_len,
    /// default 5).
    tab_complete_dict_min_len: Option<u32>,
    /// Font-size px bounds for wheel/key zoom ([editor] font_size_min / font_size_max,
    /// defaults 6 / 24) — a hard floor and cap so zoom can't shrink to nothing or blow up.
    font_size_min: Option<u32>,
    font_size_max: Option<u32>,
    outline_font_family: Option<String>,
    outline_font_size: Option<f64>,
    outline_font_weight: Option<String>,
    /// Outline pane side ([outline] position): "left" or "right" (default). "left" places it
    /// between the tree and editor; "right" is the far-right column.
    outline_position: Option<String>,
    tree_font_family: Option<String>,
    tree_font_size: Option<f64>,
    tree_font_weight: Option<String>,
    /// TOC guide-line appearance ([outline] guide_color / guide_opacity).
    outline_guide_color: Option<String>,
    outline_guide_opacity: Option<f64>,
    /// Document tab strip sizing ([tabs] height / width), in px.
    tab_height: Option<f64>,
    tab_width: Option<f64>,
    /// Prose spellchecker ([spelling] enabled / language / min_length / skip_proper_nouns).
    /// The personal-dictionary path is read entirely in Rust (spelling.rs) — the frontend
    /// only needs the on/off gate and the tokenizer knobs.
    spelling_enabled: Option<bool>,
    spelling_language: Option<String>,
    /// Shortest word the tokenizer will spell-check ([spelling] min_length, default 4).
    spelling_min_length: Option<u32>,
    /// Skip mid-sentence Capitalized words as proper nouns ([spelling] skip_proper_nouns,
    /// default true).
    spelling_skip_proper_nouns: Option<bool>,
    /// `[files] quick_file`: file opened by Ctrl+Shift+Q / "Open Quick File".
    quick_file: Option<String>,
    /// User keybinding overrides from `[keys]`: friendly-key string → action name.
    keys: Option<HashMap<String, String>>,
    /// Palette insert snippets from `[snippets]`: display name → body ("" removes a built-in).
    snippets: Option<HashMap<String, String>>,
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
        trim_trailing_whitespace: ed
            .and_then(|e| e.get("trim_trailing_whitespace"))
            .and_then(|v| {
                if let Some(b) = v.as_bool() {
                    return Some(if b { "all" } else { "off" }.to_string());
                }
                v.as_str().map(|s| match s {
                    "keep-hard-breaks" | "off" => s.to_string(),
                    _ => "all".to_string(), // unknown strings fall back to the default
                })
            }),
        tab_size: ed
            .and_then(|e| e.get("tab_size"))
            .and_then(|v| v.as_integer())
            .map(|i| i.clamp(1, 16) as u32),
        tab_complete_min_len: ed
            .and_then(|e| e.get("tab_complete_min_len"))
            .and_then(|v| v.as_integer())
            .map(|i| i.clamp(1, 64) as u32),
        tab_complete_dict: ed
            .and_then(|e| e.get("tab_complete_dict"))
            .and_then(|v| v.as_bool()),
        tab_complete_dict_min_len: ed
            .and_then(|e| e.get("tab_complete_dict_min_len"))
            .and_then(|v| v.as_integer())
            .map(|i| i.clamp(3, 32) as u32),
        font_size_min: ed
            .and_then(|e| e.get("font_size_min"))
            .and_then(|v| v.as_integer())
            .map(|i| i.clamp(1, 200) as u32),
        font_size_max: ed
            .and_then(|e| e.get("font_size_max"))
            .and_then(|v| v.as_integer())
            .map(|i| i.clamp(1, 200) as u32),
        outline_font_family: ol.and_then(|o| o.get("font_family")).and_then(string),
        outline_font_size: ol.and_then(|o| o.get("font_size")).and_then(num),
        outline_font_weight: ol.and_then(|o| o.get("font_weight")).and_then(weight),
        outline_position: ol.and_then(|o| o.get("position")).and_then(string),
        tree_font_family: tr.and_then(|t| t.get("font_family")).and_then(string),
        tree_font_size: tr.and_then(|t| t.get("font_size")).and_then(num),
        tree_font_weight: tr.and_then(|t| t.get("font_weight")).and_then(weight),
        outline_guide_color: ol.and_then(|o| o.get("guide_color")).and_then(string),
        outline_guide_opacity: ol.and_then(|o| o.get("guide_opacity")).and_then(num),
        tab_height: tb.and_then(|t| t.get("height")).and_then(num),
        tab_width: tb.and_then(|t| t.get("width")).and_then(num),
        spelling_enabled: sp.and_then(|s| s.get("enabled")).and_then(|v| v.as_bool()),
        spelling_language: sp.and_then(|s| s.get("language")).and_then(string),
        spelling_min_length: sp
            .and_then(|s| s.get("min_length"))
            .and_then(|v| v.as_integer())
            .map(|i| i.clamp(1, 64) as u32),
        spelling_skip_proper_nouns: sp
            .and_then(|s| s.get("skip_proper_nouns"))
            .and_then(|v| v.as_bool()),
        quick_file: val
            .get("files")
            .and_then(|f| f.get("quick_file"))
            .and_then(string),
        keys: val.get("keys").and_then(|v| v.as_table()).map(|t| {
            t.iter()
                .filter_map(|(k, v)| v.as_str().map(|s| (k.clone(), s.to_string())))
                .collect()
        }),
        snippets: val.get("snippets").and_then(|v| v.as_table()).map(|t| {
            t.iter()
                .filter_map(|(k, v)| v.as_str().map(|s| (k.clone(), s.to_string())))
                .collect()
        }),
    })
}

#[cfg(test)]
mod tests {
    use super::DEFAULT_CONFIG;

    #[test]
    fn default_config_is_valid_toml_and_honest() {
        let v: toml::Value = DEFAULT_CONFIG.parse().expect("default config parses as TOML");
        // Live keys the tidy must keep (representatives across sections).
        assert!(v.get("editor").and_then(|e| e.get("word_wrap")).is_some());
        assert!(v.get("editor").and_then(|e| e.get("trim_trailing_whitespace")).is_some());
        assert!(v.get("spelling").and_then(|s| s.get("min_length")).is_some());
        assert!(v.get("spelling").and_then(|s| s.get("skip_proper_nouns")).is_some());
        assert!(v.get("render").and_then(|r| r.get("figure_dpi")).is_some());
        assert!(v.get("bibliography").and_then(|b| b.get("default_file")).is_some());
        // Inert keys/sections the tidy removed must not reappear (the template only
        // advertises options the code actually reads).
        assert!(v.get("preview").is_none(), "[preview] is decorative");
        assert!(v.get("theme").is_none(), "[theme] is decorative");
        assert!(v.get("general").is_none(), "[general] is decorative");
        assert!(v.get("files").and_then(|f| f.get("extensions")).is_none());
        // tab_size is a WIRED live key (editor indent width) — it stays in the template.
        assert!(v.get("editor").and_then(|e| e.get("tab_size")).is_some());
    }
}
