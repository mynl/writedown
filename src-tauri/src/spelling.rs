//! Offline English (US) prose spellchecking. The affix rules and word list (SCOWL-derived
//! en_US Hunspell dictionaries) are embedded at compile time and parsed once by the pure-Rust
//! `spellbook` crate — no C library, no network, no external files to resolve. The frontend
//! tokenizes prose (skipping code/math/citations via the CodeMirror syntax tree) and sends a
//! deduped word list here; this module only answers "is it a word, and if not, what might you
//! mean?". Words the user adds live in an ordinary plain-text file the user owns (durable —
//! NOT under the disposable `~/.writedown/` tree), so they are never lost.

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

/// Written to the personal dictionary the first time it is created, so common file
/// extensions and tooling/domain terms don't get underlined out of the box. Ordinary
/// plain text the user fully owns and can edit; "Add to dictionary" appends below it.
/// Only ever written when the file is ABSENT — a hand-edited or emptied file is never
/// reseeded, so deletions are respected.
const SEED: &str = r#"# Writedown personal dictionary — words treated as correctly spelled.
# One word per line; '#' starts a comment; matching is case-insensitive. Words you add
# via "Add to dictionary" are appended below. Edit freely, then run the palette command
# "Reload Personal Dictionary" (or save config.toml) to pick up hand edits.

# — file extensions —
md
qmd
markdown
toml
json
yaml
yml
csv
tsv
png
jpg
jpeg
svg
gif
pdf
docx
xlsx
pptx
ipynb
py
rs
ts
tsx
js
jsx
html
css
scss
bib
tex
bat
sh
exe
dll
zip

# — tools & domain terms —
writedown
quarto
pandoc
tauri
zustand
codemirror
lezer
katex
dompurify
hunspell
repo
config
changelog
frontmatter
bibtex
crossref
actuary
actuarial
"#;

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

fn is_correct(dict: &Dictionary, personal: &HashSet<String>, word: &str) -> bool {
    if dict.check(word) {
        return true;
    }
    let lower = word.to_lowercase();
    if personal.contains(&lower) {
        return true;
    }
    // Personal words accept their common inflections: adding "quantile" also accepts
    // "quantiles", "quantile's", "quantiled", … Plain stem lookups — spellbook has no
    // runtime add-with-affixes, and asking users for Hunspell flags is hostile.
    for suffix in ["'s", "s'", "es", "s", "ed", "ing"] {
        if let Some(base) = lower.strip_suffix(suffix) {
            if base.len() >= 2 && personal.contains(base) {
                return true;
            }
        }
    }
    // "-ies" plural of a "-y" stem: added "entity" accepts "entities".
    if let Some(base) = lower.strip_suffix("ies") {
        if base.len() >= 2 && personal.contains(&format!("{base}y")) {
            return true;
        }
    }
    false
}

/// Check a deduped word list; return ONLY the misspelled ones. Correct words are omitted
/// (like `check_citation_keys` returns only the misses).
///
/// Suggestions are NOT computed here — see `spell_suggest`. `check` is effectively free
/// (4,450 words in 0.2 ms, release), but `suggest` is ~11 ms per word; computing it for up
/// to 64 misspellings on the first pass over a fresh document was a ~0.7 s stall, and every
/// non-async command runs on the UI thread, so the keyboard went dead with it (issue G.04,
/// numbers from `suggest_speed` below). `async` moves the call off the UI thread as well.
#[tauri::command(async)]
pub fn spell_check(
    words: Vec<String>,
    state: tauri::State<SpellState>,
) -> Result<Vec<String>, String> {
    let Some(dict) = dict() else {
        return Err("spell dictionary unavailable".into());
    };
    let personal = state.personal.lock().unwrap();
    let mut check_cache = state.check_cache.lock().unwrap();

    let mut out = Vec::new();
    for w in words {
        let ok = match check_cache.get(&w) {
            Some(&c) => c,
            None => {
                let c = is_correct(dict, &personal, &w);
                check_cache.insert(w.clone(), c);
                c
            }
        };
        if !ok {
            out.push(w);
        }
    }
    Ok(out)
}

