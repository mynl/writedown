//! Filesystem access for the workspace, mediated by the backend (spec §4, §27).
//! The frontend never touches the filesystem directly.

use serde::Serialize;

/// First-class document extensions (spec §6).
const DOC_EXTS: &[&str] = &["md", "qmd", "markdown"];
/// Supporting / openable files shown in the tree where useful (spec §6). Includes code
/// and data files Writedown can open and colourise (Python, JSON, CSV, TOML, YAML, …).
const SUPPORT_EXTS: &[&str] = &[
    "bib", "csl", "yml", "yaml", "toml", "json", "py", "r", "sh", "csv", "tsv", "txt", "tex",
];

#[derive(Serialize)]
pub struct DirEntry {
    name: String,
    path: String,
    is_dir: bool,
    ext: Option<String>,
}

/// List the immediate children of `path` (lazy — the tree expands on demand so it
/// stays responsive on directories with thousands of files, spec §12). Directories
/// first, then supported files, each alphabetical (case-insensitive). Unsupported
/// files are omitted; dotfiles are omitted (a `show_hidden` config option lands in 1.3).
#[tauri::command]
pub fn list_directory(path: String) -> Result<Vec<DirEntry>, String> {
    let read = std::fs::read_dir(&path).map_err(|e| format!("read_dir {path}: {e}"))?;
    let mut entries: Vec<DirEntry> = Vec::new();

    for item in read {
        let item = item.map_err(|e| e.to_string())?;
        let name = item.file_name().to_string_lossy().to_string();
        if name.starts_with('.') {
            continue;
        }
        let full = item.path();
        let is_dir = item.file_type().map_err(|e| e.to_string())?.is_dir();
        let ext = full
            .extension()
            .map(|e| e.to_string_lossy().to_lowercase());

        if !is_dir {
            let keep = ext
                .as_deref()
                .map(|e| DOC_EXTS.contains(&e) || SUPPORT_EXTS.contains(&e))
                .unwrap_or(false);
            if !keep {
                continue;
            }
        }

        entries.push(DirEntry {
            name,
            path: full.to_string_lossy().to_string(),
            is_dir,
            ext,
        });
    }

    entries.sort_by(|a, b| match (a.is_dir, b.is_dir) {
        (true, false) => std::cmp::Ordering::Less,
        (false, true) => std::cmp::Ordering::Greater,
        _ => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
    });

    Ok(entries)
}

#[derive(Serialize)]
pub struct FileItem {
    name: String,
    path: String,
    rel: String,
}

/// Directories skipped when walking the whole workspace (build churn / VCS).
const SKIP_DIRS: &[&str] = &["node_modules", "target", ".git", "__pycache__", ".venv"];

/// Recursively list every supported file under `root` (for quick-open, spec §10, §23).
/// Skips hidden entries and heavy build/VCS directories; capped for safety.
#[tauri::command]
pub fn list_all_files(root: String) -> Result<Vec<FileItem>, String> {
    let root_path = std::path::Path::new(&root);
    let mut out: Vec<FileItem> = Vec::new();
    let mut stack = vec![root_path.to_path_buf()];
    const CAP: usize = 50_000;

    while let Some(dir) = stack.pop() {
        let read = match std::fs::read_dir(&dir) {
            Ok(r) => r,
            Err(_) => continue,
        };
        for item in read.flatten() {
            let name = item.file_name().to_string_lossy().to_string();
            if name.starts_with('.') {
                continue;
            }
            let full = item.path();
            let is_dir = item.file_type().map(|f| f.is_dir()).unwrap_or(false);
            if is_dir {
                if !SKIP_DIRS.contains(&name.as_str()) {
                    stack.push(full);
                }
                continue;
            }
            let keep = full
                .extension()
                .map(|e| e.to_string_lossy().to_lowercase())
                .map(|e| DOC_EXTS.contains(&e.as_str()) || SUPPORT_EXTS.contains(&e.as_str()))
                .unwrap_or(false);
            if !keep {
                continue;
            }
            let rel = full
                .strip_prefix(root_path)
                .unwrap_or(&full)
                .to_string_lossy()
                .replace('\\', "/");
            out.push(FileItem {
                name,
                path: full.to_string_lossy().to_string(),
                rel,
            });
            if out.len() >= CAP {
                return Ok(out);
            }
        }
    }

    out.sort_by(|a, b| a.rel.to_lowercase().cmp(&b.rel.to_lowercase()));
    Ok(out)
}

