//! Find in Files (Ctrl+Shift+F, issue A.08): one `rg` spawn per search, hard-capped.
//!
//! The palette line is ripgrep's ARGUMENT line, not a search string — `-c TODO`,
//! `-l amsmath`, `-i "risk measure" -g *.qmd` all run as written. There is no shell in
//! between (arguments go straight to the process), so nothing is interpolated and
//! nothing can be injected; `rg` itself never writes. A few flags that make ripgrep read
//! arbitrary files or run programs are refused outright.
//!
//! Two output shapes, chosen from the arguments: `--json` for ordinary hits (structured
//! path / line / column / submatch offsets — no output parsing), and plain lines for the
//! summary flags (`-c`, `-l`, `-L`, `--count-matches`) that ripgrep refuses to combine
//! with `--json`. Both are read line by line under a hit cap and a wall-clock timeout,
//! and the child is killed the moment either trips — an unbounded `rg` over a big tree
//! streaming into the webview is the one way this feature could wedge the UI.

use serde::Serialize;
use std::io::{BufRead, BufReader, Read};
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

/// One match line in hits mode. `spans` are [start, end) CHARACTER offsets into `text`
/// (not bytes), so the frontend's per-character highlighter can use them directly.
#[derive(Serialize, Debug, Clone, PartialEq)]
pub struct Hit {
    pub path: String,
    pub line: u64,
    /// 1-based column of the first submatch, in characters.
    pub col: u64,
    pub text: String,
    pub spans: Vec<[usize; 2]>,
}

/// One file in summary mode: `count` is present for `-c` / `--count-matches`, absent for
/// the file-list flags (`-l`, `-L`).
#[derive(Serialize, Debug, Clone, PartialEq)]
pub struct Summary {
    pub path: String,
    pub count: Option<u64>,
}

#[derive(Serialize, Debug, Default)]
pub struct SearchResult {
    /// "hits" or "summary" — which of the two vectors carries the result.
    pub mode: String,
    pub hits: Vec<Hit>,
    pub summary: Vec<Summary>,
    /// Hits mode: matches returned. Summary mode: sum of counts (files, for `-l`).
    pub total: u64,
    /// Distinct files represented.
    pub files: u64,
    /// The cap or the timeout stopped the search; what came back is a prefix.
    pub truncated: bool,
    pub timed_out: bool,
    pub elapsed_ms: u64,
    /// ripgrep's own complaint (a regex parse error, an unknown flag) when it exited 2
    /// with nothing to show.
    pub error: Option<String>,
    /// ripgrep's complaint when it exited 2 but still produced results — typically an
    /// unquoted second word taken as a path (`-i risk measure`), or an unreadable file.
    pub warning: Option<String>,
}

/// Flags that turn a search into something else: reading a list of patterns or paths
/// from a file, running a preprocessor, searching inside archives, or listing files.
const REFUSED: &[&str] = &["--pre", "--pre-glob", "-f", "--file", "--files", "-z", "--search-zip"];

/// Flags whose output ripgrep will not emit as `--json`.
const SUMMARY_LONG: &[&str] =
    &["--count", "--count-matches", "--files-with-matches", "--files-without-match"];

/// Short flags that take a value, so a cluster scan stops at them: `-g*.md` has no `-c`.
const SHORT_WITH_VALUE: &[char] = &['e', 'g', 't', 'T', 'A', 'B', 'C', 'm', 'M', 'r', 'f', 'E', 'j', 'd'];

/// Split a palette line the way a shell would split words, minus the shell: whitespace
/// separates, double or single quotes group (and are removed), and backslash is an
/// ordinary character — Windows paths and `\d` regex escapes must survive as typed.
pub fn split_args(line: &str) -> Vec<String> {
    let mut out = Vec::new();
    let mut cur = String::new();
    let mut quote: Option<char> = None;
    let mut have = false; // `""` is an empty argument, not nothing
    for ch in line.chars() {
        match quote {
            Some(q) if ch == q => quote = None,
            Some(_) => cur.push(ch),
            None if ch == '"' || ch == '\'' => {
                quote = Some(ch);
                have = true;
            }
            None if ch.is_whitespace() => {
                if have || !cur.is_empty() {
                    out.push(std::mem::take(&mut cur));
                    have = false;
                }
            }
            None => cur.push(ch),
        }
    }
    if have || !cur.is_empty() {
        out.push(cur);
    }
    out
}

