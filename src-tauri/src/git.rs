//! Git tree marks (issues I.02, K.07), gutter marks (I.02) and "Diff: When Did This Line
//! Change" (J.07).
//!
//! Eyes-open scope: `git` only; READ-ONLY invocations (`rev-parse`, `status`, `show`, and
//! `blame` with the buffer on stdin), each run with `GIT_OPTIONAL_LOCKS=0` so none can ever
//! take `index.lock` in a repository another process is committing to; never any mutating git
//! command; no network (all purely local). Git absent or the folder not a repository is a
//! normal state, not an error: commands report "unavailable" and the frontend keeps the
//! feature silently off. Every command is `#[tauri::command(async)]` (the G.04 lesson) and
//! runs on open, save, focus or request, never from the file watcher. (From 2.23.0 to 2.31.1
//! the tree marks swept `git status` on every watcher event, and the `index.lock` it took was
//! itself a watcher event: a loop. They came back in K.07 on user events only, bounded and
//! lock-free.)

use serde::Serialize;
use std::path::Path;
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{Duration, Instant};

/// `[git] exe` from config.toml if set and non-empty, else "git" on PATH.
fn git_exe(app: &tauri::AppHandle) -> String {
    crate::config::writedown_dir(app)
        .ok()
        .and_then(|d| std::fs::read_to_string(d.join("config.toml")).ok())
        .and_then(|txt| txt.parse::<toml::Value>().ok())
        .and_then(|v| v.get("git")?.get("exe")?.as_str().map(str::to_string))
        .filter(|s| !s.trim().is_empty())
        .unwrap_or_else(|| "git".to_string())
}

/// One read-only git command with `-C dir`, counted by the tripwire, with no console window.
/// `GIT_OPTIONAL_LOCKS=0`: no command started here takes the optional `index.lock`, now or
/// after a later addition.
fn git_command(exe: &str, dir: &str, args: &[&str]) -> Command {
    let mut cmd = crate::tripwire::command("git", exe);
    cmd.arg("-C").arg(dir).args(args).env("GIT_OPTIONAL_LOCKS", "0");
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    cmd
}

/// Run one read-only git command with `-C dir`; None when the executable is missing or
/// git exits non-zero (not a repo, path not in index, …) — both are normal "no marks"
/// states here, never surfaced as errors.
fn run_git(exe: &str, dir: &str, args: &[&str]) -> Option<Vec<u8>> {
    let mut cmd = git_command(exe, dir, args);
    cmd.stdin(Stdio::null()).stdout(Stdio::piped()).stderr(Stdio::null());
    let out = cmd.output().ok()?;
    if out.status.success() { Some(out.stdout) } else { None }
}

/// `run_git` with `input` on stdin (issue J.07: `blame --contents -` reads the live buffer).
/// Still read-only and lock-free. The input is written from a thread so a large buffer can
/// never deadlock against git's output.
fn run_git_stdin(exe: &str, dir: &str, args: &[&str], input: Vec<u8>) -> Option<Vec<u8>> {
    let mut cmd = git_command(exe, dir, args);
    cmd.stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::null());
    let mut child = cmd.spawn().ok()?;
    let mut stdin = child.stdin.take()?;
    let writer = std::thread::spawn(move || {
        use std::io::Write;
        let _ = stdin.write_all(&input); // stdin drops here: EOF
    });
    let out = child.wait_with_output().ok()?;
    let _ = writer.join();
    if out.status.success() { Some(out.stdout) } else { None }
}

/// The outcome of a command run with a deadline.
#[derive(Debug, PartialEq)]
enum Timed {
    /// It finished: its stdout on success, None on a non-zero exit or a failed start.
    Done(Option<Vec<u8>>),
    /// It ran past the deadline and its process tree was killed.
    TimedOut,
}

