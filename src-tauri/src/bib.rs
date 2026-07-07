//! Authoritative BibTeX database (spec §19–22). Parses the configured `.bib` into a
//! disposable in-memory index, fuzzy-searches **key + title** with an fzf-style matcher
//! (ported from the user's csv-grid: space-separated ANDed terms, `'exact` substrings,
//! smart-case, scored subsequence) that returns matched indices for highlighting, and
//! re-parses on external change. The `.bib` is never modified.

use notify::{RecommendedWatcher, RecursiveMode, Watcher};
use serde::Serialize;
use std::collections::HashMap;
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager};

#[derive(Clone, Serialize)]
pub struct BibEntry {
    key: String,
    entry_type: String,
    author: String,    // full short "A and B" (hover / detail)
    coauthors: String, // co-authors beyond the first (display; first is in the key)
    year: String,
    title: String,
    container: String,
    #[serde(skip)]
    label: String, // "key  title" (cased) — display + match target
    #[serde(skip)]
    label_lower: Vec<char>,
    #[serde(skip)]
    label_cased: Vec<char>,
}

/// A search hit: the display label plus the char indices matched (for highlighting).
#[derive(Serialize)]
pub struct CiteMatch {
    key: String,
    label: String,
    author: String,
    coauthors: String,
    year: String,
    title: String,
    container: String,
    positions: Vec<usize>,
}

#[derive(Default)]
pub struct BibState {
    entries: Mutex<Vec<BibEntry>>,
    watcher: Mutex<Option<RecommendedWatcher>>,
}

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

fn last_names(field: &str) -> Vec<String> {
    field
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
        .collect()
}

fn short_authors(field: &str) -> String {
    let l = last_names(field);
    match l.len() {
        0 => String::new(),
        1 => l[0].clone(),
        2 => format!("{} and {}", l[0], l[1]),
        _ => format!("{} et al.", l[0]),
    }
}

