//! Authoritative BibTeX database (spec §19–22). Parses the configured `.bib` into a
//! disposable in-memory index, fuzzy-searches it with SkimMatcherV2, and re-parses on
//! external change (the user updates the file often). The `.bib` is never modified.

use fuzzy_matcher::skim::SkimMatcherV2;
use fuzzy_matcher::FuzzyMatcher;
use notify::{RecommendedWatcher, RecursiveMode, Watcher};
use serde::Serialize;
use std::collections::HashMap;
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager};

#[derive(Clone, Serialize)]
pub struct BibEntry {
    key: String,
    entry_type: String,
    author: String,    // short display, e.g. "Mildenhall and Major"
    year: String,
    title: String,
    container: String, // journal / booktitle / publisher
    #[serde(skip)]
    search: String,    // lowercased blob for fuzzy matching
}

#[derive(Default)]
pub struct BibState {
    entries: Mutex<Vec<BibEntry>>,
    watcher: Mutex<Option<RecommendedWatcher>>,
}

/// Flatten a BibTeX value to display text: drop braces, `~`→space, `\cmd`→removed,
/// `\&`→`&`, collapse whitespace.
fn clean(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    let mut chars = s.chars().peekable();
    while let Some(c) = chars.next() {
        match c {
            '{' | '}' => {}
            '~' => out.push(' '),
            '\\' => match chars.peek() {
                Some(n) if n.is_ascii_alphabetic() => {
                    while matches!(chars.peek(), Some(m) if m.is_ascii_alphabetic()) {
                        chars.next();
                    }
                }
                Some(_) => out.push(chars.next().unwrap()),
                None => {}
            },
            _ => out.push(c),
        }
    }
    out.split_whitespace().collect::<Vec<_>>().join(" ")
}

/// "Last, First and A B" → "Last and B"; 3+ authors → "Last et al."
fn format_authors(field: &str) -> String {
    let lasts: Vec<String> = field
        .split(" and ")
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(|n| {
            if let Some(c) = n.find(',') {
                clean(&n[..c])
            } else {
                clean(n).split_whitespace().last().unwrap_or("").to_string()
            }
        })
        .filter(|s| !s.is_empty())
        .collect();
    match lasts.len() {
        0 => String::new(),
        1 => lasts[0].clone(),
        2 => format!("{} and {}", lasts[0], lasts[1]),
        _ => format!("{} et al.", lasts[0]),
    }
}

fn parse_fields(s: &str, strings: &HashMap<String, String>) -> HashMap<String, String> {
    let b = s.as_bytes();
    let mut i = 0;
    let mut fields = HashMap::new();
    while i < b.len() {
        while i < b.len() && (b[i].is_ascii_whitespace() || b[i] == b',') {
            i += 1;
        }
        if i >= b.len() {
            break;
        }
        let ns = i;
        while i < b.len() && b[i] != b'=' && !b[i].is_ascii_whitespace() {
            i += 1;
        }
        let name = s[ns..i].trim().to_lowercase();
        while i < b.len() && b[i] != b'=' {
            i += 1;
        }
        if i >= b.len() {
            break;
        }
        i += 1; // '='

        let mut value = String::new();
        loop {
            while i < b.len() && b[i].is_ascii_whitespace() {
                i += 1;
            }
            if i >= b.len() {
                break;
            }
            let part: String = match b[i] {
                b'{' => {
                    i += 1;
                    let vs = i;
                    let mut depth = 1;
                    while i < b.len() && depth > 0 {
                        match b[i] {
                            b'{' => depth += 1,
                            b'}' => {
                                depth -= 1;
                                if depth == 0 {
                                    break;
                                }
                            }
                            _ => {}
                        }
                        i += 1;
                    }
                    let v = s[vs..i.min(s.len())].to_string();
                    i += 1;
                    v
                }
                b'"' => {
                    i += 1;
                    let vs = i;
                    let mut depth = 0;
                    while i < b.len() {
                        match b[i] {
                            b'{' => depth += 1,
                            b'}' if depth > 0 => depth -= 1,
                            b'"' if depth == 0 => break,
                            _ => {}
                        }
                        i += 1;
                    }
                    let v = s[vs..i.min(s.len())].to_string();
                    i += 1;
                    v
                }
                _ => {
                    let vs = i;
                    while i < b.len() && b[i] != b',' && b[i] != b'#' && !b[i].is_ascii_whitespace() {
                        i += 1;
                    }
                    let word = s[vs..i].trim();
                    strings
                        .get(&word.to_lowercase())
                        .cloned()
                        .unwrap_or_else(|| word.to_string())
                }
            };
            value.push_str(&part);
            while i < b.len() && b[i].is_ascii_whitespace() {
                i += 1;
            }
            if i < b.len() && b[i] == b'#' {
                i += 1;
                continue; // concatenation
            }
            break;
        }
        if !name.is_empty() {
            fields.insert(name, value);
        }
    }
    fields
}