/// Run `cmd` until it exits or `timeout` passes, stdin closed, stdout captured, stderr dropped.
/// stdout is read on its own thread, so output larger than the pipe buffer cannot stall the
/// child while this waits. At the deadline the whole process tree is killed: the `git.exe` on
/// PATH is usually Git for Windows' launcher, and killing the launcher alone leaves the real
/// git, its child, running.
fn run_timed(mut cmd: Command, timeout: Duration) -> Timed {
    cmd.stdin(Stdio::null()).stdout(Stdio::piped()).stderr(Stdio::null());
    let Ok(mut child) = cmd.spawn() else { return Timed::Done(None) };
    let reader = child.stdout.take().map(|mut out| {
        std::thread::spawn(move || {
            use std::io::Read;
            let mut buf = Vec::new();
            let _ = out.read_to_end(&mut buf);
            buf
        })
    });
    let deadline = Instant::now() + timeout;
    let status = loop {
        match child.try_wait() {
            Ok(Some(status)) => break status,
            Ok(None) if Instant::now() < deadline => std::thread::sleep(Duration::from_millis(5)),
            Ok(None) => {
                // The reader thread ends by itself once the killed tree closes the pipe.
                kill_tree(&mut child);
                return Timed::TimedOut;
            }
            Err(_) => {
                kill_tree(&mut child);
                return Timed::Done(None);
            }
        }
    };
    let out = reader.and_then(|h| h.join().ok()).unwrap_or_default();
    Timed::Done(status.success().then_some(out))
}

/// Kill `child` and its descendants (`taskkill /T` on Windows), then reap it.
fn kill_tree(child: &mut std::process::Child) {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        let _ = crate::tripwire::command("taskkill", "taskkill")
            .args(["/T", "/F", "/PID", &child.id().to_string()])
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .creation_flags(0x0800_0000) // CREATE_NO_WINDOW
            .status();
    }
    let _ = child.kill();
    let _ = child.wait();
}

/// `rev-parse --show-toplevel` output as a path in native separators; None when empty.
fn top_of(out: &[u8]) -> Option<String> {
    let s = String::from_utf8_lossy(out).trim().to_string();
    if s.is_empty() {
        return None;
    }
    Some(if cfg!(windows) { s.replace('/', "\\") } else { s })
}

/// The repository top-level for `dir`, in native separators — also the "is this a repo
/// at all" probe. `git show :0:` and `git blame` paths are relative to this, not to `dir`.
fn toplevel(exe: &str, dir: &str) -> Option<String> {
    top_of(&run_git(exe, dir, &["rev-parse", "--show-toplevel"])?)
}

/// One changed path from `git status --porcelain`, absolute, backslash-separated.
#[derive(Serialize, Debug, PartialEq)]
pub struct GitEntry {
    pub path: String,
    /// "modified" | "added" | "untracked" | "deleted" | "renamed"
    pub state: String,
    /// Untracked directories arrive from git as a single collapsed `dir/` entry.
    pub is_dir: bool,
}

/// The result of one tree-marks sweep (issue K.07).
#[derive(Serialize, Debug, Default)]
pub struct GitTreeStatus {
    pub entries: Vec<GitEntry>,
    /// The repository top-levels swept. Empty: no git, or no root inside a repository; the
    /// frontend says so once per session, never as an error.
    pub repos: Vec<String>,
    /// Roots and repositories skipped because a git call ran past `SWEEP_TIMEOUT`.
    pub timed_out: Vec<String>,
    /// Another sweep was running, so this call did nothing.
    pub skipped: bool,
}

/// Each git call in a sweep is killed after this long.
const SWEEP_TIMEOUT: Duration = Duration::from_secs(3);

/// A sweep is running: the command's own single-flight, a second line of defense behind the
/// frontend's scheduler (`requestGitMarks` in store.ts).
static SWEEPING: AtomicBool = AtomicBool::new(false);

/// Clears `SWEEPING` however the sweep ends, a panic included.
struct SweepGuard;
impl Drop for SweepGuard {
    fn drop(&mut self) {
        SWEEPING.store(false, Ordering::SeqCst);
    }
}

