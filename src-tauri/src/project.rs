//! Sublime-style projects: a named set of folder roots, stored as a small JSON file
//! (`.wdproj`) wherever the user saves it. `~/.writedown/recent-projects.json` keeps an
//! MRU list of project files for quick switching. User documents are never touched.

use crate::config::writedown_dir;
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Default)]
pub struct Project {
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub folders: Vec<String>,
}

/// Load a `.wdproj` file. The name falls back to the file stem.
#[tauri::command]
pub fn load_project(path: String) -> Result<Project, String> {
    let text = std::fs::read_to_string(&path).map_err(|e| format!("read {path}: {e}"))?;
    let mut p: Project =
        serde_json::from_str(&text).map_err(|e| format!("parse {path}: {e}"))?;
    if p.name.is_empty() {
        p.name = std::path::Path::new(&path)
            .file_stem()
            .map(|s| s.to_string_lossy().to_string())
            .unwrap_or_else(|| "project".into());
    }
    Ok(p)
}

/// Save a project file (pretty JSON — it's meant to be human-readable and git-able).
#[tauri::command]
pub fn save_project(path: String, project: Project) -> Result<(), String> {
    let json = serde_json::to_string_pretty(&project).map_err(|e| e.to_string())?;
    std::fs::write(&path, json).map_err(|e| format!("write {path}: {e}"))
}

fn recent_file(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    Ok(writedown_dir(app)?.join("recent-projects.json"))
}

/// MRU list of project file paths (most recent first), pruned of vanished files.
#[tauri::command]
pub fn recent_projects(app: tauri::AppHandle) -> Result<Vec<String>, String> {
    let list: Vec<String> = std::fs::read_to_string(recent_file(&app)?)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default();
    Ok(list
        .into_iter()
        .filter(|p| std::path::Path::new(p).exists())
        .collect())
}

/// Move `path` to the front of the MRU (capped at 10).
#[tauri::command]
pub fn add_recent_project(app: tauri::AppHandle, path: String) -> Result<(), String> {
    let mut list = recent_projects(app.clone())?;
    list.retain(|p| p != &path);
    list.insert(0, path);
    list.truncate(10);
    let json = serde_json::to_string_pretty(&list).map_err(|e| e.to_string())?;
    std::fs::write(recent_file(&app)?, json).map_err(|e| format!("write recents: {e}"))
}
