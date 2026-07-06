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
}

#[derive(Serialize, Deserialize, Default)]
struct Global {
    workspace: Option<String>,
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

/// The workspace to restore on a cold start (last one opened), if any.
#[tauri::command]
pub fn load_last_workspace(app: tauri::AppHandle) -> Result<Option<String>, String> {
    match std::fs::read_to_string(global_file(&app)?) {
        Ok(s) => Ok(serde_json::from_str::<Global>(&s).map(|g| g.workspace).unwrap_or(None)),
        Err(_) => Ok(None),
    }
}

#[tauri::command]
pub fn save_last_workspace(app: tauri::AppHandle, workspace: Option<String>) -> Result<(), String> {
    let json = serde_json::to_string_pretty(&Global { workspace }).map_err(|e| e.to_string())?;
    std::fs::write(global_file(&app)?, json).map_err(|e| format!("write session.json: {e}"))
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
