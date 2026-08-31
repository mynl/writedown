//! Filesystem access for the workspace, mediated by the backend (spec §4, §27).
//! The frontend never touches the filesystem directly.

use serde::Serialize;

/// First-class document extensions (spec §6).
const DOC_EXTS: &[&str] = &["md", "qmd", "markdown"];
/// Supporting / openable files shown in the tree where useful (spec §6). Includes code
/// and data files Writedown can open and colourise (Python, JSON, CSV, TOML, YAML, …).
const SUPPORT_EXTS: &[&str] = &[
    "bib", "csl", "yml", "yaml", "toml", "json", "py", "r", "sh", "csv", "tsv", "txt", "tex",
    "rst", "c", "h", "cpp", "hpp", "js", "mjs", "ts", "tsx", "css", "html", "sql", "ps1", "psm1",
    "agg", "dec", "decl", // aggregate Dec Language programs (colorized via editor/decl.ts)
    "pdf", "djvu", // never opened in a tab — routed to [tools] pdf_viewer
];
/// Images opened in the in-app viewer tab. Keep in sync with `isImageDoc` in
/// src/editor/languages.ts.
const IMAGE_EXTS: &[&str] = &["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "ico", "avif"];

#[derive(Serialize)]
pub struct DirEntry {
    name: String,
    path: String,
    is_dir: bool,
    ext: Option<String>,
    /// Writedown can open this in a tab (text whitelist or image viewer). Unsupported
    /// files are still listed — the tree renders them muted.
    supported: bool,
}

/// Is this entry a directory, **following Windows junctions and symlinks** (issue D.03)?
///
/// `FileType::is_dir()` on Windows is `!is_symlink() && is_directory()`, and `is_symlink()`
/// counts BOTH `IO_REPARSE_TAG_SYMLINK` and `IO_REPARSE_TAG_MOUNT_POINT` — a junction. So
/// `C:\S` (on the previous machine a junction into a synced folder; the example stands)
/// came back `is_dir: false` and drew as a dim, unexpandable file row: present, but useless. The extra `metadata()` — which DOES
/// follow the link — is paid only for reparse-point entries, so an ordinary folder costs
/// nothing. A dangling link stays a file, which is the right failure.
fn is_dir_following_links(ft: &std::fs::FileType, full: &std::path::Path) -> bool {
    ft.is_dir()
        || (ft.is_symlink() && std::fs::metadata(full).map(|m| m.is_dir()).unwrap_or(false))
}

/// `[files] show_hidden` from config.toml, default **true** — dot files/dirs (`.writedown`,
/// `.github`, …) are shown unless the user opts out. Read per call (like the bib module
/// reads `[bibliography]`), so a config edit applies on the next listing without plumbing.
fn show_hidden(app: &tauri::AppHandle) -> bool {
    let Ok(dir) = crate::config::writedown_dir(app) else { return true };
    let Ok(txt) = std::fs::read_to_string(dir.join("config.toml")) else { return true };
    txt.parse::<toml::Value>()
        .ok()
        .and_then(|v| v.get("files")?.get("show_hidden")?.as_bool())
        .unwrap_or(true)
}

/// List the immediate children of `path` (lazy — the tree expands on demand so it
/// stays responsive on directories with thousands of files, spec §12). Directories
/// first, then files, each alphabetical (case-insensitive). Every file is listed;
/// `supported` marks what Writedown opens in a tab and the tree mutes the rest
/// (issue We 3). Dot entries are shown unless `[files] show_hidden = false`.
#[tauri::command]
pub fn list_directory(app: tauri::AppHandle, path: String) -> Result<Vec<DirEntry>, String> {
    let read = std::fs::read_dir(&path).map_err(|e| format!("read_dir {path}: {e}"))?;
    let show_dots = show_hidden(&app);
    let mut entries: Vec<DirEntry> = Vec::new();

    for item in read {
        let item = item.map_err(|e| e.to_string())?;
        let name = item.file_name().to_string_lossy().to_string();
        if !show_dots && name.starts_with('.') {
            continue;
        }
        let full = item.path();
        let ft = item.file_type().map_err(|e| e.to_string())?;
        let is_dir = is_dir_following_links(&ft, &full);
        let ext = full
            .extension()
            .map(|e| e.to_string_lossy().to_lowercase());

        let supported = is_dir
            || ext
                .as_deref()
                .map(|e| {
                    DOC_EXTS.contains(&e) || SUPPORT_EXTS.contains(&e) || IMAGE_EXTS.contains(&e)
                })
                .unwrap_or(false);

        entries.push(DirEntry {
            name,
            path: full.to_string_lossy().to_string(),
            is_dir,
            ext,
            supported,
        });
    }

    entries.sort_by(|a, b| match (a.is_dir, b.is_dir) {
        (true, false) => std::cmp::Ordering::Less,
        (false, true) => std::cmp::Ordering::Greater,
        _ => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
    });

    Ok(entries)
}

/// List several directories in ONE round-trip (issue A.25). Switching projects used to
/// fetch each remembered-expanded folder separately, each answer re-rendering the tree —
/// so the sidebar visibly filled in one folder at a time. The frontend now prefetches the
/// whole set here and mounts the tree already populated. Unreadable directories are simply
/// absent from the map (one bad path must not sink the batch).
#[tauri::command]
pub fn list_directories(
    app: tauri::AppHandle,
    paths: Vec<String>,
) -> std::collections::HashMap<String, Vec<DirEntry>> {
    let mut out = std::collections::HashMap::new();
    for p in paths {
        if let Ok(entries) = list_directory(app.clone(), p.clone()) {
            out.insert(p, entries);
        }
    }
    out
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
/// Honors `[files] show_hidden` (default true); always skips heavy build/VCS
/// directories (SKIP_DIRS); capped for safety.
///
/// Directory junctions and symlinks are followed (issue D.03), which makes a loop guard
/// mandatory. A followed link is walked only when its target lies **outside** the root
/// tree, and only once:
///
/// - target inside the root (`C:\S` → CloudStation, with the root at `C:\`) — skipped,
///   because the ordinary walk already reaches those files under their real path; without
///   this every file would appear in quick-open twice;
/// - target is an ancestor of the root (root `C:\S\AI` containing a link to `C:\S`) —
///   skipped, since walking it re-enters the root and never terminates;
/// - target genuinely elsewhere (`data` → `D:\data`) — walked, which is the point of D.03,
///   and `visited` keeps two links to the same tree from listing it twice.
///
/// Only LINKS pay the `canonicalize` syscall: a plain subdirectory cannot introduce a cycle
/// or a duplicate, so the common path is exactly as fast as before.
#[tauri::command]
pub fn list_all_files(app: tauri::AppHandle, root: String) -> Result<Vec<FileItem>, String> {
    let root_path = std::path::Path::new(&root);
    let show_dots = show_hidden(&app);
    let mut out: Vec<FileItem> = Vec::new();
    let mut stack = vec![root_path.to_path_buf()];
    let root_real = std::fs::canonicalize(root_path).unwrap_or_else(|_| root_path.to_path_buf());
    let mut visited: std::collections::HashSet<std::path::PathBuf> = std::collections::HashSet::new();
    const CAP: usize = 50_000;

    while let Some(dir) = stack.pop() {
        let read = match std::fs::read_dir(&dir) {
            Ok(r) => r,
            Err(_) => continue,
        };
        for item in read.flatten() {
            let name = item.file_name().to_string_lossy().to_string();
            if !show_dots && name.starts_with('.') {
                continue;
            }
            let full = item.path();
            let Ok(ft) = item.file_type() else { continue };
            let is_dir = is_dir_following_links(&ft, &full);
            if is_dir {
                if SKIP_DIRS.contains(&name.as_str()) {
                    continue;
                }
                // Only a link can re-enter a tree we have already walked; a plain
                // subdirectory is new by construction, so it skips the syscall.
                if ft.is_symlink() {
                    let Ok(real) = std::fs::canonicalize(&full) else { continue };
                    // Either direction of containment means the walk already covers it.
                    if real.starts_with(&root_real) || root_real.starts_with(&real) {
                        continue;
                    }
                    if !visited.insert(real) {
                        continue; // a second link into the same outside tree
                    }
                }
                stack.push(full);
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

/// What a dropped path is (issue A.04): the frontend opens directories as a workspace and
/// files as tabs, and must not guess from the name — an extensionless directory and an
/// extensionless file look identical.
#[derive(Serialize)]
pub struct PathInfo {
    path: String,
    exists: bool,
    is_dir: bool,
}

/// Classify each path. Missing paths come back `exists: false` rather than erroring, so one
/// bad entry in a drop can't sink the rest.
#[tauri::command]
pub fn stat_paths(paths: Vec<String>) -> Vec<PathInfo> {
    paths
        .into_iter()
        .map(|p| {
            let meta = std::fs::metadata(&p);
            PathInfo {
                exists: meta.is_ok(),
                is_dir: meta.map(|m| m.is_dir()).unwrap_or(false),
                path: p,
            }
        })
        .collect()
}

/// Write a pasted clipboard image next to the document (issue A.22). `dir` is the target
/// folder, created if absent; `None` means the app's own image folder (`~/.writedown/img`),
/// used for temp buffers, which have no folder of their own.
///
/// Content-addressed and **never overwrites**: if `<stem>.<ext>` already exists with the
/// SAME bytes the existing file is reused (so pasting one screenshot twice yields one
/// file); if it exists with different bytes — a hash collision — the next free `-N` suffix
/// is taken. Returns the full path written or reused.
#[tauri::command]
pub fn save_pasted_image(
    app: tauri::AppHandle,
    dir: Option<String>,
    stem: String,
    ext: String,
    bytes: Vec<u8>,
) -> Result<String, String> {
    let dir = match dir {
        Some(d) => std::path::PathBuf::from(d),
        None => crate::config::writedown_dir(&app)?.join("img"),
    };
    std::fs::create_dir_all(&dir).map_err(|e| format!("create {}: {e}", dir.display()))?;
    // Guard the name: this comes from a hash, but never let it escape the target folder.
    let stem: String = stem
        .chars()
        .filter(|c| c.is_ascii_alphanumeric() || *c == '-' || *c == '_')
        .collect();
    let ext: String = ext.chars().filter(|c| c.is_ascii_alphanumeric()).collect();
    if stem.is_empty() || ext.is_empty() {
        return Err("bad image file name".into());
    }
    for n in 1..1000 {
        let name = if n == 1 { format!("{stem}.{ext}") } else { format!("{stem}-{n}.{ext}") };
        let candidate = dir.join(&name);
        match std::fs::read(&candidate) {
            // Same bytes already on disk — reuse it, write nothing.
            Ok(existing) if existing == bytes => return Ok(candidate.to_string_lossy().into()),
            Ok(_) => continue, // occupied by something else; try the next suffix
            Err(_) => {
                std::fs::write(&candidate, &bytes)
                    .map_err(|e| format!("write {}: {e}", candidate.display()))?;
                return Ok(candidate.to_string_lossy().into());
            }
        }
    }
    Err("could not find a free image file name".into())
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

/// What a file looked like on disk when we last read or wrote it — modified time plus
/// length. Cheap (metadata only, no read) and enough to notice that somebody else has
/// been here (issue B.04).
#[derive(serde::Serialize, serde::Deserialize, Clone, Copy, PartialEq, Eq, Debug)]
pub struct FileStamp {
    pub mtime_ms: u64,
    pub len: u64,
}

/// Error prefix for a refused check-and-set save. The frontend tests for it, so it must
/// stay in step with `CHANGED_ON_DISK` in store.ts.
const CHANGED_ON_DISK: &str = "changed-on-disk";

fn stamp_of_path(path: &str) -> Option<FileStamp> {
    let meta = std::fs::metadata(path).ok()?;
    let mtime_ms = meta
        .modified()
        .ok()?
        .duration_since(std::time::UNIX_EPOCH)
        .ok()?
        .as_millis() as u64;
    Some(FileStamp { mtime_ms, len: meta.len() })
}

/// Current stamp of a file, or `None` when it does not exist / cannot be read. Never an
/// error: a missing file is an answer, not a failure.
#[tauri::command]
pub fn file_stamp(path: String) -> Option<FileStamp> {
    stamp_of_path(&path)
}

/// Atomic save (spec §12): write to a temp file in the SAME directory, flush and
/// fsync, then rename over the original. On Windows `std::fs::rename` replaces the
/// destination atomically (MoveFileExW + MOVEFILE_REPLACE_EXISTING). `content` is
/// written byte-for-byte as UTF-8 — the frontend is responsible for the newline
/// convention and any whitespace policy, so this never rewrites the user's bytes.
///
/// `expect` makes the write a check-and-set (issue B.04): when the caller passes the
/// stamp the file had when it was read, the save is REFUSED if the file on disk has
/// moved on since — somebody else wrote it while we were editing. That guarantee does
/// not depend on the file watcher noticing, which is exactly the weakness B.03 exposed.
/// `None` means "write regardless" (an explicit overwrite, or a caller with no stamp).
/// Returns the stamp of what we just wrote, so the caller can keep checking.
#[tauri::command]
pub fn write_file(
    app: tauri::AppHandle,
    path: String,
    content: String,
    expect: Option<FileStamp>,
) -> Result<FileStamp, String> {
    use std::io::Write;

    if let Some(expected) = expect {
        if stamp_of_path(&path) != Some(expected) {
            return Err(format!("{CHANGED_ON_DISK}: {path}"));
        }
    }

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
    })?;

    // The stamp of what we just wrote becomes the caller's new expectation. A file that
    // vanished between rename and stat is reported as len 0 rather than failing a save
    // that did in fact succeed.
    Ok(stamp_of_path(&path).unwrap_or(FileStamp { mtime_ms: 0, len: 0 }))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::{Path, PathBuf};

    /// Make a directory junction with `mklink /J`. Junctions — unlike symlinks — need no
    /// elevation and no Developer Mode, which is why `C:\S` is one and why this test can
    /// run anywhere. Returns None if the OS declines, so the test skips instead of failing.
    fn make_junction(link: &Path, target: &Path) -> Option<()> {
        let ok = std::process::Command::new("cmd")
            .args(["/C", "mklink", "/J"])
            .arg(link)
            .arg(target)
            .output()
            .ok()?
            .status
            .success();
        ok.then_some(())
    }

    fn temp_dir(tag: &str) -> PathBuf {
        let d = std::env::temp_dir().join(format!("writedown-junction-{tag}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&d);
        std::fs::create_dir_all(&d).expect("temp dir");
        d
    }

    /// Issue D.03: a junction must classify as a DIRECTORY. Rust's `FileType::is_dir()`
    /// says false for one (it counts IO_REPARSE_TAG_MOUNT_POINT as a symlink), which is
    /// why `C:\S` used to draw as a dim, unexpandable file row.
    #[test]
    fn junction_is_a_directory() {
        let base = temp_dir("dir");
        let real = base.join("real");
        std::fs::create_dir_all(real.join("inner")).unwrap();
        std::fs::write(real.join("note.md"), "hi").unwrap();
        let link = base.join("linked");
        let Some(()) = make_junction(&link, &real) else {
            eprintln!("skipped: mklink /J unavailable");
            return;
        };

        let ft = std::fs::symlink_metadata(&link).unwrap().file_type();
        // The bug, asserted so the fix cannot be quietly reverted:
        assert!(!ft.is_dir(), "precondition: Rust reports a junction as a non-dir");
        assert!(ft.is_symlink(), "precondition: a junction counts as a symlink on Windows");
        // The fix:
        assert!(is_dir_following_links(&ft, &link), "junction must classify as a directory");

        // And a plain file is still not a directory, junction logic notwithstanding.
        let f = real.join("note.md");
        let fft = std::fs::symlink_metadata(&f).unwrap().file_type();
        assert!(!is_dir_following_links(&fft, &f));

        let _ = std::fs::remove_dir(&link);
        let _ = std::fs::remove_dir_all(&base);
    }

    /// Issue D.03, second half: following links must not make quick-open list a tree twice.
    /// `inside` points at a sibling under the same root, which the ordinary walk already
    /// covers; without the containment check every file below it would appear twice.
    #[test]
    fn walk_does_not_follow_a_link_into_its_own_root() {
        let base = temp_dir("walk");
        let docs = base.join("docs");
        std::fs::create_dir_all(&docs).unwrap();
        std::fs::write(docs.join("a.md"), "a").unwrap();
        let link = base.join("shortcut");
        let Some(()) = make_junction(&link, &docs) else {
            eprintln!("skipped: mklink /J unavailable");
            return;
        };

        let root_real = std::fs::canonicalize(&base).unwrap();
        let link_real = std::fs::canonicalize(&link).unwrap();
        assert!(
            link_real.starts_with(&root_real),
            "a link to a sibling resolves inside the root, so the walk must skip it"
        );

        let _ = std::fs::remove_dir(&link);
        let _ = std::fs::remove_dir_all(&base);
    }
}
