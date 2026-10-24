//! Fast in-process Quarto/Markdown render (plan 1.33): split the live buffer into prose
//! and code cells, resolve `@key` citations against the bibliography index, number Quarto
//! crossrefs, append a generated References section, and return expanded markdown for the
//! existing preview component. Speed over accuracy — no pandoc, no quarto, no citeproc.
//! Nothing is ever written to the user's files.

use crate::bib::{self, BibEntry};
use crate::check::{fence_close, fence_open};
use crate::labels::attr_labels;
use regex::Regex;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant, SystemTime};
use tauri::Manager;

// ---- state -------------------------------------------------------------------------

/// Render-scoped state: the per-document bibliography cache (a doc's front-matter
/// `bibliography:` override, keyed by path+mtime) and the persistent python kernels.
#[derive(Default)]
pub struct RenderState {
    doc_bib: Mutex<Option<DocBib>>,
    /// The kernel pool (issue J.19): at most `[render] max_kernels` processes, one per
    /// interpreter, most recently used first. Switching between documents in different
    /// venvs swaps processes instead of restarting one, so each keeps its namespace. The
    /// lock is held for a whole render, as the single kernel's was.
    kernels: Mutex<Vec<Kernel>>,
    /// Last render's cell outputs per document path, so "Run This Cell" can re-assemble the
    /// whole rendered document with just one cell's output replaced (issue A.24). Each entry
    /// keeps the code it was produced from: if that cell's source has changed since, the
    /// cached output is dropped rather than shown — stale output must never look current.
    cells: Mutex<HashMap<String, HashMap<usize, CachedCell>>>,
}