/// The letters of a short-flag cluster (`-il` → `i`, `l`), stopping at the first flag that
/// takes a value. `--long` and bare `-` yield nothing.
fn short_flags(tok: &str) -> Vec<char> {
    if !tok.starts_with('-') || tok.starts_with("--") || tok.len() < 2 {
        return Vec::new();
    }
    let mut out = Vec::new();
    for c in tok[1..].chars() {
        out.push(c);
        if SHORT_WITH_VALUE.contains(&c) {
            break;
        }
    }
    out
}

fn long_name(tok: &str) -> Option<&str> {
    tok.strip_prefix("--").map(|t| t.split('=').next().unwrap_or(t))
}

/// Which argument the user's line asks for: refused, summary-shaped, or with its own
/// file selection (`-g`/`-t`), so the configured globs must stand aside.
#[derive(Debug, Default, PartialEq)]
pub struct ArgShape {
    pub refused: Option<String>,
    pub summary: bool,
    pub own_globs: bool,
}

pub fn classify(args: &[String]) -> ArgShape {
    let mut shape = ArgShape::default();
    let mut positional_only = false;
    for tok in args {
        if positional_only {
            continue;
        }
        if tok == "--" {
            positional_only = true;
            continue;
        }
        if let Some(name) = long_name(tok) {
            let full = format!("--{name}");
            if REFUSED.contains(&full.as_str()) {
                shape.refused.get_or_insert(full.clone());
            }
            if SUMMARY_LONG.contains(&full.as_str()) {
                shape.summary = true;
            }
            if matches!(name, "glob" | "iglob" | "type" | "type-not") {
                shape.own_globs = true;
            }
            continue;
        }
        for c in short_flags(tok) {
            match c {
                'f' | 'z' => {
                    shape.refused.get_or_insert(format!("-{c}"));
                }
                'c' | 'l' | 'L' => shape.summary = true,
                'g' | 't' | 'T' => shape.own_globs = true,
                _ => {}
            }
        }
    }
    shape
}

/// Byte offset → character offset within `s` (clamped to the string).
fn char_index(s: &str, byte: usize) -> usize {
    s[..byte.min(s.len())].chars().count()
}

/// Parse one `--json` line; only `match` events produce a hit.
pub fn parse_match_line(line: &str, max_text: usize) -> Option<Hit> {
    let v: serde_json::Value = serde_json::from_str(line).ok()?;
    if v.get("type")?.as_str()? != "match" {
        return None;
    }
    let data = v.get("data")?;
    let path = data.get("path")?.get("text")?.as_str()?.to_string();
    let line_no = data.get("line_number")?.as_u64()?;
    let raw = data.get("lines")?.get("text")?.as_str()?;
    let full = raw.trim_end_matches(['\r', '\n']);
    let mut spans: Vec<[usize; 2]> = data
        .get("submatches")
        .and_then(|s| s.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|m| {
                    let s = m.get("start")?.as_u64()? as usize;
                    let e = m.get("end")?.as_u64()? as usize;
                    Some([char_index(full, s), char_index(full, e)])
                })
                .collect()
        })
        .unwrap_or_default();
    // A very long line (minified JSON, a data URI) is windowed around the first match so
    // the row stays a row; spans outside the window are dropped.
    let chars: Vec<char> = full.chars().collect();
    let mut text = full.to_string();
    if chars.len() > max_text {
        let first = spans.first().map(|s| s[0]).unwrap_or(0);
        let start = first.saturating_sub(max_text / 4).min(chars.len() - max_text);
        let end = start + max_text;
        text = chars[start..end].iter().collect();
        spans = spans
            .into_iter()
            .filter(|s| s[0] >= start && s[1] <= end)
            .map(|s| [s[0] - start, s[1] - start])
            .collect();
        if start > 0 {
            text.insert(0, '…');
            for s in &mut spans {
                s[0] += 1;
                s[1] += 1;
            }
        }
    }
    let col = spans.first().map(|s| s[0] as u64 + 1).unwrap_or(1);
    // `col` must address the ORIGINAL line, not the window: recompute from the full text.
    let col = if chars.len() > max_text {
        data.get("submatches")
            .and_then(|s| s.as_array())
            .and_then(|a| a.first())
            .and_then(|m| m.get("start"))
            .and_then(|s| s.as_u64())
            .map(|b| char_index(full, b as usize) as u64 + 1)
            .unwrap_or(1)
    } else {
        col
    };
    Some(Hit { path, line: line_no, col, text, spans })
}

