//! Session persistence (spec §24). Keyed **per workspace** so multiple instances on
//! different folders don't clobber each other: each workspace's tabs/pane-widths live in
//! `~/.writedown/sessions/<hash>.json`, and `session.json` holds only the last-opened
//! workspace (for a cold start). Never touches user documents.

use crate::config::writedown_dir;
use serde::{Deserialize, Serialize};
use std::hash::{Hash, Hasher};
use std::path::PathBuf;

#[derive(Serialize, Deserialize, Default)]
pub struct Session {
    #[serde(default)]
    pub open_tabs: Vec<String>,
    #[serde(default)]
    pub active_tab: Option<String>,
    #[serde(default)]
    pub tree_width: Option<f64>,
    #[serde(default)]
    pub outline_width: Option<f64>,
    #[serde(default)]
    pub split_ratio: Option<f64>,
    /// Side panel / outline visibility. None in sessions from older builds → visible.
    #[serde(default)]
    pub sidebar_visible: Option<bool>,
    #[serde(default)]
    pub outline_visible: Option<bool>,
    /// Hot exit: untitled:// scratch buffer text, keyed by sentinel path. Tab ORDER
    /// comes from `open_tabs` (which includes the sentinels); this map only carries
    /// the text. Old builds ignore the key and skip the sentinel tabs.
    #[serde(default)]
    pub scratch_contents: std::collections::HashMap<String, String>,
}

#[derive(Serialize, Deserialize, Default)]
pub struct Global {
    #[serde(default)]
    pub workspace: Option<String>,
    /// Folder-tab root, independent of the project — the Folder tab must survive a
    /// restart even when the last workspace was a .wdproj.
    #[serde(default)]
    pub folder_root: Option<String>,
    /// "folder" | "project" — which side-panel tab was showing.
    #[serde(default)]
    pub panel_tab: Option<String>,
}

fn session_file(app: &tauri::AppHandle, workspace: &str) -> Result<PathBuf, String> {
    // Stable hash: DefaultHasher::new() uses fixed keys (unlike RandomState).
    let mut h = std::collections::hash_map::DefaultHasher::new();
    workspace.hash(&mut h);
    let dir = writedown_dir(app)?.join("sessions");
    let _ = std::fs::create_dir_all(&dir);
    Ok(dir.join(format!("{:016x}.json", h.finish())))
}

fn global_file(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    Ok(writedown_dir(app)?.join("session.json"))
}

fn read_global(app: &tauri::AppHandle) -> Global {
    // Missing/corrupt → default; a bad session.json must never block launch.
    global_file(app)
        .ok()
        .and_then(|p| std::fs::read_to_string(p).ok())
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

fn write_global(app: &tauri::AppHandle, g: &Global) -> Result<(), String> {
    let json = serde_json::to_string_pretty(g).map_err(|e| e.to_string())?;
    std::fs::write(global_file(app)?, json).map_err(|e| format!("write session.json: {e}"))
}

/// Cold-start state: last workspace, Folder-tab root, and active panel tab.
#[tauri::command]
pub fn load_global_state(app: tauri::AppHandle) -> Result<Global, String> {
    Ok(read_global(&app))
}

#[tauri::command]
pub fn save_last_workspace(app: tauri::AppHandle, workspace: Option<String>) -> Result<(), String> {
    // Read-modify-write so setting the workspace never wipes the folder fields.
    let mut g = read_global(&app);
    g.workspace = workspace;
    write_global(&app, &g)
}

#[tauri::command]
pub fn save_folder_state(
    app: tauri::AppHandle,
    folder_root: Option<String>,
    panel_tab: Option<String>,
) -> Result<(), String> {
    let mut g = read_global(&app);
    g.folder_root = folder_root;
    g.panel_tab = panel_tab;
    write_global(&app, &g)
}

/// Load a workspace's session (tabs/pane widths). Missing/corrupt → default.
#[tauri::command]
pub fn load_session(app: tauri::AppHandle, workspace: String) -> Result<Session, String> {
    match std::fs::read_to_string(session_file(&app, &workspace)?) {
        Ok(s) => Ok(serde_json::from_str(&s).unwrap_or_default()),
        Err(_) => Ok(Session::default()),
    }
}

#[tauri::command]
pub fn save_session(app: tauri::AppHandle, workspace: String, session: Session) -> Result<(), String> {
    let json = serde_json::to_string_pretty(&session).map_err(|e| e.to_string())?;
    std::fs::write(session_file(&app, &workspace)?, json).map_err(|e| format!("write session: {e}"))
}
