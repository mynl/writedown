//! Git status marks (issue I.02) — Writedown's first feature that runs another program.
//!
//! Eyes-open scope: `git` only; READ-ONLY invocations (`rev-parse`, `status`, `show`, and
//! since J.07 `blame` with the buffer on stdin);
//! never any mutating git command; no network (all three are purely local). Git absent or
//! the folder not a repository is a normal state, not an error: commands report
//! "unavailable" and the frontend keeps the feature silently off. Every command is
//! `#[tauri::command(async)]` (the G.04 lesson) and every call from the frontend is
//! per-root, debounced, and off the typing path — `git status` cost scales with the repo.

use serde::Serialize;
use std::path::Path;
use std::process::{Command, Stdio};

/// One changed path from `git status --porcelain`, absolute, backslash-separated.
#[derive(Serialize)]
pub struct GitEntry {
    pub path: String,
    /// "modified" | "added" | "untracked" | "deleted" | "renamed"
    pub state: String,
    /// Untracked directories arrive from git as a single collapsed `dir/` entry.
    pub is_dir: bool,
}

#[derive(Serialize)]
pub struct GitStatus {
    pub entries: Vec<GitEntry>,
    /// false = no git on the resolved path, or the root is not inside a repository.
    /// The frontend shows a one-line footer note the first time, never an error.
    pub available: bool,
}

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

/// Run one read-only git command with `-C dir`; None when the executable is missing or
/// git exits non-zero (not a repo, path not in index, …) — both are normal "no marks"
/// states here, never surfaced as errors.
fn run_git(exe: &str, dir: &str, args: &[&str]) -> Option<Vec<u8>> {
    let mut cmd = Command::new(exe);
    cmd.arg("-C")
        .arg(dir)
        .args(args)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    let out = cmd.output().ok()?;
    if out.status.success() { Some(out.stdout) } else { None }
}

/// `run_git` with `input` on stdin (issue J.07: `blame --contents -` reads the live buffer).
/// Still read-only. The input is written from a thread so a large buffer can never
/// deadlock against git's output.
fn run_git_stdin(exe: &str, dir: &str, args: &[&str], input: Vec<u8>) -> Option<Vec<u8>> {
    let mut cmd = Command::new(exe);
    cmd.arg("-C")
        .arg(dir)
        .args(args)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
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

/// The repository top-level for `dir`, in native separators — also the "is this a repo
/// at all" probe. `git status` paths are relative to this, not to `dir`.
fn toplevel(exe: &str, dir: &str) -> Option<String> {
    let out = run_git(exe, dir, &["rev-parse", "--show-toplevel"])?;
    let s = String::from_utf8_lossy(&out).trim().to_string();
    if s.is_empty() {
        return None;
    }
    Some(if cfg!(windows) { s.replace('/', "\\") } else { s })
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

/// `git status --porcelain -z` for one workspace root, parsed to absolute paths.
/// Non-repo or no git → `Ok(empty, available: false)` — silently off by design.
#[tauri::command(async)]
pub fn git_status(app: tauri::AppHandle, root: String) -> Result<GitStatus, String> {
    let exe = git_exe(&app);
    let Some(top) = toplevel(&exe, &root) else {
        return Ok(GitStatus { entries: Vec::new(), available: false });
    };
    let Some(out) = run_git(&exe, &root, &["status", "--porcelain", "-z"]) else {
        return Ok(GitStatus { entries: Vec::new(), available: false });
    };
    let text = String::from_utf8_lossy(&out);
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
        let joined = Path::new(&top).join(rel_native.trim_end_matches(['\\', '/']));
        entries.push(GitEntry {
            path: joined.to_string_lossy().to_string(),
            state: state_of(xy).to_string(),
            is_dir,
        });
    }
    Ok(GitStatus { entries, available: true })
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
    use super::{line_history, parse_blame, state_of};

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
}