/// Parse one plain summary line: `path:count` (for `-c`) or bare `path` (for `-l`). The
/// split is on the LAST colon so a drive letter survives; a bare path with no digit tail
/// is a file-list entry.
pub fn parse_summary_line(line: &str) -> Option<Summary> {
    let line = line.trim_end_matches(['\r', '\n']);
    if line.is_empty() {
        return None;
    }
    if let Some(i) = line.rfind(':') {
        let tail = &line[i + 1..];
        if !tail.is_empty() && tail.chars().all(|c| c.is_ascii_digit()) {
            return Some(Summary { path: line[..i].to_string(), count: tail.parse().ok() });
        }
    }
    Some(Summary { path: line.to_string(), count: None })
}

/// The one search allowed to run at a time; `cancel_search` kills it. A second search
/// starting while one runs kills the first — the palette only ever wants the latest.
static RUNNING: Mutex<Option<Arc<Mutex<Child>>>> = Mutex::new(None);

fn kill_child(child: &Arc<Mutex<Child>>) {
    if let Ok(mut c) = child.lock() {
        if matches!(c.try_wait(), Ok(None)) {
            let _ = c.kill();
        }
    }
}

#[tauri::command]
pub fn cancel_search() {
    if let Ok(mut slot) = RUNNING.lock() {
        if let Some(child) = slot.take() {
            kill_child(&child);
        }
    }
}

/// Run ripgrep with the user's argument line over `roots`. `globs` are the configured
/// default file globs (dropped when the line brings its own `-g`/`-t`); `max_hits` and
/// `timeout_ms` are the hard caps.
#[tauri::command]
pub async fn search_workspace(
    line: String,
    roots: Vec<String>,
    globs: Vec<String>,
    max_hits: u64,
    timeout_ms: u64,
) -> Result<SearchResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        search_impl(&line, &roots, &globs, max_hits as usize, Duration::from_millis(timeout_ms))
    })
    .await
    .map_err(|e| format!("search task: {e}"))?
}

