//! Watch the workspace for external changes (spec §14) and emit `fs-change` events to
//! the frontend with the affected paths. The frontend refreshes the tree and reloads (or
//! flags a conflict on) open files. One recursive watcher at a time; opening a new
//! workspace replaces it.
//!
//! Background cost follows the visible set, never the size of the roots (2.32.0). The
//! frontend states its interest (`set_watch_interest`: the folders the tree has listed, the
//! open files and the project file) and every OS event outside it is dropped here with a
//! hash lookup, before it reaches the webview. The events that pass are deduplicated and
//! delivered in one `fs-change` per `BATCH_MS`. With a whole drive as a root, a build or a
//! commit elsewhere on the drive therefore costs nothing beyond the lookup.

use notify::{Event, RecommendedWatcher, RecursiveMode, Watcher};
use serde::Serialize;
use std::collections::HashSet;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::{AppHandle, Emitter};

/// How long the first relevant event waits for others before one `fs-change` carries them
/// all. An editor saving a file emits several events; a branch checkout emits hundreds.
const BATCH_MS: u64 = 250;

pub struct WatchState(pub Mutex<Option<RecommendedWatcher>>);

impl Default for WatchState {
    fn default() -> Self {
        WatchState(Mutex::new(None))
    }
}

/// Independent watcher for open files that live OUTSIDE every workspace root (e.g. a
/// quick-opened file from another folder) — without it those tabs never see external
/// edits (issue 11). Same replace-on-call semantics as the workspace watcher, but
/// non-recursive and per-file.
pub struct ExtraWatchState(pub Mutex<Option<RecommendedWatcher>>);

impl Default for ExtraWatchState {
    fn default() -> Self {
        ExtraWatchState(Mutex::new(None))
    }
}

/// A path in the form the store compares paths in. Must agree exactly with `normPath` in
/// `src/store.ts`: backslashes to `/`, lowercase, trailing slashes stripped. A mismatch
/// silently drops real events (the class of bug fixed in issue A.28).
///
/// Notes
/// -----
/// Rust's `to_lowercase` and JavaScript's `toLowerCase` both apply the Unicode default
/// case mapping, and agree on every letter a Windows path ordinarily holds. They can
/// differ only where the two runtimes ship different Unicode versions, on letters newer
/// than the older of the two; such a path would miss its events. Accepted, not engineered
/// around.
pub(crate) fn norm(p: &str) -> String {
    p.replace('\\', "/").to_lowercase().trim_end_matches('/').to_string()
}

/// The parent of `p` by the store's string rule, `p.replace(/[\\/][^\\/]*$/, "")`:
/// everything before the last separator, or `p` itself when it has none. Applied to the
/// string rather than through `Path::parent`, so the two sides cannot disagree on
/// prefixes such as `\\?\` or on a drive root (`V:\foo` → `V:`).
fn parent(p: &str) -> &str {
    match p.rfind(['\\', '/']) {
        Some(i) => &p[..i],
        None => p,
    }
}

/// Is the normalized path `p` strictly inside the normalized `root`? On a separator
/// boundary, so `v:/dev/aggregate-api` is not inside `v:/dev/aggregate`. Mirrors
/// `underRoot` in the store.
fn inside(p: &str, root: &str) -> bool {
    p.len() > root.len() && p.starts_with(root) && p[root.len()..].starts_with('/')
}

/// The roots worth arming: each root lying inside another root is dropped, since the
/// outer recursive watch already covers it and a second watch would deliver every event
/// twice. Spellings of the same folder collapse to the first one given.
fn outermost(roots: &[String]) -> Vec<String> {
    let normed: Vec<String> = roots.iter().map(|r| norm(r)).collect();
    let mut out = Vec::new();
    let mut kept: HashSet<&str> = HashSet::new();
    for (r, n) in roots.iter().zip(&normed) {
        if normed.iter().any(|m| inside(n, m)) || !kept.insert(n.as_str()) {
            continue;
        }
        out.push(r.clone());
    }
    out
}

/// What the frontend acts on, normalized by `norm`: the folders the tree has listed, and
/// the open files plus the project file.
#[derive(Default)]
struct Interest {
    dirs: HashSet<String>,
    files: HashSet<String>,
}

impl Interest {
    /// The three tests `onFsChange` applies, so nothing it acts on is ever dropped: the
    /// path is an open file, or a listed folder (a folder event names the folder itself),
    /// or lies directly in a listed folder.
    fn wants(&self, path: &str) -> bool {
        let n = norm(path);
        self.files.contains(&n) || self.dirs.contains(&n) || self.dirs.contains(&norm(parent(path)))
    }
}

/// Paths waiting for the next flush, each once (by `norm`), in arrival order.
#[derive(Default)]
struct Pending {
    paths: Vec<String>,
    seen: HashSet<String>,
    /// A flush is already scheduled.
    armed: bool,
}

impl Pending {
    /// Queue `path`; true when this push must schedule the flush (none is pending yet).
    fn push(&mut self, path: String) -> bool {
        if self.seen.insert(norm(&path)) {
            self.paths.push(path);
        }
        !std::mem::replace(&mut self.armed, true)
    }

