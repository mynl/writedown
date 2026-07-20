//! Fast in-process Quarto/Markdown render (plan 1.33): split the live buffer into prose
//! and code cells, resolve `@key` citations against the bibliography index, number Quarto
//! crossrefs, append a generated References section, and return expanded markdown for the
//! existing preview component. Speed over accuracy — no pandoc, no quarto, no citeproc.
//! Nothing is ever written to the user's files.

use crate::bib::{self, BibEntry};
use crate::check::{attr_labels, fence_close, fence_open};
use regex::Regex;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant, SystemTime};
use tauri::Manager;

// ---- state -------------------------------------------------------------------------

/// Render-scoped state: the per-document bibliography cache (a doc's front-matter
/// `bibliography:` override, keyed by path+mtime) and the persistent python kernel.
#[derive(Default)]
pub struct RenderState {
    doc_bib: Mutex<Option<DocBib>>,
    kernel: Mutex<Option<Kernel>>,
}

struct DocBib {
    path: PathBuf,
    mtime: SystemTime,
    entries: Vec<BibEntry>,
}

#[derive(Serialize)]
pub struct RenderResult {
    markdown: String,
    cells: usize,
    errors: usize,
    elapsed_ms: u64,
    /// "ok" | "not_configured" | error message.
    python: String,
    /// Per expanded-markdown line: its 1-based source line, 0 = synthetic (see Expanded).
    line_map: Vec<u32>,
}

// ---- python kernel ---------------------------------------------------------------------

/// `[render]` in config.toml, read directly like `bib_path` does. `python` is an explicit
/// interpreter path — no discovery. Missing/invalid keys fall back to defaults.
struct RenderCfg {
    python: String,
    timeout_seconds: u64,
    figure_format: String, // "png" | "svg"
    figure_dpi: u32,
}

fn render_cfg(app: &tauri::AppHandle) -> RenderCfg {
    let mut cfg = RenderCfg {
        python: String::new(),
        timeout_seconds: 30,
        figure_format: "png".into(),
        figure_dpi: 150,
    };
    let Ok(dir) = crate::config::writedown_dir(app) else { return cfg };
    let txt = std::fs::read_to_string(dir.join("config.toml")).unwrap_or_default();
    let Ok(val) = txt.parse::<toml::Value>() else { return cfg };
    let Some(r) = val.get("render") else { return cfg };
    if let Some(p) = r.get("python").and_then(|v| v.as_str()) {
        cfg.python = p.trim().to_string();
    }
    if let Some(t) = r.get("timeout_seconds").and_then(|v| v.as_integer()) {
        if t > 0 {
            cfg.timeout_seconds = t as u64;
        }
    }
    if let Some(f) = r.get("figure_format").and_then(|v| v.as_str()) {
        if f == "png" || f == "svg" {
            cfg.figure_format = f.into();
        }
    }
    if let Some(d) = r.get("figure_dpi").and_then(|v| v.as_integer()) {
        if d > 0 {
            cfg.figure_dpi = d as u32;
        }
    }
    cfg
}

#[derive(Serialize)]
struct CellReq<'a> {
    id: u64,
    code: &'a str,
    reset: bool,
    cwd: Option<&'a str>,
    fig_format: &'a str,
    fig_dpi: u32,
}

#[derive(Deserialize, Default)]
struct CellReply {
    #[serde(default)]
    id: u64,
    #[serde(default)]
    stdout: String,
    #[serde(default)]
    stderr: String,
    #[serde(default)]
    result_text: Option<String>,
    #[serde(default)]
    result_html: Option<String>,
    #[serde(default)]
    figures: Vec<Figure>,
    #[serde(default)]
    error: Option<CellError>,
}

#[derive(Deserialize, Default, Clone)]
struct Figure {
    format: String,
    b64: String,
}

#[derive(Deserialize, Default, Clone)]
struct CellError {
    message: String,
    #[serde(default)]
    traceback: String,
    /// Cell-relative 1-based line (from the last `<cell>` traceback frame).
    #[serde(default)]
    line: Option<i64>,
}

/// One executed cell's result, keyed by segment index for splicing. `skipped` is set for
/// cells not run because an earlier cell timed out.
#[derive(Default)]
pub(crate) struct CellOutput {
    stdout: String,
    stderr: String,
    result_text: Option<String>,
    result_html: Option<String>,
    figures: Vec<Figure>,
    error: Option<CellError>,
    skipped: Option<String>,
}

impl From<CellReply> for CellOutput {
    fn from(r: CellReply) -> Self {
        CellOutput {
            stdout: r.stdout,
            stderr: r.stderr,
            result_text: r.result_text,
            result_html: r.result_html,
            figures: r.figures,
            error: r.error,
            skipped: None,
        }
    }
}

enum ExecFail {
    Timeout,
    Dead,
}

/// A persistent python process running the embedded JSON-lines runner. The namespace is
/// reset per render (runner-side); the process — and thus `sys.modules` — survives so
/// imports are paid once. Dropping the kernel kills the process.
struct Kernel {
    child: std::process::Child,
    stdin: std::process::ChildStdin,
    /// Lines from the reader thread; disconnect = the runner exited.
    rx: std::sync::mpsc::Receiver<String>,
    python_path: String,
    next_id: u64,
}

impl Kernel {
    fn spawn(python: &str, runner_dir: &Path, ready_timeout: Duration) -> Result<Kernel, String> {
        std::fs::create_dir_all(runner_dir)
            .map_err(|e| format!("create {}: {e}", runner_dir.display()))?;
        let runner = runner_dir.join("runner.py");
        std::fs::write(&runner, include_str!("../runner.py"))
            .map_err(|e| format!("write {}: {e}", runner.display()))?;

        let mut cmd = std::process::Command::new(python);
        cmd.arg("-u")
            .arg(&runner)
            // Backend fixed before any user import; user stderr is captured runner-side.
            .env("MPLBACKEND", "Agg")
            .stdin(std::process::Stdio::piped())
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::null());
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            cmd.creation_flags(0x0800_0000); // CREATE_NO_WINDOW — no console flash
        }
        let mut child = cmd.spawn().map_err(|e| format!("start {python}: {e}"))?;
        let stdin = child.stdin.take().expect("piped stdin");
        let stdout = child.stdout.take().expect("piped stdout");

        let (tx, rx) = std::sync::mpsc::channel::<String>();
        std::thread::spawn(move || {
            use std::io::BufRead;
            for line in std::io::BufReader::new(stdout).lines() {
                match line {
                    Ok(l) => {
                        if tx.send(l).is_err() {
                            break;
                        }
                    }
                    Err(_) => break,
                }
            }
        });

        let mut k = Kernel { child, stdin, rx, python_path: python.to_string(), next_id: 0 };
        match k.rx.recv_timeout(ready_timeout) {
            Ok(l) if l.contains("\"ready\"") => Ok(k),
            Ok(l) => {
                let _ = k.child.kill();
                Err(format!("unexpected runner handshake: {l}"))
            }
            Err(_) => {
                let _ = k.child.kill();
                Err(format!("{python}: runner did not start"))
            }
        }
    }

    fn alive(&mut self) -> bool {
        matches!(self.child.try_wait(), Ok(None))
    }

    fn exec(
        &mut self,
        code: &str,
        reset: bool,
        cwd: Option<&str>,
        fig_format: &str,
        fig_dpi: u32,
        timeout: Duration,
    ) -> Result<CellReply, ExecFail> {
        use std::io::Write;
        self.next_id += 1;
        let id = self.next_id;
        let req = CellReq { id, code, reset, cwd, fig_format, fig_dpi };
        let line = serde_json::to_string(&req).map_err(|_| ExecFail::Dead)?;
        writeln!(self.stdin, "{line}").map_err(|_| ExecFail::Dead)?;
        self.stdin.flush().map_err(|_| ExecFail::Dead)?;
        let deadline = Instant::now() + timeout;
        loop {
            let left = deadline.saturating_duration_since(Instant::now());
            if left.is_zero() {
                return Err(ExecFail::Timeout);
            }
            match self.rx.recv_timeout(left) {
                Ok(l) => {
                    if let Ok(rep) = serde_json::from_str::<CellReply>(&l) {
                        if rep.id == id {
                            return Ok(rep);
                        }
                    }
                    // stale/foreign line (e.g. reply to a killed request) — keep waiting
                }
                Err(std::sync::mpsc::RecvTimeoutError::Timeout) => return Err(ExecFail::Timeout),
                Err(std::sync::mpsc::RecvTimeoutError::Disconnected) => return Err(ExecFail::Dead),
            }
        }
    }
}

