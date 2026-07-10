//! Offline English (US) prose spellchecking. The affix rules and word list (SCOWL-derived
//! en_US Hunspell dictionaries) are embedded at compile time and parsed once by the pure-Rust
//! `spellbook` crate — no C library, no network, no external files to resolve. The frontend
//! tokenizes prose (skipping code/math/citations via the CodeMirror syntax tree) and sends a
//! deduped word list here; this module only answers "is it a word, and if not, what might you
//! mean?". Words the user adds live in an ordinary plain-text file the user owns (durable —
//! NOT under the disposable `~/.writedown/` tree), so they are never lost.

use serde::Serialize;
use spellbook::Dictionary;
use std::collections::{HashMap, HashSet};
use std::io::Write;
use std::path::PathBuf;
use std::sync::{Mutex, OnceLock};
use tauri::Manager;

// The en_US dictionary, embedded in the binary. `include_str!` requires valid UTF-8 — the
// wooorm/dictionaries `en` files declare `SET UTF-8`, so this holds.
const AFF: &str = include_str!("../assets/dict/en_US.aff");
const DIC: &str = include_str!("../assets/dict/en_US.dic");

/// Parsed once on first use. `None` means the embedded data failed to parse — a build/data
/// bug we surface (stderr + an Err from `spell_check`) rather than silently disabling checks.
static DICT: OnceLock<Option<Dictionary>> = OnceLock::new();

fn dict() -> Option<&'static Dictionary> {
    DICT.get_or_init(|| match Dictionary::new(AFF, DIC) {
        Ok(d) => Some(d),
        Err(e) => {
            eprintln!("writedown: spell dictionary parse failed: {e}");
            None
        }
    })
    .as_ref()
}

/// At most this many distinct misspelled words get suggestions computed per call (suggestions
/// are the expensive part). Beyond it, the word is still underlined — just without quick-fixes.
const MAX_SUGGEST_WORDS: usize = 64;
/// Suggestions offered per misspelled word.
const MAX_SUGGESTIONS: usize = 5;

/// Per-app spell state (Tauri-managed). The dictionary itself is a process-wide `OnceLock`;
/// this holds the user's personal words plus memo caches so repeat idle lint cycles are cheap.
#[derive(Default)]
pub struct SpellState {
    /// Words the user added (stored lowercased for case-insensitive matching).
    personal: Mutex<HashSet<String>>,
    /// word -> is-correct. Bounded by the document's vocabulary; cleared on add/reload.
    check_cache: Mutex<HashMap<String, bool>>,
    /// misspelled word -> suggestions (the costly result). Cleared on add/reload.
    suggest_cache: Mutex<HashMap<String, Vec<String>>>,
}

#[derive(Serialize)]
pub struct SpellResult {
    word: String,
    suggestions: Vec<String>,
}

fn is_correct(dict: &Dictionary, personal: &HashSet<String>, word: &str) -> bool {
    dict.check(word) || personal.contains(&word.to_lowercase())
}

/// Check a deduped word list; return ONLY the misspelled ones, each with up to five
/// suggestions. Correct words are omitted (like `check_citation_keys` returns only the misses).
#[tauri::command]
pub fn spell_check(
    words: Vec<String>,
    state: tauri::State<SpellState>,
) -> Result<Vec<SpellResult>, String> {
    let Some(dict) = dict() else {
        return Err("spell dictionary unavailable".into());
    };
    let personal = state.personal.lock().unwrap();
    let mut check_cache = state.check_cache.lock().unwrap();
    let mut suggest_cache = state.suggest_cache.lock().unwrap();

    let mut out = Vec::new();
    let mut suggested = 0usize;
    for w in words {
        let ok = match check_cache.get(&w) {
            Some(&c) => c,
            None => {
                let c = is_correct(dict, &personal, &w);
                check_cache.insert(w.clone(), c);
                c
            }
        };
        if ok {
            continue;
        }
        let suggestions = if let Some(s) = suggest_cache.get(&w) {
            s.clone()
        } else if suggested < MAX_SUGGEST_WORDS {
            suggested += 1;
            let mut s = Vec::new();
            dict.suggest(&w, &mut s);
            s.truncate(MAX_SUGGESTIONS);
            suggest_cache.insert(w.clone(), s.clone());
            s
        } else {
            Vec::new()
        };
        out.push(SpellResult { word: w, suggestions });
    }
    Ok(out)
}

