//! One window per file's project (issue I.07) — stop Explorer double-clicks multiplying
//! windows. Windows-only, compile-gated with no-op stubs (the titlebar.rs pattern), so the
//! crate builds and runs everywhere with the feature simply absent.
//!
//! Routing, by PROJECT MEMBERSHIP first (author-specified 2026-09-24):
//!   1. the file lies under an open window's project folders → open it THERE
//!      (several qualify → current virtual desktop first, then front-most);
//!   2. under no open window's folders → first existing window, same tie-break;
//!   3. no Writedown windows at all → a new window, as always;
//!   4. a bare launch, or any directory argument → ALWAYS a new window (that is how
//!      project instances are opened; never reuse).
//!
//! Why hand-rolled: `tauri-plugin-single-instance` forces one process total, which would
//! break the several-instances-one-per-project workflow. Rejected.
//!
//! Mechanism: each running window writes `~/.writedown/instances/<pid>.json`
//! `{ pid, hwnd, roots }` (derived and disposable, like everything under `~/.writedown/`),
//! stamps its HWND with a named property — the marker name encodes debug vs release so a
//! running `tauri dev` never captures real double-clicks — and subclasses its wndproc to
//! accept `WM_COPYDATA`. A fresh launch with only file arguments reads the registry, drops
//! stale entries (HWND gone or marker missing), applies the routing rules, sends the paths
//! via `WM_COPYDATA`, and exits before any window exists. ANY failure at ANY step falls
//! through to a new window: routing is best-effort, opening the file is guaranteed.
//!
//! Known edges, accepted up front: an elevated Writedown cannot receive `WM_COPYDATA`
//! from a non-elevated launcher (falls through to a new window); Explorer multi-select
//! launches N racing processes that each route independently to the same window (the
//! right outcome); Windows may deny foreground rights, leaving the target flashing in
//! the taskbar instead of raising — cosmetic, the path still opens.

use serde::{Deserialize, Serialize};
use std::path::PathBuf;

/// One running window's registry entry.
#[derive(Serialize, Deserialize)]
struct Entry {
    pid: u32,
    hwnd: isize,
    roots: Vec<String>,
}

/// `~/.writedown/instances/` without an AppHandle — the launcher runs before Tauri
/// builds anything. Same resolution as config::writedown_dir (home_dir = USERPROFILE).
fn instances_dir() -> Option<PathBuf> {
    let home = std::env::var("USERPROFILE").ok().filter(|s| !s.is_empty())?;
    Some(PathBuf::from(home).join(".writedown").join("instances"))
}

fn my_entry_path() -> Option<PathBuf> {
    Some(instances_dir()?.join(format!("{}.json", std::process::id())))
}

/// Record (or re-record) this window's roots. The frontend calls it on project
/// open/close/change; `register` writes the first, rootless entry at startup.
#[tauri::command]
pub fn set_instance_roots(roots: Vec<String>) -> Result<(), String> {
    write_entry(roots);
    Ok(())
}

#[cfg(windows)]
fn write_entry(roots: Vec<String>) {
    let Some(hwnd) = MY_HWND.get().copied() else { return };
    let Some(path) = my_entry_path() else { return };
    if let Some(dir) = path.parent() {
        let _ = std::fs::create_dir_all(dir);
    }
    let entry = Entry { pid: std::process::id(), hwnd, roots };
    if let Ok(json) = serde_json::to_string(&entry) {
        let _ = std::fs::write(&path, json);
    }
}

#[cfg(not(windows))]
fn write_entry(_roots: Vec<String>) {}

/// Delete this window's registry entry — called from the Exit run-event. A crash leaves
/// the file behind, which is why the launcher validates HWND + marker before trusting one.
pub fn cleanup() {
    if let Some(path) = my_entry_path() {
        let _ = std::fs::remove_file(path);
    }
}

// ---- Windows implementation ----------------------------------------------------------

#[cfg(windows)]
static MY_HWND: std::sync::OnceLock<isize> = std::sync::OnceLock::new();
#[cfg(windows)]
static APP: std::sync::OnceLock<tauri::AppHandle> = std::sync::OnceLock::new();

/// The HWND property marking a real Writedown window. Debug and release use different
/// names so a running `tauri dev` never captures the author's real double-clicks.
#[cfg(windows)]
const MARKER: &str = if cfg!(debug_assertions) {
    "WritedownInstanceDebug"
} else {
    "WritedownInstance"
};

