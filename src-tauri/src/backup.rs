//! Backup-before-overwrite safety net (job 1: never lose content). Before a save
//! replaces a file, the CURRENT on-disk bytes — the version about to be lost — are
//! copied into `~/.writedown/backups/<path-key>/<unix-millis><ext>`. We keep the last
//! `KEEP` per file and prune older ones. Everything here is derived/disposable and lives
//! off the synced tree; user documents are never moved, only copied out as a net.

use crate::config::writedown_dir;
use std::path::{Path, PathBuf};

/// How many prior versions to retain per file.
const KEEP: usize = 20;

fn backups_root(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    Ok(writedown_dir(app)?.join("backups"))
}

/// A stable, filesystem-safe folder name for an absolute path. Case-insensitive and
/// slash-agnostic so the same file always maps to the same key on Windows. FNV-1a/64.
fn key_for(path: &str) -> String {
    let norm = path.replace('\\', "/").to_lowercase();
    let mut h: u64 = 0xcbf2_9ce4_8422_2325;
    for b in norm.as_bytes() {
        h ^= *b as u64;
        h = h.wrapping_mul(0x0000_0100_0000_01b3);
    }
    format!("{h:016x}")
}

fn ext_of(path: &str) -> String {
    Path::new(path)
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| format!(".{e}"))
        .unwrap_or_default()
}

fn now_millis() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

/// The unix-millis stamp encoded in a backup file name (leading digits), if any.
fn stamp_of(name: &str) -> Option<u64> {
    let digits: String = name.chars().take_while(|c| c.is_ascii_digit()).collect();
    if digits.is_empty() {
        None
    } else {
        digits.parse::<u64>().ok()
    }
}

/// Copy the current on-disk content of `path` into the backup store, just before an
/// overwrite. Best-effort: a backup failure must never block the user's save (the save
/// matters more than the net). Skips when the file is new (nothing to preserve) or when
/// the new content is byte-identical to what's already there (no version worth keeping).
pub fn snapshot(app: &tauri::AppHandle, path: &str, new_content: &str) {
    let Ok(bytes) = std::fs::read(Path::new(path)) else {
        return; // new file — no prior version to keep
    };
    if bytes == new_content.as_bytes() {
        return; // unchanged — don't spam identical backups
    }
    let Ok(root) = backups_root(app) else { return };
    let dir = root.join(key_for(path));
    if std::fs::create_dir_all(&dir).is_err() {
        return;
    }
    let file = dir.join(format!("{}{}", now_millis(), ext_of(path)));
    let _ = std::fs::write(&file, &bytes);
    prune(&dir);
}

/// Delete all but the newest `KEEP` backups in a file's backup folder.
fn prune(dir: &Path) {
    let mut files: Vec<(u64, PathBuf)> = Vec::new();
    if let Ok(rd) = std::fs::read_dir(dir) {
        for e in rd.flatten() {
            if let Some(m) = stamp_of(&e.file_name().to_string_lossy()) {
                files.push((m, e.path()));
            }
        }
    }
    if files.len() <= KEEP {
        return;
    }
    files.sort_by(|a, b| b.0.cmp(&a.0)); // newest first
    for (_, p) in files.into_iter().skip(KEEP) {
        let _ = std::fs::remove_file(p);
    }
}

/// One restorable snapshot, for the Previous Versions picker.
#[derive(serde::Serialize)]
pub struct BackupEntry {
    /// Unix-millis when this version was superseded (i.e. backed up).
    pub millis: u64,
    pub size: u64,
    /// A short single-line preview of the content.
    pub preview: String,
}

/// List the retained versions of `path`, newest first. No backups → empty list.
#[tauri::command]
pub fn list_backups(app: tauri::AppHandle, path: String) -> Result<Vec<BackupEntry>, String> {
    let dir = backups_root(&app)?.join(key_for(&path));
    let mut out: Vec<BackupEntry> = Vec::new();
    let Ok(rd) = std::fs::read_dir(&dir) else {
        return Ok(out); // folder absent → nothing backed up yet
    };
    for e in rd.flatten() {
        let Some(millis) = stamp_of(&e.file_name().to_string_lossy()) else {
            continue;
        };
        let size = e.metadata().map(|m| m.len()).unwrap_or(0);
        let preview = std::fs::read_to_string(e.path())
            .ok()
            .map(|s| {
                s.split_whitespace()
                    .collect::<Vec<_>>()
                    .join(" ")
                    .chars()
                    .take(120)
                    .collect::<String>()
            })
            .unwrap_or_default();
        out.push(BackupEntry { millis, size, preview });
    }
    out.sort_by(|a, b| b.millis.cmp(&a.millis));
    Ok(out)
}

/// Return the full content of one backup, for preview/restore in the editor.
#[tauri::command]
pub fn read_backup(app: tauri::AppHandle, path: String, millis: u64) -> Result<String, String> {
    let dir = backups_root(&app)?.join(key_for(&path));
    let rd = std::fs::read_dir(&dir).map_err(|e| format!("read backups: {e}"))?;
    for e in rd.flatten() {
        if stamp_of(&e.file_name().to_string_lossy()) == Some(millis) {
            return std::fs::read_to_string(e.path()).map_err(|e| format!("read backup: {e}"));
        }
    }
    Err(format!("no backup at {millis}"))
}