impl Drop for Kernel {
    fn drop(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait(); // reap — no zombie
    }
}

/// Kill the kernel on app exit (RunEvent::Exit). The runner's stdin-EOF exit is the
/// backstop; this is the belt to that suspender.
pub fn shutdown_kernel(app: &tauri::AppHandle) {
    if let Some(state) = app.try_state::<RenderState>() {
        if let Ok(mut k) = state.kernel.lock() {
            *k = None; // Drop kills
        }
    }
}

/// Explicit user command ("Restart Python Kernel"): kill now, respawn on the next render.
/// This is the Windows "interrupt" for a stuck or memory-heavy kernel.
#[tauri::command]
pub fn restart_kernel(state: tauri::State<RenderState>) {
    if let Ok(mut k) = state.kernel.lock() {
        *k = None;
    }
}

/// Run every `eval`-able python cell top-to-bottom (fresh namespace via `reset` on the
/// first). On a timeout the kernel is killed and the remaining cells are marked skipped.
/// Returns (segment index -> output, error count). Err = the kernel could not start.
fn run_cells(
    app: &tauri::AppHandle,
    cfg: &RenderCfg,
    segments: &[Segment],
    doc_dir: Option<&str>,
) -> Result<(HashMap<usize, CellOutput>, usize), String> {
    let state = app.state::<RenderState>();
    let mut guard = state.kernel.lock().map_err(|e| e.to_string())?;
    let respawn = match guard.as_mut() {
        Some(k) => !k.alive() || k.python_path != cfg.python,
        None => true,
    };
    if respawn {
        let cache = crate::config::writedown_dir(app)?.join("cache");
        *guard = Some(Kernel::spawn(&cfg.python, &cache, Duration::from_secs(cfg.timeout_seconds))?);
    }

    let mut outputs: HashMap<usize, CellOutput> = HashMap::new();
    let mut errors = 0usize;
    let mut first = true;
    let mut dead: Option<String> = None; // skip reason once the kernel is gone
    let mut cell_no = 0usize;
    for (idx, seg) in segments.iter().enumerate() {
        let Segment::PythonCell { code, opts, .. } = seg else { continue };
        cell_no += 1;
        if !opts.eval {
            continue; // shown per echo, never sent to the kernel
        }
        if let Some(reason) = &dead {
            outputs.insert(idx, CellOutput { skipped: Some(reason.clone()), ..Default::default() });
            continue;
        }
        let kernel = guard.as_mut().expect("kernel present until taken");
        match kernel.exec(code, first, doc_dir, &cfg.figure_format, cfg.figure_dpi,
                          Duration::from_secs(cfg.timeout_seconds)) {
            Ok(rep) => {
                if rep.error.is_some() {
                    errors += 1;
                }
                outputs.insert(idx, rep.into());
            }
            Err(fail) => {
                errors += 1;
                *guard = None; // Drop kills; next render respawns
                let msg = match fail {
                    ExecFail::Timeout => format!(
                        "timed out after {}s — kernel restarted",
                        cfg.timeout_seconds
                    ),
                    ExecFail::Dead => "python kernel exited unexpectedly".to_string(),
                };
                outputs.insert(idx, CellOutput {
                    error: Some(CellError { message: msg, traceback: String::new(), line: None }),
                    ..Default::default()
                });
                dead = Some(format!(
                    "not run (kernel restarted after cell {cell_no} {})",
                    match fail { ExecFail::Timeout => "timed out", ExecFail::Dead => "died" }
                ));
            }
        }
        first = false;
    }
    Ok((outputs, errors))
}

// ---- document splitter ----------------------------------------------------------------

#[derive(Default)]
pub(crate) struct FrontMatter {
    pub(crate) title: Option<String>,
    pub(crate) bibliography: Option<String>,
    /// `wd-python:` — a document-level Python interpreter override (issue 9). Absolute
    /// paths only; enforced where it is applied (see `render_impl`).
    pub(crate) wd_python: Option<String>,
}

/// Quarto `#|` cell options. All flags default true; unknown keys are ignored.
pub(crate) struct CellOpts {
    pub(crate) eval: bool,
    pub(crate) echo: bool,
    pub(crate) include: bool,
    pub(crate) output: bool,
    pub(crate) label: Option<String>,
    pub(crate) fig_cap: Option<String>,
}

impl Default for CellOpts {
    fn default() -> Self {
        CellOpts { eval: true, echo: true, include: true, output: true, label: None, fig_cap: None }
    }
}

pub(crate) enum Segment {
    /// Prose — the cite/crossref pass applies. `start` = 1-based document line of the
    /// first prose line (line-map anchor; likewise on the other variants).
    Markdown { text: String, start: usize },
    /// Plain fenced blocks including the fence lines — passed through verbatim.
    PlainFence { text: String, start: usize },
    /// ```{python} cell. `first_line` = 1-based document line of the first body line
    /// (maps cell-relative traceback lines back to the document).
    PythonCell { code: String, opts: CellOpts, first_line: usize },
    /// ```{r}, ```{julia}, … — shown as source, never run. `start` = the fence line.
    OtherCell { code: String, lang: String, opts: CellOpts, start: usize },
}

/// `#|` option lines at the top of a cell (Quarto). Quotes stripped; unknown keys ignored.
fn parse_cell_opts(body: &[&str]) -> CellOpts {
    let mut o = CellOpts::default();
    for l in body {
        let Some(rest) = l.trim_start().strip_prefix("#|") else { break };
        let Some((k, v)) = rest.trim().split_once(':') else { continue };
        let v = v.trim().trim_matches(|c| c == '"' || c == '\'').trim();
        match k.trim() {
            "eval" => o.eval = v != "false",
            "echo" => o.echo = v != "false",
            "include" => o.include = v != "false",
            "output" => o.output = v != "false",
            "label" if !v.is_empty() => o.label = Some(v.to_string()),
            "fig-cap" if !v.is_empty() => o.fig_cap = Some(v.to_string()),
            _ => {}
        }
    }
    o
}

/// Hand-extract top-level `title:` and `bibliography:` (scalar, flow list, or first item
/// of a block list) — no YAML crate; the front matter is read-only and never reflowed.
fn parse_front_matter(lines: &[&str], fm: &mut FrontMatter) {
    let unquote = |v: &str| v.trim().trim_matches(|c| c == '"' || c == '\'').trim().to_string();
    for (k, line) in lines.iter().enumerate() {
        if line.starts_with(|c: char| c.is_whitespace()) {
            continue; // not top-level
        }
        if let Some(v) = line.strip_prefix("title:") {
            let v = unquote(v);
            if !v.is_empty() {
                fm.title = Some(v);
            }
        } else if let Some(v) = line.strip_prefix("bibliography:") {
            let v = v.trim();
            if let Some(inner) = v.strip_prefix('[') {
                let first = unquote(inner.split([',', ']']).next().unwrap_or(""));
                if !first.is_empty() {
                    fm.bibliography = Some(first);
                }
            } else if !v.is_empty() {
                fm.bibliography = Some(unquote(v));
            } else {
                // block list — first `- item` on the following indented lines
                for m in lines.iter().skip(k + 1) {
                    if !m.starts_with(|c: char| c.is_whitespace()) {
                        break;
                    }
                    if let Some(item) = m.trim_start().strip_prefix('-') {
                        let item = unquote(item);
                        if !item.is_empty() {
                            fm.bibliography = Some(item);
                        }
                        break;
                    }
                }
            }
        } else if let Some(v) = line.strip_prefix("wd-python:") {
            // Document-level interpreter override (issue 9). Stored verbatim; the
            // absolute-path requirement is enforced where it is applied (render_impl).
            let v = unquote(v);
            if !v.is_empty() {
                fm.wd_python = Some(v);
            }
        }
    }
}

