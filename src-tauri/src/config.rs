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
# fill_column: column "Reflow Paragraph" (Alt+Q) hard-wraps at (default 80).
# fill_column = 80
# tab_complete_min_len: shortest nearby word Tab word-completion will offer (default 5).
# tab_complete_min_len = 5
# tab_complete_dict: also offer your frequently-used words — collected in the background
# from every doc you open or save — after the nearby matches (default true).
# tab_complete_dict = true
# tab_complete_dict_min_len: shortest word the frequency dictionary collects (default 5).
# tab_complete_dict_min_len = 5
# tab_complete_stem_min: after a word at least this long, a Tab that finds no completion is
# swallowed (with a status-bar note) instead of indenting the line (default 2). Tab at line
# start or after whitespace always indents.
# tab_complete_stem_min = 2
# font_size_min / font_size_max: px floor and cap for Ctrl+wheel / Ctrl+= zoom (default 6 / 24).
# font_size_min = 6
# font_size_max = 24
word_wrap = true
# font_choices: families offered as palette "Font: <name>" verbs. Choosing one applies for
# this session only — it is never written back here.
# font_choices = ["Source Code Pro", "Cascadia Mono", "Consolas"]
# trim_trailing_whitespace: strip spaces/tabs from line ends when a file is saved.
# true trims them all (Sublime-style); "keep-hard-breaks" spares markdown two-plus-
# space line breaks (tip: a trailing backslash is the trim-proof hard break); false
# disables. CSV/TSV files are never trimmed.
trim_trailing_whitespace = true
# Stamp formats for the palette's "Insert Date" and "Insert Date-Time" (strftime patterns:
# %Y year, %m month, %d day, %H:%M:%S time, %A weekday, %B month name). Defaults below.
# date_format = "%Y-%m-%d"
# datetime_format = "%Y-%m-%d %H:%M:%S"

[git]
# Git marks (read-only `git status` / `git show`; never any mutating command, no network).
# tree_marks tints changed/added/untracked files in the sidebar; gutter_marks adds per-line
# change stripes in the editor (updated on open and save). Both silently off outside a repo.
# exe: full path to git.exe when git is not on PATH.
tree_marks = true
gutter_marks = false
# exe = "C:\\Program Files\\Git\\cmd\\git.exe"

[outline]
# Outline pane side: "left" (between the tree and editor) or "right" (far right, past the preview).
position = "right"
# Python outlines list every class member. python_show_private = false hides _private ones;
# python_show_dunder = true adds __dunder__ ones (__init__ is always listed).
# python_show_private = true
# python_show_dunder = false
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
# traceback_mode: how a failing cell is reported. Writedown formats tracebacks itself (there
# is no IPython here), so this costs nothing and runs only when a cell raises.
#   minimal  exception type + message, no frames
#   plain    exactly what python prints, including Writedown's own runner frames
#   context  your frames only, with the failing source line          <- default
#   verbose  context + the local variables in each frame
#   docs     context + the docstring of the function in each frame
# A document can override it with `wd-traceback: verbose` in its front matter, or a cell
# with `%xmode verbose` — the one magic Writedown interprets instead of ignoring.
traceback_mode = "context"

[window]
# Title bar colour (Windows 11 only — Windows 10 ignores it and keeps the system caption).
# Defaults to the logo's orange with the logo's navy for the title text, so Writedown is
# findable in a taskbar full of grey captions. Value is RRGGBB (a leading hash is optional);
# 'none' leaves that part of the caption to Windows.
# NOTE single quotes: a double quote immediately followed by a hash would end this very
# string literal, so the examples below deliberately use TOML literal strings.
# titlebar_color = '#DD9536'
# titlebar_text_color = '#15385D'

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
# quick_files: the pick-list behind palette "Open Quick File…" — fuzzy-search these by name
# or folder and Enter to open. Independent of quick_file, which keeps Ctrl+Shift+Q. Listed
# in the order you write them (that IS your preference order); missing files show greyed.
# quick_files = [
#   'C:\path\to\notes.md',
#   'C:\path\to\issues.md',
# ]

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
# personal_dictionary = "D:/notes/writedown-personal-dictionary.txt"

[search]
# Find in Files (Ctrl+Shift+F) runs ripgrep over the project's folders. The palette line is
# rg's argument line: `TODO`, `-c TODO` (counts per file), `-l amsmath` (file list),
# `-i "risk measure" -g *.qmd`. These globs are passed as -g unless the line has its own
# -g / -t; max_hits and timeout_ms are hard caps (the search stops and says so).
globs = ["*.md", "*.qmd", "*.py", "*.bib", "*.toml", "*.txt", "*.yaml", "*.yml"]
max_hits = 500
timeout_ms = 5000

