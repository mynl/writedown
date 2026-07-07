//! Exact Quarto rendering (spec §16.2). Runs `quarto render <file>` only on an explicit
//! user command — never automatically. Discovers `quarto` from PATH via the shell.

use serde::Serialize;
use std::io::{BufRead, BufReader, Read};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::{Arc, Mutex};
use std::thread;
use tauri::Emitter;

#[derive(Serialize)]
pub struct QuartoResult {
    success: bool,
    log: String,
    output_file: Option<String>,
}

/// Walk up from the file to the Quarto project root (the dir holding `_quarto.yml`/`.yaml`).
/// Project-relative resources (`static/…`, `styles.css`) resolve against this, so it must be
/// the working directory — matching how the user renders from a terminal at the project root.
fn project_root(file: &Path) -> Option<PathBuf> {
    let mut dir = file.parent();
    while let Some(d) = dir {
        if d.join("_quarto.yml").exists() || d.join("_quarto.yaml").exists() {
            return Some(d.to_path_buf());
        }
        dir = d.parent();
    }
    None
}

/// True if `quarto` is resolvable in PowerShell (which loads the user's profile).
#[tauri::command]
pub fn find_quarto() -> bool {
    Command::new("pwsh")
        .args(["-NoLogo", "-Command", "if (Get-Command quarto -EA SilentlyContinue) { exit 0 } else { exit 1 }"])
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
}

/// The render command line from config `[quarto] command` ({file} = document path).
/// Default runs plain `quarto`; set it to activate a conda/venv that has Python so code
/// cells execute (e.g. `conda run -n myenv quarto render "{file}"`).
fn quarto_command(app: &tauri::AppHandle) -> String {
    let default = || "quarto render \"{file}\"".to_string();
    let Ok(dir) = crate::config::writedown_dir(app) else { return default() };
    let Ok(txt) = std::fs::read_to_string(dir.join("config.toml")) else { return default() };
    let Ok(val) = txt.parse::<toml::Value>() else { return default() };
    val.get("quarto")
        .and_then(|q| q.get("command"))
        .and_then(|v| v.as_str())
        .filter(|s| !s.trim().is_empty())
        .map(str::to_string)
        .unwrap_or_else(default)
}

/// Render a `.qmd`/`.md` with Quarto. Runs from the project root, streams each output line
/// to the frontend as a `quarto-log` event (live progress), and returns the full log plus
/// the produced output path (parsed from Quarto's "Output created:" line).
#[tauri::command]
pub fn render_with_quarto(app: tauri::AppHandle, path: String) -> Result<QuartoResult, String> {
    let file = Path::new(&path);
    let dir = file
        .parent()
        .ok_or_else(|| format!("no parent directory for {path}"))?;
    // Prefer the project root so project-relative resources resolve; else the file's dir.
    let root = project_root(file);
    let cwd = root.clone().unwrap_or_else(|| dir.to_path_buf());

    // Say up front which config governs this render — a nearby _quarto.yml silently
    // reshapes everything (title-prefix, css, includes, output-dir), so make it visible.
    let context = match &root {
        Some(r) => format!("[writedown] Quarto project: {}\\_quarto.yml", r.display()),
        None => format!("[writedown] standalone render (no _quarto.yml above file); cwd: {}", dir.display()),
    };
    let _ = app.emit("quarto-log", &context);

    let cmdline = quarto_command(&app).replace("{file}", &path);
    // Run through pwsh (the user's shell, so their profile/env is set up) via a temp
    // script — sidesteps all shell-quoting issues.
    let script = std::env::temp_dir().join("writedown-quarto-render.ps1");
    std::fs::write(&script, &cmdline).map_err(|e| format!("write render script: {e}"))?;
    let mut child = Command::new("pwsh")
        .args(["-NoLogo", "-ExecutionPolicy", "Bypass", "-File"])
        .arg(&script)
        .current_dir(&cwd)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("failed to run pwsh: {e}"))?;

    // Stream stdout + stderr line-by-line: emit each line and accumulate the full log.
    let log = Arc::new(Mutex::new(context + "\n"));
    let streams: [Option<Box<dyn Read + Send>>; 2] = [
        child.stdout.take().map(|s| Box::new(s) as Box<dyn Read + Send>),
        child.stderr.take().map(|s| Box::new(s) as Box<dyn Read + Send>),
    ];
    let mut handles = Vec::new();
    for stream in streams.into_iter().flatten() {
        let app = app.clone();
        let log = Arc::clone(&log);
        handles.push(thread::spawn(move || {
            for line in BufReader::new(stream).lines().map_while(Result::ok) {
                let _ = app.emit("quarto-log", &line);
                if let Ok(mut l) = log.lock() {
                    l.push_str(&line);
                    l.push('\n');
                }
            }
        }));
    }

    let status = child.wait().map_err(|e| format!("quarto wait failed: {e}"))?;
    for h in handles {
        let _ = h.join();
    }
    let log = Arc::try_unwrap(log)
        .ok()
        .and_then(|m| m.into_inner().ok())
        .unwrap_or_default();

    // Quarto prints "Output created: <path>" — the authoritative output location (honors
    // output-dir like `docs/`). Fall back to <stem>.html next to the source.
    let output_file = log
        .lines()
        .rev()
        .find_map(|l| l.trim().strip_prefix("Output created:"))
        .map(|p| {
            let p = p.trim();
            let pb = Path::new(p);
            if pb.is_absolute() { pb.to_path_buf() } else { cwd.join(p) }
        })
        .or_else(|| {
            file.file_stem()
                .and_then(|s| s.to_str())
                .map(|stem| dir.join(format!("{stem}.html")))
        })
        .filter(|p| p.exists())
        .map(|p| p.to_string_lossy().to_string());

    Ok(QuartoResult {
        success: status.success(),
        log,
        output_file,
    })
}