/// `WM_COPYDATA` payload tag: "WDOP" — anything else addressed to us is ignored.
#[cfg(windows)]
const MAGIC: usize = 0x5744_4F50;

#[cfg(windows)]
mod win {
    use super::*;
    use windows::core::PCWSTR;
    use windows::Win32::Foundation::{HANDLE, HWND, LPARAM, LRESULT, WPARAM};
    use windows::Win32::System::Com::{CoCreateInstance, CoInitializeEx, CLSCTX_ALL, COINIT_APARTMENTTHREADED};
    use windows::Win32::System::DataExchange::COPYDATASTRUCT;
    use windows::Win32::UI::Shell::{DefSubclassProc, IVirtualDesktopManager, SetWindowSubclass, VirtualDesktopManager};
    use windows::Win32::UI::WindowsAndMessaging::{
        AllowSetForegroundWindow, EnumWindows, GetPropW, IsWindow, SendMessageTimeoutW,
        SetPropW, SEND_MESSAGE_TIMEOUT_FLAGS, WM_COPYDATA,
    };

    fn wide(s: &str) -> Vec<u16> {
        s.encode_utf16().chain(std::iter::once(0)).collect()
    }

    /// Stamp the marker and install the WM_COPYDATA subclass on the main window.
    pub fn register(app: &tauri::AppHandle) {
        use tauri::Manager;
        let Some(window) = app.get_webview_window("main") else { return };
        let Ok(handle) = window.hwnd() else { return };
        let hwnd = HWND(handle.0);
        let _ = super::APP.set(app.clone());
        let _ = super::MY_HWND.set(handle.0 as isize);
        let name = wide(super::MARKER);
        unsafe {
            let _ = SetPropW(hwnd, PCWSTR(name.as_ptr()), HANDLE(1 as _));
            let _ = SetWindowSubclass(hwnd, Some(subclass_proc), 1, 0);
        }
        super::write_entry(Vec::new()); // roots follow from the frontend momentarily
    }

    /// Receive routed paths: emit them to the frontend (which feeds the ordinary
    /// launch-file logic) and raise the window. Returns 1 so the launcher knows.
    unsafe extern "system" fn subclass_proc(
        hwnd: HWND,
        msg: u32,
        wparam: WPARAM,
        lparam: LPARAM,
        _id: usize,
        _data: usize,
    ) -> LRESULT {
        if msg == WM_COPYDATA {
            let cds = &*(lparam.0 as *const COPYDATASTRUCT);
            if cds.dwData == super::MAGIC && !cds.lpData.is_null() {
                let bytes = std::slice::from_raw_parts(cds.lpData as *const u8, cds.cbData as usize);
                if let Ok(paths) = serde_json::from_slice::<Vec<String>>(bytes) {
                    if let Some(app) = super::APP.get() {
                        use tauri::{Emitter, Manager};
                        let _ = app.emit("open-paths", paths);
                        if let Some(w) = app.get_webview_window("main") {
                            let _ = w.unminimize();
                            let _ = w.set_focus();
                        }
                    }
                    return LRESULT(1);
                }
            }
        }
        DefSubclassProc(hwnd, msg, wparam, lparam)
    }

    /// A registry entry whose HWND is live and still carries our marker. The marker check
    /// doubles as the dead-pid guard: a recycled HWND belongs to some other window, which
    /// cannot carry a property only Writedown sets.
    fn validate(e: &Entry) -> bool {
        let hwnd = HWND(e.hwnd as _);
        let name = wide(super::MARKER);
        unsafe { IsWindow(hwnd).as_bool() && !GetPropW(hwnd, PCWSTR(name.as_ptr())).is_invalid() }
    }

    /// Top-level windows, front-most first (EnumWindows enumerates in z-order).
    fn z_order() -> Vec<isize> {
        unsafe extern "system" fn enum_proc(hwnd: HWND, lparam: LPARAM) -> windows::Win32::Foundation::BOOL {
            let list = &mut *(lparam.0 as *mut Vec<isize>);
            list.push(hwnd.0 as isize);
            true.into()
        }
        let mut list: Vec<isize> = Vec::new();
        unsafe {
            let _ = EnumWindows(Some(enum_proc), LPARAM(&mut list as *mut _ as isize));
        }
        list
    }