pub(crate) fn split_document(text: &str) -> (FrontMatter, Vec<Segment>) {
    let text = text.strip_prefix('\u{feff}').unwrap_or(text);
    let lines: Vec<&str> = text.lines().collect();
    let mut fm = FrontMatter::default();
    let mut i = 0;

    // Front matter: `---` on line 1, closed by a later `---` (Preview.tsx semantics).
    if lines.first().map(|l| l.trim_end()) == Some("---") {
        let mut j = 1;
        while j < lines.len() && lines[j].trim_end() != "---" {
            j += 1;
        }
        if j < lines.len() {
            parse_front_matter(&lines[1..j], &mut fm);
            i = j + 1;
        }
    }

    let mut segs: Vec<Segment> = Vec::new();
    let mut prose: Vec<&str> = Vec::new();
    let mut prose_start = i; // 0-based index of prose[0] in `lines`
    let flush = |prose: &mut Vec<&str>, segs: &mut Vec<Segment>, start: usize| {
        // Blank-only runs between fences carry nothing — assembly re-spaces blocks.
        if prose.iter().any(|l| !l.trim().is_empty()) {
            segs.push(Segment::Markdown { text: prose.join("\n"), start: start + 1 });
        }
        prose.clear();
    };
    while i < lines.len() {
        let trimmed = lines[i].trim_start();
        if let Some(f) = fence_open(trimmed) {
            flush(&mut prose, &mut segs, prose_start);
            let mut j = i + 1;
            while j < lines.len() && !fence_close(lines[j].trim_start(), f.ticks) {
                j += 1;
            }
            let body = &lines[i + 1..j.min(lines.len())];
            match f.lang.as_deref() {
                Some("python") => segs.push(Segment::PythonCell {
                    code: body.join("\n"),
                    opts: parse_cell_opts(body),
                    first_line: i + 2, // 1-based; fence line is i+1
                }),
                Some(lang) => segs.push(Segment::OtherCell {
                    code: body.join("\n"),
                    lang: lang.to_string(),
                    opts: parse_cell_opts(body),
                    start: i + 1,
                }),
                None => {
                    let last = if j < lines.len() { j } else { lines.len() - 1 };
                    segs.push(Segment::PlainFence {
                        text: lines[i..=last].join("\n"),
                        start: i + 1,
                    });
                }
            }
            i = j + 1;
        } else {
            if prose.is_empty() {
                prose_start = i;
            }
            prose.push(lines[i]);
            i += 1;
        }
    }
    flush(&mut prose, &mut segs, prose_start);
    (fm, segs)
}

// ---- citation / crossref passes --------------------------------------------------------

/// Mirror of the editor's CITE_RE (citations.ts). The regex crate has no lookbehind, so
/// the boundary guard is a leading group that must be re-emitted on replacement.
fn cite_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| {
        Regex::new(r"(^|[^\p{L}\p{N}_@/])@([\p{L}\p{N}](?:[\p{L}\p{N}_:.-]*[\p{L}\p{N}])?)")
            .unwrap()
    })
}

/// A trailing pandoc attribute block `{ … }` at the end of a heading's text (group 1 = the
/// brace content).
fn trailing_attr_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"\s*\{([^}]*)\}\s*$").unwrap())
}

/// Any pandoc attribute block `{ … }`, optionally right after a `)` (an image/link). Group
/// 1 is the `)` when present; group 2 is the brace content.
fn attr_block_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"(\))?\{([^}]*)\}").unwrap())
}

/// Split a `{ … }` block's content into its first `#id` (in any position) and the other
/// attributes rejoined: `width=50% #fig-x .cls` → (`Some("fig-x")`, `"width=50% .cls"`).
fn split_attr_block(inner: &str) -> (Option<String>, String) {
    let mut id = None;
    let mut rest: Vec<&str> = Vec::new();
    for tok in inner.split_whitespace() {
        if id.is_none() {
            if let Some(t) = tok.strip_prefix('#') {
                if !t.is_empty() {
                    id = Some(t.to_string());
                    continue;
                }
            }
        }
        rest.push(tok);
    }
    (id, rest.join(" "))
}

fn first_hash_id(inner: &str) -> Option<String> {
    split_attr_block(inner).0
}

fn heading_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"^(#{1,6})\s+(.*)$").unwrap())
}

fn html_escape(s: &str) -> String {
    s.replace('&', "&amp;").replace('<', "&lt;").replace('>', "&gt;").replace('"', "&quot;")
}

/// Collect crossref labels in document order and number them per family.
/// label -> link display text ("Figure 1", "Table 2", "§ Heading Text").
fn collect_labels(segments: &[Segment]) -> HashMap<String, String> {
    let mut map: HashMap<String, String> = HashMap::new();
    let (mut fig, mut tbl, mut eq) = (0usize, 0usize, 0usize);
    let mut add = |label: &str, heading: Option<&str>, map: &mut HashMap<String, String>| {
        if map.contains_key(label) {
            return; // duplicates: first wins (the document checker flags them)
        }
        let disp = if label.starts_with("fig-") {
            fig += 1;
            format!("Figure {fig}")
        } else if label.starts_with("tbl-") {
            tbl += 1;
            format!("Table {tbl}")
        } else if label.starts_with("eq-") {
            eq += 1;
            format!("Equation {eq}")
        } else if label.starts_with("sec-") {
            format!("§ {}", heading.unwrap_or(label))
        } else {
            return; // not a crossref family — falls through to the citation pass
        };
        map.insert(label.to_string(), disp);
    };
    for seg in segments {
        match seg {
            Segment::PythonCell { opts, .. } | Segment::OtherCell { opts, .. } => {
                if let Some(l) = &opts.label {
                    add(l, None, &mut map);
                }
            }
            Segment::Markdown { text, .. } => {
                for line in text.lines() {
                    let heading = heading_re().captures(line).map(|c| {
                        trailing_attr_re().replace(&c[2], "").trim().to_string()
                    });
                    for (l, _) in attr_labels(line) {
                        add(&l, heading.as_deref(), &mut map);
                    }
                }
            }
            Segment::PlainFence { .. } => {}
        }
    }
    map
}

/// Pandoc attribute blocks (markdown-it doesn't understand them itself):
/// - `## Title {#sec-x}` → `## <a id="sec-x"></a>Title`.
/// - An image's block keeps its non-id attributes so the preview can apply width/class,
///   with the `#id` split off as the crossref anchor: `![](p){width=50% #fig-x}` →
///   `![](p){width=50%}<a id="fig-x"></a>` (the `#id` may sit anywhere in the block).
/// - Other `{#label}` blocks (table captions, divs) collapse to a bare anchor.
/// - A block with no `#id` (e.g. `{width=50%}`) is left intact for the preview to apply.
fn transform_anchors(line: &str) -> String {
    if !line.contains('{') {
        return line.to_string();
    }
    if let Some(h) = heading_re().captures(line) {
        let text = &h[2];
        if let Some(m) = trailing_attr_re().captures(text) {
            if let Some(id) = first_hash_id(&m[1]) {
                let cleaned = trailing_attr_re().replace(text, "");
                return format!("{} <a id=\"{}\"></a>{}", &h[1], id, cleaned.trim());
            }
        }
        return line.to_string();
    }
    attr_block_re()
        .replace_all(line, |c: &regex::Captures| {
            let after_paren = c.get(1).is_some();
            let (id, rest) = split_attr_block(&c[2]);
            match id {
                None => c[0].to_string(), // no #id — leave intact (bare {width=…}, math, code)
                Some(id) => {
                    let anchor = format!("<a id=\"{id}\"></a>");
                    match (after_paren, rest.is_empty()) {
                        (true, false) => format!("){{{rest}}}{anchor}"),
                        (true, true) => format!("){anchor}"),
                        (false, _) => anchor,
                    }
                }
            }
        })
        .into_owned()
}

