//! Launch external tools: the configured PDF/DjVu viewer and a shell at a directory.
//! Tool paths come from `[tools]` in config.toml, read per call (the same pattern as
//! `files::show_hidden`), so a config edit applies immediately with no plumbing.

use std::process::Command;

fn tool(app: &tauri::AppHandle, key: &str) -> Option<String> {
    let dir = crate::config::writedown_dir(app).ok()?;
    let txt = std::fs::read_to_string(dir.join("config.toml")).ok()?;
    let val: toml::Value = txt.parse().ok()?;
    val.get("tools")?.get(key)?.as_str().map(str::to_string)
}

/// Open `path` in the configured external viewer (`[tools] pdf_viewer`). Used for
/// PDF/DjVu files, which Writedown never renders itself — SumatraPDF reads both.
/// A missing key is a surfaced error, not a silent fallback.
#[tauri::command]
pub fn open_external(app: tauri::AppHandle, path: String) -> Result<(), String> {
    let exe = tool(&app, "pdf_viewer").ok_or_else(|| {
        "no viewer configured — set  [tools] pdf_viewer = 'C:/path/to/SumatraPDF.exe'  \
         in config.toml"
            .to_string()
    })?;
    Command::new(&exe)
        .arg(&path)
        .spawn()
        .map_err(|e| format!("launch {exe}: {e}"))?;
    Ok(())
}

/// Open the configured shell (`[tools] shell`, default `pwsh`) in its own console
/// window at `dir`. On Windows CREATE_NEW_CONSOLE is required: a console child spawned
/// from a GUI app has no console to inherit and would otherwise run invisibly. Other
/// platforms (untested) spawn plain — the cfg guard keeps the crate compiling there.
/// (Known limit: `shell = "wt"` ignores the directory — Windows Terminal uses its own
/// startingDirectory profile setting, not the spawn cwd.)
#[tauri::command]
pub fn open_shell(app: tauri::AppHandle, dir: String) -> Result<(), String> {
    let exe = tool(&app, "shell").unwrap_or_else(|| "pwsh".to_string());
    let mut cmd = Command::new(&exe);
    cmd.current_dir(&dir);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NEW_CONSOLE: u32 = 0x0000_0010;
        cmd.creation_flags(CREATE_NEW_CONSOLE);
    }
    cmd.spawn().map_err(|e| format!("launch {exe} in {dir}: {e}"))?;
    Ok(())
}

/// Result of a `[build]` command: exit code (None if killed), captured stdout/stderr
/// (UTF-8 lossy), and wall-clock milliseconds.
#[derive(serde::Serialize)]
pub struct BuildResult {
    code: Option<i32>,
    stdout: String,
    stderr: String,
    ms: u64,
}

// PowerShell single-quoted literal: no expansion; only `''` escapes a literal quote.
fn ps_quote(s: &str) -> String {
    format!("'{}'", s.replace('\'', "''"))
}

/// Run a user `[build]` command against `file`, Sublime-build style. Everything is
/// launched through PowerShell (`pwsh`) from the file's own folder — author decision
/// ("redirect by default through pwsh"): pwsh runs a .bat (via its cmd shim), a .ps1,
/// an .exe, or a bare PATH command identically, so no per-type dispatch is needed. The
/// `$file`-family variables are substituted as single-quoted literals so a path with
/// spaces survives as one argument. Output is captured (not shown live) and returned
/// for the frontend to surface. Blocking `.output()` runs on a worker thread so the
/// webview never stalls (same pattern as render_document).
#[tauri::command]
pub async fn run_build(command: String, file: String) -> Result<BuildResult, String> {
    tauri::async_runtime::spawn_blocking(move || run_build_impl(&command, &file))
        .await
        .map_err(|e| format!("build task: {e}"))?
}

fn run_build_impl(command: &str, file: &str) -> Result<BuildResult, String> {
    let p = std::path::Path::new(file);
    let dir = p
        .parent()
        .filter(|d| !d.as_os_str().is_empty())
        .ok_or_else(|| format!("no folder for {file}"))?;
    let name = p.file_name().map(|s| s.to_string_lossy().into_owned()).unwrap_or_default();
    let stem = p.file_stem().map(|s| s.to_string_lossy().into_owned()).unwrap_or_default();
    let ext = p.extension().map(|s| s.to_string_lossy().into_owned()).unwrap_or_default();
    let dir_s = dir.to_string_lossy();

    // Substitute Sublime-style variables — longest name first so `$file` can't shadow
    // `$file_name`/`$file_path`. Each value is single-quoted for PowerShell so spaces
    // in a path can't split it into two arguments.
    let ps_body = command
        .replace("$file_base_name", &ps_quote(&stem))
        .replace("$file_extension", &ps_quote(&ext))
        .replace("$file_name", &ps_quote(&name))
        .replace("$file_path", &ps_quote(&dir_s))
        .replace("$file", &ps_quote(file));

    let mut cmd = Command::new("pwsh");
    cmd.args(["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", &ps_body]);
    cmd.current_dir(dir);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    let start = std::time::Instant::now();
    let out = cmd.output().map_err(|e| format!("launch pwsh for build: {e}"))?;
    Ok(BuildResult {
        code: out.status.code(),
        stdout: String::from_utf8_lossy(&out.stdout).into_owned(),
        stderr: String::from_utf8_lossy(&out.stderr).into_owned(),
        ms: start.elapsed().as_millis() as u64,
    })
}