# ── Per-file-type editor fonts ───────────────────────────────────────────────────────────────
# Extension (lowercase, no dot) → font family. Overrides [editor] font_family for those files;
# every other type keeps font_family. NOTE this is a TOML sub-table, so it must stay BELOW all
# the plain [editor] keys — anything written after it belongs to it, not to [editor].
# [editor.font_by_ext]
# py = "Cascadia Mono"
# md = "Source Code Pro"

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

# ── Unicode picker additions ─────────────────────────────────────────────────────────────────
# Extra entries and aliases for Ctrl+Shift+U ("Insert: Unicode Character…"). Key = the name
# you want to search for, value = the character. Repeat a character under several names to
# give it aliases. Setting a BUILT-IN name to "" removes it. Nothing here is needed for
# ordinary use — the built-in table already carries LaTeX names, Unicode names and emoji
# keywords — this is for your own shorthand.
# [symbols]
# "sjm" = "✠"
# "wat" = "⁇"

# ── Build commands ─────────────────────────────────────────────────────────────────────────────
# Run an external script/command against the current file — Sublime's build system. Each entry is
# a palette "Build: <name>" verb; Ctrl+Shift+B runs the last one used (or the first configured).
# The buffer is saved first, then the command runs THROUGH PWSH from the file's own folder, so a
# .bat, a .ps1, an .exe, or a bare command on PATH all behave exactly as in a terminal. Variables
# (substituted, quoted, so spaces are safe):
#   $file  (full path)    $file_path  (its folder, = the working directory)
#   $file_name  (name.ext)    $file_base_name  (name, no ext)    $file_extension
# Output goes to the status bar; a failed build opens its stdout/stderr in a scratch tab.
# A program path with spaces needs the pwsh call operator, e.g.  "& 'C:/my tools/build.bat' $file".
# [build]
# "pdf" = "my-pandoc-script $file"
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
    // The bundled user guide, refreshed every launch so it always matches the running
    // build (derived/disposable — edits to this copy are expendable; HELP.md in the
    // repo is canonical).
    let help = dir.join("help.md");
    std::fs::write(&help, include_str!("../../HELP.md"))
        .map_err(|e| format!("write help.md: {e}"))?;
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