/// Append a word to the personal dictionary and make it count as correct immediately.
/// Idempotent. Write failures are surfaced (Err), never swallowed.
#[tauri::command]
pub fn add_to_dictionary(
    word: String,
    app: tauri::AppHandle,
    state: tauri::State<SpellState>,
) -> Result<(), String> {
    let word = word.trim().to_string();
    if word.is_empty() || word.contains(['\n', '\r']) {
        return Err("invalid word".into());
    }
    let lower = word.to_lowercase();
    {
        let mut personal = state.personal.lock().unwrap();
        if personal.contains(&lower) {
            return Ok(()); // already known — nothing to do
        }
        let path = personal_dict_path(&app)?;
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent).map_err(|e| format!("create {}: {e}", parent.display()))?;
        }
        let mut f = std::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(&path)
            .map_err(|e| format!("open {}: {e}", path.display()))?;
        writeln!(f, "{word}").map_err(|e| format!("write {}: {e}", path.display()))?;
        personal.insert(lower);
    }
    // A newly-added word may flip prior "misspelled" verdicts — drop the memo caches.
    state.check_cache.lock().unwrap().clear();
    state.suggest_cache.lock().unwrap().clear();
    Ok(())
}

/// Re-read the personal dictionary from disk (e.g. after the `[spelling] personal_dictionary`
/// path changed, or the file was edited by hand) and drop the memo caches.
#[tauri::command]
pub fn spell_reload(app: tauri::AppHandle, state: tauri::State<SpellState>) -> Result<(), String> {
    let words = load_personal(&app)?;
    *state.personal.lock().unwrap() = words;
    state.check_cache.lock().unwrap().clear();
    state.suggest_cache.lock().unwrap().clear();
    Ok(())
}

/// Parse the embedded dictionary and load the personal word list off the main thread (called
/// from `setup`, like the bibliography). Failures are logged, never fatal.
pub fn warm(app: &tauri::AppHandle) {
    let _ = dict(); // pay the one-time parse cost now, not on the first keystroke
    let state = app.state::<SpellState>();
    match load_personal(app) {
        Ok(words) => *state.personal.lock().unwrap() = words,
        Err(e) => eprintln!("writedown: personal dictionary load failed: {e}"),
    }
}

/// Personal-dictionary file location. `[spelling] personal_dictionary` wins if set; otherwise
/// the OS roaming app-config dir (durable, distinct from the disposable `~/.writedown/`).
fn personal_dict_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    if let Some(p) = config_personal_path(app) {
        return Ok(PathBuf::from(p));
    }
    let dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    Ok(dir.join("personal-dictionary.txt"))
}

/// The `[spelling] personal_dictionary` override, if present and non-empty.
fn config_personal_path(app: &tauri::AppHandle) -> Option<String> {
    let cfg = crate::config::writedown_dir(app).ok()?.join("config.toml");
    let txt = std::fs::read_to_string(&cfg).ok()?;
    let val: toml::Value = txt.parse().ok()?;
    let p = val
        .get("spelling")?
        .get("personal_dictionary")?
        .as_str()?
        .trim()
        .to_string();
    (!p.is_empty()).then_some(p)
}

/// Read the personal dictionary: one word per line, `#` comments and blank lines ignored,
/// stored lowercased. A missing file is empty, not an error.
fn load_personal(app: &tauri::AppHandle) -> Result<HashSet<String>, String> {
    let path = personal_dict_path(app)?;
    let text = match std::fs::read_to_string(&path) {
        Ok(t) => t,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(HashSet::new()),
        Err(e) => return Err(format!("read {}: {e}", path.display())),
    };
    Ok(text
        .lines()
        .map(str::trim)
        .filter(|l| !l.is_empty() && !l.starts_with('#'))
        .map(|l| l.to_lowercase())
        .collect())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn known_words_pass_unknown_fail() {
        let d = dict().expect("embedded dictionary parses");
        assert!(d.check("hello"));
        assert!(d.check("the"));
        assert!(!d.check("teh"));
        assert!(!d.check("intergal"));
    }

    #[test]
    fn suggests_the_for_teh() {
        let d = dict().expect("embedded dictionary parses");
        let mut s = Vec::new();
        d.suggest("teh", &mut s);
        assert!(s.iter().any(|x| x == "the"), "suggestions were {s:?}");
    }

    #[test]
    fn personal_words_count_as_correct_case_insensitively() {
        let d = dict().expect("embedded dictionary parses");
        let mut personal = HashSet::new();
        assert!(!is_correct(d, &personal, "Mildenhall"));
        personal.insert("mildenhall".to_string());
        assert!(is_correct(d, &personal, "Mildenhall"));
        assert!(is_correct(d, &personal, "mildenhall"));
    }
}
