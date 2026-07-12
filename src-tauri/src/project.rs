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

/// A managed project (name + file path) for the quick-switch list.
#[derive(Serialize)]
pub struct ProjectInfo {
    pub name: String,
    pub path: String,
}

/// Where managed projects live: `~/.writedown/projects/` (created by `ensure_setup`).
fn projects_dir(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    Ok(writedown_dir(app)?.join("projects"))
}

/// Turn a project name into a safe file stem — replace path-hostile characters, never empty.
fn sanitize_stem(name: &str) -> String {
    let s: String = name
        .chars()
        .map(|c| if "\\/:*?\"<>|".contains(c) { '-' } else { c })
        .collect();
    let s = s.trim().trim_matches('.').trim();
    if s.is_empty() { "project".to_string() } else { s.to_string() }
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

/// Create a new managed project under `~/.writedown/projects/`. The location is managed —
/// the user is never asked where. Name collisions get a numeric suffix. Returns the path.
#[tauri::command]
pub fn new_project(
    app: tauri::AppHandle,
    name: String,
    folders: Vec<String>,
) -> Result<String, String> {
    let dir = projects_dir(&app)?;
    std::fs::create_dir_all(&dir).map_err(|e| format!("create {}: {e}", dir.display()))?;
    let stem = sanitize_stem(&name);
    let mut path = dir.join(format!("{stem}.wdproj"));
    let mut n = 2;
    while path.exists() {
        path = dir.join(format!("{stem}-{n}.wdproj"));
        n += 1;
    }
    let display = {
        let t = name.trim();
        if t.is_empty() { "project".to_string() } else { t.to_string() }
    };
    let project = Project { name: display, folders };
    let json = serde_json::to_string_pretty(&project).map_err(|e| e.to_string())?;
    std::fs::write(&path, json).map_err(|e| format!("write {}: {e}", path.display()))?;
    Ok(path.to_string_lossy().to_string())
}

/// List every managed project in `~/.writedown/projects/` (name + full path), name-sorted.
#[tauri::command]
pub fn list_projects(app: tauri::AppHandle) -> Result<Vec<ProjectInfo>, String> {
    let dir = projects_dir(&app)?;
    let mut out = Vec::new();
    if let Ok(entries) = std::fs::read_dir(&dir) {
        for e in entries.flatten() {
            let p = e.path();
            if p.extension().and_then(|s| s.to_str()) == Some("wdproj") {
                let name = std::fs::read_to_string(&p)
                    .ok()
                    .and_then(|t| serde_json::from_str::<Project>(&t).ok())
                    .map(|pr| pr.name)
                    .filter(|n| !n.is_empty())
                    .or_else(|| p.file_stem().map(|s| s.to_string_lossy().to_string()))
                    .unwrap_or_else(|| "project".into());
                out.push(ProjectInfo {
                    name,
                    path: p.to_string_lossy().to_string(),
                });
            }
        }
    }
    out.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    Ok(out)
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