/// Apply `f` to the parts of a line outside inline `code` spans (a span = matching
/// backtick runs of equal length; an unmatched run is literal prose, per CommonMark).
fn map_outside_code_spans(line: &str, mut f: impl FnMut(&str) -> String) -> String {
    if !line.contains('`') {
        return f(line);
    }
    let b = line.as_bytes();
    let mut out = String::new();
    let mut start = 0;
    let mut i = 0;
    while i < b.len() {
        if b[i] != b'`' {
            i += 1;
            continue;
        }
        let rs = i;
        while i < b.len() && b[i] == b'`' {
            i += 1;
        }
        let n = i - rs;
        // find the closing run of exactly n backticks
        let mut k = i;
        let mut close = None;
        while k < b.len() {
            if b[k] == b'`' {
                let cs = k;
                while k < b.len() && b[k] == b'`' {
                    k += 1;
                }
                if k - cs == n {
                    close = Some(k);
                    break;
                }
            } else {
                k += 1;
            }
        }
        if let Some(ce) = close {
            out.push_str(&f(&line[start..rs]));
            out.push_str(&line[rs..ce]);
            start = ce;
            i = ce;
        }
    }
    out.push_str(&f(&line[start..]));
    out
}

/// `@fig-x` → `[Figure N](#fig-x)` etc. Unknown keys are left for the citation pass.
fn replace_crossrefs(part: &str, labels: &HashMap<String, String>) -> String {
    cite_re()
        .replace_all(part, |c: &regex::Captures| {
            let key = &c[2];
            match labels.get(key) {
                Some(disp) => format!("{}[{}](#{})", &c[1], disp, key),
                None => c[0].to_string(),
            }
        })
        .into_owned()
}

fn cite_link(e: &BibEntry, key: &str, suppress: bool, parens_year: bool) -> String {
    let author = if e.author.is_empty() { key } else { &e.author };
    let disp = if suppress {
        if e.year.is_empty() { key.to_string() } else { e.year.clone() }
    } else if e.year.is_empty() {
        author.to_string()
    } else if parens_year {
        format!("{} ({})", author, e.year)
    } else {
        format!("{} {}", author, e.year)
    };
    format!("[{disp}](#ref-{key})")
}

fn cite_missing(key: &str) -> String {
    format!("<span class=\"cite-missing\">@{key}</span>")
}

/// One `[…@…]` group: `;`-split items, each with exactly one `-?@key`; prefix/suffix text
/// kept verbatim; the group re-emitted in parens. Returns None when the content is not a
/// citation group (some item has no citation) — the brackets then stay verbatim.
fn citation_group(
    content: &str,
    refs: &HashMap<&str, &BibEntry>,
    cited: &mut Vec<String>,
    n_cites: &mut usize,
) -> Option<String> {
    let mut parts: Vec<String> = Vec::new();
    for item in content.split(';') {
        let caps = cite_re().captures(item)?;
        let m = caps.get(0).unwrap();
        let lead = caps.get(1).map_or("", |g| g.as_str());
        let key = caps.get(2).unwrap().as_str();
        let suppress = lead == "-";
        *n_cites += 1;
        let mut piece = String::new();
        piece.push_str(&item[..m.start()]);
        if !suppress {
            piece.push_str(lead);
        }
        match refs.get(key) {
            Some(e) => {
                cited.push(key.to_string());
                piece.push_str(&cite_link(e, key, suppress, false));
            }
            None => piece.push_str(&cite_missing(key)),
        }
        piece.push_str(&item[m.end()..]);
        parts.push(piece.trim().to_string());
    }
    Some(format!("({})", parts.join("; ")))
}

/// Bracketed citation groups, found with a hand scanner (the regex crate has no lookahead
/// for the "`]` not followed by `(`/`[`, not preceded by `!`" guards).
fn replace_bracket_groups(
    s: &str,
    refs: &HashMap<&str, &BibEntry>,
    cited: &mut Vec<String>,
    n_cites: &mut usize,
) -> String {
    if !s.contains('[') {
        return s.to_string();
    }
    let b = s.as_bytes();
    let mut out = String::new();
    let mut start = 0;
    let mut i = 0;
    while i < b.len() {
        if b[i] != b'[' {
            i += 1;
            continue;
        }
        if i > 0 && b[i - 1] == b'!' {
            i += 1;
            continue; // image ![…]
        }
        let mut j = i + 1;
        while j < b.len() && b[j] != b']' && b[j] != b'[' {
            j += 1;
        }
        if j >= b.len() || b[j] != b']' {
            i += 1; // nested/unclosed — rescan from the next char
            continue;
        }
        if matches!(b.get(j + 1), Some(b'(') | Some(b'[')) {
            i = j + 1;
            continue; // markdown link / reference link
        }
        let content = &s[i + 1..j];
        if !content.contains('@') {
            i = j + 1;
            continue;
        }
        match citation_group(content, refs, cited, n_cites) {
            Some(rep) => {
                out.push_str(&s[start..i]);
                out.push_str(&rep);
                start = j + 1;
                i = j + 1;
            }
            None => i = j + 1,
        }
    }
    out.push_str(&s[start..]);
    out
}

/// In-text `@key` → `[Author (Year)](#ref-key)`; `-@key` → year only; unknown key →
/// red-dotted `cite-missing` span.
fn replace_bare_citations(
    part: &str,
    refs: &HashMap<&str, &BibEntry>,
    cited: &mut Vec<String>,
    n_cites: &mut usize,
) -> String {
    cite_re()
        .replace_all(part, |c: &regex::Captures| {
            let lead = c.get(1).map_or("", |g| g.as_str());
            let key = &c[2];
            let suppress = lead == "-";
            *n_cites += 1;
            match refs.get(key) {
                Some(e) => {
                    cited.push(key.to_string());
                    let link = cite_link(e, key, suppress, true);
                    let link = if suppress && !e.year.is_empty() {
                        format!("[({})](#ref-{})", e.year, key)
                    } else {
                        link
                    };
                    format!("{}{}", if suppress { "" } else { lead }, link)
                }
                None => format!("{}{}", lead, cite_missing(key)),
            }
        })
        .into_owned()
}

fn process_prose(
    text: &str,
    labels: &HashMap<String, String>,
    refs: &HashMap<&str, &BibEntry>,
    cited: &mut Vec<String>,
    n_cites: &mut usize,
) -> String {
    let mut out: Vec<String> = Vec::new();
    for line in text.lines() {
        let line = transform_anchors(line);
        let line = map_outside_code_spans(&line, |part| {
            let a = replace_crossrefs(part, labels);
            let b = replace_bracket_groups(&a, refs, cited, n_cites);
            replace_bare_citations(&b, refs, cited, n_cites)
        });
        out.push(line);
    }
    out.join("\n")
}

// ---- references -------------------------------------------------------------------

