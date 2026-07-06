//! Filesystem access for the workspace, mediated by the backend (spec §4, §27).
//! The frontend never touches the filesystem directly.

use serde::Serialize;

/// First-class document extensions (spec §6).
const DOC_EXTS: &[&str] = &["md", "qmd", "markdown"];
/// Supporting files shown in the tree where useful (spec §6).
const SUPPORT_EXTS: &[&str] = &["bib", "csl", "yml", "yaml", "toml"];

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
pub fn write_file(path: String, content: String) -> Result<(), String> {
    use std::io::Write;

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
