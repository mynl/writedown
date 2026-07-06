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

#[tauri::command]
pub fn watch_workspace(
    app: AppHandle,
    path: String,
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

    watcher
        .watch(std::path::Path::new(&path), RecursiveMode::Recursive)
        .map_err(|e| e.to_string())?;

    // Replacing the previous watcher drops it, stopping the old watch.
    *state.0.lock().map_err(|e| e.to_string())? = Some(watcher);
    Ok(())
}