    /// Route `files` (all plain files) to an existing window per the rules above.
    /// True = delivered; the caller exits without building a window.
    pub fn route(files: &[String]) -> bool {
        let Some(dir) = instances_dir() else { return false };
        let Ok(read) = std::fs::read_dir(&dir) else { return false };
        let mut entries: Vec<Entry> = Vec::new();
        for f in read.flatten() {
            let path = f.path();
            if path.extension().and_then(|e| e.to_str()) != Some("json") {
                continue;
            }
            let Some(e) = std::fs::read_to_string(&path).ok().and_then(|t| serde_json::from_str::<Entry>(&t).ok()) else {
                let _ = std::fs::remove_file(&path);
                continue;
            };
            if e.pid == std::process::id() {
                continue; // our own half-written entry, never a target
            }
            if validate(&e) {
                entries.push(e);
            } else {
                let _ = std::fs::remove_file(&path); // stale-file guard (Task Manager kill)
            }
        }
        if entries.is_empty() {
            return false; // rule 3: no windows → new window
        }

        // Rule 1: windows whose project folders contain the first file; else rule 2: all.
        // Multi-select races each route the same way, so keying on files[0] is stable.
        let under = |file: &str, root: &str| {
            let f = file.to_lowercase().replace('/', "\\");
            let mut r = root.to_lowercase().replace('/', "\\");
            if !r.ends_with('\\') {
                r.push('\\');
            }
            f.starts_with(&r)
        };
        let owning: Vec<&Entry> = entries
            .iter()
            .filter(|e| e.roots.iter().any(|r| files.iter().any(|f| under(f, r))))
            .collect();
        let pool: Vec<&Entry> = if owning.is_empty() { entries.iter().collect() } else { owning };

        // Tie-break: current virtual desktop first (documented COM API), then z-order.
        unsafe {
            let _ = CoInitializeEx(None, COINIT_APARTMENTTHREADED);
        }
        let on_current = |e: &Entry| -> bool {
            unsafe {
                CoCreateInstance::<_, IVirtualDesktopManager>(&VirtualDesktopManager, None, CLSCTX_ALL)
                    .and_then(|vdm| vdm.IsWindowOnCurrentVirtualDesktop(HWND(e.hwnd as _)))
                    .map(|b| b.as_bool())
                    .unwrap_or(true) // API unavailable → treat every window as eligible
            }
        };
        let z = z_order();
        let rank = |e: &Entry| z.iter().position(|h| *h == e.hwnd).unwrap_or(usize::MAX);
        let target = pool
            .iter()
            .min_by_key(|e| (!on_current(e), rank(e)))
            .copied();
        let Some(target) = target else { return false };

        // Deliver. Timeout + ABORTIFHUNG so a wedged window cannot hang the launcher;
        // any failure falls through to a new window.
        let Ok(json) = serde_json::to_string(&files.to_vec()) else { return false };
        let bytes = json.as_bytes();
        let cds = COPYDATASTRUCT {
            dwData: super::MAGIC,
            cbData: bytes.len() as u32,
            lpData: bytes.as_ptr() as *mut _,
        };
        unsafe {
            let _ = AllowSetForegroundWindow(target.pid);
            let mut result: usize = 0;
            let sent = SendMessageTimeoutW(
                HWND(target.hwnd as _),
                WM_COPYDATA,
                WPARAM(0),
                LPARAM(&cds as *const _ as isize),
                SEND_MESSAGE_TIMEOUT_FLAGS(0x0002 | 0x0008), // SMTO_ABORTIFHUNG | SMTO_ERRORONEXIT
                3000,
                Some(&mut result),
            );
            sent.0 != 0 && result == 1
        }
    }
}

/// Hand pure-file launches to an existing window. Returns true when the paths were
/// delivered and this process should exit without creating a window. Any directory
/// argument (a project open) and the bare launch always get a new window — rule 4.
#[cfg(windows)]
pub fn route_to_existing(paths: &[String]) -> bool {
    if paths.is_empty() || !paths.iter().all(|p| std::path::Path::new(p).is_file()) {
        return false;
    }
    win::route(paths)
}

#[cfg(not(windows))]
pub fn route_to_existing(_paths: &[String]) -> bool {
    false
}

/// Mark this window and start listening for routed paths — called from setup, after the
/// main window exists.
#[cfg(windows)]
pub fn register(app: &tauri::AppHandle) {
    win::register(app);
}

#[cfg(not(windows))]
pub fn register(_app: &tauri::AppHandle) {}