pub fn parse_bib(src: &str) -> Vec<BibEntry> {
    let b = src.as_bytes();
    let mut i = 0;
    let mut strings: HashMap<String, String> = HashMap::new();
    let mut out: Vec<BibEntry> = Vec::new();

    while i < b.len() {
        while i < b.len() && b[i] != b'@' {
            i += 1;
        }
        if i >= b.len() {
            break;
        }
        i += 1; // '@'
        let ts = i;
        while i < b.len() && (b[i] as char).is_ascii_alphabetic() {
            i += 1;
        }
        let etype = src[ts..i].to_lowercase();
        while i < b.len() && b[i].is_ascii_whitespace() {
            i += 1;
        }
        if i >= b.len() || (b[i] != b'{' && b[i] != b'(') {
            continue;
        }
        i += 1;
        let bs = i;
        let mut depth = 1;
        while i < b.len() && depth > 0 {
            match b[i] {
                b'{' | b'(' => depth += 1,
                b'}' | b')' => {
                    depth -= 1;
                    if depth == 0 {
                        break;
                    }
                }
                _ => {}
            }
            i += 1;
        }
        let body = &src[bs..i.min(src.len())];
        i += 1; // closing brace

        match etype.as_str() {
            "comment" | "preamble" => continue,
            "string" => {
                let f = parse_fields(body, &strings);
                for (k, v) in f {
                    strings.insert(k, clean(&v));
                }
                continue;
            }
            _ => {}
        }

        let (key, rest) = match body.find(',') {
            Some(c) => (body[..c].trim().to_string(), &body[c + 1..]),
            None => (body.trim().to_string(), ""),
        };
        if key.is_empty() {
            continue;
        }
        let f = parse_fields(rest, &strings);
        let author_field = f.get("author").or_else(|| f.get("editor")).cloned().unwrap_or_default();
        let author = format_authors(&author_field);
        let year = f
            .get("year")
            .cloned()
            .or_else(|| f.get("date").map(|d| d.chars().filter(|c| c.is_ascii_digit()).take(4).collect()))
            .unwrap_or_default();
        let title = clean(&f.get("title").cloned().unwrap_or_default());
        let container = clean(
            &f.get("journal")
                .or_else(|| f.get("booktitle"))
                .or_else(|| f.get("publisher"))
                .cloned()
                .unwrap_or_default(),
        );
        let keywords = clean(&f.get("keywords").cloned().unwrap_or_default());
        let search = format!(
            "{} {} {} {} {} {}",
            key,
            clean(&author_field),
            year,
            title,
            container,
            keywords
        )
        .to_lowercase();

        out.push(BibEntry {
            key,
            entry_type: etype,
            author,
            year,
            title,
            container,
            search,
        });
    }
    out
}