/// Git tree marks for the project's roots (issue K.07), one call per sweep. Each root is
/// resolved to its repository (`rev-parse --show-toplevel`), roots in one repository share a
/// single `status --porcelain -z`, and every git call is lock-free and killed after 3 s.
///
/// Background cost: called on focus, 2 s after a save, on a change of roots and from the
/// palette, at most once per 10 s (the frontend scheduler); one `rev-parse` per root and one
/// `status` per repository; writes nothing, so it cannot reach any trigger.
#[tauri::command(async)]
pub fn git_tree_status(app: tauri::AppHandle, roots: Vec<String>) -> Result<GitTreeStatus, String> {
    if SWEEPING.swap(true, Ordering::SeqCst) {
        return Ok(GitTreeStatus { skipped: true, ..Default::default() });
    }
    let _guard = SweepGuard;
    Ok(tree_status(&git_exe(&app), &roots, SWEEP_TIMEOUT))
}

/// The body of `git_tree_status`, with the git executable and the timeout given.
fn tree_status(exe: &str, roots: &[String], timeout: Duration) -> GitTreeStatus {
    let mut res = GitTreeStatus::default();
    let mut tops: Vec<String> = Vec::new();
    for root in roots {
        match run_timed(git_command(exe, root, &["rev-parse", "--show-toplevel"]), timeout) {
            Timed::Done(Some(out)) => {
                if let Some(top) = top_of(&out) {
                    push_unique(&mut tops, top);
                }
            }
            Timed::Done(None) => {} // not inside a repository, or no git
            Timed::TimedOut => res.timed_out.push(root.clone()),
        }
    }
    for top in tops {
        match run_timed(git_command(exe, &top, &["status", "--porcelain", "-z"]), timeout) {
            Timed::Done(Some(out)) => {
                res.entries.extend(parse_porcelain(&top, &String::from_utf8_lossy(&out)));
                res.repos.push(top);
            }
            Timed::Done(None) => {}
            Timed::TimedOut => res.timed_out.push(top),
        }
    }
    res
}

/// Add `top` unless a repository already listed matches it, ignoring case (Windows paths).
fn push_unique(tops: &mut Vec<String>, top: String) {
    if !tops.iter().any(|t| t.eq_ignore_ascii_case(&top)) {
        tops.push(top);
    }
}

/// Porcelain XY code → our state word. `??` is untracked; index or worktree letters
/// R/A/D map by the most specific one; everything else that reaches porcelain is a
/// modification of some kind.
fn state_of(xy: &str) -> &'static str {
    if xy == "??" {
        "untracked"
    } else if xy.contains('R') {
        "renamed"
    } else if xy.contains('D') {
        "deleted"
    } else if xy.contains('A') {
        "added"
    } else {
        "modified"
    }
}

/// `git status --porcelain -z` output for the repository at `top`, as absolute paths.
fn parse_porcelain(top: &str, text: &str) -> Vec<GitEntry> {
    let mut entries = Vec::new();
    let mut fields = text.split('\0');
    while let Some(rec) = fields.next() {
        if rec.len() < 4 {
            continue; // trailing empty field, or noise
        }
        let xy = &rec[..2];
        let rel = &rec[3..];
        if xy.contains('R') {
            let _old = fields.next(); // -z renames carry the original path as the next field
        }
        let is_dir = rel.ends_with('/');
        let rel_native = if cfg!(windows) { rel.replace('/', "\\") } else { rel.to_string() };
        let joined = Path::new(top).join(rel_native.trim_end_matches(['\\', '/']));
        entries.push(GitEntry {
            path: joined.to_string_lossy().to_string(),
            state: state_of(xy).to_string(),
            is_dir,
        });
    }
    entries
}

/// The INDEX version of one file (`git show :0:<relpath>`), the base for the gutter diff.
/// `Ok(None)` = feature unavailable here (no git / not a repo); `Ok(Some(""))` = the file
/// is untracked or not yet in the index, so every buffer line counts as added.
#[tauri::command(async)]
pub fn git_show_index(app: tauri::AppHandle, path: String) -> Result<Option<String>, String> {
    let exe = git_exe(&app);
    let dir = Path::new(&path)
        .parent()
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_else(|| ".".to_string());
    let Some(top) = toplevel(&exe, &dir) else {
        return Ok(None);
    };
    // The :0: form wants the path relative to the repo top, forward slashes.
    let rel = match Path::new(&path).strip_prefix(&top) {
        Ok(r) => r.to_string_lossy().replace('\\', "/"),
        Err(_) => return Ok(None), // path not under the repo it claims to be in
    };
    match run_git(&exe, &dir, &["show", &format!(":0:{rel}")]) {
        Some(bytes) => Ok(Some(String::from_utf8_lossy(&bytes).to_string())),
        None => Ok(Some(String::new())), // untracked / not in the index
    }
}

