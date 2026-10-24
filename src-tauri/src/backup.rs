//! Backup-before-overwrite safety net (job 1: never lose content). Before a save
//! replaces a file, the CURRENT on-disk bytes — the version about to be lost — are
//! copied into `~/.writedown/backups/<path-key>/<unix-millis><ext>`. Retention is tiered
//! (issue J.07, see `retained`): the newest `KEEP` always, then thinning by age. Everything
//! here is derived/disposable and lives off the synced tree; user documents are never
//! moved, only copied out as a net.

use crate::config::writedown_dir;
use serde::Serialize;
use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};

/// How many of the newest versions per file are kept whatever their age.
const KEEP: usize = 20;

const HOUR_MS: u64 = 3_600_000;
const DAY_MS: u64 = 86_400_000;

/// (year, month 1..=12) of a day count since 1970-01-01, proleptic Gregorian. Howard
/// Hinnant's `civil_from_days`, so calendar months need no date crate.
fn civil_from_days(z: i64) -> (i64, u32) {
    let z = z + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let doe = (z - era * 146_097) as u64; // day of era, [0, 146096]
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365; // [0, 399]
    let y = yoe as i64 + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100); // [0, 365]
    let mp = (5 * doy + 2) / 153; // March-based month, [0, 11]
    let m = if mp < 10 { mp + 3 } else { mp - 9 } as u32;
    (if m <= 2 { y + 1 } else { y }, m)
}

/// The age bucket a version falls in at time `now`, after Synology's Smart Recycle: its
/// UTC hour while under a day old, its day under 30 days, its week (Monday-based) under a
/// year, its calendar month beyond. Tagged by tier, so buckets of different tiers never
/// coincide.
fn bucket(stamp: u64, now: u64) -> (u8, i64) {
    let age = now.saturating_sub(stamp);
    let days = (stamp / DAY_MS) as i64;
    if age < DAY_MS {
        (0, (stamp / HOUR_MS) as i64)
    } else if age < 30 * DAY_MS {
        (1, days)
    } else if age < 365 * DAY_MS {
        (2, (days + 3).div_euclid(7)) // 1970-01-01 was a Thursday: +3 starts weeks on Monday
    } else {
        let (y, m) = civil_from_days(days);
        (3, y * 12 + m as i64)
    }
}

/// The versions tiered retention keeps (issue J.07), newest first: the newest `KEEP`
/// whatever their age, then within each age bucket (see `bucket`) the newest version, so
/// each survivor is the state at the end of its hour, day, week or month. Pure and
/// deterministic: the same stamps and `now` always keep the same set.
///
/// Notes
/// -----
/// The count per file is bounded by KEEP + 24 + 30 + 53 + one per month of age. A version
/// kept for its hour may be dropped later, once it is old enough that its day already has
/// a newer survivor; that is the thinning.
pub(crate) fn retained(stamps: &[u64], now: u64) -> Vec<u64> {
    let mut sorted = stamps.to_vec();
    sorted.sort_unstable_by(|a, b| b.cmp(a));
    sorted.dedup();
    // The newest KEEP claim their buckets too, so an older version sharing a bucket with
    // one of them adds nothing and goes.
    let mut seen: HashSet<(u8, i64)> = HashSet::new();
    let mut keep = Vec::new();
    for (i, s) in sorted.into_iter().enumerate() {
        let fresh = seen.insert(bucket(s, now));
        if i < KEEP || fresh {
            keep.push(s);
        }
    }
    keep
}

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

/// The versions in one file's backup folder: (stamp, path, size), newest first.
fn versions_in(dir: &Path) -> Vec<(u64, PathBuf, u64)> {
    let mut files = Vec::new();
    if let Ok(rd) = std::fs::read_dir(dir) {
        for e in rd.flatten() {
            if let Some(m) = stamp_of(&e.file_name().to_string_lossy()) {
                let size = e.metadata().map(|md| md.len()).unwrap_or(0);
                files.push((m, e.path(), size));
            }
        }
    }
    files.sort_by(|a, b| b.0.cmp(&a.0));
    files
}

