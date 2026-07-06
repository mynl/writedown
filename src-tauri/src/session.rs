//! Session persistence (spec §24) — `~/.writedown/session.json`. Restores the
//! workspace, open tabs, active tab, and pane widths across restarts. Never touches
//! user documents.

use crate::config::writedown_dir;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;

#[derive(Serialize, Deserialize, Default)]
pub struct Session {
    #[serde(default)]
    pub workspace: Option<String>,
    #[serde(default)]
    pub open_tabs: Vec<String>,
    #[serde(default)]
    pub active_tab: Option<String>,
    #[serde(default)]
    pub tree_width: Option<f64>,
    #[serde(default)]
    pub outline_width: Option<f64>,
}

fn session_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    Ok(writedown_dir(app)?.join("session.json"))
}

/// Load the saved session, or a default if none/unreadable (a corrupt session must
/// never block startup).
#[tauri::command]
pub fn load_session(app: tauri::AppHandle) -> Result<Session, String> {
    let path = session_path(&app)?;
    match std::fs::read_to_string(&path) {
        Ok(s) => Ok(serde_json::from_str(&s).unwrap_or_default()),
        Err(_) => Ok(Session::default()),
    }
}

#[tauri::command]
pub fn save_session(app: tauri::AppHandle, session: Session) -> Result<(), String> {
    let path = session_path(&app)?;
    let json = serde_json::to_string_pretty(&session).map_err(|e| e.to_string())?;
    std::fs::write(&path, json).map_err(|e| format!("write session.json: {e}"))
}