/// Who last changed one line, from `git blame --porcelain` (issue J.07).
#[derive(Serialize, Debug, PartialEq, Default)]
pub struct BlameLine {
    /// false: "Not Committed Yet", the line changed after the last commit.
    pub committed: bool,
    pub commit: String,
    /// Author time, unix seconds.
    pub author_time: i64,
    pub summary: String,
    /// The line's number in that commit's version of the file.
    pub orig_line: u32,
    /// The file's repo-relative name in that commit (blame follows renames).
    pub filename: String,
    /// The parent commit and file name the line's change is relative to, when there is one
    /// (absent for a root commit, or a commit that added the file).
    pub previous: Option<(String, String)>,
    /// The file before and at that commit, for the pair diff. Empty when uncommitted.
    pub base: String,
    pub other: String,
}

/// Parse the porcelain header of a one-line `git blame -L n,n --porcelain`.
fn parse_blame(text: &str) -> Option<BlameLine> {
    let mut lines = text.lines();
    let mut head = lines.next()?.split_whitespace();
    let commit = head.next()?.to_string();
    let orig_line = head.next()?.parse().ok()?;
    let mut b = BlameLine {
        committed: !commit.chars().all(|c| c == '0'),
        commit,
        orig_line,
        ..Default::default()
    };
    for l in lines {
        if l.starts_with('\t') {
            break; // the line's own text ends the header
        } else if let Some(v) = l.strip_prefix("author-time ") {
            b.author_time = v.trim().parse().unwrap_or(0);
        } else if let Some(v) = l.strip_prefix("summary ") {
            b.summary = v.to_string();
        } else if let Some(v) = l.strip_prefix("filename ") {
            b.filename = v.to_string();
        } else if let Some(v) = l.strip_prefix("previous ") {
            if let Some((sha, name)) = v.split_once(' ') {
                b.previous = Some((sha.to_string(), name.to_string()));
            }
        }
    }
    Some(b)
}

/// "Diff: When Did This Line Change", the git step (issue J.07): blame line `line`
/// (1-based) of `path` against the live buffer `contents` (so unsaved edits count, read on
/// stdin), and for a committed line also fetch the file before and at that commit.
/// `Ok(None)`: no git, not a repository, or the file is not tracked; the caller falls back
/// to saved versions. Read-only throughout (`blame`, `show`).
#[tauri::command(async)]
pub fn git_line_history(
    app: tauri::AppHandle,
    path: String,
    line: u32,
    contents: String,
) -> Result<Option<BlameLine>, String> {
    Ok(line_history(&git_exe(&app), &path, line, contents))
}