/// Delete the versions tiered retention does not keep (issue J.07). Runs at every save
/// that made a backup: one directory listing and a sort, negligible beside the copy.
fn prune(dir: &Path) {
    let files = versions_in(dir);
    if files.len() <= KEEP {
        return;
    }
    let stamps: Vec<u64> = files.iter().map(|f| f.0).collect();
    let keep: HashSet<u64> = retained(&stamps, now_millis()).into_iter().collect();
    for (m, p, _) in files {
        if !keep.contains(&m) {
            let _ = std::fs::remove_file(p);
        }
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

/// The first few KB of a file as text, for a preview: never the whole file (issue J.07; a
/// heavily edited file can hold a hundred versions of several hundred KB each).
fn head_text(path: &Path) -> String {
    use std::io::Read;
    let mut buf = Vec::with_capacity(4096);
    if let Ok(f) = std::fs::File::open(path) {
        let _ = f.take(4096).read_to_end(&mut buf);
    }
    String::from_utf8_lossy(&buf).to_string()
}

/// List the retained versions of `path`, newest first. No backups → empty list. Async:
/// a directory listing plus a 4 KB read per version, kept off the UI thread.
#[tauri::command(async)]
pub fn list_backups(app: tauri::AppHandle, path: String) -> Result<Vec<BackupEntry>, String> {
    let dir = backups_root(&app)?.join(key_for(&path));
    let out = versions_in(&dir)
        .into_iter()
        .map(|(millis, p, size)| BackupEntry {
            millis,
            size,
            preview: head_text(&p)
                .split_whitespace()
                .collect::<Vec<_>>()
                .join(" ")
                .chars()
                .take(120)
                .collect(),
        })
        .collect();
    Ok(out)
}

/// The full text of several versions of `path`, in the order asked (issue J.07: line
/// history walks back through them a batch at a time). A stamp with no version is an error.
#[tauri::command(async)]
pub fn read_backups(app: tauri::AppHandle, path: String, millis: Vec<u64>) -> Result<Vec<String>, String> {
    let dir = backups_root(&app)?.join(key_for(&path));
    let by: HashMap<u64, PathBuf> = versions_in(&dir).into_iter().map(|(m, p, _)| (m, p)).collect();
    millis
        .iter()
        .map(|m| {
            let p = by.get(m).ok_or_else(|| format!("no backup at {m}"))?;
            std::fs::read_to_string(p).map_err(|e| format!("read backup: {e}"))
        })
        .collect()
}

/// Version History: Stats (issue J.07). A project's figures count only its current files;
/// history of a file since deleted or renamed belongs to no project (folders are named by a
/// hash of the path) and shows in the whole-store figures alone.
#[derive(Serialize, Default)]
pub struct BackupStats {
    project_files: usize,
    project_versions: usize,
    project_bytes: u64,
    project_oldest: Option<u64>,
    store_files: usize,
    store_versions: usize,
    store_bytes: u64,
    store_oldest: Option<u64>,
    /// The project walk stopped at its file cap, so its figures are a floor.
    capped: bool,
}

/// The smaller of two optional stamps, either alone when the other is absent.
fn min_opt(a: Option<u64>, b: Option<u64>) -> Option<u64> {
    match (a, b) {
        (Some(x), Some(y)) => Some(x.min(y)),
        (x, None) => x,
        (None, y) => y,
    }
}

/// One history folder's totals: versions, bytes, oldest stamp.
type FolderTotals = (usize, u64, Option<u64>);

/// Every history folder in the store, keyed by its folder name.
fn store_totals(root: &Path) -> HashMap<String, FolderTotals> {
    let mut out = HashMap::new();
    let Ok(rd) = std::fs::read_dir(root) else { return out };
    for e in rd.flatten() {
        if !e.file_type().map(|t| t.is_dir()).unwrap_or(false) {
            continue;
        }
        let vs = versions_in(&e.path());
        if vs.is_empty() {
            continue;
        }
        let bytes = vs.iter().map(|v| v.2).sum();
        let oldest = vs.iter().map(|v| v.0).min();
        out.insert(e.file_name().to_string_lossy().to_string(), (vs.len(), bytes, oldest));
    }
    out
}

/// The history-folder keys of every file under the project's roots (any extension, since
/// Writedown saves whatever text file it opens), each once, and whether the walk was capped.
fn project_keys(app: &tauri::AppHandle, roots: &[String]) -> (HashSet<String>, bool) {
    let mut keys = HashSet::new();
    let mut capped = false;
    for r in roots {
        let (files, c) = crate::files::walk_files(app, Path::new(r), false);
        capped |= c;
        for (p, _) in files {
            keys.insert(key_for(&p.to_string_lossy()));
        }
    }
    (keys, capped)
}

/// The project's and the whole store's figures, on demand only. A large project takes a
/// moment, like Ctrl+P's first listing.
#[tauri::command(async)]
pub fn backup_stats(app: tauri::AppHandle, roots: Vec<String>) -> Result<BackupStats, String> {
    let all = store_totals(&backups_root(&app)?);
    let (keys, capped) = project_keys(&app, &roots);
    let mut s = BackupStats { capped, ..Default::default() };
    for (k, (n, bytes, oldest)) in &all {
        s.store_files += 1;
        s.store_versions += n;
        s.store_bytes += bytes;
        s.store_oldest = min_opt(s.store_oldest, *oldest);
        if keys.contains(k) {
            s.project_files += 1;
            s.project_versions += n;
            s.project_bytes += bytes;
            s.project_oldest = min_opt(s.project_oldest, *oldest);
        }
    }
    Ok(s)
}

/// What a prune would free, or freed.
#[derive(Serialize, Default)]
pub struct PruneReport {
    files: usize,
    versions: usize,
    bytes: u64,
}

/// Version History: Prune This Project… (issue J.07): every version beyond the newest
/// `KEEP` of each of the project's files. Never touches the newest KEEP, so the safety net
/// stays. `dry_run` only counts, for the confirmation.
#[tauri::command(async)]
pub fn backup_prune_project(
    app: tauri::AppHandle,
    roots: Vec<String>,
    dry_run: bool,
) -> Result<PruneReport, String> {
    let root = backups_root(&app)?;
    let (keys, _) = project_keys(&app, &roots);
    let mut rep = PruneReport::default();
    for k in keys {
        let vs = versions_in(&root.join(&k));
        if vs.len() <= KEEP {
            continue;
        }
        rep.files += 1;
        for (_, p, size) in vs.into_iter().skip(KEEP) {
            if dry_run || std::fs::remove_file(&p).is_ok() {
                rep.versions += 1;
                rep.bytes += size;
            }
        }
    }
    Ok(rep)
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

#[cfg(test)]
mod tests {
    use super::*;

    /// 2,000 synthetic stamps spread over 400 days before `now`, from a fixed LCG, so the
    /// test is the same on every run.
    fn stamps(now: u64) -> Vec<u64> {
        let mut x: u64 = 0x2545_f491_4f6c_dd1d;
        (0..2000)
            .map(|_| {
                x = x.wrapping_mul(6_364_136_223_846_793_005).wrapping_add(1_442_695_040_888_963_407);
                now - (x >> 11) % (400 * DAY_MS)
            })
            .collect()
    }

    #[test]
    fn retained_keeps_the_newest_and_one_per_bucket() {
        let now = 1_790_000_000_000; // 2026-09-21, UTC
        let all = stamps(now);
        let keep = retained(&all, now);
        let mut sorted = all.clone();
        sorted.sort_unstable_by(|a, b| b.cmp(a));
        assert_eq!(keep[0], sorted[0], "the newest version is always kept");
        assert_eq!(&keep[..KEEP], &sorted[..KEEP], "the newest KEEP are kept whatever their age");
        // Beyond KEEP, no two survivors share a bucket.
        let mut seen = std::collections::HashSet::new();
        for s in &keep[KEEP..] {
            assert!(seen.insert(bucket(*s, now)), "two survivors in one bucket");
        }
        // Bounded: 24 hours, 30 days, 53 weeks, and the months of a year beyond (2 here).
        assert!(keep.len() <= KEEP + 24 + 30 + 53 + 2, "kept {}", keep.len());
        assert!(keep.len() > KEEP, "the long tail keeps something");
        assert_eq!(retained(&all, now), keep, "deterministic");
    }

    #[test]
    fn retained_keeps_everything_when_few() {
        let now = 1_790_000_000_000;
        let few: Vec<u64> = (0..15).map(|i| now - i * DAY_MS * 40).collect();
        assert_eq!(retained(&few, now).len(), 15);
    }

    #[test]
    fn civil_months_are_right() {
        assert_eq!(civil_from_days(0), (1970, 1));
        assert_eq!(civil_from_days(31), (1970, 2));
        assert_eq!(civil_from_days(20_725), (2026, 9)); // 2026-09-29
        assert_eq!(civil_from_days(-1), (1969, 12));
    }
}