    /// Everything queued, leaving the queue empty and unarmed.
    fn take(&mut self) -> Vec<String> {
        self.seen.clear();
        self.armed = false;
        std::mem::take(&mut self.paths)
    }
}

/// The filter and the batch queue shared by both watchers.
#[derive(Default, Clone)]
pub struct WatchHub {
    interest: Arc<Mutex<Interest>>,
    pending: Arc<Mutex<Pending>>,
}

impl WatchHub {
    /// The callback a watcher is built with: keep the interesting paths of each event,
    /// queue them, and schedule a flush when the queue was empty. No thread runs while
    /// nothing is pending.
    fn handler(&self, app: AppHandle) -> impl FnMut(notify::Result<Event>) + Send + 'static {
        let hub = self.clone();
        move |res: notify::Result<Event>| {
            if let Ok(event) = res {
                hub.offer(&app, &event.paths);
            }
        }
    }

    fn offer(&self, app: &AppHandle, paths: &[PathBuf]) {
        let wanted: Vec<String> = match self.interest.lock() {
            Ok(interest) => paths
                .iter()
                .map(|p| p.to_string_lossy().to_string())
                .filter(|p| interest.wants(p))
                .collect(),
            Err(_) => return,
        };
        if wanted.is_empty() {
            return;
        }
        let schedule = match self.pending.lock() {
            Ok(mut pending) => wanted.into_iter().fold(false, |s, p| pending.push(p) | s),
            Err(_) => return,
        };
        if schedule {
            let pending = self.pending.clone();
            let app = app.clone();
            std::thread::spawn(move || {
                std::thread::sleep(Duration::from_millis(BATCH_MS));
                let batch = pending.lock().map(|mut p| p.take()).unwrap_or_default();
                if !batch.is_empty() {
                    let _ = app.emit("fs-change", batch);
                }
            });
        }
    }
}

/// Replace the interest set (replace-all). Called by the frontend whenever the listed
/// folders, the open tabs or the project file change; never per keystroke.
#[tauri::command]
pub fn set_watch_interest(
    dirs: Vec<String>,
    files: Vec<String>,
    hub: tauri::State<WatchHub>,
) -> Result<(), String> {
    let mut interest = hub.interest.lock().map_err(|e| e.to_string())?;
    interest.dirs = dirs.iter().map(|d| norm(d)).collect();
    interest.files = files.iter().map(|f| norm(f)).collect();
    Ok(())
}

/// Watch the given out-of-root files individually (empty list drops the watcher).
/// Individual failures are skipped — a just-deleted file must not unwatch the rest.
#[tauri::command]
pub fn watch_extra_files(
    app: AppHandle,
    paths: Vec<String>,
    state: tauri::State<ExtraWatchState>,
    hub: tauri::State<WatchHub>,
) -> Result<(), String> {
    if paths.is_empty() {
        *state.0.lock().map_err(|e| e.to_string())? = None;
        return Ok(());
    }
    let mut watcher = notify::recommended_watcher(hub.handler(app)).map_err(|e| e.to_string())?;

    for path in &paths {
        let _ = watcher.watch(std::path::Path::new(path), RecursiveMode::NonRecursive);
    }

    *state.0.lock().map_err(|e| e.to_string())? = Some(watcher);
    Ok(())
}

/// A root `watch_workspace` could not arm, and why.
#[derive(Serialize)]
pub struct WatchFailure {
    pub root: String,
    pub error: String,
}

/// Watch one or more roots (a folder workspace, or every folder of a project). One
/// watcher instance covers all of them; calling again replaces the previous set. A root
/// inside another root is not armed twice. Each root arms independently: one that fails
/// (a missing drive, say) is returned for the frontend to report, and the rest stay
/// watched.
#[tauri::command]
pub fn watch_workspace(
    app: AppHandle,
    paths: Vec<String>,
    state: tauri::State<WatchState>,
    hub: tauri::State<WatchHub>,
) -> Result<Vec<WatchFailure>, String> {
    let mut watcher = notify::recommended_watcher(hub.handler(app)).map_err(|e| e.to_string())?;

    let mut failures = Vec::new();
    for root in outermost(&paths) {
        if let Err(e) = watcher.watch(std::path::Path::new(&root), RecursiveMode::Recursive) {
            failures.push(WatchFailure { root, error: e.to_string() });
        }
    }

    // Replacing the previous watcher drops it, stopping the old watch.
    *state.0.lock().map_err(|e| e.to_string())? = Some(watcher);
    Ok(failures)
}

#[cfg(test)]
mod tests {
    use super::{inside, norm, outermost, parent, Interest, Pending};

