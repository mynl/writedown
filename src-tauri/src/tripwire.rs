//! Subprocess tripwire (issue K.08): every process Writedown starts goes through `command`,
//! which counts the start per kind. Past a kind's limit within a minute, the start is logged
//! (`~/.writedown/logs/writedown.log`) and a `tripwire` event goes to the frontend, which shows
//! it on the error bar; once per kind per session, so a loop is loud without flooding.
//!
//! Why: from 2.23.0 to 2.31.1 a watcher-driven `git status` loop started about 400 `git.exe`
//! a minute for weeks and nothing noticed. Counting starts catches that class of loop at the
//! cost of one mutex and a map lookup per start; sampling CPU would need an idle detector,
//! because typing, rendering and search use CPU legitimately.
//!
//! Background cost: runs once per subprocess start, never per keystroke; writes at most one log
//! line per kind per session; starts nothing, so it cannot reach its own trigger.

use std::collections::HashMap;
use std::ffi::OsStr;
use std::process::Command;
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};

/// The counting window: a kind's count resets once this long has passed since its window
/// opened (a fixed window, not a sliding one).
const WINDOW: Duration = Duration::from_secs(60);

/// Starts a minute allowed per kind, at or above the highest legitimate rate.
///
/// `git`: tree marks sweep at most once per 10 s (6 a minute), each sweep one `rev-parse` per
/// root and one `status` per repository; the gutter adds two per open, save or tab switch while
/// it is on, and a blame request three or four. 120 covers ten roots in ten repositories
/// swept every 10 s for a whole minute, which needs a focus change or a save every 10 s; the
/// 2.31.1 loop ran at about 400 a minute. `rg`: one per Find in Files query, on Enter. `python`: kernel
/// starts, at most `max_kernels` at warm-up plus restarts. Every other kind (viewer, shell,
/// build, window, update, taskkill) is one start per command the person runs.
fn limit(kind: &str) -> u32 {
    match kind {
        "git" => 120,
        "rg" => 60,
        _ => 30,
    }
}

/// One kind's fixed window, and whether it has tripped this session.
struct Counter {
    opened: Instant,
    count: u32,
    tripped: bool,
}

/// What a start past the limit reports: the kind, the count so far in the window, the limit,
/// and the whole seconds since the window opened.
#[derive(Debug, PartialEq, Clone, serde::Serialize)]
pub struct Trip {
    pub kind: &'static str,
    pub count: u32,
    pub limit: u32,
    pub seconds: u64,
}

/// Per-kind counters, with time passed in so the window logic is testable without sleeping.
#[derive(Default)]
struct Counters(HashMap<&'static str, Counter>);

impl Counters {
    /// Count one start of `kind` at `now`. Returns the trip the first time in this session the
    /// kind's count passes `limit` within one window; `None` otherwise.
    fn record(&mut self, kind: &'static str, limit: u32, now: Instant) -> Option<Trip> {
        let c = self.0.entry(kind).or_insert(Counter { opened: now, count: 0, tripped: false });
        if now.duration_since(c.opened) >= WINDOW {
            c.opened = now;
            c.count = 0;
        }
        c.count += 1;
        if c.count > limit && !c.tripped {
            c.tripped = true;
            return Some(Trip { kind, count: c.count, limit, seconds: now.duration_since(c.opened).as_secs() });
        }
        None
    }
}

static COUNTERS: Mutex<Option<Counters>> = Mutex::new(None);

/// What a trip is handed to: set in `setup`, where it logs and emits through the app handle.
/// A start before that (the launcher) is counted but reported nowhere. A callback rather than
/// a stored `AppHandle` keeps this module free of the Tauri runtime: every spawn site, test
/// code included, links `command`, and a direct `emit` here pulled WebView2 into the test
/// binary, which then failed to load (STATUS_ENTRYPOINT_NOT_FOUND).
type Sink = Box<dyn Fn(&Trip) + Send + Sync>;
static SINK: OnceLock<Sink> = OnceLock::new();

/// Install the trip reporter. Called once from `setup`.
pub fn init(sink: impl Fn(&Trip) + Send + Sync + 'static) {
    let _ = SINK.set(Box::new(sink));
}

/// Count one start of `kind`, then return `Command::new(exe)` for the caller to configure and
/// run. The only place in the crate outside test code that may call `Command::new`; a test
/// below enforces that. `kind` is a short fixed name for what is started (`"git"`, `"rg"`,
/// `"python"`, …): it selects the limit and appears in the log line and on the error bar.
pub fn command(kind: &'static str, exe: impl AsRef<OsStr>) -> Command {
    let trip = COUNTERS
        .lock()
        .ok()
        .and_then(|mut g| g.get_or_insert_with(Counters::default).record(kind, limit(kind), Instant::now()));
    // Reported outside the counters' lock.
    if let (Some(trip), Some(sink)) = (trip, SINK.get()) {
        sink(&trip);
    }
    Command::new(exe)
}

impl Trip {
    /// The line written to the error log; the idle check looks for its `tripwire:` prefix.
    pub fn log_line(&self) -> String {
        format!(
            "tripwire: {} {} starts in {} s (limit {} a minute); background work may be looping",
            self.count, self.kind, self.seconds, self.limit
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// The window counts, trips once just past the limit, never trips again in the session,
    /// and resets its count once a minute has passed.
    #[test]
    fn window_trips_once_and_resets() {
        let mut c = Counters::default();
        let t0 = Instant::now();
        for i in 0..3 {
            assert_eq!(c.record("git", 3, t0 + Duration::from_secs(i)), None);
        }
        let trip = c.record("git", 3, t0 + Duration::from_secs(5)).expect("fourth start trips");
        assert_eq!(trip, Trip { kind: "git", count: 4, limit: 3, seconds: 5 });
        assert_eq!(c.record("git", 3, t0 + Duration::from_secs(6)), None, "trips once only");
        // Another kind has its own window.
        assert_eq!(c.record("rg", 3, t0 + Duration::from_secs(6)), None);
        // A minute after the window opened (at 6 s), the count starts again from one.
        let later = t0 + Duration::from_secs(66);
        c.record("rg", 3, later);
        assert_eq!(c.0["rg"].count, 1);
        assert_eq!(c.0["rg"].opened, later);
        // Past the limit again in a fresh window: still silent, the session already knows.
        for i in 0..5 {
            assert_eq!(c.record("git", 3, later + Duration::from_secs(i)), None);
        }
        assert!(c.0["git"].tripped);
    }

    /// Every subprocess in the crate starts through `command`: no `Command::new(` in any source
    /// file outside this one, test modules aside (they sit at the foot of each file, so each file
    /// is read up to its first `#[cfg(test)]`; the junction helper in `files.rs` tests is one).
    #[test]
    fn every_spawn_goes_through_the_tripwire() {
        let src = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("src");
        let mut offenders = Vec::new();
        for entry in std::fs::read_dir(&src).expect("src folder") {
            let path = entry.expect("entry").path();
            if path.extension().and_then(|e| e.to_str()) != Some("rs") {
                continue;
            }
            if path.file_name().and_then(|n| n.to_str()) == Some("tripwire.rs") {
                continue;
            }
            let text = std::fs::read_to_string(&path).expect("read source");
            let code = text.split("#[cfg(test)]").next().unwrap_or("");
            for (i, line) in code.lines().enumerate() {
                if line.contains("Command::new(") {
                    offenders.push(format!("{}:{}", path.display(), i + 1));
                }
            }
        }
        assert!(offenders.is_empty(), "use tripwire::command instead: {offenders:?}");
    }
}