fn bib_path(app: &AppHandle) -> Result<String, String> {
    let cfg = crate::config::writedown_dir(app)?.join("config.toml");
    let txt = std::fs::read_to_string(&cfg).unwrap_or_default();
    let val: toml::Value = txt.parse().map_err(|e: toml::de::Error| e.to_string())?;
    Ok(val
        .get("bibliography")
        .and_then(|b| b.get("default_file"))
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string())
}

fn watch_bib(app: &AppHandle, path: &str, state: &BibState) {
    let app2 = app.clone();
    let p = path.to_string();
    let watcher = notify::recommended_watcher(move |res: notify::Result<notify::Event>| {
        if res.is_ok() {
            if let Ok(src) = std::fs::read_to_string(&p) {
                let entries = parse_bib(&src);
                let n = entries.len();
                let st = app2.state::<BibState>();
                if let Ok(mut guard) = st.entries.lock() {
                    *guard = entries;
                }
                let _ = app2.emit("bib-updated", n);
            }
        }
    });
    if let Ok(mut w) = watcher {
        let _ = w.watch(std::path::Path::new(path), RecursiveMode::NonRecursive);
        if let Ok(mut guard) = state.watcher.lock() {
            *guard = Some(w);
        }
    }
}

/// Parse + index the configured `.bib` and start watching it. Safe to call repeatedly.
pub fn reload(app: &AppHandle) -> Result<usize, String> {
    let path = bib_path(app)?;
    if path.is_empty() {
        return Ok(0);
    }
    let src = std::fs::read_to_string(&path).map_err(|e| format!("read bib {path}: {e}"))?;
    let entries = parse_bib(&src);
    let n = entries.len();
    let state = app.state::<BibState>();
    *state.entries.lock().map_err(|e| e.to_string())? = entries;
    watch_bib(app, &path, &state);
    Ok(n)
}

#[tauri::command]
pub fn load_bibliography(app: AppHandle) -> Result<usize, String> {
    reload(&app)
}

#[tauri::command]
pub fn search_bibliography(query: String, state: tauri::State<BibState>) -> Vec<BibEntry> {
    let entries = state.entries.lock().unwrap();
    let q = query.trim().to_lowercase();
    if q.is_empty() {
        return entries.iter().take(30).cloned().collect();
    }
    let matcher = SkimMatcherV2::default().ignore_case();
    let mut scored: Vec<(i64, &BibEntry)> = entries
        .iter()
        .filter_map(|e| matcher.fuzzy_match(&e.search, &q).map(|s| (s, e)))
        .collect();
    scored.sort_by(|a, b| b.0.cmp(&a.0));
    scored.into_iter().take(30).map(|(_, e)| e.clone()).collect()
}

#[tauri::command]
pub fn get_citation(key: String, state: tauri::State<BibState>) -> Option<BibEntry> {
    let entries = state.entries.lock().unwrap();
    entries.iter().find(|e| e.key == key).cloned()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_entries_strings_and_dates() {
        let src = r#"
        @string{jrm = "Journal of Risk"}
        % a comment
        @article{MildenhallMajor2022,
          author = {Mildenhall, Stephen J. and Major, John A.},
          title  = {Pricing Insurance Risk: Theory and Practice},
          year   = {2022},
        }
        @book{Smith2020, author = {Smith, Jane}, title = {A {Nested} Title},
              journal = jrm, date = {2020-05-01}}
        "#;
        let e = parse_bib(src);
        assert_eq!(e.len(), 2);
        assert_eq!(e[0].key, "MildenhallMajor2022");
        assert_eq!(e[0].author, "Mildenhall and Major");
        assert_eq!(e[0].year, "2022");
        assert_eq!(e[0].title, "Pricing Insurance Risk: Theory and Practice");
        assert_eq!(e[1].key, "Smith2020");
        assert_eq!(e[1].author, "Smith");
        assert_eq!(e[1].title, "A Nested Title");
        assert_eq!(e[1].container, "Journal of Risk");
        assert_eq!(e[1].year, "2020");
    }
}
