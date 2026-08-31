//! Sublime-style projects: a named set of folder roots, stored as a small JSON file
//! (`.wdproj`) wherever the user saves it. `~/.writedown/recent-projects.json` keeps an
//! MRU list of project files for quick switching. User documents are never touched.

use crate::config::writedown_dir;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

#[derive(Serialize, Deserialize, Default)]
pub struct Project {
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub folders: Vec<String>,
    /// Optional display label per folder (issue G.14), shown as `dir (label)` in the
    /// sidebar so three roots named `docs` can be told apart. Keyed by the path exactly
    /// as it appears in `folders`. A BTreeMap so the written file is stable, and omitted
    /// entirely when empty so a project without labels round-trips byte-identical.
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub labels: BTreeMap<String, String>,
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
    labels: Option<BTreeMap<String, String>>,
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
    let project = Project { name: display, folders, labels: labels.unwrap_or_default() };
    let json = serde_json::to_string_pretty(&project).map_err(|e| e.to_string())?;
    std::fs::write(&path, json).map_err(|e| format!("write {}: {e}", path.display()))?;
    Ok(path.to_string_lossy().to_string())
}

/// Save or rename the current project under the managed dir (`~/.writedown/projects/`).
/// The location is managed — the user supplies a name only. `old_path` is the project's
/// current file, if any: renaming a managed project moves it (the old file is removed);
/// a project living elsewhere is adopted in and its original file left untouched (user
/// files are never deleted). Refuses to overwrite a DIFFERENT existing project.
#[tauri::command]
pub fn save_managed_project(
    app: tauri::AppHandle,
    name: String,
    folders: Vec<String>,
    old_path: Option<String>,
    labels: Option<BTreeMap<String, String>>,
) -> Result<String, String> {
    let dir = projects_dir(&app)?;
    std::fs::create_dir_all(&dir).map_err(|e| format!("create {}: {e}", dir.display()))?;
    let stem = sanitize_stem(&name);
    let path = dir.join(format!("{stem}.wdproj"));
    // Windows paths: compare case-insensitively so "my proj" → "My Proj" counts as the
    // same file (the write below updates the stored display name in place).
    let is_own_file = old_path
        .as_deref()
        .map(|o| path.to_string_lossy().eq_ignore_ascii_case(o))
        .unwrap_or(false);
    if path.exists() && !is_own_file {
        return Err(format!("a project named \"{stem}\" already exists"));
    }
    let display = {
        let t = name.trim();
        if t.is_empty() { "project".to_string() } else { t.to_string() }
    };
    let project = Project { name: display, folders, labels: labels.unwrap_or_default() };
    let json = serde_json::to_string_pretty(&project).map_err(|e| e.to_string())?;
    std::fs::write(&path, json).map_err(|e| format!("write {}: {e}", path.display()))?;
    if let Some(old) = old_path {
        let old_p = std::path::PathBuf::from(&old);
        if !is_own_file && old_p.starts_with(&dir) && old_p.exists() {
            let _ = std::fs::remove_file(&old_p); // true rename inside the managed dir
        }
    }
    Ok(path.to_string_lossy().to_string())
}

/// Delete a MANAGED project file (`~/.writedown/projects/<name>.wdproj`), recycled to the
/// OS Recycle Bin so it stays recoverable. Guarded: refuses anything outside the managed
/// dir or not ending in `.wdproj` — a `.wdproj` is only folder-path strings, never user
/// documents, and this must never touch the folders it references (spec §2). The recent
/// list self-prunes the now-vanished path on its next read.
#[tauri::command]
pub fn delete_project(app: tauri::AppHandle, path: String) -> Result<(), String> {
    let dir = projects_dir(&app)?;
    let p = std::path::PathBuf::from(&path);
    let is_managed = p.starts_with(&dir)
        && p.extension()
            .and_then(|e| e.to_str())
            .map(|e| e.eq_ignore_ascii_case("wdproj"))
            .unwrap_or(false);
    if !is_managed {
        return Err(format!("refusing to delete a non-managed project: {path}"));
    }
    trash::delete(&p).map_err(|e| format!("delete {path}: {e}"))
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

/// Normalized comparison key for a project path: case- and separator-insensitive,
/// trailing slash stripped (Windows). Mirrors the frontend `normPath` so the same file
/// added via different spellings (managed join vs. native Open dialog, casing, `\` vs
/// `/`, trailing slash) is treated as one entry (issue 13). Kept for de-dup only — the
/// original spelling is preserved in the stored list.
fn recent_key(p: &str) -> String {
    p.replace('\\', "/").to_lowercase().trim_end_matches('/').to_string()
}

/// MRU list of project file paths (most recent first), pruned of vanished files and of
/// duplicate spellings of the same path (keeping the most recent occurrence).
#[tauri::command]
pub fn recent_projects(app: tauri::AppHandle) -> Result<Vec<String>, String> {
    let list: Vec<String> = std::fs::read_to_string(recent_file(&app)?)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default();
    let mut seen = std::collections::HashSet::new();
    Ok(list
        .into_iter()
        .filter(|p| std::path::Path::new(p).exists())
        .filter(|p| seen.insert(recent_key(p)))
        .collect())
}

/// Move `path` to the front of the MRU (capped at 10), dropping any prior spelling of
/// the same file.
#[tauri::command]
pub fn add_recent_project(app: tauri::AppHandle, path: String) -> Result<(), String> {
    let mut list = recent_projects(app.clone())?;
    let key = recent_key(&path);
    list.retain(|p| recent_key(p) != key);
    list.insert(0, path);
    list.truncate(10);
    let json = serde_json::to_string_pretty(&list).map_err(|e| e.to_string())?;
    std::fs::write(recent_file(&app)?, json).map_err(|e| format!("write recents: {e}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A project written before labels existed must load, and save back byte-identical:
    /// the `labels` key is absent from the file when there are none (issue G.14).
    #[test]
    fn labels_are_optional_and_omitted_when_empty() {
        // Exactly what serde_json's pretty printer emits for a label-free project, with
        // the JSON-escaped Windows path — so the equality below is a real round trip.
        let before = "{\n  \"name\": \"AI\",\n  \"folders\": [\n    \"D:\\\\projects\\\\AI\"\n  ]\n}";
        let p: Project = serde_json::from_str(before).unwrap();
        assert!(p.labels.is_empty());
        assert_eq!(serde_json::to_string_pretty(&p).unwrap(), before);
    }

    #[test]
    fn labels_round_trip_keyed_by_folder_path() {
        let a = r"D:\a\docs";
        let b = r"D:\b\docs";
        let mut p = Project {
            name: "AI".into(),
            folders: vec![a.into(), b.into()],
            labels: BTreeMap::new(),
        };
        p.labels.insert(b.into(), "papers".into());
        let json = serde_json::to_string_pretty(&p).unwrap();
        assert!(json.contains("\"labels\""));
        let back: Project = serde_json::from_str(&json).unwrap();
        assert_eq!(back.labels.get(b).map(String::as_str), Some("papers"));
        assert_eq!(back.labels.get(a), None);
    }
}