/// Absolute path to the bundled user guide's launch-time copy (for "Open Help").
#[tauri::command]
pub fn help_path(app: tauri::AppHandle) -> Result<String, String> {
    Ok(writedown_dir(&app)?.join("help.md").to_string_lossy().to_string())
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
    /// Per-file-type editor font from `[editor.font_by_ext]` — lowercase extension → family
    /// (issue A.05). Beats `font_family`; the imported Sublime face is the final fallback.
    font_by_ext: Option<HashMap<String, String>>,
    /// `[editor] font_choices`: families offered as palette "Font: <name>" verbs. The choice
    /// is a session override only — never written back to config.
    font_choices: Option<Vec<String>>,
    /// Editor word wrap default ([editor] word_wrap). Runtime toggle is session-only.
    word_wrap: Option<bool>,
    /// Trim trailing spaces/tabs on save ([editor] trim_trailing_whitespace), normalized
    /// to "all" (true, the default) | "keep-hard-breaks" | "off" (false). CSV/TSV are
    /// always exempt (store.ts saveDoc).
    trim_trailing_whitespace: Option<String>,
    /// Editor indent width in spaces ([editor] tab_size, default 4). Indentation is spaces-only.
    tab_size: Option<u32>,
    /// Column "Reflow Paragraph" (Alt+Q) hard-wraps at ([editor] fill_column, default 80).
    fill_column: Option<u32>,
    /// Shortest nearby word Tab word-completion will offer ([editor] tab_complete_min_len,
    /// default 5) — shorter words aren't worth a Tab.
    tab_complete_min_len: Option<u32>,
    /// Offer frequent words from the background dictionary after nearby matches
    /// ([editor] tab_complete_dict, default true).
    tab_complete_dict: Option<bool>,
    /// Shortest word the frequency dictionary collects ([editor] tab_complete_dict_min_len,
    /// default 5).
    tab_complete_dict_min_len: Option<u32>,
    /// Shortest stem after which Tab is CONSUMED rather than indenting when no completion
    /// matches ([editor] tab_complete_stem_min, default 2). Deliberately low: the workflow
    /// is 1-3 letters then Tab, and those short stems are the ones that miss.
    tab_complete_stem_min: Option<u32>,
    /// Font-size px bounds for wheel/key zoom ([editor] font_size_min / font_size_max,
    /// defaults 6 / 24) — a hard floor and cap so zoom can't shrink to nothing or blow up.
    font_size_min: Option<u32>,
    font_size_max: Option<u32>,
    /// Python outline: show `_private` members ([outline] python_show_private, default
    /// true) and `__dunder__` members ([outline] python_show_dunder, default false;
    /// `__init__` is always shown).
    outline_python_show_private: Option<bool>,
    outline_python_show_dunder: Option<bool>,
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
    /// `[files] quick_files`: the pick-list behind the palette's "Open Quick File…"
    /// (issue D.04). Independent of `quick_file`, which keeps Ctrl+Shift+Q to itself.
    quick_files: Option<Vec<String>>,
    /// `[editor] date_format` / `datetime_format`: strftime-style patterns for the two
    /// stamp verbs (issue D.01). Defaults reproduce the previous hard-coded output.
    date_format: Option<String>,
    datetime_format: Option<String>,
    /// `[symbols]`: user additions and aliases for the Unicode picker (issue D.12) —
    /// name → character, `""` removes a built-in. Same override rules as `[snippets]`.
    symbols: Option<HashMap<String, String>>,
    /// User keybinding overrides from `[keys]`: friendly-key string → action name.
    keys: Option<HashMap<String, String>>,
    /// Palette insert snippets from `[snippets]`: display name → body ("" removes a built-in).
    snippets: Option<HashMap<String, String>>,
    /// Sublime-style build commands from `[build]`: name → command line (run through pwsh
    /// against the current file). Each becomes a "Build: <name>" palette verb.
    build: Option<HashMap<String, String>>,
    /// `[search]` (Find in Files, Ctrl+Shift+F): default file globs handed to ripgrep as
    /// `-g` unless the query brings its own, and the two hard caps.
    search_globs: Option<Vec<String>>,
    search_max_hits: Option<u64>,
    search_timeout_ms: Option<u64>,
    /// `[git] tree_marks` (default true) / `gutter_marks` (default false), issue I.02.
    /// The palette's Git: … On/Off verbs override these for the session only.
    git_tree_marks: Option<bool>,
    git_gutter_marks: Option<bool>,
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
        font_by_ext: ed
            .and_then(|e| e.get("font_by_ext"))
            .and_then(|v| v.as_table())
            .map(|t| {
                t.iter()
                    .filter_map(|(k, v)| v.as_str().map(|s| (k.to_lowercase(), s.to_string())))
                    .collect()
            }),
        font_choices: ed.and_then(|e| e.get("font_choices")).and_then(|v| v.as_array()).map(|a| {
            a.iter().filter_map(|v| v.as_str().map(str::to_string)).collect()
        }),
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
        fill_column: ed
            .and_then(|e| e.get("fill_column"))
            .and_then(|v| v.as_integer())
            .map(|i| i.clamp(20, 400) as u32),
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
        tab_complete_stem_min: ed
            .and_then(|e| e.get("tab_complete_stem_min"))
            .and_then(|v| v.as_integer())
            .map(|i| i.clamp(1, 32) as u32),
        outline_python_show_private: ol
            .and_then(|o| o.get("python_show_private"))
            .and_then(|v| v.as_bool()),
        outline_python_show_dunder: ol
            .and_then(|o| o.get("python_show_dunder"))
            .and_then(|v| v.as_bool()),
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
        quick_files: val
            .get("files")
            .and_then(|f| f.get("quick_files"))
            .and_then(|v| v.as_array())
            .map(|a| a.iter().filter_map(|v| v.as_str().map(str::to_string)).collect()),
        date_format: ed.and_then(|e| e.get("date_format")).and_then(string),
        datetime_format: ed.and_then(|e| e.get("datetime_format")).and_then(string),
        symbols: val.get("symbols").and_then(|v| v.as_table()).map(|t| {
            t.iter()
                .filter_map(|(k, v)| v.as_str().map(|s| (k.clone(), s.to_string())))
                .collect()
        }),
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
        build: val.get("build").and_then(|v| v.as_table()).map(|t| {
            t.iter()
                .filter_map(|(k, v)| v.as_str().map(|s| (k.clone(), s.to_string())))
                .collect()
        }),
        search_globs: val
            .get("search")
            .and_then(|s| s.get("globs"))
            .and_then(|v| v.as_array())
            .map(|a| a.iter().filter_map(|v| v.as_str().map(str::to_string)).collect()),
        search_max_hits: val
            .get("search")
            .and_then(|s| s.get("max_hits"))
            .and_then(|v| v.as_integer())
            .filter(|n| *n > 0)
            .map(|n| n as u64),
        search_timeout_ms: val
            .get("search")
            .and_then(|s| s.get("timeout_ms"))
            .and_then(|v| v.as_integer())
            .filter(|n| *n > 0)
            .map(|n| n as u64),
        git_tree_marks: val.get("git").and_then(|g| g.get("tree_marks")).and_then(|v| v.as_bool()),
        git_gutter_marks: val.get("git").and_then(|g| g.get("gutter_marks")).and_then(|v| v.as_bool()),
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
        assert!(v.get("search").and_then(|s| s.get("globs")).is_some());
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