fn search_impl(
    line: &str,
    roots: &[String],
    globs: &[String],
    max_hits: usize,
    timeout: Duration,
) -> Result<SearchResult, String> {
    let user = split_args(line);
    if user.is_empty() {
        return Err("nothing to search for".into());
    }
    if roots.is_empty() {
        return Err("nothing to search — open a folder or project first".into());
    }
    let shape = classify(&user);
    if let Some(flag) = shape.refused {
        return Err(format!("{flag} is not allowed here (it reads files or runs programs)"));
    }

    // Defaults first so anything the user writes overrides them (`-s` beats
    // `--smart-case`, their `-m` beats ours). No per-file cap in summary mode: `-c`
    // must count everything, and the wall clock still bounds it.
    let mut args: Vec<String> =
        vec!["--smart-case".into(), "--color".into(), "never".into()];
    if shape.summary {
        args.push("--with-filename".into());
    } else {
        args.extend(["--json".into(), "--line-number".into(), "--max-count".into(), "200".into()]);
    }
    if !shape.own_globs {
        for g in globs {
            args.push("-g".into());
            args.push(g.clone());
        }
    }
    // The user's `--json` would double ours; drop it silently.
    args.extend(user.into_iter().filter(|a| a != "--json"));
    args.extend(roots.iter().cloned());

    let mut cmd = Command::new("rg");
    cmd.args(&args).stdin(Stdio::null()).stdout(Stdio::piped()).stderr(Stdio::piped());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    let start = Instant::now();
    let mut child = cmd.spawn().map_err(|e| {
        if e.kind() == std::io::ErrorKind::NotFound {
            "ripgrep (rg) not found on PATH".to_string()
        } else {
            format!("launch rg: {e}")
        }
    })?;
    let stdout = child.stdout.take().ok_or("rg stdout")?;
    let mut stderr = child.stderr.take().ok_or("rg stderr")?;
    let child = Arc::new(Mutex::new(child));

    // Register as the running search, killing any predecessor.
    if let Ok(mut slot) = RUNNING.lock() {
        if let Some(prev) = slot.replace(child.clone()) {
            kill_child(&prev);
        }
    }
    // Watchdog: the read loop below blocks between lines, so the timeout needs its own
    // thread to fire while rg is silent (a slow disk, a huge file).
    let timed_out = Arc::new(AtomicBool::new(false));
    {
        let c = child.clone();
        let t = timed_out.clone();
        std::thread::spawn(move || {
            std::thread::sleep(timeout);
            if let Ok(mut ch) = c.lock() {
                if matches!(ch.try_wait(), Ok(None)) {
                    t.store(true, Ordering::SeqCst);
                    let _ = ch.kill();
                }
            }
        });
    }
    // Drain stderr concurrently so a chatty rg can never block on a full pipe.
    let err_thread = std::thread::spawn(move || {
        let mut s = String::new();
        let _ = stderr.read_to_string(&mut s);
        s
    });

    let mut result = SearchResult {
        mode: if shape.summary { "summary" } else { "hits" }.into(),
        ..Default::default()
    };
    let reader = BufReader::new(stdout);
    let mut files = std::collections::HashSet::new();
    for line in reader.lines() {
        let Ok(line) = line else { break };
        if shape.summary {
            if let Some(s) = parse_summary_line(&line) {
                files.insert(s.path.clone());
                result.total += s.count.unwrap_or(1);
                result.summary.push(s);
                if result.summary.len() >= max_hits {
                    result.truncated = true;
                    break;
                }
            }
        } else if let Some(h) = parse_match_line(&line, 240) {
            files.insert(h.path.clone());
            result.hits.push(h);
            if result.hits.len() >= max_hits {
                result.truncated = true;
                break;
            }
        }
    }
    if result.truncated {
        kill_child(&child);
    }
    let status = child.lock().ok().and_then(|mut c| c.wait().ok());
    if let Ok(mut slot) = RUNNING.lock() {
        if slot.as_ref().is_some_and(|c| Arc::ptr_eq(c, &child)) {
            *slot = None;
        }
    }
    let err_text = err_thread.join().unwrap_or_default();

    result.timed_out = timed_out.load(Ordering::SeqCst);
    if result.timed_out {
        result.truncated = true;
    }
    if !shape.summary {
        result.total = result.hits.len() as u64;
    } else {
        // `-c` counts descending: the file with the most hits first is the quick look.
        result.summary.sort_by(|a, b| b.count.cmp(&a.count).then_with(|| a.path.cmp(&b.path)));
    }
    result.files = files.len() as u64;
    result.elapsed_ms = start.elapsed().as_millis() as u64;
    // Exit 2 is ripgrep's "something was wrong" (1 is merely "no matches"); a kill on
    // Windows reports 1 with no stderr, which the truncated flag already explains.
    if status.and_then(|s| s.code()) == Some(2) && !result.truncated {
        let msg = err_text.trim();
        let msg = if msg.is_empty() { "rg failed".to_string() } else { msg.to_string() };
        if result.hits.is_empty() && result.summary.is_empty() {
            result.error = Some(msg);
        } else {
            result.warning = Some(msg);
        }
    }
    Ok(result)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn split_words_and_quotes() {
        assert_eq!(split_args("TODO"), vec!["TODO"]);
        assert_eq!(split_args("  -c   TODO "), vec!["-c", "TODO"]);
        assert_eq!(split_args(r#"-i "risk measure" -g *.qmd"#), vec!["-i", "risk measure", "-g", "*.qmd"]);
        assert_eq!(split_args("'a b' c"), vec!["a b", "c"]);
        assert_eq!(split_args(r"C:\dev \d+"), vec![r"C:\dev", r"\d+"]);
        assert_eq!(split_args(r#""" x"#), vec!["", "x"]);
        assert!(split_args("   ").is_empty());
    }

    #[test]
    fn classify_shapes() {
        let a = |s: &str| classify(&split_args(s));
        assert_eq!(a("TODO"), ArgShape::default());
        assert!(a("-c TODO").summary);
        assert!(a("-ic TODO").summary);
        assert!(a("--count-matches x").summary);
        assert!(a("-l x").summary && a("-L x").summary);
        assert!(!a("-C 3 x").summary, "-C is context, not count");
        assert!(!a("-g*.html x").summary, "the l in html is a glob, not a flag");
        assert!(a("-g *.qmd x").own_globs);
        assert!(a("--type=py x").own_globs);
        assert!(a("-tpy x").own_globs);
        assert_eq!(a("--pre cat x").refused.as_deref(), Some("--pre"));
        assert_eq!(a("-f pats").refused.as_deref(), Some("-f"));
        assert_eq!(a("--files").refused.as_deref(), Some("--files"));
        assert_eq!(a("x -- --files").refused, None, "after -- everything is a path");
    }

    #[test]
    fn parse_json_match() {
        let line = r#"{"type":"match","data":{"path":{"text":"V:\\dev\\a.md"},"lines":{"text":"see TODO here\n"},"line_number":7,"absolute_offset":0,"submatches":[{"match":{"text":"TODO"},"start":4,"end":8}]}}"#;
        let h = parse_match_line(line, 240).unwrap();
        assert_eq!(h.path, r"V:\dev\a.md");
        assert_eq!(h.line, 7);
        assert_eq!(h.col, 5);
        assert_eq!(h.text, "see TODO here");
        assert_eq!(h.spans, vec![[4, 8]]);
        assert!(parse_match_line(r#"{"type":"begin","data":{}}"#, 240).is_none());
    }

    #[test]
    fn parse_json_match_char_offsets_and_window() {
        // Byte offsets from rg become character offsets: "é" is two bytes, one char.
        let line = r#"{"type":"match","data":{"path":{"text":"a.md"},"lines":{"text":"éé TODO\n"},"line_number":1,"submatches":[{"match":{"text":"TODO"},"start":5,"end":9}]}}"#;
        let h = parse_match_line(line, 240).unwrap();
        assert_eq!(h.spans, vec![[3, 7]]);
        assert_eq!(h.col, 4);
        // A long line is windowed around the match, col still addresses the full line.
        let long = format!("{}TODO{}", "x".repeat(500), "y".repeat(500));
        let line = format!(
            r#"{{"type":"match","data":{{"path":{{"text":"a.md"}},"lines":{{"text":"{long}"}},"line_number":1,"submatches":[{{"match":{{"text":"TODO"}},"start":500,"end":504}}]}}}}"#
        );
        let h = parse_match_line(&line, 100).unwrap();
        assert_eq!(h.col, 501);
        assert!(h.text.starts_with('…'));
        assert_eq!(h.text.chars().count(), 101);
        let [s, e] = h.spans[0];
        assert_eq!(h.text.chars().skip(s).take(e - s).collect::<String>(), "TODO");
    }

    /// Spawns the real `rg` over this source tree — needs ripgrep on PATH, so ignored by
    /// default: `cargo test live_rg -- --ignored`.
    #[test]
    #[ignore]
    fn live_rg_smoke() {
        let root = env!("CARGO_MANIFEST_DIR").to_string();
        let globs = vec!["*.rs".to_string()];
        let r = search_impl("\"fn search_impl\"", &[root.clone()], &globs, 500, Duration::from_secs(5)).unwrap();
        assert_eq!(r.mode, "hits");
        assert!(r.hits.iter().any(|h| h.path.ends_with("search.rs") && h.text.contains("fn search_impl")), "{r:?}");
        assert!(r.error.is_none() && !r.truncated, "error={:?} trunc={} timed_out={} n={}", r.error, r.truncated, r.timed_out, r.hits.len());
        let r = search_impl("-c search_impl", &[root.clone()], &globs, 500, Duration::from_secs(5)).unwrap();
        assert_eq!(r.mode, "summary");
        assert!(r.summary.iter().any(|s| s.path.ends_with("search.rs") && s.count.unwrap_or(0) >= 3), "{r:?}");
        let r = search_impl("-l search_impl", &[root.clone()], &globs, 500, Duration::from_secs(5)).unwrap();
        assert!(r.summary.iter().all(|s| s.count.is_none()));
        // A bad regex is reported, not swallowed; a cap of 1 truncates and says so.
        let r = search_impl("(unclosed", &[root.clone()], &globs, 500, Duration::from_secs(5)).unwrap();
        assert!(r.error.is_some(), "{r:?}");
        let r = search_impl("fn", &[root], &globs, 1, Duration::from_secs(5)).unwrap();
        assert!(r.truncated && r.hits.len() == 1, "{r:?}");
    }

    #[test]
    fn parse_summary_lines() {
        assert_eq!(
            parse_summary_line(r"V:\dev\a.md:12"),
            Some(Summary { path: r"V:\dev\a.md".into(), count: Some(12) })
        );
        assert_eq!(
            parse_summary_line(r"V:\dev\a.md"),
            Some(Summary { path: r"V:\dev\a.md".into(), count: None })
        );
        assert_eq!(parse_summary_line(""), None);
    }
}