/// APA-like References block from the cited keys — an approximation from the parsed bib
/// index, not citeproc. Raw HTML so entries can carry ids and `<em>`.
fn references_section(cited: &[String], refs: &HashMap<&str, &BibEntry>) -> Option<String> {
    let mut seen = std::collections::HashSet::new();
    let mut list: Vec<&BibEntry> = cited
        .iter()
        .filter(|k| seen.insert(k.as_str()))
        .filter_map(|k| refs.get(k.as_str()).copied())
        .collect();
    if list.is_empty() {
        return None;
    }
    list.sort_by(|a, b| {
        (a.authors_full.to_lowercase(), a.year.as_str(), a.key.as_str())
            .cmp(&(b.authors_full.to_lowercase(), b.year.as_str(), b.key.as_str()))
    });
    let mut out = String::from("## References\n\n<div class=\"references\">\n");
    for e in list {
        let mut s = String::new();
        if !e.authors_full.is_empty() {
            s.push_str(&html_escape(&e.authors_full));
        }
        if !e.year.is_empty() {
            if !s.is_empty() {
                s.push(' ');
            }
            s.push_str(&format!("({})", e.year));
        }
        if !s.is_empty() && !s.ends_with('.') {
            s.push('.');
        }
        if !e.title.is_empty() {
            if !s.is_empty() {
                s.push(' ');
            }
            s.push_str(&format!("<em>{}</em>.", html_escape(&e.title)));
        }
        if !e.container.is_empty() {
            if !s.is_empty() {
                s.push(' ');
            }
            s.push_str(&format!("<em>{}</em>.", html_escape(&e.container)));
        }
        out.push_str(&format!("<p class=\"ref-entry\" id=\"ref-{}\">{}</p>\n", e.key, s));
    }
    out.push_str("</div>");
    Some(out)
}

// ---- assembly ---------------------------------------------------------------------

pub(crate) struct Expanded {
    pub(crate) markdown: String,
    pub(crate) cells: usize,
    pub(crate) warnings: Vec<String>,
    /// One entry per line of `markdown`: the 1-based SOURCE line it came from, or 0
    /// for synthetic content (separators, references). Lets the frontend translate
    /// between editor (source) and rendered (expanded) coordinates for scroll sync
    /// and the after-build position restore (issue 4).
    pub(crate) line_map: Vec<u32>,
}

/// How a block's lines map back to the source document.
enum BlockMap {
    /// Block line k (0-based) ↔ source line `start + k` — prose, fences.
    Linear(usize),
    /// Every block line ↔ this one source line — spliced cell output, errors.
    Anchor(usize),
    /// No source counterpart (the generated References section).
    Synthetic,
}

/// Leading `#|` option lines are stripped from the echoed source (Quarto behavior).
fn echo_source(code: &str) -> String {
    code.lines()
        .skip_while(|l| l.trim_start().starts_with("#|"))
        .collect::<Vec<_>>()
        .join("\n")
}

fn source_fence(code: &str, lang: &str) -> String {
    let (mut run, mut cur) = (0usize, 0usize);
    for ch in code.chars() {
        if ch == '`' {
            cur += 1;
            run = run.max(cur);
        } else {
            cur = 0;
        }
    }
    let ticks = "`".repeat((run + 1).max(3));
    format!("{ticks}{lang}\n{code}\n{ticks}")
}

/// Splice one executed cell's output after its (echo-gated) source, honoring CellOpts.
fn splice_output(
    o: &CellOutput,
    opts: &CellOpts,
    first_line: usize,
    cell_no: usize,
    labels: &HashMap<String, String>,
    parts: &mut Vec<String>,
) {
    if let Some(reason) = &o.skipped {
        parts.push(format!("<div class=\"cell-skipped\">{}</div>", html_escape(reason)));
        return;
    }
    if opts.output {
        if !o.stdout.is_empty() {
            parts.push(source_fence(o.stdout.trim_end_matches('\n'), "text"));
        }
        if !o.stderr.is_empty() {
            parts.push(format!(
                "<pre class=\"cell-stderr\">{}</pre>",
                html_escape(o.stderr.trim_end_matches('\n'))
            ));
        }
        if let Some(t) = &o.result_text {
            parts.push(source_fence(t, "text"));
        }
        if let Some(h) = &o.result_html {
            // The existing DOMPurify pass sanitizes whatever _repr_html_ produced.
            parts.push(format!("<div class=\"cell-result\">\n{}\n</div>", h.trim()));
        }
        for (i, f) in o.figures.iter().enumerate() {
            let mime = if f.format == "svg" { "svg+xml" } else { f.format.as_str() };
            let cap = opts.fig_cap.as_deref().unwrap_or("");
            let mut block = String::new();
            if i == 0 {
                if let Some(l) = &opts.label {
                    block.push_str(&format!("<a id=\"{l}\"></a>"));
                }
            }
            block.push_str(&format!(
                "<img class=\"cell-figure\" src=\"data:image/{mime};base64,{}\" alt=\"{}\">",
                f.b64,
                html_escape(cap)
            ));
            if i == 0 {
                let num = opts.label.as_ref().and_then(|l| labels.get(l));
                let caption = match (num, cap.is_empty()) {
                    (Some(n), false) => format!("{n}: {cap}"),
                    (Some(n), true) => n.clone(),
                    (None, false) => cap.to_string(),
                    (None, true) => String::new(),
                };
                if !caption.is_empty() {
                    block.push_str(&format!(
                        "\n<p class=\"fig-caption\">{}</p>",
                        html_escape(&caption)
                    ));
                }
            }
            parts.push(block);
        }
    }
    if let Some(err) = &o.error {
        let loc = match err.line {
            Some(l) if l > 0 => format!("Cell {cell_no} (line {})", first_line as i64 + l - 1),
            _ => format!("Cell {cell_no}"),
        };
        let mut block = format!(
            "<div class=\"cell-error\"><p>{}: {}</p>",
            loc,
            html_escape(&err.message)
        );
        if !err.traceback.trim().is_empty() {
            block.push_str(&format!("<pre>{}</pre>", html_escape(err.traceback.trim_end())));
        }
        block.push_str("</div>");
        parts.push(block);
    }
}

