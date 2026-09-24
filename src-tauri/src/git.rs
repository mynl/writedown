//! Git status marks (issue I.02) — Writedown's first feature that runs another program.
//!
//! Eyes-open scope: `git` only; READ-ONLY invocations (`rev-parse`, `status`, `show`);
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

#[cfg(test)]
mod tests {
    use super::state_of;

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
