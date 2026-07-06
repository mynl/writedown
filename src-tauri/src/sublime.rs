//! Import the user's Sublime Text colour scheme (spec §11). Reads
//! `Preferences.sublime-settings` for the active scheme + font, then the referenced
//! `.sublime-color-scheme` (JSON5: comments + trailing commas), resolving `var(...)`
//! and `color(<c> alpha(<a>))` into concrete CSS colours. Writedown never writes to
//! the Sublime config.

use serde::Serialize;
use serde_json::{Map, Value};

#[derive(Serialize, Default)]
pub struct ScopeRule {
    scope: String,
    foreground: Option<String>,
    background: Option<String>,
    font_style: Option<String>,
}

#[derive(Serialize, Default)]
pub struct SublimeTheme {
    name: String,
    dark: bool,
    background: String,
    foreground: String,
    caret: String,
    selection: String,
    line_highlight: String,
    font_face: String,
    font_size: u32,
    line_padding_top: f64,
    line_padding_bottom: f64,
    rules: Vec<ScopeRule>,
}

fn hex_to_rgba(hex: &str, alpha: f64) -> String {
    let h = hex.trim_start_matches('#');
    if h.len() >= 6 {
        if let (Ok(r), Ok(g), Ok(b)) = (
            u8::from_str_radix(&h[0..2], 16),
            u8::from_str_radix(&h[2..4], 16),
            u8::from_str_radix(&h[4..6], 16),
        ) {
            return format!("rgba({r},{g},{b},{alpha})");
        }
    }
    hex.to_string()
}

/// Resolve a Sublime colour expression to a CSS colour string.
fn resolve(val: &str, vars: &Map<String, Value>) -> Option<String> {
    let v = val.trim();
    if let Some(rest) = v.strip_prefix("var(").and_then(|s| s.strip_suffix(')')) {
        let inner = vars.get(rest.trim())?.as_str()?;
        return resolve(inner, vars);
    }
    if let Some(rest) = v.strip_prefix("color(").and_then(|s| s.strip_suffix(')')) {
        if let Some(ai) = rest.find("alpha(") {
            let color_part = rest[..ai].trim();
            let alpha = rest[ai + 6..].trim().trim_end_matches(')').trim();
            let base = resolve(color_part, vars)?;
            return Some(hex_to_rgba(&base, alpha.parse().unwrap_or(1.0)));
        }
        return resolve(rest.trim(), vars);
    }
    if v.starts_with('#') {
        return Some(v.to_string());
    }
    None
}

fn luminance(hex: &str) -> f64 {
    let h = hex.trim_start_matches('#');
    if h.len() >= 6 {
        if let (Ok(r), Ok(g), Ok(b)) = (
            u8::from_str_radix(&h[0..2], 16),
            u8::from_str_radix(&h[2..4], 16),
            u8::from_str_radix(&h[4..6], 16),
        ) {
            return (0.299 * r as f64 + 0.587 * g as f64 + 0.114 * b as f64) / 255.0;
        }
    }
    0.0
}

fn user_dir() -> Option<std::path::PathBuf> {
    let appdata = std::env::var_os("APPDATA")?;
    let dir = std::path::Path::new(&appdata)
        .join("Sublime Text")
        .join("Packages")
        .join("User");
    dir.exists().then_some(dir)
}

/// Find the scheme file by base name — first in User, then anywhere under Packages.
fn find_scheme(user: &std::path::Path, name: &str) -> Option<std::path::PathBuf> {
    let base = std::path::Path::new(name).file_name()?.to_str()?;
    let direct = user.join(base);
    if direct.exists() {
        return Some(direct);
    }
    let packages = user.parent()?;
    let mut stack = vec![packages.to_path_buf()];
    while let Some(d) = stack.pop() {
        if let Ok(rd) = std::fs::read_dir(&d) {
            for it in rd.flatten() {
                let p = it.path();
                if p.is_dir() {
                    stack.push(p);
                } else if p.file_name().and_then(|n| n.to_str()) == Some(base) {
                    return Some(p);
                }
            }
        }
    }
    None
}

#[tauri::command]
pub fn load_sublime_theme() -> Result<SublimeTheme, String> {
    let user = user_dir().ok_or("Sublime Text User directory not found")?;

    let prefs_txt = std::fs::read_to_string(user.join("Preferences.sublime-settings"))
        .map_err(|e| format!("read Preferences: {e}"))?;
    let prefs: Value = json5::from_str(&prefs_txt).map_err(|e| format!("parse Preferences: {e}"))?;

    let scheme_name = prefs
        .get("color_scheme")
        .or_else(|| prefs.get("dark_color_scheme"))
        .and_then(|v| v.as_str())
        .ok_or("no color_scheme in Preferences")?;
    let font_face = prefs
        .get("font_face")
        .and_then(|v| v.as_str())
        .unwrap_or("Consolas")
        .to_string();
    let font_size = prefs.get("font_size").and_then(|v| v.as_u64()).unwrap_or(15) as u32;
    let lpt = prefs.get("line_padding_top").and_then(|v| v.as_f64()).unwrap_or(0.0);
    let lpb = prefs.get("line_padding_bottom").and_then(|v| v.as_f64()).unwrap_or(0.0);

    let scheme_path = find_scheme(&user, scheme_name)
        .ok_or_else(|| format!("colour scheme file not found: {scheme_name}"))?;
    let scheme_txt =
        std::fs::read_to_string(&scheme_path).map_err(|e| format!("read scheme: {e}"))?;
    let scheme: Value = json5::from_str(&scheme_txt).map_err(|e| format!("parse scheme: {e}"))?;

    let empty = Map::new();
    let vars = scheme.get("variables").and_then(|v| v.as_object()).unwrap_or(&empty);
    let globals = scheme.get("globals").and_then(|v| v.as_object()).unwrap_or(&empty);
    let g = |k: &str, default: &str| -> String {
        globals
            .get(k)
            .and_then(|v| v.as_str())
            .and_then(|s| resolve(s, vars))
            .unwrap_or_else(|| default.to_string())
    };

    let background = g("background", "#1e1e1e");
    let foreground = g("foreground", "#e6e6e6");
    let caret = g("caret", &foreground);
    let selection = g("selection", "rgba(120,150,200,0.4)");
    let line_highlight = g("line_highlight", "rgba(255,255,255,0.06)");

    let mut rules = Vec::new();
    if let Some(arr) = scheme.get("rules").and_then(|v| v.as_array()) {
        for r in arr {
            let scope = r.get("scope").and_then(|v| v.as_str()).unwrap_or("").to_string();
            if scope.is_empty() {
                continue;
            }
            rules.push(ScopeRule {
                scope,
                foreground: r.get("foreground").and_then(|v| v.as_str()).and_then(|s| resolve(s, vars)),
                background: r.get("background").and_then(|v| v.as_str()).and_then(|s| resolve(s, vars)),
                font_style: r.get("font_style").and_then(|v| v.as_str()).map(str::to_string),
            });
        }
    }

    Ok(SublimeTheme {
        name: scheme.get("name").and_then(|v| v.as_str()).unwrap_or("Sublime").to_string(),
        dark: luminance(&background) < 0.5,
        background,
        foreground,
        caret,
        selection,
        line_highlight,
        font_face,
        font_size,
        line_padding_top: lpt,
        line_padding_bottom: lpb,
        rules,
    })
}