/// Create a new empty file. Refuses to touch an existing file (never overwrite,
/// spec §2); creates missing parent directories.
#[tauri::command]
pub fn create_file(path: String) -> Result<(), String> {
    let target = std::path::Path::new(&path);
    if target.exists() {
        return Err(format!("already exists: {path}"));
    }
    if let Some(dir) = target.parent() {
        std::fs::create_dir_all(dir).map_err(|e| format!("create parent for {path}: {e}"))?;
    }
    std::fs::File::create_new(target)
        .map(|_| ())
        .map_err(|e| format!("create {path}: {e}"))
}

/// Create a directory (and any missing parents). Existing directories are fine.
#[tauri::command]
pub fn create_directory(path: String) -> Result<(), String> {
    std::fs::create_dir_all(&path).map_err(|e| format!("create dir {path}: {e}"))
}

/// Rename/move a file or folder — only on an explicit user command (spec §2, §8).
/// Refuses to clobber an existing target so a rename can never destroy another file.
#[tauri::command]
pub fn rename_path(from: String, to: String) -> Result<(), String> {
    let dst = std::path::Path::new(&to);
    if dst.exists() {
        return Err(format!("already exists: {to}"));
    }
    if let Some(dir) = dst.parent() {
        std::fs::create_dir_all(dir).map_err(|e| format!("create parent for {to}: {e}"))?;
    }
    std::fs::rename(&from, &to).map_err(|e| format!("rename {from} -> {to}: {e}"))
}

/// Move a file or folder to the OS Recycle Bin — recoverable, never a hard delete
/// (content is job 1). Only on an explicit user command.
#[tauri::command]
pub fn delete_path(path: String) -> Result<(), String> {
    trash::delete(&path).map_err(|e| format!("delete {path}: {e}"))
}

/// Read a UTF-8 text file. Returns the content verbatim (no normalisation).
#[tauri::command]
pub fn read_file(path: String) -> Result<String, String> {
    std::fs::read_to_string(&path).map_err(|e| format!("read {path}: {e}"))
}

/// Atomic save (spec §12): write to a temp file in the SAME directory, flush and
/// fsync, then rename over the original. On Windows `std::fs::rename` replaces the
/// destination atomically (MoveFileExW + MOVEFILE_REPLACE_EXISTING). `content` is
/// written byte-for-byte as UTF-8 — the frontend is responsible for the newline
/// convention and any whitespace policy, so this never rewrites the user's bytes.
#[tauri::command]
pub fn write_file(app: tauri::AppHandle, path: String, content: String) -> Result<(), String> {
    use std::io::Write;

    // Safety net: stash the version we're about to replace before we touch it (spec §12,
    // "never lose content"). Best-effort — never blocks the save.
    crate::backup::snapshot(&app, &path, &content);

    let target = std::path::Path::new(&path);
    let dir = target
        .parent()
        .ok_or_else(|| format!("no parent directory for {path}"))?;
    let name = target
        .file_name()
        .and_then(|n| n.to_str())
        .ok_or_else(|| format!("bad file name for {path}"))?;

    let nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    let tmp = dir.join(format!(".{name}.wd-tmp-{nanos}"));

    let write_tmp = || -> std::io::Result<()> {
        let mut f = std::fs::File::create(&tmp)?;
        f.write_all(content.as_bytes())?;
        f.flush()?;
        f.sync_all()?;
        Ok(())
    };
    if let Err(e) = write_tmp() {
        let _ = std::fs::remove_file(&tmp);
        return Err(format!("write temp for {path}: {e}"));
    }

    std::fs::rename(&tmp, target).map_err(|e| {
        let _ = std::fs::remove_file(&tmp);
        format!("replace {path}: {e}")
    })
}
