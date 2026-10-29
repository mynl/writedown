//! Persistence for the Tab-completion frequency dictionary (issue Sa 5b): one JSON
//! blob at `~/.writedown/word-frequency.json`. Derived, disposable data — recomputable
//! by re-scanning documents; never user content (spec §2). The frontend owns the
//! format (src/editor/wordFreq.ts); these commands are a dumb load/store pair.
use crate::config::writedown_dir;
use std::path::Path;

fn freq_path(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    Ok(writedown_dir(app)?.join("word-frequency.json"))
}

/// Raw JSON of the frequency store ("" when absent — the frontend starts empty).
#[tauri::command]
pub fn word_freq_load(app: tauri::AppHandle) -> Result<String, String> {
    Ok(std::fs::read_to_string(freq_path(&app)?).unwrap_or_default())
}

/// Write the store atomically (issue K.06). Every window re-reads the file and merges before
/// it saves, so a reader must never see a half-written file: it would parse as empty and turn
/// the merge back into the old overwrite.
#[tauri::command]
pub fn word_freq_save(app: tauri::AppHandle, json: String) -> Result<(), String> {
    write_atomic(&freq_path(&app)?, &json)
}

/// Write `text` to a temporary file beside `path`, then rename it over `path`, the pattern
/// `files::write_file` uses for documents (without its backup and stamp check, which a
/// disposable cache does not need). The temporary file is removed on any failure.
fn write_atomic(path: &Path, text: &str) -> Result<(), String> {
    let nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    let name = path.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default();
    let tmp = path.with_file_name(format!(".{name}.wd-tmp-{nanos}"));
    if let Err(e) = std::fs::write(&tmp, text) {
        let _ = std::fs::remove_file(&tmp);
        return Err(format!("write {}: {e}", tmp.display()));
    }
    std::fs::rename(&tmp, path).map_err(|e| {
        let _ = std::fs::remove_file(&tmp);
        format!("replace {}: {e}", path.display())
    })
}

#[cfg(test)]
mod tests {
    use super::write_atomic;

    /// Writes a new file, replaces an existing one, and leaves no temporary file behind.
    #[test]
    fn atomic_write_replaces_and_leaves_no_temp() {
        let dir = std::env::temp_dir().join(format!("writedown-wordfreq-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("word-frequency.json");
        write_atomic(&path, "{\"a\":1}").unwrap();
        assert_eq!(std::fs::read_to_string(&path).unwrap(), "{\"a\":1}");
        write_atomic(&path, "{\"b\":2}").unwrap();
        assert_eq!(std::fs::read_to_string(&path).unwrap(), "{\"b\":2}");
        let names: Vec<String> = std::fs::read_dir(&dir)
            .unwrap()
            .map(|e| e.unwrap().file_name().to_string_lossy().to_string())
            .collect();
        assert_eq!(names, vec!["word-frequency.json".to_string()]);
        let _ = std::fs::remove_dir_all(&dir);
    }
}