/// Expand a split document against a bibliography, splicing executed cell output (keyed
/// by segment index; empty when execution is off). Pure — no filesystem, no app state —
/// so the whole pipeline is unit-testable.
pub(crate) fn expand(
    fm: &FrontMatter,
    segments: &[Segment],
    entries: &[BibEntry],
    exec: &HashMap<usize, CellOutput>,
) -> Expanded {
    let refs: HashMap<&str, &BibEntry> = entries.iter().map(|e| (e.key.as_str(), e)).collect();
    let labels = collect_labels(segments);
    let mut cited: Vec<String> = Vec::new();
    let mut n_cites = 0usize;
    let mut cells = 0usize;
    let mut blocks: Vec<(String, BlockMap)> = Vec::new();
    // Leading `#|` option lines are stripped from an echoed cell, shifting its first
    // echoed line down by their count in the source.
    let opt_lines = |code: &str| {
        code.lines().take_while(|l| l.trim_start().starts_with("#|")).count()
    };

    if let Some(t) = &fm.title {
        blocks.push((format!("# {t}"), BlockMap::Anchor(1)));
    }
    for (idx, seg) in segments.iter().enumerate() {
        match seg {
            Segment::Markdown { text, start } => {
                let processed = process_prose(text, &labels, &refs, &mut cited, &mut n_cites);
                // trim_matches drops leading newlines — account for them in the anchor.
                let leading = processed.chars().take_while(|c| *c == '\n').count();
                let p = processed.trim_matches('\n');
                if !p.trim().is_empty() {
                    blocks.push((p.to_string(), BlockMap::Linear(start + leading)));
                }
            }
            Segment::PlainFence { text, start } => {
                blocks.push((text.clone(), BlockMap::Linear(*start)));
            }
            Segment::PythonCell { code, opts, first_line } => {
                cells += 1;
                if !opts.include {
                    continue; // run, emit nothing (summary still counts it)
                }
                if opts.echo {
                    let src = echo_source(code);
                    if !src.trim().is_empty() {
                        // Fence line ↔ the line before the first echoed body line.
                        let start = (first_line + opt_lines(code)).saturating_sub(1);
                        blocks.push((source_fence(&src, "python"), BlockMap::Linear(start)));
                    }
                }
                if let Some(o) = exec.get(&idx) {
                    let mut parts: Vec<String> = Vec::new();
                    splice_output(o, opts, *first_line, cells, &labels, &mut parts);
                    blocks.extend(
                        parts.into_iter().map(|p| (p, BlockMap::Anchor(*first_line))),
                    );
                }
            }
            Segment::OtherCell { code, lang, opts, start } => {
                if !opts.include {
                    continue;
                }
                if opts.echo {
                    let src = echo_source(code);
                    if !src.trim().is_empty() {
                        blocks.push((
                            source_fence(&src, lang),
                            BlockMap::Linear(start + opt_lines(code)),
                        ));
                    }
                }
            }
        }
    }
    if let Some(r) = references_section(&cited, &refs) {
        blocks.push((r, BlockMap::Synthetic));
    }
    let mut warnings = Vec::new();
    if n_cites > 0 && entries.is_empty() {
        warnings.push("bibliography not loaded — citations are unresolved".to_string());
    }
    // Assemble: blocks joined by a blank line, with one line-map entry per output line
    // (the separator maps to 0 = synthetic).
    let mut markdown = String::new();
    let mut line_map: Vec<u32> = Vec::new();
    for (bi, (text, map)) in blocks.iter().enumerate() {
        if bi > 0 {
            markdown.push_str("\n\n");
            line_map.push(0);
        }
        let n = text.lines().count().max(1);
        match map {
            BlockMap::Linear(s) => line_map.extend((0..n).map(|k| (s + k) as u32)),
            BlockMap::Anchor(s) => line_map.extend(std::iter::repeat(*s as u32).take(n)),
            BlockMap::Synthetic => line_map.extend(std::iter::repeat(0u32).take(n)),
        }
        markdown.push_str(text);
    }
    Expanded { markdown, cells, warnings, line_map }
}

// ---- command ----------------------------------------------------------------------

/// The doc's front-matter `bibliography:` (resolved relative to the doc's folder),
/// parsed on demand and cached in RenderState by (path, mtime).
fn doc_bib(app: &tauri::AppHandle, doc_path: Option<&str>, rel: &str) -> Result<Vec<BibEntry>, String> {
    let mut p = PathBuf::from(rel);
    if p.is_relative() {
        let base = doc_path
            .and_then(|d| std::path::Path::new(d).parent().map(|b| b.to_path_buf()))
            .ok_or_else(|| format!("relative path '{rel}' needs a saved document"))?;
        p = base.join(rel);
    }
    let mtime = std::fs::metadata(&p)
        .and_then(|m| m.modified())
        .map_err(|e| format!("{}: {e}", p.display()))?;
    let state = app.state::<RenderState>();
    let mut guard = state.doc_bib.lock().map_err(|e| e.to_string())?;
    if let Some(db) = guard.as_ref() {
        if db.path == p && db.mtime == mtime {
            return Ok(db.entries.clone());
        }
    }
    let src = std::fs::read_to_string(&p).map_err(|e| format!("{}: {e}", p.display()))?;
    let entries = bib::parse_bib(&src);
    *guard = Some(DocBib { path: p, mtime, entries: entries.clone() });
    Ok(entries)
}

fn render_impl(app: &tauri::AppHandle, text: &str, path: Option<&str>) -> RenderResult {
    let t0 = Instant::now();
    let (fm, segments) = split_document(text);
    let mut pre_warnings: Vec<String> = Vec::new();

    // Execute python cells first (namespace-fresh, top-to-bottom); everything else
    // degrades gracefully when no interpreter is configured or the spawn fails.
    let n_python = segments.iter().filter(|s| matches!(s, Segment::PythonCell { .. })).count();
    let mut cfg = render_cfg(app);
    // Document-level interpreter override (issue 9): absolute paths only. A relative value
    // is ignored (not resolved against the doc folder), falling through to the configured
    // [render] python; a bad absolute path still surfaces below via Kernel::spawn.
    if let Some(wp) = fm.wd_python.as_deref().map(str::trim).filter(|s| !s.is_empty()) {
        if Path::new(wp).is_absolute() {
            cfg.python = wp.to_string();
        } else {
            pre_warnings.push(format!("wd-python ignored (must be an absolute path): {wp}"));
        }
    }
    let mut exec: HashMap<usize, CellOutput> = HashMap::new();
    let mut errors = 0usize;
    let python = if n_python == 0 {
        "ok".to_string()
    } else if cfg.python.is_empty() {
        pre_warnings.push(
            "python not configured — cells shown as source (set [render] python in config.toml)"
                .to_string(),
        );
        "not_configured".to_string()
    } else {
        let doc_dir = path
            .and_then(|p| Path::new(p).parent())
            .map(|d| d.to_string_lossy().to_string());
        match run_cells(app, &cfg, &segments, doc_dir.as_deref()) {
            Ok((map, errs)) => {
                exec = map;
                errors = errs;
                "ok".to_string()
            }
            Err(e) => {
                pre_warnings.push(format!("python failed to start: {e} — cells shown as source"));
                e
            }
        }
    };

    let mut exp = if let Some(rel) = fm.bibliography.clone() {
        match doc_bib(app, path, &rel) {
            Ok(entries) => expand(&fm, &segments, &entries, &exec),
            Err(e) => {
                // The doc explicitly overrode the bibliography — a failed load must not
                // silently fall back to the default file.
                pre_warnings.push(format!("bibliography not loaded: {e}"));
                expand(&fm, &segments, &[], &exec)
            }
        }
    } else {
        let st = app.state::<bib::BibState>();
        bib::with_entries(&st, |entries| expand(&fm, &segments, entries, &exec))
    };
    if pre_warnings.iter().any(|w| w.starts_with("bibliography not loaded")) {
        // The specific load error replaces the generic "not loaded" warning.
        exp.warnings.retain(|w| !w.starts_with("bibliography not loaded"));
    }
    let warnings = [pre_warnings, exp.warnings].concat();

    let elapsed_ms = t0.elapsed().as_millis() as u64;
    let cells = exp.cells;
    let cell_word = if cells == 1 { "cell" } else { "cells" };
    let err_part = match errors {
        0 => String::new(),
        1 => " · 1 error".to_string(),
        n => format!(" · {n} errors"),
    };
    let mut md = format!(
        "<p class=\"render-summary {}\">{} {cells} {cell_word}{err_part} · {:.1} s</p>",
        if errors > 0 { "err" } else { "ok" },
        if errors > 0 { "✗" } else { "✓" },
        elapsed_ms as f64 / 1000.0
    );
    for w in &warnings {
        md.push_str(&format!("\n<p class=\"render-summary warn\">{}</p>", html_escape(w)));
    }
    md.push_str("\n\n");
    md.push_str(&exp.markdown);
    // The prefix contributes: the summary line, one line per warning, and the blank
    // separator line from "\n\n" — all synthetic.
    let mut line_map = vec![0u32; 1 + warnings.len() + 1];
    line_map.extend(&exp.line_map);
    RenderResult { markdown: md, cells, errors, elapsed_ms, python, line_map }
}

/// Render the live buffer (no save side effect, no temp files). Async + spawn_blocking so
/// the webview never blocks.
#[tauri::command]
pub async fn render_document(
    app: tauri::AppHandle,
    text: String,
    path: Option<String>,
) -> Result<RenderResult, String> {
    tauri::async_runtime::spawn_blocking(move || render_impl(&app, &text, path.as_deref()))
        .await
        .map_err(|e| e.to_string())
}