#[derive(Clone)]
struct CachedCell {
    code: String,
    out: CellOutput,
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

/// `[render]` in config.toml, read directly like `bib_path` does (each render reads it
/// afresh, so edits apply on the next render). `python` is the
/// configured interpreter, the last resort after `wd-python` and a venv found beside the
/// document (issue J.19; see `resolve_python`). Missing/invalid keys fall back to defaults.
struct RenderCfg {
    python: String,
    timeout_seconds: u64,
    figure_format: String, // "png" | "svg"
    figure_dpi: u32,
    /// How a failing cell is reported (issue D.09): minimal | plain | context | verbose |
    /// docs. The runner formats tracebacks itself, so this is ours to choose — there is no
    /// IPython involved and no CPython flag that does it.
    traceback_mode: String,
    /// Python warning mode (issue J.16): first | all | off. See WARNING_MODES.
    warnings: String,
    /// Look for `.venv` / `venv` beside the document and in its parents (issue J.19).
    auto_venv: bool,
    /// Python processes kept alive per window, one per interpreter (issue J.19), >= 1.
    max_kernels: usize,
}

/// Valid `[render] traceback_mode` values; anything else falls back to the default.
const TRACEBACK_MODES: &[&str] = &["minimal", "plain", "context", "verbose", "docs"];

/// Valid warning modes (issue J.16), for `[render] warnings`, `wd-warnings:` and the
/// palette override: Python's "once" (the first of each distinct message, the default),
/// "always", "ignore". The runner maps them (runner.py WARN_ACTIONS).
const WARNING_MODES: &[&str] = &["first", "all", "off"];

fn render_cfg(app: &tauri::AppHandle) -> RenderCfg {
    let mut cfg = RenderCfg {
        python: String::new(),
        timeout_seconds: 30,
        figure_format: "png".into(),
        figure_dpi: 150,
        traceback_mode: "context".into(),
        warnings: "first".into(),
        auto_venv: true,
        max_kernels: 3,
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
    if let Some(m) = r.get("traceback_mode").and_then(|v| v.as_str()) {
        let m = m.trim().to_lowercase();
        if TRACEBACK_MODES.contains(&m.as_str()) {
            cfg.traceback_mode = m;
        }
    }
    if let Some(m) = r.get("warnings").and_then(|v| v.as_str()) {
        let m = m.trim().to_lowercase();
        if WARNING_MODES.contains(&m.as_str()) {
            cfg.warnings = m;
        }
    }
    if let Some(b) = r.get("auto_venv").and_then(|v| v.as_bool()) {
        cfg.auto_venv = b;
    }
    if let Some(n) = r.get("max_kernels").and_then(|v| v.as_integer()) {
        cfg.max_kernels = n.clamp(1, 16) as usize;
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
    traceback_mode: &'a str,
    warnings: &'a str,
}

/// Everything about a request except the code and the reset flag: the same for every cell
/// of one render.
struct ExecOpts<'a> {
    cwd: Option<&'a str>,
    fig_format: &'a str,
    fig_dpi: u32,
    traceback_mode: &'a str,
    warnings: &'a str,
    timeout: Duration,
}

impl RenderCfg {
    fn exec_opts<'a>(&'a self, cwd: Option<&'a str>) -> ExecOpts<'a> {
        ExecOpts {
            cwd,
            fig_format: &self.figure_format,
            fig_dpi: self.figure_dpi,
            traceback_mode: &self.traceback_mode,
            warnings: &self.warnings,
            timeout: Duration::from_secs(self.timeout_seconds),
        }
    }
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
#[derive(Default, Clone)]
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
    /// The interpreter's version from the runner's ready line ("3.13.5"), for Which Python.
    version: String,
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

        let mut k = Kernel {
            child,
            stdin,
            rx,
            python_path: python.to_string(),
            version: String::new(),
            next_id: 0,
        };
        match k.rx.recv_timeout(ready_timeout) {
            Ok(l) if l.contains("\"ready\"") => {
                k.version = serde_json::from_str::<serde_json::Value>(&l)
                    .ok()
                    .and_then(|v| v.get("python")?.as_str().map(str::to_string))
                    .unwrap_or_default();
                Ok(k)
            }
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

    fn exec(&mut self, code: &str, reset: bool, o: &ExecOpts) -> Result<CellReply, ExecFail> {
        use std::io::Write;
        self.next_id += 1;
        let id = self.next_id;
        let req = CellReq {
            id,
            code,
            reset,
            cwd: o.cwd,
            fig_format: o.fig_format,
            fig_dpi: o.fig_dpi,
            traceback_mode: o.traceback_mode,
            warnings: o.warnings,
        };
        let line = serde_json::to_string(&req).map_err(|_| ExecFail::Dead)?;
        writeln!(self.stdin, "{line}").map_err(|_| ExecFail::Dead)?;
        self.stdin.flush().map_err(|_| ExecFail::Dead)?;
        let deadline = Instant::now() + o.timeout;
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

impl Kernel {
    /// Send one non-cell request (`op` set, issue J.18) and wait for its reply, matched by
    /// id like a cell's. The reply comes back as JSON for the caller to read.
    fn request(&mut self, mut req: serde_json::Value, timeout: Duration) -> Result<serde_json::Value, ExecFail> {
        use std::io::Write;
        self.next_id += 1;
        let id = self.next_id;
        req["id"] = serde_json::json!(id);
        writeln!(self.stdin, "{req}").map_err(|_| ExecFail::Dead)?;
        self.stdin.flush().map_err(|_| ExecFail::Dead)?;
        let deadline = Instant::now() + timeout;
        loop {
            let left = deadline.saturating_duration_since(Instant::now());
            if left.is_zero() {
                return Err(ExecFail::Timeout);
            }
            match self.rx.recv_timeout(left) {
                Ok(l) => {
                    if let Ok(v) = serde_json::from_str::<serde_json::Value>(&l) {
                        if v.get("id").and_then(|x| x.as_u64()) == Some(id) {
                            return Ok(v);
                        }
                    }
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

/// Kill every kernel on app exit (RunEvent::Exit). The runner's stdin-EOF exit is the
/// backstop; this is the belt to that suspender.
pub fn shutdown_kernel(app: &tauri::AppHandle) {
    if let Some(state) = app.try_state::<RenderState>() {
        if let Ok(mut pool) = state.kernels.lock() {
            pool.clear(); // Drop kills
        }
    }
}

/// The kernel for `python`, moved to the front of the pool, and whether it was just
/// started (an empty namespace). Dead kernels are dropped first; a new one is spawned when
/// none matches, and the least recently used beyond `max` are dropped, which kills them.
fn checkout<'a>(
    pool: &'a mut Vec<Kernel>,
    python: &str,
    max_kernels: usize,
    runner_dir: &Path,
    ready_timeout: Duration,
) -> Result<(&'a mut Kernel, bool), String> {
    pool.retain_mut(|k| k.alive());
    let fresh = match pool.iter().position(|k| k.python_path == python) {
        Some(i) => {
            let k = pool.remove(i);
            pool.insert(0, k);
            false
        }
        None => {
            let k = Kernel::spawn(python, runner_dir, ready_timeout)?;
            pool.insert(0, k);
            true
        }
    };
    pool.truncate(max_kernels.max(1));
    Ok((&mut pool[0], fresh))
}

/// `checkout` with the app's runner folder and the config's pool size and timeout.
fn checkout_for<'a>(
    app: &tauri::AppHandle,
    pool: &'a mut Vec<Kernel>,
    python: &str,
    cfg: &RenderCfg,
) -> Result<(&'a mut Kernel, bool), String> {
    let cache = crate::config::writedown_dir(app)?.join("cache");
    checkout(pool, python, cfg.max_kernels, &cache, Duration::from_secs(cfg.timeout_seconds))
}

/// Explicit user command ("Restart Python Kernel"): kill now, respawn on the next render.
/// This is the Windows "interrupt" for a stuck or memory-heavy kernel. With a document
/// (its text and path), only the kernel for that document's interpreter (issue J.19);
/// with neither, every kernel in the pool. Async, so waiting out a render that holds the
/// pool never freezes the window.
#[tauri::command(async)]
pub fn restart_kernel(
    app: tauri::AppHandle,
    text: Option<String>,
    path: Option<String>,
) -> Result<(), String> {
    let target = match (&text, &path) {
        (None, None) => None,
        _ => Some(doc_python(&app, text.as_deref().unwrap_or(""), path.as_deref()).0),
    };
    let state = app.state::<RenderState>();
    let mut pool = state.kernels.lock().map_err(|e| e.to_string())?;
    match target {
        None => pool.clear(),
        Some(py) => pool.retain(|k| k.python_path != py),
    }
    Ok(())
}

/// Where a document's interpreter came from (issue J.19), in `resolve_python`'s order.
#[derive(Debug, PartialEq)]
pub(crate) enum PySource {
    /// `wd-python:` in the front matter (absolute paths only).
    FrontMatter,
    /// A `.venv` / `venv` in this folder: the document's own or a parent.
    Venv(PathBuf),
    /// `[render] python`.
    Config,
    /// Nothing configured or found.
    Unset,
}

/// The venv interpreter nearest `dir`: at each folder from `dir` up to the drive root,
/// `.venv` then `venv`. Returns the interpreter and the folder holding the venv.
fn nearest_venv(dir: &Path) -> Option<(PathBuf, PathBuf)> {
    let rel: [&[&str]; 2] = if cfg!(windows) {
        [&[".venv", "Scripts", "python.exe"], &["venv", "Scripts", "python.exe"]]
    } else {
        [&[".venv", "bin", "python"], &["venv", "bin", "python"]]
    };
    let mut cur = Some(dir);
    while let Some(d) = cur {
        for parts in rel {
            let p = parts.iter().fold(d.to_path_buf(), |acc, s| acc.join(s));
            if p.is_file() {
                return Some((p, d.to_path_buf()));
            }
        }
        cur = d.parent();
    }
    None
}

/// The interpreter for a document (issue J.19): `wd-python` (absolute paths only; a relative
/// one is ignored with a warning), then the nearest venv when `auto_venv` and the document
/// has a folder (a scratch buffer has none), then `[render] python`. Pure but for the
/// file-existence tests, so it is testable over a temporary folder tree. Used by the full
/// render, Run This Cell, Which Python and the restart verb alike.
pub(crate) fn resolve_python(
    doc_dir: Option<&Path>,
    wd_python: Option<&str>,
    cfg_python: &str,
    auto_venv: bool,
) -> (String, PySource, Option<String>) {
    let mut warning = None;
    if let Some(wp) = wd_python.map(str::trim).filter(|s| !s.is_empty()) {
        if Path::new(wp).is_absolute() {
            return (wp.to_string(), PySource::FrontMatter, None);
        }
        warning = Some(format!("wd-python ignored (must be an absolute path): {wp}"));
    }
    if auto_venv {
        if let Some((py, folder)) = doc_dir.and_then(nearest_venv) {
            return (py.to_string_lossy().to_string(), PySource::Venv(folder), warning);
        }
    }
    if cfg_python.is_empty() {
        (String::new(), PySource::Unset, warning)
    } else {
        (cfg_python.to_string(), PySource::Config, warning)
    }
}

/// A document's interpreter from its live text and path, with the config read fresh.
fn doc_python(app: &tauri::AppHandle, text: &str, path: Option<&str>) -> (String, PySource, Option<String>) {
    let (fm, _) = split_document(text);
    let cfg = render_cfg(app);
    let dir = path.and_then(|p| Path::new(p).parent());
    resolve_python(dir, fm.wd_python.as_deref(), &cfg.python, cfg.auto_venv)
}

#[derive(Serialize)]
pub struct WhichPython {
    /// The interpreter path, "" when none is configured or found.
    python: String,
    /// Why: "wd-python in front matter", "venv found in <folder>", "[render] python", or
    /// "not configured".
    reason: String,
    /// Its version when its kernel is running, else None ("not started").
    version: Option<String>,
    /// Kernels alive in this window; None while a render holds the pool.
    kernels: Option<usize>,
    /// A front-matter problem worth showing (a relative wd-python).
    warning: Option<String>,
}

/// "Python: Which Python" (issue J.19): the active document's interpreter and why it was
/// chosen. Never waits behind a render: a busy pool reports no version and no count.
#[tauri::command(async)]
pub fn which_python(app: tauri::AppHandle, text: String, path: Option<String>) -> WhichPython {
    let (python, source, warning) = doc_python(&app, &text, path.as_deref());
    let reason = match &source {
        PySource::FrontMatter => "wd-python in front matter".to_string(),
        PySource::Venv(folder) => format!("venv found in {}", folder.display()),
        PySource::Config => "[render] python".to_string(),
        PySource::Unset => "not configured: set [render] python, or add a .venv".to_string(),
    };
    let state = app.state::<RenderState>();
    let (version, kernels) = match state.kernels.try_lock() {
        Ok(mut pool) => {
            pool.retain_mut(|k| k.alive());
            let v = pool.iter().find(|k| k.python_path == python).map(|k| k.version.clone());
            (v, Some(pool.len()))
        }
        Err(_) => (None, None),
    };
    WhichPython { python, reason, version, kernels, warning }
}

/// The code a help request reads, and the caret's line within it (issue J.18). A Markdown
/// or Quarto document gives every `{python}` cell up to and including the one holding
/// document line `line`, joined, so names defined in earlier cells resolve for jedi; a
/// `.py` file gives the whole buffer. None: the caret is not in a cell's body.
pub(crate) fn help_code(text: &str, line: usize, py_file: bool) -> Option<(String, usize)> {
    if py_file {
        return Some((text.to_string(), line));
    }
    let (_, segments) = split_document(text);
    let mut parts: Vec<&str> = Vec::new();
    let mut offset = 0usize; // code lines in the cells before this one
    for seg in &segments {
        let Segment::PythonCell { code, first_line, .. } = seg else { continue };
        let n = if code.is_empty() { 0 } else { code.split('\n').count() };
        if line >= *first_line && line < first_line + n {
            parts.push(code);
            return Some((parts.join("\n"), offset + (line - first_line) + 1));
        }
        if *first_line > line {
            break;
        }
        parts.push(code);
        offset += n;
    }
    None
}

#[derive(Serialize, Deserialize, Default)]
pub struct PythonHelp {
    /// The dotted name at the caret ("df.groupby").
    #[serde(default)]
    name: String,
    /// "namespace" (the live kernel), "jedi" (static reading), or "none".
    #[serde(default)]
    source: String,
    #[serde(default)]
    text: String,
}

/// How long a help request may take before it is abandoned (issue J.18).
const HELP_TIMEOUT: Duration = Duration::from_secs(5);

/// "Python: Help on Name at Caret" (issue J.18): help() text for the name at document line
/// `line`, column `col` (both 1-based), from the kernel of the document's own interpreter
/// (J.19's resolver), so the names are those its last render defined. Never waits behind a
/// render: a pool in use answers "busy (rendering)". With no kernel yet for that
/// interpreter one is started, and its empty namespace leaves jedi or "render first".
///
/// Notes
/// -----
/// A help request that outlives HELP_TIMEOUT is abandoned but its kernel is KEPT: killing
/// it would throw away the namespace the help was about. The runner is single-threaded, so
/// a render sent meanwhile waits for it to finish, and its late reply is dropped by id.
#[tauri::command(async)]
pub fn python_help(
    app: tauri::AppHandle,
    text: String,
    path: Option<String>,
    line: usize,
    col: usize,
    py_file: bool,
) -> Result<PythonHelp, String> {
    let Some((code, code_line)) = help_code(&text, line, py_file) else {
        return Err("help: the caret is not in Python code".to_string());
    };
    let (python, _, _) = doc_python(&app, &text, path.as_deref());
    if python.is_empty() {
        return Err("help: no Python configured (set [render] python, or add a .venv)".to_string());
    }
    let cfg = render_cfg(&app);
    let state = app.state::<RenderState>();
    let Ok(mut pool) = state.kernels.try_lock() else {
        return Err("help: busy (rendering)".to_string());
    };
    let (kernel, _) = checkout_for(&app, &mut pool, &python, &cfg)?;
    let req = serde_json::json!({ "op": "help", "code": code, "line": code_line, "col": col });
    match kernel.request(req, HELP_TIMEOUT) {
        Ok(v) => serde_json::from_value::<PythonHelp>(v.get("help").cloned().unwrap_or_default())
            .map_err(|e| format!("help: unreadable reply ({e})")),
        Err(ExecFail::Timeout) => Err("help: no answer within 5 s (the kernel is kept)".to_string()),
        Err(ExecFail::Dead) => {
            pool.remove(0); // a dead kernel goes; the next request or render starts afresh
            Err("help: the python kernel exited".to_string())
        }
    }
}

/// Run every `eval`-able python cell top-to-bottom (fresh namespace via `reset` on the
/// first). On a timeout the kernel is killed and the remaining cells are marked skipped.
/// Returns (segment index -> output, error count). Err = the kernel could not start.
fn run_cells(
    app: &tauri::AppHandle,
    cfg: &RenderCfg,
    python: &str,
    segments: &[Segment],
    doc_dir: Option<&str>,
) -> Result<(HashMap<usize, CellOutput>, usize), String> {
    let state = app.state::<RenderState>();
    let mut pool = state.kernels.lock().map_err(|e| e.to_string())?;
    checkout_for(app, &mut pool, python, cfg)?;
    let o = cfg.exec_opts(doc_dir);

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
        let kernel = &mut pool[0]; // checked out above; removed only on failure below
        match kernel.exec(code, first, &o) {
            Ok(rep) => {
                if rep.error.is_some() {
                    errors += 1;
                }
                outputs.insert(idx, rep.into());
            }
            Err(fail) => {
                errors += 1;
                pool.remove(0); // Drop kills this kernel alone; the next render respawns it
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

/// Run exactly ONE python cell, in whatever state the kernel is already in — Jupyter's
/// Shift+Enter (issue A.24). No `reset`, so imports and variables from earlier work are
/// still there and the call is as fast as the cell itself. The honest trade, stated in the
/// changelog: a document can then "work" in an execution order a clean full render would
/// not reproduce; Ctrl+Shift+Enter remains the source of truth.
fn run_one_cell(
    app: &tauri::AppHandle,
    cfg: &RenderCfg,
    python: &str,
    code: &str,
    doc_dir: Option<&str>,
) -> Result<CellOutput, String> {
    let state = app.state::<RenderState>();
    let mut pool = state.kernels.lock().map_err(|e| e.to_string())?;
    // A cold kernel has an empty namespace, so `first` must be true here to initialise it;
    // an already-running one is left exactly as it is. With the pool (issue J.19) that
    // includes a kernel kept warm across a render of a document in another venv.
    let (kernel, first) = checkout_for(app, &mut pool, python, cfg)?;
    match kernel.exec(code, first, &cfg.exec_opts(doc_dir)) {
        Ok(rep) => Ok(rep.into()),
        Err(fail) => {
            pool.remove(0); // Drop kills this kernel alone; the next run respawns it
            let msg = match fail {
                ExecFail::Timeout => {
                    format!("timed out after {}s — kernel restarted", cfg.timeout_seconds)
                }
                ExecFail::Dead => "python kernel exited unexpectedly".to_string(),
            };
            Ok(CellOutput {
                error: Some(CellError { message: msg, traceback: String::new(), line: None }),
                ..Default::default()
            })
        }
    }
}

/// The segment index of the `{python}` cell containing 1-based document line `line`, or the
/// nearest one above it. Resolved HERE rather than in the frontend so `split_document` stays
/// the single definition of where a cell starts and ends.
fn cell_at_line(segments: &[Segment], line: usize) -> Option<usize> {
    let mut best: Option<usize> = None;
    for (idx, seg) in segments.iter().enumerate() {
        if let Segment::PythonCell { first_line, code, .. } = seg {
            let start = *first_line;
            let end = start + code.lines().count();
            if line >= start.saturating_sub(1) && line <= end {
                return Some(idx);
            }
            if start <= line {
                best = Some(idx);
            }
        }
    }
    best
}

// ---- document splitter ----------------------------------------------------------------

#[derive(Default)]
pub(crate) struct FrontMatter {
    pub(crate) title: Option<String>,
    pub(crate) bibliography: Option<String>,
    /// `wd-python:` — a document-level Python interpreter override (issue 9). Absolute
    /// paths only; enforced where it is applied (see `render_impl`).
    pub(crate) wd_python: Option<String>,
    /// `wd-traceback:` — a document-level traceback mode (issue D.09). One of
    /// TRACEBACK_MODES; validated where it is applied (see `render_impl`).
    pub(crate) wd_traceback: Option<String>,
    /// `wd-warnings:` — a document-level Python warning mode (issue J.16). One of
    /// WARNING_MODES; validated where it is applied (see `render_impl`).
    pub(crate) wd_warnings: Option<String>,
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
        } else if let Some(v) = line.strip_prefix("wd-traceback:") {
            // Document-level traceback verbosity (issue D.09), mirroring wd-python.
            // Validated where it is applied, so an unknown value warns rather than
            // silently doing nothing.
            let v = unquote(v);
            if !v.is_empty() {
                fm.wd_traceback = Some(v);
            }
        } else if let Some(v) = line.strip_prefix("wd-warnings:") {
            // Document-level warning mode (issue J.16), the wd-traceback pattern exactly.
            let v = unquote(v);
            if !v.is_empty() {
                fm.wd_warnings = Some(v);
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

/// Mirror of the editor's CITE_RE (citePatterns.ts). The regex crate has no lookbehind, so
/// the boundary guard is a leading group that must be re-emitted on replacement. `&` is
/// allowed inside a key (issue J.22: `@S&P2019`); a key still ends on a letter or digit,
/// so `Smith & Jones` and trailing sentence punctuation stay outside it.
fn cite_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| {
        Regex::new(r"(^|[^\p{L}\p{N}_@/])@([\p{L}\p{N}](?:[\p{L}\p{N}_:.&-]*[\p{L}\p{N}])?)")
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

// Shared with the checker and the `@`-completion label picker (issue E.01): one definition
// of which token in a `{ … }` block is the id.
use crate::labels::split_attr_block;

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
    format!("<span class=\"cite-missing\">@{}</span>", html_escape(key))
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
        // Escaped: a key may contain `&` (issue J.22). The browser decodes the attribute,
        // so the id still equals the `#ref-<key>` fragment the citation links point at.
        out.push_str(&format!(
            "<p class=\"ref-entry\" id=\"ref-{}\">{}</p>\n",
            html_escape(&e.key),
            s
        ));
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

fn render_impl(
    app: &tauri::AppHandle,
    text: &str,
    path: Option<&str>,
    // Some(line) = "Run This Cell": execute only the cell at that 1-based document line, in
    // the live namespace, and re-assemble the document from the cached outputs (issue A.24).
    only_cell_at: Option<usize>,
    // The palette's "Python Warnings: …" session override (issue J.16); beats front matter
    // and config. None = no override.
    warnings_override: Option<&str>,
) -> RenderResult {
    let t0 = Instant::now();
    let (fm, segments) = split_document(text);
    let mut pre_warnings: Vec<String> = Vec::new();

    // Execute python cells first (namespace-fresh, top-to-bottom); everything else
    // degrades gracefully when no interpreter is configured or the spawn fails.
    let n_python = segments.iter().filter(|s| matches!(s, Segment::PythonCell { .. })).count();
    let mut cfg = render_cfg(app);
    let doc_dir_path = path.and_then(|p| Path::new(p).parent());
    // The interpreter (issues 9 and J.19): wd-python (absolute only; a relative value is
    // ignored with a warning, not resolved against the doc folder), then the nearest venv,
    // then [render] python. Resolved BEFORE the not-configured test below, so a document
    // whose folder has a venv runs even with [render] python empty. A bad path still
    // surfaces below via Kernel::spawn.
    let (python, _source, py_warning) =
        resolve_python(doc_dir_path, fm.wd_python.as_deref(), &cfg.python, cfg.auto_venv);
    pre_warnings.extend(py_warning);
    // Warning mode (issue J.16): palette override, then wd-warnings, then config. An
    // unknown front-matter value warns, like wd-traceback.
    if let Some(ww) = fm.wd_warnings.as_deref().map(str::trim).filter(|s| !s.is_empty()) {
        let ww = ww.to_lowercase();
        if WARNING_MODES.contains(&ww.as_str()) {
            cfg.warnings = ww;
        } else {
            pre_warnings.push(format!(
                "wd-warnings ignored (expected one of {}): {ww}",
                WARNING_MODES.join(", ")
            ));
        }
    }
    if let Some(ov) = warnings_override.filter(|m| WARNING_MODES.contains(m)) {
        cfg.warnings = ov.to_string();
    }
    // Document-level traceback mode (issue D.09). An unrecognised value warns rather than
    // being dropped in silence — a typo'd `wd-traceback: verbos` should say so.
    if let Some(wt) = fm.wd_traceback.as_deref().map(str::trim).filter(|s| !s.is_empty()) {
        let wt = wt.to_lowercase();
        if TRACEBACK_MODES.contains(&wt.as_str()) {
            cfg.traceback_mode = wt;
        } else {
            pre_warnings.push(format!(
                "wd-traceback ignored (expected one of {}): {wt}",
                TRACEBACK_MODES.join(", ")
            ));
        }
    }
    let mut exec: HashMap<usize, CellOutput> = HashMap::new();
    let mut errors = 0usize;
    let python_status = if n_python == 0 {
        "ok".to_string()
    } else if python.is_empty() {
        pre_warnings.push(
            "python not configured — cells shown as source (set [render] python in config.toml, or add a .venv)"
                .to_string(),
        );
        "not_configured".to_string()
    } else {
        let doc_dir = doc_dir_path.map(|d| d.to_string_lossy().to_string());
        if let Some(line) = only_cell_at {
            // ---- Run This Cell ------------------------------------------------------
            // Start from the previous render's outputs so the rest of the document keeps
            // its results, dropping any whose source has since changed.
            let cache_key = path.unwrap_or("").to_string();
            let mut cached: HashMap<usize, CachedCell> = app
                .state::<RenderState>()
                .cells
                .lock()
                .ok()
                .and_then(|c| c.get(&cache_key).cloned())
                .unwrap_or_default();
            cached.retain(|idx, c| match segments.get(*idx) {
                Some(Segment::PythonCell { code, .. }) => *code == c.code,
                _ => false,
            });
            match cell_at_line(&segments, line) {
                None => pre_warnings.push("no {python} cell at the cursor".to_string()),
                Some(idx) => {
                    let Segment::PythonCell { code, opts, .. } = &segments[idx] else {
                        unreachable!("cell_at_line only returns PythonCell indices")
                    };
                    if !opts.eval {
                        pre_warnings.push("this cell has #| eval: false".to_string());
                    } else {
                        match run_one_cell(app, &cfg, &python, code, doc_dir.as_deref()) {
                            Ok(out) => {
                                cached.insert(idx, CachedCell { code: code.clone(), out });
                            }
                            Err(e) => pre_warnings
                                .push(format!("python failed to start: {e} — cell not run")),
                        }
                    }
                }
            }
            errors = cached.values().filter(|c| c.out.error.is_some()).count();
            exec = cached.iter().map(|(i, c)| (*i, c.out.clone())).collect();
            if let Ok(mut store) = app.state::<RenderState>().cells.lock() {
                store.insert(cache_key, cached);
            }
            "ok".to_string()
        } else {
        match run_cells(app, &cfg, &python, &segments, doc_dir.as_deref()) {
            Ok((map, errs)) => {
                // Remember this render's outputs so a later "Run This Cell" can rebuild
                // the document around a single re-executed cell.
                if let Ok(mut store) = app.state::<RenderState>().cells.lock() {
                    let cached = map
                        .iter()
                        .filter_map(|(idx, out)| match segments.get(*idx) {
                            Some(Segment::PythonCell { code, .. }) => Some((
                                *idx,
                                CachedCell { code: code.clone(), out: out.clone() },
                            )),
                            _ => None,
                        })
                        .collect();
                    store.insert(path.unwrap_or("").to_string(), cached);
                }
                exec = map;
                errors = errs;
                "ok".to_string()
            }
            Err(e) => {
                pre_warnings.push(format!("python failed to start: {e} — cells shown as source"));
                e
            }
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
    RenderResult { markdown: md, cells, errors, elapsed_ms, python: python_status, line_map }
}

/// Render the live buffer (no save side effect, no temp files). Async + spawn_blocking so
/// the webview never blocks. `warnings`: the palette's session override (issue J.16).
#[tauri::command]
pub async fn render_document(
    app: tauri::AppHandle,
    text: String,
    path: Option<String>,
    warnings: Option<String>,
) -> Result<RenderResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        render_impl(&app, &text, path.as_deref(), None, warnings.as_deref())
    })
    .await
    .map_err(|e| e.to_string())
}

/// Run only the `{python}` cell at `line` (1-based), in the kernel's CURRENT namespace, and
/// return the whole document re-assembled from the cached outputs (issue A.24). Re-expanding
/// everything costs milliseconds — the expensive part is executing the cell, which is exactly
/// what this avoids doing for the other cells.
#[tauri::command]
pub async fn run_cell(
    app: tauri::AppHandle,
    text: String,
    path: Option<String>,
    line: usize,
    warnings: Option<String>,
) -> Result<RenderResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        render_impl(&app, &text, path.as_deref(), Some(line), warnings.as_deref())
    })
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
            @techreport{S&P2019, author = {Ratings, Standard}, title = {Credit Notes}, year = {2019}}
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
    fn front_matter_reads_wd_traceback() {
        let doc = "---\ntitle: Doc\nwd-traceback: verbose\n---\nbody\n";
        let (fm, _) = split_document(doc);
        assert_eq!(fm.wd_traceback.as_deref(), Some("verbose"));
        // Absent is None, so the config default stands.
        let (fm, _) = split_document("---\ntitle: Doc\n---\nbody\n");
        assert_eq!(fm.wd_traceback, None);
    }

    #[test]
    fn help_code_joins_cells_up_to_the_caret() {
        let doc = "Intro\n```{python}\nimport numpy as np\nx = 1\n```\nprose\n```{python}\ny = np.linspace(0, 1)\n```\n```{python}\nlater = 2\n```\n";
        // Caret in the second cell (document line 8): both cells, caret on code line 3.
        let (code, line) = help_code(doc, 8, false).unwrap();
        assert_eq!(code, "import numpy as np\nx = 1\ny = np.linspace(0, 1)");
        assert_eq!(line, 3);
        // In prose, or on a fence line: not Python.
        assert!(help_code(doc, 6, false).is_none());
        assert!(help_code(doc, 2, false).is_none());
        // A .py file is the whole buffer, line unchanged.
        assert_eq!(help_code("a = 1\nb = a\n", 2, true), Some(("a = 1\nb = a\n".to_string(), 2)));
    }

    #[test]
    fn front_matter_reads_wd_warnings() {
        let (fm, _) = split_document("---\ntitle: Doc\nwd-warnings: all\n---\nbody\n");
        assert_eq!(fm.wd_warnings.as_deref(), Some("all"));
        let (fm, _) = split_document("---\ntitle: Doc\n---\nbody\n");
        assert_eq!(fm.wd_warnings, None);
    }

    #[test]
    fn warning_modes_are_the_three_the_runner_knows() {
        // runner.py WARN_ACTIONS maps exactly these; a mode accepted here but unknown there
        // would silently fall back to "first".
        assert_eq!(WARNING_MODES, &["first", "all", "off"]);
    }

    /// A synthetic folder tree for resolve_python: root/.venv (an interpreter file), and
    /// root/a/b for the document; a sibling tree with no venv at all.
    fn venv_tree(tag: &str) -> (PathBuf, PathBuf, PathBuf) {
        let base = std::env::temp_dir().join(format!("wd-venv-{tag}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&base);
        let root = base.join("proj");
        let doc = root.join("a").join("b");
        std::fs::create_dir_all(&doc).unwrap();
        let py = if cfg!(windows) {
            root.join(".venv").join("Scripts").join("python.exe")
        } else {
            root.join(".venv").join("bin").join("python")
        };
        std::fs::create_dir_all(py.parent().unwrap()).unwrap();
        std::fs::write(&py, "").unwrap();
        let bare = base.join("bare").join("doc");
        std::fs::create_dir_all(&bare).unwrap();
        (root, doc, bare)
    }

    #[test]
    fn resolve_python_finds_the_venv_in_a_parent() {
        let (root, doc, _) = venv_tree("parent");
        let (py, src, w) = resolve_python(Some(&doc), None, "C:/cfg/python.exe", true);
        assert!(py.contains(".venv"), "{py}");
        assert_eq!(src, PySource::Venv(root.clone()));
        assert_eq!(w, None);
        let _ = std::fs::remove_dir_all(root.parent().unwrap());
    }

    #[test]
    fn resolve_python_finds_the_venv_in_the_documents_folder() {
        let (root, _, _) = venv_tree("own");
        let (_, src, _) = resolve_python(Some(&root), None, "", true);
        assert_eq!(src, PySource::Venv(root.clone()));
        let _ = std::fs::remove_dir_all(root.parent().unwrap());
    }

    #[test]
    fn resolve_python_without_a_venv_uses_config() {
        let (root, _, bare) = venv_tree("none");
        let (py, src, _) = resolve_python(Some(&bare), None, "C:/cfg/python.exe", true);
        assert_eq!((py.as_str(), src), ("C:/cfg/python.exe", PySource::Config));
        let (py, src, _) = resolve_python(Some(&bare), None, "", true);
        assert_eq!((py.as_str(), src), ("", PySource::Unset));
        // A scratch buffer has no folder: configured interpreter.
        let (_, src, _) = resolve_python(None, None, "C:/cfg/python.exe", true);
        assert_eq!(src, PySource::Config);
        let _ = std::fs::remove_dir_all(root.parent().unwrap());
    }

    #[test]
    fn resolve_python_wd_python_beats_the_venv() {
        let (root, doc, _) = venv_tree("fm");
        let abs = if cfg!(windows) { "C:/py/python.exe" } else { "/usr/bin/python3" };
        let (py, src, _) = resolve_python(Some(&doc), Some(abs), "", true);
        assert_eq!((py.as_str(), src), (abs, PySource::FrontMatter));
        // A relative wd-python is ignored with a warning, and the venv still applies.
        let (_, src, w) = resolve_python(Some(&doc), Some("python.exe"), "", true);
        assert!(matches!(src, PySource::Venv(_)));
        assert!(w.unwrap().contains("absolute"));
        let _ = std::fs::remove_dir_all(root.parent().unwrap());
    }

    #[test]
    fn resolve_python_auto_venv_off_skips_the_venv() {
        let (root, doc, _) = venv_tree("off");
        let (py, src, _) = resolve_python(Some(&doc), None, "C:/cfg/python.exe", false);
        assert_eq!((py.as_str(), src), ("C:/cfg/python.exe", PySource::Config));
        let _ = std::fs::remove_dir_all(root.parent().unwrap());
    }

    #[test]
    fn traceback_modes_are_the_five_the_runner_knows() {
        // The runner validates the same list independently (runner.py TB_MODES); if these
        // ever drift, a mode accepted here would be silently ignored there.
        assert_eq!(TRACEBACK_MODES, &["minimal", "plain", "context", "verbose", "docs"]);
        assert!(TRACEBACK_MODES.contains(&"context"), "context is the documented default");
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

    // -- keys containing `&` (issue J.22) --

    #[test]
    fn ampersand_key_linked() {
        let out = run("Rated by @S&P2019 last year.");
        assert!(out.contains("[Ratings (2019)](#ref-S&P2019)"), "{out}");
        // The reference entry's id is escaped in the HTML; the browser decodes it back to
        // `ref-S&P2019`, the fragment the link carries.
        assert!(out.contains("id=\"ref-S&amp;P2019\""), "{out}");
    }

    #[test]
    fn spaced_ampersand_is_not_a_key() {
        let out = run("Smith & Jones agree.");
        assert_eq!(out.trim(), "Smith & Jones agree.");
    }

    #[test]
    fn ampersand_key_excludes_trailing_period() {
        // AT&T2001 is not in the test bibliography: the whole key, and only the key, is
        // flagged, and the sentence's period stays outside the span.
        let out = run("see @AT&T2001.");
        assert!(out.contains("<span class=\"cite-missing\">@AT&amp;T2001</span>."), "{out}");
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

    /// Request options for the kernel tests: no cwd, png at 150 dpi, context tracebacks,
    /// warnings "first", and a timeout in seconds.
    fn topts(secs: u64) -> ExecOpts<'static> {
        ExecOpts {
            cwd: None,
            fig_format: "png",
            fig_dpi: 150,
            traceback_mode: "context",
            warnings: "first",
            timeout: Duration::from_secs(secs),
        }
    }

    /// Issue J.19 acceptance, the pool: alternating between two interpreters (A from
    /// WRITEDOWN_TEST_PYTHON, B from WRITEDOWN_TEST_PYTHON_B, e.g. a venv) spawns each once,
    /// and A's namespace survives a render in B. With a pool of one, B evicts A.
    #[test]
    #[ignore]
    fn kernel_pool_keeps_two_interpreters_warm() {
        let a = std::env::var("WRITEDOWN_TEST_PYTHON").expect("WRITEDOWN_TEST_PYTHON");
        let b = std::env::var("WRITEDOWN_TEST_PYTHON_B").expect("WRITEDOWN_TEST_PYTHON_B");
        let dir = std::env::temp_dir().join("writedown-kernel-test");
        let t = Duration::from_secs(20);
        let mut pool: Vec<Kernel> = Vec::new();
        let exe = |pool: &mut Vec<Kernel>, py: &str, code: &str, reset: bool, max: usize| {
            let (k, fresh) = checkout(pool, py, max, &dir, t).unwrap();
            let r = k.exec(code, reset, &topts(10)).ok().unwrap();
            (fresh, r)
        };
        let (fresh, _) = exe(&mut pool, &a, "x = 41", true, 3);
        assert!(fresh, "A starts");
        let (fresh, _) = exe(&mut pool, &b, "1", true, 3);
        assert!(fresh, "B starts");
        // Back to A: no respawn, and x from A's last render is still there (Run This Cell).
        let (fresh, r) = exe(&mut pool, &a, "x + 1", false, 3);
        assert!(!fresh, "A kept warm");
        assert_eq!(r.result_text.as_deref(), Some("42"));
        let (fresh, _) = exe(&mut pool, &b, "1", true, 3);
        assert!(!fresh, "B kept warm");
        assert_eq!(pool.len(), 2);
        // max_kernels = 1: switching evicts the other, which is today's behavior.
        let (fresh, _) = exe(&mut pool, &a, "1", true, 1);
        assert!(!fresh);
        assert_eq!(pool.len(), 1);
        let (fresh, _) = exe(&mut pool, &b, "1", true, 1);
        assert!(fresh, "B was evicted, so it restarts");
        assert_eq!(pool.len(), 1);
    }

    /// Issue J.18: a help request after a cell sees the cell's names, through
    /// Kernel::request; the namespace is untouched by it.
    #[test]
    #[ignore]
    fn kernel_help_request() {
        let mut k = test_kernel();
        k.exec("def f(a, b=2):\n    '''Add things.'''\n    return a + b", true, &topts(10)).ok().unwrap();
        let req = serde_json::json!({ "op": "help", "code": "f(1)", "line": 1, "col": 1 });
        let v = k.request(req, Duration::from_secs(10)).ok().unwrap();
        let h: PythonHelp = serde_json::from_value(v["help"].clone()).unwrap();
        assert_eq!((h.name.as_str(), h.source.as_str()), ("f", "namespace"));
        assert!(h.text.starts_with("f(a, b=2)"), "{}", h.text);
        assert!(h.text.contains("Add things."));
        let r = k.exec("f(1)", false, &topts(10)).ok().unwrap();
        assert_eq!(r.result_text.as_deref(), Some("3"), "namespace intact after help");
    }

    /// Issue J.16 acceptance: three identical warnings in a cell show once in "first",
    /// three times in "all", never in "off".
    #[test]
    #[ignore]
    fn kernel_warning_modes() {
        let mut k = test_kernel();
        let code = "import warnings\n_ = [warnings.warn('w') for _ in range(3)]";
        for (mode, n) in [("first", 1), ("all", 3), ("off", 0)] {
            let r = k.exec(code, true, &ExecOpts { warnings: mode, ..topts(10) }).ok().unwrap();
            assert_eq!(r.stderr.matches("UserWarning").count(), n, "{mode}: {}", r.stderr);
        }
    }

    /// Issue J.16 acceptance: a warning raised inside a library module (a synthetic
    /// helper.py beside the "document") shows on EVERY render in "first", not only the
    /// first render since the process started.
    #[test]
    #[ignore]
    fn kernel_library_warning_repeats_per_render() {
        let dir = std::env::temp_dir().join(format!("wd-warn-lib-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join("helper.py"), "import warnings\ndef f():\n    warnings.warn('lib')\n")
            .unwrap();
        let cwd = dir.to_string_lossy().to_string();
        let mut k = test_kernel();
        let code = "import sys, os\nsys.path.insert(0, os.getcwd())\nimport helper\nhelper.f()";
        for render in 0..3 {
            let r = k
                .exec(code, true, &ExecOpts { cwd: Some(&cwd), ..topts(10) })
                .ok()
                .unwrap();
            assert!(r.error.is_none(), "{:?}", r.error.map(|e| e.message));
            assert_eq!(r.stderr.matches("UserWarning: lib").count(), 1, "render {render}: {}", r.stderr);
        }
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    #[ignore]
    fn kernel_stdout_and_last_expr() {
        let mut k = test_kernel();
        let r = k
            .exec("print('hey')\n1 + 1", true, &topts(10))
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
        let r = k.exec("import math\nx = 41", true, &topts(10));
        assert!(r.ok().unwrap().error.is_none());
        // Same render (no reset): x is visible.
        let r = k.exec("x + 1", false, &topts(10)).ok().unwrap();
        assert_eq!(r.result_text.as_deref(), Some("42"));
        // New render (reset): x is gone.
        let r = k.exec("x", true, &topts(10)).ok().unwrap();
        assert!(r.error.is_some());
    }

    #[test]
    #[ignore]
    fn kernel_error_line_maps() {
        let mut k = test_kernel();
        let r = k
            .exec("a = 1\nb = 2\n1/0", true, &topts(10))
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
        let r = k.exec("while True: pass", true, &topts(2));
        assert!(matches!(r, Err(ExecFail::Timeout)));
        drop(k); // Drop kills the busy process — must not hang
    }

    #[test]
    #[ignore]
    fn kernel_matplotlib_figure() {
        let mut k = test_kernel();
        let code = "import matplotlib.pyplot as plt\nplt.plot([1, 2], [3, 4])\nplt.gcf()";
        let r = k.exec(code, true, &ExecOpts { fig_dpi: 96, ..topts(30) }).ok().unwrap();
        assert!(r.error.is_none(), "{:?}", r.error.map(|e| e.message));
        assert_eq!(r.figures.len(), 1);
        assert_eq!(r.figures[0].format, "png");
        assert!(!r.figures[0].b64.is_empty());
    }
}
