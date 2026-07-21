//! Persistence for the Tab-completion frequency dictionary (issue Sa 5b): one JSON
//! blob at `~/.writedown/word-frequency.json`. Derived, disposable data — recomputable
//! by re-scanning documents; never user content (spec §2). The frontend owns the
//! format (src/editor/wordFreq.ts); these commands are a dumb load/store pair.
use crate::config::writedown_dir;

fn freq_path(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    Ok(writedown_dir(app)?.join("word-frequency.json"))
}

/// Raw JSON of the frequency store ("" when absent — the frontend starts empty).
#[tauri::command]
pub fn word_freq_load(app: tauri::AppHandle) -> Result<String, String> {
    Ok(std::fs::read_to_string(freq_path(&app)?).unwrap_or_default())
}

#[tauri::command]
pub fn word_freq_save(app: tauri::AppHandle, json: String) -> Result<(), String> {
    let p = freq_path(&app)?;
    std::fs::write(&p, json).map_err(|e| format!("write {}: {e}", p.display()))
}
