//! Watch the workspace for external changes (spec §14) and emit `fs-change` events to
//! the frontend with the affected paths. The frontend refreshes the tree and reloads (or
//! flags a conflict on) open files. One recursive watcher at a time; opening a new
//! workspace replaces it.

use notify::{Event, RecommendedWatcher, RecursiveMode, Watcher};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter};

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

/// Watch the given out-of-root files individually (empty list drops the watcher).
/// Individual failures are skipped — a just-deleted file must not unwatch the rest.
#[tauri::command]
pub fn watch_extra_files(
    app: AppHandle,
    paths: Vec<String>,
    state: tauri::State<ExtraWatchState>,
) -> Result<(), String> {
    if paths.is_empty() {
        *state.0.lock().map_err(|e| e.to_string())? = None;
        return Ok(());
    }
    let app2 = app.clone();
    let mut watcher = notify::recommended_watcher(move |res: notify::Result<Event>| {
        if let Ok(event) = res {
            let paths: Vec<String> = event
                .paths
                .iter()
                .map(|p| p.to_string_lossy().to_string())
                .collect();
            if !paths.is_empty() {
                let _ = app2.emit("fs-change", paths);
            }
        }
    })
    .map_err(|e| e.to_string())?;

    for path in &paths {
        let _ = watcher.watch(std::path::Path::new(path), RecursiveMode::NonRecursive);
    }

    *state.0.lock().map_err(|e| e.to_string())? = Some(watcher);
    Ok(())
}

/// Watch one or more roots (a folder workspace, or every folder of a project). One
/// watcher instance covers all of them; calling again replaces the previous set.
#[tauri::command]
pub fn watch_workspace(
    app: AppHandle,
    paths: Vec<String>,
    state: tauri::State<WatchState>,
) -> Result<(), String> {
    let app2 = app.clone();
    let mut watcher = notify::recommended_watcher(move |res: notify::Result<Event>| {
        if let Ok(event) = res {
            let paths: Vec<String> = event
                .paths
                .iter()
                .map(|p| p.to_string_lossy().to_string())
                .collect();
            if !paths.is_empty() {
                let _ = app2.emit("fs-change", paths);
            }
        }
    })
    .map_err(|e| e.to_string())?;

    for path in &paths {
        watcher
            .watch(std::path::Path::new(path), RecursiveMode::Recursive)
            .map_err(|e| format!("watch {path}: {e}"))?;
    }

    // Replacing the previous watcher drops it, stopping the old watch.
    *state.0.lock().map_err(|e| e.to_string())? = Some(watcher);
    Ok(())
}