/// Up to five suggestions for one misspelled word, computed when the user opens that
/// misspelling rather than for every misspelling in the document. Memoized until the
/// personal dictionary changes. The suggest runs outside the cache lock so two hovers
/// never serialize on it.
#[tauri::command(async)]
pub fn spell_suggest(word: String, state: tauri::State<SpellState>) -> Result<Vec<String>, String> {
    let Some(dict) = dict() else {
        return Err("spell dictionary unavailable".into());
    };
    if let Some(s) = state.suggest_cache.lock().unwrap().get(&word) {
        return Ok(s.clone());
    }
    let mut s = Vec::new();
    dict.suggest(&word, &mut s);
    s.truncate(MAX_SUGGESTIONS);
    state.suggest_cache.lock().unwrap().insert(word, s.clone());
    Ok(s)
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
    if let Err(e) = ensure_personal_seeded(app) {
        eprintln!("writedown: personal dictionary seed failed: {e}");
    }
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

/// Absolute path to the personal dictionary (for the "Open Personal Dictionary" command).
/// Ensures the file exists — seeded on first creation — so the command always opens a real,
/// populated file rather than a "file not found".
#[tauri::command]
pub fn personal_dictionary_path(app: tauri::AppHandle) -> Result<String, String> {
    ensure_personal_seeded(&app)?;
    Ok(personal_dict_path(&app)?.to_string_lossy().to_string())
}

/// Create + seed the personal dictionary when it does not yet exist. No-op if present, so a
/// hand-edited, emptied, or intentionally-trimmed file is never clobbered or reseeded.
fn ensure_personal_seeded(app: &tauri::AppHandle) -> Result<(), String> {
    let path = personal_dict_path(app)?;
    seed_if_absent(&path).map_err(|e| format!("seed {}: {e}", path.display()))?;
    Ok(())
}

/// Write the seed to `path` only if it is absent. Returns whether it wrote. Pure filesystem
/// logic (no AppHandle) so it is unit-testable.
fn seed_if_absent(path: &std::path::Path) -> std::io::Result<bool> {
    if path.exists() {
        return Ok(false);
    }
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    std::fs::write(path, SEED)?;
    Ok(true)
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
    fn seed_written_once_then_left_alone() {
        // process-id-scoped temp dir keeps parallel test runs from colliding (no Date/rand).
        let dir = std::env::temp_dir().join(format!("wd-seed-test-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        let path = dir.join("personal-dictionary.txt");

        assert!(seed_if_absent(&path).unwrap(), "first call creates the file");
        assert!(path.exists());
        assert!(std::fs::read_to_string(&path).unwrap().contains("quarto"));

        // A hand edit must survive: seeding is a no-op once the file exists.
        std::fs::write(&path, "myword\n").unwrap();
        assert!(!seed_if_absent(&path).unwrap(), "existing file is never reseeded");
        assert_eq!(std::fs::read_to_string(&path).unwrap(), "myword\n");

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn personal_words_match_common_inflections() {
        let d = dict().expect("embedded dictionary parses");
        let mut personal = HashSet::new();
        personal.insert("quantile".to_string());
        personal.insert("mildenhall".to_string());
        personal.insert("copula".to_string());
        assert!(is_correct(d, &personal, "quantiles"));
        assert!(is_correct(d, &personal, "Quantiles"));
        assert!(is_correct(d, &personal, "quantile's"));
        assert!(is_correct(d, &personal, "Mildenhalls"));
        assert!(is_correct(d, &personal, "copulas"));
        assert!(!is_correct(d, &personal, "quantilish"), "unrelated suffixes still flagged");
    }

    #[test]
    fn ies_plural_matches_y_stem() {
        let d = dict().expect("embedded dictionary parses");
        let mut personal = HashSet::new();
        personal.insert("mesokurty".to_string()); // synthetic -y stem, not in en_US
        assert!(is_correct(d, &personal, "mesokurties"));
    }

    /// The cost of the first spell pass on a fresh document (issue G.04), as numbers rather
    /// than a guess: `cargo test --release -- --ignored --nocapture suggest_speed`. Not part
    /// of the normal suite. Reports dictionary parse, `check` throughput, and cold vs warm
    /// `suggest` over 80 plausible misspellings (real words with two letters swapped).
    #[test]
    #[ignore]
    fn suggest_speed() {
        use std::time::Instant;
        let t = Instant::now();
        let fresh = Dictionary::new(AFF, DIC).expect("parses");
        println!("dictionary parse: {:.0} ms", t.elapsed().as_secs_f64() * 1e3);
        let d = &fresh;

        const BASE: &str = "the house quantile actuary reinsurance distribution premium \
            severity frequency aggregate portfolio capital allocation coherent measure \
            expected shortfall variance moment generating function convolution simulation \
            parameter estimate likelihood posterior prior bayesian regression correlation \
            copula dependence marginal conditional independent identical random variable \
            probability density cumulative percentile quantile median average deviation \
            standard normal lognormal gamma pareto weibull exponential poisson binomial \
            negative geometric mixture compound layer excess retention limit attachment \
            treaty facultative catastrophe hurricane earthquake flood wildfire liability \
            property casualty commercial personal automobile homeowners workers claim \
            reserve development triangle chain ladder bornhuetter ferguson ultimate";
        let words: Vec<String> = BASE
            .split_whitespace()
            .filter(|w| w.len() >= 5)
            .take(80)
            .map(|w| {
                // Swap the 2nd and 3rd letters: "house" -> "huose". A typo shape, not gibberish.
                let mut c: Vec<char> = w.chars().collect();
                c.swap(1, 2);
                c.into_iter().collect::<String>()
            })
            .filter(|w| !d.check(w))
            .collect();
        println!("{} misspellings", words.len());

        let t = Instant::now();
        for _ in 0..50 {
            for w in BASE.split_whitespace() {
                std::hint::black_box(d.check(w));
            }
        }
        let n = 50 * BASE.split_whitespace().count();
        println!("check: {n} words in {:.1} ms", t.elapsed().as_secs_f64() * 1e3);

        let mut per: Vec<f64> = Vec::new();
        let t = Instant::now();
        for w in &words {
            let t1 = Instant::now();
            let mut s = Vec::new();
            d.suggest(w, &mut s);
            per.push(t1.elapsed().as_secs_f64() * 1e3);
        }
        let total = t.elapsed().as_secs_f64() * 1e3;
        per.sort_by(|a, b| a.partial_cmp(b).unwrap());
        println!(
            "suggest cold: {} words, total {:.0} ms, median {:.1} ms, max {:.1} ms",
            words.len(),
            total,
            per[per.len() / 2],
            per[per.len() - 1]
        );
        let t = Instant::now();
        for w in &words {
            let mut s = Vec::new();
            d.suggest(w, &mut s);
        }
        println!("suggest again (no app cache — spellbook itself): {:.0} ms", t.elapsed().as_secs_f64() * 1e3);
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