    /// `norm` and `parent` must give what `normPath` and the store's parent rule give; the
    /// expected values are what the JavaScript produces for each input.
    #[test]
    fn norm_and_parent_match_the_store() {
        assert_eq!(norm(r"V:\Dev\Aggregate\README.md"), "v:/dev/aggregate/readme.md");
        assert_eq!(norm("v:/dev/aggregate/README.md"), "v:/dev/aggregate/readme.md");
        assert_eq!(norm(r"V:\dev\aggregate\"), "v:/dev/aggregate");
        assert_eq!(norm("V:/dev/aggregate//"), "v:/dev/aggregate");
        assert_eq!(norm(r"V:\"), "v:");
        assert_eq!(norm(r"\\Server\Share\Notes"), "//server/share/notes");
        assert_eq!(norm(r"D:\My Projects\Draft One.md"), "d:/my projects/draft one.md");
        assert_eq!(norm(r"D:\Projects\Émile\Über.md"), "d:/projects/émile/über.md");

        assert_eq!(parent(r"V:\foo"), "V:");
        assert_eq!(norm(parent(r"V:\foo")), norm(r"V:\"));
        assert_eq!(parent(r"V:\"), "V:");
        assert_eq!(parent(r"V:\dev\aggregate\README.md"), r"V:\dev\aggregate");
        assert_eq!(parent("V:/dev/a.md"), "V:/dev");
        assert_eq!(parent(r"V:\dev\aggregate\"), r"V:\dev\aggregate");
        assert_eq!(parent(r"\\Server\Share\Notes\a.md"), r"\\Server\Share\Notes");
        assert_eq!(parent(r"D:\My Projects\Draft One.md"), r"D:\My Projects");
        assert_eq!(parent("README.md"), "README.md");
    }

    fn interest(dirs: &[&str], files: &[&str]) -> Interest {
        Interest {
            dirs: dirs.iter().map(|d| norm(d)).collect(),
            files: files.iter().map(|f| norm(f)).collect(),
        }
    }

    #[test]
    fn filter_keeps_the_visible_set_and_drops_the_rest() {
        let i = interest(
            &[r"V:\dev\aggregate", r"V:\dev\aggregate\docs", r"V:\"],
            &[r"D:\elsewhere\notes.md", r"C:\Users\me\.writedown\projects\AGG.wdproj"],
        );
        // A file in a listed folder, in either spelling.
        assert!(i.wants(r"V:\dev\aggregate\README.md"));
        assert!(i.wants("v:/DEV/Aggregate/docs/index.qmd"));
        // A listed folder itself (created, deleted, renamed).
        assert!(i.wants(r"V:\dev\aggregate\docs"));
        // A file directly in a listed drive root.
        assert!(i.wants(r"V:\new.md"));
        // An open tab outside every listed folder, and the project file.
        assert!(i.wants(r"D:\elsewhere\notes.md"));
        assert!(i.wants(r"C:\Users\me\.writedown\projects\AGG.wdproj"));
        // Inside .git, in an unlisted folder, under target: all dropped.
        assert!(!i.wants(r"V:\dev\aggregate\.git\index.lock"));
        assert!(!i.wants(r"V:\dev\aggregate\src\core.py"));
        assert!(!i.wants(r"V:\dev\aggregate\target\debug\build\x.exe"));
        assert!(!i.wants(r"D:\elsewhere\other.md"));
    }

    #[test]
    fn nested_roots_reduce_to_the_outermost() {
        let roots: Vec<String> = [
            r"V:\dev\aggregate",
            r"V:\dev",
            r"V:\dev\aggregate-api",
            r"D:\Projects\aggregate",
            r"v:\DEV\",
            r"V:\worktrees\aggregate_REFACTOR",
        ]
        .iter()
        .map(|s| s.to_string())
        .collect();
        assert_eq!(
            outermost(&roots),
            vec![r"V:\dev", r"D:\Projects\aggregate", r"V:\worktrees\aggregate_REFACTOR"]
        );
        // The separator boundary: a sibling sharing a prefix is not inside.
        let pair = vec![r"V:\dev\aggregate".to_string(), r"V:\dev\aggregate-api".to_string()];
        assert_eq!(outermost(&pair), pair);
        assert!(!inside("v:/dev/aggregate-api", "v:/dev/aggregate"));
        assert!(inside("v:/dev/aggregate/docs", "v:/dev/aggregate"));
        // A drive root covers everything on the drive.
        let drive = vec![r"V:\".to_string(), r"V:\dev".to_string(), r"D:\x".to_string()];
        assert_eq!(outermost(&drive), vec![r"V:\", r"D:\x"]);
    }

    #[test]
    fn batch_deduplicates_and_arms_once() {
        let mut p = Pending::default();
        assert!(p.push(r"V:\dev\a.md".into()), "the first push schedules the flush");
        assert!(!p.push("v:/dev/A.md".into()), "same file, other spelling: no second flush");
        assert!(!p.push(r"V:\dev\b.md".into()));
        assert!(!p.push(r"V:\dev\a.md".into()));
        assert_eq!(p.take(), vec![r"V:\dev\a.md", r"V:\dev\b.md"]);
        assert!(p.take().is_empty());
        assert!(p.push(r"V:\dev\a.md".into()), "after a flush the next push schedules again");
    }
}