/// Co-authors = last names beyond the first (the first author is already in the key).
fn coauthors(field: &str) -> String {
    let l = last_names(field);
    if l.len() <= 1 {
        return String::new();
    }
    let mut s = l[1..].iter().take(2).cloned().collect::<Vec<_>>().join(", ");
    if l.len() > 3 {
        s.push_str(", …");
    }
    s
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
        i += 1;

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
                    strings.get(&word.to_lowercase()).cloned().unwrap_or_else(|| word.to_string())
                }
            };
            value.push_str(&part);
            while i < b.len() && b[i].is_ascii_whitespace() {
                i += 1;
            }
            if i < b.len() && b[i] == b'#' {
                i += 1;
                continue;
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
        i += 1;
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
        // Count ONLY the delimiter that opened the entry. Field values routinely contain
        // unbalanced parens (e.g. "(March 2013"), which must not shift the brace depth —
        // counting them made one stray `(` swallow every following entry.
        let (open, close) = if b[i] == b'{' { (b'{', b'}') } else { (b'(', b')') };
        i += 1;
        let bs = i;
        let mut depth = 1;
        while i < b.len() && depth > 0 {
            let c = b[i];
            if c == open {
                depth += 1;
            } else if c == close {
                depth -= 1;
                if depth == 0 {
                    break;
                }
            }
            i += 1;
        }
        let body = &src[bs..i.min(src.len())];
        i += 1;

        match etype.as_str() {
            "comment" | "preamble" => continue,
            "string" => {
                for (k, v) in parse_fields(body, &strings) {
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
        let label = format!("{}  {}", key, title);
        out.push(BibEntry {
            author: short_authors(&author_field),
            coauthors: coauthors(&author_field),
            label_lower: label.to_lowercase().chars().collect(),
            label_cased: label.chars().collect(),
            key,
            entry_type: etype,
            year,
            title,
            container,
            label,
        });
    }
    out
}

// ---- fzf-style matcher (ported from csv-grid) over key+title ----

struct Term {
    exact: bool,
    cs: bool,
    s: Vec<char>,
}

fn parse_terms(q: &str) -> Vec<Term> {
    let chars: Vec<char> = q.chars().collect();
    let mut terms = Vec::new();
    let mut i = 0;
    while i < chars.len() {
        while i < chars.len() && chars[i].is_whitespace() {
            i += 1;
        }
        if i >= chars.len() {
            break;
        }
        let exact = chars[i] == '\'';
        if exact {
            i += 1;
        }
        let start = i;
        while i < chars.len() && chars[i] != '\'' && !chars[i].is_whitespace() {
            i += 1;
        }
        let raw: String = chars[start..i].iter().collect();
        if raw.is_empty() {
            continue;
        }
        let cs = raw.chars().any(|c| c.is_uppercase());
        let s = if cs {
            raw.chars().collect()
        } else {
            raw.to_lowercase().chars().collect()
        };
        terms.push(Term { exact, cs, s });
    }
    terms
}

fn is_boundary(c: char) -> bool {
    c.is_whitespace() || "_-/\\.,:;()[]{}\"'".contains(c)
}

fn fuzzy(hay: &[char], needle: &[char]) -> Option<(i64, Vec<usize>)> {
    let (n, m) = (hay.len(), needle.len());
    if m == 0 {
        return Some((0, vec![]));
    }
    if m > n {
        return None;
    }
    let mut j = 0;
    let mut end = None;
    for i in 0..n {
        if hay[i] == needle[j] {
            j += 1;
            if j == m {
                end = Some(i);
                break;
            }
        }
    }
    let end = end?;
    j = m - 1;
    let mut start = end;
    let mut i = end as isize;
    while i >= 0 {
        let ii = i as usize;
        if hay[ii] == needle[j] {
            start = ii;
            if j == 0 {
                break;
            }
            j -= 1;
        }
        i -= 1;
    }
    let mut score = 100 - 3 * (end as i64 - start as i64 + 1 - m as i64) - start.min(20) as i64;
    let mut idx = Vec::new();
    j = 0;
    let mut prev = false;
    let mut k = start;
    while k <= end && j < m {
        if hay[k] == needle[j] {
            if k == 0 || is_boundary(hay[k - 1]) {
                score += 8;
            }
            if prev {
                score += 4;
            }
            prev = true;
            idx.push(k);
            j += 1;
        } else {
            prev = false;
        }
        k += 1;
    }
    Some((score, idx))
}

fn exact(hay: &[char], needle: &[char]) -> Option<(i64, Vec<usize>)> {
    if needle.is_empty() {
        return Some((0, vec![]));
    }
    if needle.len() > hay.len() {
        return None;
    }
    for p in 0..=(hay.len() - needle.len()) {
        if hay[p..p + needle.len()] == needle[..] {
            let mut score = 120 + needle.len() as i64 * 4;
            if p == 0 || is_boundary(hay[p - 1]) {
                score += 8;
            }
            return Some((score, (p..p + needle.len()).collect()));
        }
    }
    None
}

fn match_entry(e: &BibEntry, terms: &[Term]) -> Option<(i64, Vec<usize>)> {
    if terms.is_empty() {
        return Some((0, vec![]));
    }
    let mut total = 0i64;
    let mut all: Vec<usize> = Vec::new();
    for t in terms {
        let hay = if t.cs { &e.label_cased } else { &e.label_lower };
        let (sc, idx) = if t.exact { exact(hay, &t.s) } else { fuzzy(hay, &t.s) }?;
        total += sc;
        all.extend(idx);
    }
    all.sort_unstable();
    all.dedup();
    Some((total, all))
}

fn to_match(e: &BibEntry, positions: Vec<usize>) -> CiteMatch {
    CiteMatch {
        key: e.key.clone(),
        label: e.label.clone(),
        author: e.author.clone(),
        coauthors: e.coauthors.clone(),
        year: e.year.clone(),
        title: e.title.clone(),
        container: e.container.clone(),
        positions,
    }
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
pub fn search_bibliography(query: String, state: tauri::State<BibState>) -> Vec<CiteMatch> {
    let entries = state.entries.lock().unwrap();
    let terms = parse_terms(&query);
    if terms.is_empty() {
        return entries.iter().take(40).map(|e| to_match(e, vec![])).collect();
    }
    let mut scored: Vec<(i64, &BibEntry, Vec<usize>)> = entries
        .iter()
        .filter_map(|e| match_entry(e, &terms).map(|(s, idx)| (s, e, idx)))
        .collect();
    scored.sort_by(|a, b| b.0.cmp(&a.0));
    scored.into_iter().take(40).map(|(_, e, idx)| to_match(e, idx)).collect()
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
    fn ignores_unbalanced_parens_in_values() {
        // An unbalanced '(' in a value must not swallow the following entry.
        let src = r#"
        @unpublished{A2011, title = {{Foo (March 2011}}, author = {X, Y}}
        @article{B2012, title = {Bar}, author = {Z, W}}
        "#;
        let e = parse_bib(src);
        assert_eq!(e.len(), 2);
        assert_eq!(e[1].key, "B2012");
    }

    #[test]
    fn parses_and_matches() {
        let src = r#"
        @string{jrm = "Journal of Risk"}
        @article{MildenhallMajor2022,
          author = {Mildenhall, Stephen J. and Major, John A.},
          title  = {Pricing Insurance Risk: Theory and Practice},
          year   = {2022}}
        @book{Smith2020, author = {Smith, Jane}, title = {A {Nested} Title},
              journal = jrm, date = {2020-05-01}}
        "#;
        let e = parse_bib(src);
        assert_eq!(e.len(), 2);
        assert_eq!(e[0].key, "MildenhallMajor2022");
        assert_eq!(e[0].coauthors, "Major");
        assert_eq!(e[1].title, "A Nested Title");
        assert_eq!(e[1].container, "Journal of Risk");
        assert_eq!(e[1].year, "2020");

        // 'mild'pric → exact "mild" and exact "pric", both hit the first entry.
        let terms = parse_terms("'mild'pric");
        let (_, idx) = match_entry(&e[0], &terms).unwrap();
        assert!(!idx.is_empty());
        assert!(match_entry(&e[1], &terms).is_none());
    }
}