// ---- tests -----------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    fn entries() -> Vec<BibEntry> {
        bib::parse_bib(
            r#"
            @book{Mild2022, author = {Mildenhall, Stephen J. and Major, John A.},
                  title = {Pricing Insurance Risk}, year = {2022}, publisher = {Wiley}}
            @article{Smith2020, author = {Smith, Jane}, title = {On Things},
                     year = {2020}, journal = {Journal of Things}}
            @misc{Adams2019, author = {Adams, Ann}, title = {Alpha Notes}, year = {2019}}
            "#,
        )
    }

    fn run(text: &str) -> String {
        let e = entries();
        let (fm, segs) = split_document(text);
        expand(&fm, &segs, &e, &HashMap::new()).markdown
    }

    // -- splitter --

    #[test]
    fn splits_front_matter_prose_and_cells() {
        let doc = "---\ntitle: \"My Doc\"\nbibliography: refs.bib\n---\nHello.\n\n```{python}\n#| label: fig-x\n#| echo: false\nprint(1)\n```\n\n```\nplain\n```\ntail\n";
        let (fm, segs) = split_document(doc);
        assert_eq!(fm.title.as_deref(), Some("My Doc"));
        assert_eq!(fm.bibliography.as_deref(), Some("refs.bib"));
        assert_eq!(segs.len(), 4);
        match &segs[1] {
            Segment::PythonCell { code, opts, first_line } => {
                assert!(code.contains("print(1)"));
                assert_eq!(opts.label.as_deref(), Some("fig-x"));
                assert!(!opts.echo);
                assert!(opts.eval && opts.include && opts.output);
                assert_eq!(*first_line, 8); // `#| label: fig-x` is document line 8
            }
            _ => panic!("expected python cell"),
        }
        match &segs[2] {
            Segment::PlainFence { text, .. } => assert_eq!(text, "```\nplain\n```"),
            _ => panic!("expected plain fence"),
        }
    }

    #[test]
    fn front_matter_tolerates_bom_crlf_and_block_list() {
        let doc = "\u{feff}---\r\ntitle: Doc\r\nbibliography:\r\n  - a.bib\r\n  - b.bib\r\n---\r\nbody\r\n";
        let (fm, segs) = split_document(doc);
        assert_eq!(fm.title.as_deref(), Some("Doc"));
        assert_eq!(fm.bibliography.as_deref(), Some("a.bib"));
        assert_eq!(segs.len(), 1);
    }

    #[test]
    fn front_matter_reads_wd_python() {
        let doc = "---\ntitle: Doc\nwd-python: \"C:/py/python.exe\"\n---\nbody\n";
        let (fm, _) = split_document(doc);
        assert_eq!(fm.wd_python.as_deref(), Some("C:/py/python.exe"));
    }

    #[test]
    fn hash_pipe_lines_stripped_from_echo() {
        let out = run("```{python}\n#| label: fig-a\n#| fig-cap: \"Cap\"\nx = 1\n```\n");
        assert!(out.contains("```python\nx = 1\n```"));
        assert!(!out.contains("#|"));
    }

    // -- citations (shared corpus with the editor's CITE_RE) --

    #[test]
    fn bare_citation_linked() {
        let out = run("As shown by @Mild2022 earlier.");
        assert!(out.contains("[Mildenhall and Major (2022)](#ref-Mild2022)"), "{out}");
    }

    #[test]
    fn trailing_punctuation_excluded() {
        let out = run("See @Smith2020.");
        assert!(out.contains("[Smith (2020)](#ref-Smith2020)."), "{out}");
    }

    #[test]
    fn email_and_path_not_citations() {
        let out = run("mail foo@Smith2020 and a/@Smith2020 stay");
        assert!(!out.contains("#ref-"), "{out}");
    }

    #[test]
    fn code_spans_and_fences_skipped() {
        let out = run("keep `@Smith2020` and\n```\n@Smith2020\n```\nliteral");
        assert!(!out.contains("#ref-"), "{out}");
        assert!(out.contains("`@Smith2020`"));
    }

    #[test]
    fn bracketed_group() {
        let out = run("[@Mild2022; @Smith2020]");
        assert!(
            out.contains("([Mildenhall and Major 2022](#ref-Mild2022); [Smith 2020](#ref-Smith2020))"),
            "{out}"
        );
    }

    #[test]
    fn bracketed_group_with_prefix_suffix() {
        let out = run("[see @Mild2022, p. 7]");
        assert!(out.contains("(see [Mildenhall and Major 2022](#ref-Mild2022), p. 7)"), "{out}");
    }

    #[test]
    fn suppressed_author() {
        let out = run("Mildenhall said it [-@Mild2022].");
        assert!(out.contains("([2022](#ref-Mild2022))"), "{out}");
    }

    #[test]
    fn unknown_key_flagged() {
        let out = run("See @NoSuchKey99 here.");
        assert!(out.contains("<span class=\"cite-missing\">@NoSuchKey99</span>"), "{out}");
        assert!(!out.contains("## References"));
    }

    #[test]
    fn markdown_links_untouched() {
        let out = run("[a link](https://x.y) and [ref link][@weird] stay");
        assert!(out.contains("[a link](https://x.y)"), "{out}");
    }

    #[test]
    fn no_bib_warns_and_flags() {
        let (fm, segs) = split_document("See @Smith2020.");
        let exp = expand(&fm, &segs, &[], &HashMap::new());
        assert!(exp.warnings.iter().any(|w| w.contains("bibliography not loaded")));
        assert!(exp.markdown.contains("cite-missing"));
    }

    // -- references --

    #[test]
    fn references_sorted_and_anchored() {
        let out = run("cite @Smith2020 and @Mild2022 and @Adams2019");
        let refs = out.split("## References").nth(1).expect("references section");
        assert!(refs.contains("<div class=\"references\">"));
        let a = refs.find("id=\"ref-Adams2019\"").unwrap();
        let m = refs.find("id=\"ref-Mild2022\"").unwrap();
        let s = refs.find("id=\"ref-Smith2020\"").unwrap();
        assert!(a < m && m < s, "sorted by author: {refs}");
        assert!(refs.contains(
            "Mildenhall, Stephen J. and Major, John A. (2022). <em>Pricing Insurance Risk</em>. <em>Wiley</em>."
        ));
        // No container on Adams2019 — entry ends cleanly after the title.
        assert!(refs.contains("Adams, Ann (2019). <em>Alpha Notes</em>.</p>"));
    }

    #[test]
    fn cited_once_listed_once() {
        let out = run("@Smith2020 and again @Smith2020");
        assert_eq!(out.matches("id=\"ref-Smith2020\"").count(), 1);
    }

    // -- crossrefs --

    #[test]
    fn crossrefs_numbered_in_doc_order() {
        let doc = "```{python}\n#| label: fig-first\nx\n```\n\n![cap](i.png){#fig-second}\n\nA table {#tbl-t}\n\nSee @fig-second, @fig-first, @tbl-t, @eq-nope.";
        let out = run(doc);
        assert!(out.contains("[Figure 2](#fig-second)"), "{out}");
        assert!(out.contains("[Figure 1](#fig-first)"), "{out}");
        assert!(out.contains("[Table 1](#tbl-t)"), "{out}");
        // eq-nope has no label anywhere — falls through to the citation pass
        assert!(out.contains("<span class=\"cite-missing\">@eq-nope</span>"), "{out}");
        // prose attrs became anchors
        assert!(out.contains("![cap](i.png)<a id=\"fig-second\"></a>"), "{out}");
    }

    #[test]
    fn heading_attr_becomes_anchor() {
        let out = run("## Intro Section {#sec-intro}\n\nSee @sec-intro.");
        assert!(out.contains("## <a id=\"sec-intro\"></a>Intro Section"), "{out}");
        assert!(out.contains("[§ Intro Section](#sec-intro)"), "{out}");
    }

    #[test]
    fn image_attrs_preserved_any_order() {
        // The `#id` splits off as the crossref anchor; width survives (either token order);
        // numbering is by document position. The preview then applies the kept `{width=…}`.
        let out = run(
            "![a](i.png){#fig-a width=50%}\n\n![b](j.png){width=60% #fig-b}\n\nSee @fig-a, @fig-b.",
        );
        assert!(out.contains("![a](i.png){width=50%}<a id=\"fig-a\"></a>"), "{out}");
        assert!(out.contains("![b](j.png){width=60%}<a id=\"fig-b\"></a>"), "{out}");
        assert!(out.contains("[Figure 1](#fig-a)"), "{out}");
        assert!(out.contains("[Figure 2](#fig-b)"), "{out}");
    }

    #[test]
    fn width_only_image_passes_through() {
        // No `#id` — the whole block is left intact for the preview to apply.
        let out = run("![a](i.png){width=50%}");
        assert!(out.contains("![a](i.png){width=50%}"), "{out}");
    }

    // -- execution splicing (synthetic outputs — no python needed) --

    fn expand_with(doc: &str, exec: HashMap<usize, CellOutput>) -> String {
        let (fm, segs) = split_document(doc);
        expand(&fm, &segs, &[], &exec).markdown
    }

    #[test]
    fn splices_stdout_result_and_error_line() {
        let doc = "```{python}\nprint('hi')\n```\n\n```{python}\n1/0\n```\n";
        let mut exec = HashMap::new();
        exec.insert(0, CellOutput { stdout: "hi\n".into(), ..Default::default() });
        exec.insert(1, CellOutput {
            error: Some(CellError {
                message: "ZeroDivisionError: division by zero".into(),
                traceback: "Traceback (most recent call last): ...".into(),
                line: Some(1),
            }),
            ..Default::default()
        });
        let out = expand_with(doc, exec);
        assert!(out.contains("```text\nhi\n```"), "{out}");
        // cell 2's body starts at document line 6, error at cell-relative line 1
        assert!(out.contains("<div class=\"cell-error\"><p>Cell 2 (line 6): ZeroDivisionError: division by zero</p>"), "{out}");
        assert!(out.contains("<pre>Traceback"), "{out}");
    }

    #[test]
    fn honors_echo_include_output_flags() {
        let doc = "```{python}\n#| echo: false\nprint('a')\n```\n\n```{python}\n#| include: false\nprint('b')\n```\n\n```{python}\n#| output: false\nprint('c')\n```\n";
        let mut exec = HashMap::new();
        exec.insert(0, CellOutput { stdout: "a\n".into(), ..Default::default() });
        exec.insert(1, CellOutput { stdout: "b\n".into(), ..Default::default() });
        exec.insert(2, CellOutput { stdout: "c\n".into(), ..Default::default() });
        let out = expand_with(doc, exec);
        // echo:false — output but no source
        assert!(out.contains("```text\na\n```"), "{out}");
        assert!(!out.contains("print('a')"), "{out}");
        // include:false — nothing at all
        assert!(!out.contains('b'), "{out}");
        // output:false — source but no output
        assert!(out.contains("print('c')"), "{out}");
        assert!(!out.contains("```text\nc"), "{out}");
    }

    #[test]
    fn figure_gets_anchor_number_and_caption() {
        let doc = "```{python}\n#| label: fig-plot\n#| fig-cap: \"My Cap\"\nplot()\n```\n";
        let mut exec = HashMap::new();
        exec.insert(0, CellOutput {
            figures: vec![Figure { format: "png".into(), b64: "AAAA".into() }],
            ..Default::default()
        });
        let out = expand_with(doc, exec);
        assert!(out.contains("<a id=\"fig-plot\"></a><img class=\"cell-figure\" src=\"data:image/png;base64,AAAA\" alt=\"My Cap\">"), "{out}");
        assert!(out.contains("<p class=\"fig-caption\">Figure 1: My Cap</p>"), "{out}");
    }

    #[test]
    fn skipped_and_html_result_blocks() {
        let doc = "```{python}\ndf\n```\n\n```{python}\nx\n```\n";
        let mut exec = HashMap::new();
        exec.insert(0, CellOutput {
            result_html: Some("<table><tr><td>1</td></tr></table>".into()),
            ..Default::default()
        });
        exec.insert(1, CellOutput {
            skipped: Some("not run (kernel restarted after cell 1 timed out)".into()),
            ..Default::default()
        });
        let out = expand_with(doc, exec);
        assert!(out.contains("<div class=\"cell-result\">\n<table>"), "{out}");
        assert!(out.contains("<div class=\"cell-skipped\">not run (kernel restarted after cell 1 timed out)</div>"), "{out}");
    }

    // -- kernel integration: cargo test -- --ignored, with a real interpreter on PATH
    // or named in WRITEDOWN_TEST_PYTHON (the Store's python.exe stub does not count) --

    fn test_kernel() -> Kernel {
        let python =
            std::env::var("WRITEDOWN_TEST_PYTHON").unwrap_or_else(|_| "python".to_string());
        let dir = std::env::temp_dir().join("writedown-kernel-test");
        Kernel::spawn(&python, &dir, Duration::from_secs(20)).expect("real python available")
    }

    #[test]
    #[ignore]
    fn kernel_stdout_and_last_expr() {
        let mut k = test_kernel();
        let r = k
            .exec("print('hey')\n1 + 1", true, None, "png", 150, Duration::from_secs(10))
            .ok()
            .unwrap();
        assert_eq!(r.stdout, "hey\n");
        assert_eq!(r.result_text.as_deref(), Some("2"));
        assert!(r.error.is_none());
    }

    #[test]
    #[ignore]
    fn kernel_namespace_resets_but_modules_survive() {
        let mut k = test_kernel();
        let r = k.exec("import math\nx = 41", true, None, "png", 150, Duration::from_secs(10));
        assert!(r.ok().unwrap().error.is_none());
        // Same render (no reset): x is visible.
        let r = k.exec("x + 1", false, None, "png", 150, Duration::from_secs(10)).ok().unwrap();
        assert_eq!(r.result_text.as_deref(), Some("42"));
        // New render (reset): x is gone.
        let r = k.exec("x", true, None, "png", 150, Duration::from_secs(10)).ok().unwrap();
        assert!(r.error.is_some());
    }

    #[test]
    #[ignore]
    fn kernel_error_line_maps() {
        let mut k = test_kernel();
        let r = k
            .exec("a = 1\nb = 2\n1/0", true, None, "png", 150, Duration::from_secs(10))
            .ok()
            .unwrap();
        let e = r.error.expect("error");
        assert!(e.message.contains("ZeroDivisionError"));
        assert_eq!(e.line, Some(3));
    }

    #[test]
    #[ignore]
    fn kernel_timeout_kills() {
        let mut k = test_kernel();
        let r = k.exec("while True: pass", true, None, "png", 150, Duration::from_secs(2));
        assert!(matches!(r, Err(ExecFail::Timeout)));
        drop(k); // Drop kills the busy process — must not hang
    }

    #[test]
    #[ignore]
    fn kernel_matplotlib_figure() {
        let mut k = test_kernel();
        let code = "import matplotlib.pyplot as plt\nplt.plot([1, 2], [3, 4])\nplt.gcf()";
        let r = k.exec(code, true, None, "png", 96, Duration::from_secs(30)).ok().unwrap();
        assert!(r.error.is_none(), "{:?}", r.error.map(|e| e.message));
        assert_eq!(r.figures.len(), 1);
        assert_eq!(r.figures[0].format, "png");
        assert!(!r.figures[0].b64.is_empty());
    }
}