/// The body of `git_line_history`, with the git executable given.
fn line_history(exe: &str, path: &str, line: u32, contents: String) -> Option<BlameLine> {
    let dir = Path::new(path)
        .parent()
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_else(|| ".".to_string());
    let top = toplevel(exe, &dir)?;
    // Not under the repository it claims to be in: no history from git.
    let rel = Path::new(path).strip_prefix(&top).ok()?.to_string_lossy().replace('\\', "/");
    let range = format!("{line},{line}");
    let args = ["blame", "-L", &range, "--porcelain", "--contents", "-", "--", &rel];
    // None: untracked (not in HEAD), or the line is past the end.
    let out = run_git_stdin(exe, &top, &args, contents.into_bytes())?;
    let mut b = parse_blame(&String::from_utf8_lossy(&out))?;
    if b.committed {
        let show = |rev: &str, name: &str| {
            run_git(exe, &top, &["show", &format!("{rev}:{name}")])
                .map(|bytes| String::from_utf8_lossy(&bytes).to_string())
                .unwrap_or_default()
        };
        b.other = show(&b.commit, &b.filename);
        b.base = match &b.previous {
            Some((sha, name)) => show(sha, name),
            None => String::new(),
        };
    }
    Some(b)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::process::Command;

    #[test]
    fn porcelain_codes_map_to_states() {
        assert_eq!(state_of("??"), "untracked");
        assert_eq!(state_of(" M"), "modified");
        assert_eq!(state_of("M "), "modified");
        assert_eq!(state_of("MM"), "modified");
        assert_eq!(state_of("A "), "added");
        assert_eq!(state_of(" D"), "deleted");
        assert_eq!(state_of("R "), "renamed");
    }

    /// Paths come back absolute under the repository top; a rename's original path is
    /// consumed, not listed; an untracked folder is one entry flagged as a folder.
    #[test]
    fn porcelain_parses_to_absolute_paths() {
        let top = if cfg!(windows) { r"C:\repo" } else { "/repo" };
        let text = " M docs/a.md\0?? new/\0R  b.md\0old.md\0A  c.md\0";
        let e = parse_porcelain(top, text);
        let p = |rel: &str| Path::new(top).join(rel).to_string_lossy().to_string();
        assert_eq!(e.len(), 4, "{e:?}");
        assert_eq!(e[0], GitEntry { path: p(if cfg!(windows) { r"docs\a.md" } else { "docs/a.md" }), state: "modified".into(), is_dir: false });
        assert_eq!(e[1], GitEntry { path: p("new"), state: "untracked".into(), is_dir: true });
        assert_eq!(e[2], GitEntry { path: p("b.md"), state: "renamed".into(), is_dir: false });
        assert_eq!(e[3], GitEntry { path: p("c.md"), state: "added".into(), is_dir: false });
    }

    /// Two roots in one repository are swept once, whatever the case of their paths.
    #[test]
    fn roots_in_one_repository_dedupe() {
        let mut tops = Vec::new();
        push_unique(&mut tops, r"V:\dev\writedown".to_string());
        push_unique(&mut tops, r"v:\Dev\Writedown".to_string());
        push_unique(&mut tops, r"V:\dev\aggregate".to_string());
        assert_eq!(tops, vec![r"V:\dev\writedown".to_string(), r"V:\dev\aggregate".to_string()]);
    }

    /// A real sweep over a temporary repository with two roots inside it and one root outside
    /// any repository: one repository swept, its changes listed once, the outside root silent,
    /// and no `index.lock` left behind. Skipped, with a note, where git is not on PATH.
    #[test]
    fn tree_status_sweeps_each_repository_once() {
        if Command::new("git").arg("--version").output().map(|o| !o.status.success()).unwrap_or(true) {
            eprintln!("git not on PATH: tree_status_sweeps_each_repository_once skipped");
            return;
        }
        let base = std::env::temp_dir().join(format!("writedown-tree-status-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&base);
        let repo = base.join("repo");
        let outside = base.join("outside");
        for d in [repo.join("a"), repo.join("b"), outside.clone()] {
            std::fs::create_dir_all(d).unwrap();
        }
        let git = |args: &[&str]| {
            let ok = Command::new("git")
                .arg("-C")
                .arg(&repo)
                .args(["-c", "user.name=t", "-c", "user.email=t@example.invalid"])
                .args(args)
                .output()
                .unwrap()
                .status
                .success();
            assert!(ok, "git {args:?}");
        };
        git(&["init", "-q"]);
        std::fs::write(repo.join("a").join("kept.md"), "x\n").unwrap();
        git(&["add", "-A"]);
        git(&["commit", "-q", "-m", "fixture"]);
        std::fs::write(repo.join("a").join("kept.md"), "changed\n").unwrap();
        std::fs::write(repo.join("b").join("new.md"), "y\n").unwrap();
        let s = |p: &std::path::Path| p.to_string_lossy().to_string();
        let roots = vec![s(&repo.join("a")), s(&repo.join("b")), s(&outside)];
        let res = tree_status("git", &roots, Duration::from_secs(10));
        assert_eq!(res.repos.len(), 1, "{res:?}");
        assert!(res.timed_out.is_empty());
        let states: Vec<(&str, &str)> = res
            .entries
            .iter()
            .map(|e| (e.path.rsplit(['\\', '/']).next().unwrap(), e.state.as_str()))
            .collect();
        assert_eq!(states.len(), 2, "{res:?}");
        assert!(states.contains(&("kept.md", "modified")));
        // `b` holds only an untracked file, so git reports the folder, collapsed.
        assert!(states.contains(&("b", "untracked")));
        assert!(res.entries.iter().any(|e| e.is_dir && e.path.ends_with('b')));
        assert!(!repo.join(".git").join("index.lock").exists());
        let _ = std::fs::remove_dir_all(&base);
    }

    /// A child that outlives the deadline is reported as timed out at the deadline, not when it
    /// would have finished; `cmd` running `ping` stands in for the git launcher and its child.
    #[cfg(windows)]
    #[test]
    fn timeout_kills_a_stuck_child() {
        let mut cmd = Command::new("cmd");
        cmd.args(["/C", "ping", "-n", "30", "127.0.0.1"]);
        let start = Instant::now();
        assert_eq!(run_timed(cmd, Duration::from_millis(500)), Timed::TimedOut);
        assert!(start.elapsed() < Duration::from_secs(10), "{:?}", start.elapsed());
        let mut quick = Command::new("cmd");
        quick.args(["/C", "echo", "done"]);
        match run_timed(quick, Duration::from_secs(10)) {
            Timed::Done(Some(out)) => assert!(String::from_utf8_lossy(&out).contains("done")),
            other => panic!("{other:?}"),
        }
    }

    /// Against this repository's own README (opt-in: needs git and the checkout's history).
    /// Line 1 has been committed; an unsaved edit on it reads as not committed yet; a file
    /// outside any repository gives None.
    #[test]
    #[ignore]
    fn line_history_on_this_repository() {
        let readme = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("..").join("README.md");
        let readme = std::fs::canonicalize(readme).unwrap();
        let path = readme.to_string_lossy().trim_start_matches(r"\\?\").to_string();
        let text = std::fs::read_to_string(&readme).unwrap();
        let b = line_history("git", &path, 1, text.clone()).expect("tracked file");
        assert!(b.committed, "{b:?}");
        assert!(!b.other.is_empty());
        assert_eq!(b.filename, "README.md");
        let edited = format!("# edited\n{}", text.splitn(2, '\n').nth(1).unwrap_or(""));
        let b = line_history("git", &path, 1, edited).expect("tracked file");
        assert!(!b.committed);
        let outside = std::env::temp_dir().join("wd-not-a-repo.md");
        std::fs::write(&outside, "x\n").unwrap();
        assert!(line_history("git", &outside.to_string_lossy(), 1, "x\n".into()).is_none());
    }

    #[test]
    fn blame_porcelain_parses() {
        let text = "1a2b3c4d5e6f7a8b9c0d1a2b3c4d5e6f7a8b9c0d 12 15 1\n\
                    author Jane\nauthor-time 1700000000\nauthor-tz +0000\n\
                    summary Fix the tables\nprevious 0f0e0d0c0b0a09080706050403020100ffeeddcc old/name.md\n\
                    filename new/name.md\n\tthe line\n";
        let b = parse_blame(text).unwrap();
        assert!(b.committed);
        assert_eq!(b.orig_line, 12);
        assert_eq!(b.author_time, 1_700_000_000);
        assert_eq!(b.summary, "Fix the tables");
        assert_eq!(b.filename, "new/name.md");
        assert_eq!(
            b.previous,
            Some(("0f0e0d0c0b0a09080706050403020100ffeeddcc".into(), "old/name.md".into()))
        );
        let unc = parse_blame(
            "0000000000000000000000000000000000000000 3 3 1\nauthor Not Committed Yet\nfilename a.md\n\tx\n",
        )
        .unwrap();
        assert!(!unc.committed);
    }
}
