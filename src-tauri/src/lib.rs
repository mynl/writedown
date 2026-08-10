mod backup;
mod bib;
mod check;
mod config;
mod external;
mod files;
mod project;
mod render;
mod session;
mod spelling;
mod sublime;
mod watch;
mod wordfreq;

/// Paths Writedown was launched with — double-clicked in Explorer once the installer has
/// registered the file types, or passed on the command line (issues A.03, D.02). Collected
/// at startup and handed to the frontend once, AFTER session restore, so a launched file
/// ends up as the active tab rather than being buried by the restored session.
#[derive(Default)]
struct LaunchArgs(std::sync::Mutex<Vec<String>>);

/// Take (and clear) the launch path list. Idempotent: a second call returns nothing, so a
/// hot reload during development can't reopen the same files again.
#[tauri::command]
fn launch_files(state: tauri::State<LaunchArgs>) -> Vec<String> {
    state.0.lock().map(|mut v| std::mem::take(&mut *v)).unwrap_or_default()
}

/// What the command line asked for (issue D.02).
#[derive(Debug, PartialEq)]
enum Cli {
    /// Open these path candidates (existence is checked separately, so this stays pure).
    Open(Vec<String>),
    Version,
    Help,
}

/// Parse the arguments after argv[0]. Pure — no filesystem, no exits — so it is testable.
///
/// Unknown flags are ignored rather than rejected: WebView2 and Tauri both inject their
/// own switches, and refusing to start over one would be a terrible trade. `--` ends option
/// parsing, so a file genuinely named `-notes.md` is still reachable.
fn parse_args<I: IntoIterator<Item = String>>(args: I) -> Cli {
    let mut paths = Vec::new();
    let mut literal = false;
    for a in args {
        if literal {
            paths.push(a);
            continue;
        }
        match a.as_str() {
            "--" => literal = true,
            "--version" | "-V" => return Cli::Version,
            "--help" | "-h" | "-?" | "/?" => return Cli::Help,
            _ if a.starts_with('-') => {} // someone else's switch; not ours to judge
            _ => paths.push(a),
        }
    }
    Cli::Open(paths)
}

/// Keep the candidates that exist — files **and directories** (D.02: a directory argument
/// used to be silently dropped by an `is_file()` filter, so `writedown C:\docs` opened an
/// empty window with no explanation).
fn existing_paths(candidates: Vec<String>) -> Vec<String> {
    candidates
        .into_iter()
        .filter(|a| std::path::Path::new(a).exists())
        .collect()
}

const HELP_TEXT: &str = "\
Writedown — a fast, local, predictable Markdown and Quarto editor.

USAGE:
    writedown [OPTIONS] [PATH]...

ARGS:
    PATH...    Files to open as tabs, and/or a folder to open in the sidebar.
               A folder joins the current project if one is open, otherwise it
               becomes the Folder-tab root.

OPTIONS:
    -h, --help       Print this help and exit
    -V, --version    Print the version and exit
    --               Treat every remaining argument as a path

Each invocation opens a NEW window; Writedown does not hand files to a running
instance. Running several at once is supported and expected.
";

/// Attach to the launching terminal's console so `--version` / `--help` have somewhere to
/// print (issue D.02).
///
/// Release builds set `windows_subsystem = "windows"` (main.rs) — a GUI process with no
/// console, where `println!` goes nowhere. `AttachConsole(ATTACH_PARENT_PROCESS)` borrows
/// the parent shell's. Failure is not an error: it means either no parent console, or
/// output is redirected to a file (`writedown --version > v.txt`), and in the redirected
/// case the handle is already valid.
///
/// Known and unavoidable: the shell does not WAIT for a GUI process, so the prompt returns
/// before this text lands. Fixing that properly needs a separate console shim (`subl.exe`
/// solves it the same way).
#[cfg(windows)]
fn attach_parent_console() {
    #[link(name = "kernel32")]
    extern "system" {
        fn AttachConsole(dw_process_id: u32) -> i32;
    }
    const ATTACH_PARENT_PROCESS: u32 = u32::MAX; // (DWORD)-1
    unsafe {
        AttachConsole(ATTACH_PARENT_PROCESS);
    }
}

#[cfg(not(windows))]
fn attach_parent_console() {}

/// Handle `--version` / `--help` and exit before any window exists; otherwise return the
/// paths to open.
fn cli_paths_or_exit() -> Vec<String> {
    match parse_args(std::env::args().skip(1)) {
        Cli::Open(paths) => existing_paths(paths),
        Cli::Version => {
            attach_parent_console();
            println!("writedown {}", env!("CARGO_PKG_VERSION"));
            std::process::exit(0);
        }
        Cli::Help => {
            attach_parent_console();
            print!("{HELP_TEXT}");
            std::process::exit(0);
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // First thing, before any window or plugin exists: --version / --help print and exit.
    let launch_paths = cli_paths_or_exit();
    tauri::Builder::default()
        .manage(LaunchArgs(std::sync::Mutex::new(launch_paths)))
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        // Remembers window position/size/maximized between launches (~/.writedown-adjacent
        // app data; pane widths live in the per-workspace session instead).
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .manage(watch::WatchState::default())
        .manage(watch::ExtraWatchState::default())
        .manage(bib::BibState::default())
        .manage(render::RenderState::default())
        .manage(spelling::SpellState::default())
        .setup(|app| {
            if let Err(e) = config::ensure_setup(&app.handle()) {
                eprintln!("writedown: setup failed: {e}");
            }
            // Index the BibTeX database off the main thread (7k entries take a moment).
            let handle = app.handle().clone();
            std::thread::spawn(move || {
                if let Err(e) = bib::reload(&handle) {
                    eprintln!("writedown: bibliography load failed: {e}");
                }
            });
            // Parse the spell dictionary + load personal words off-thread too (independent
            // of the bib load, so neither waits on the other).
            let sp_handle = app.handle().clone();
            std::thread::spawn(move || spelling::warm(&sp_handle));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            files::list_directory,
            files::list_directories,
            files::list_all_files,
            files::read_file,
            files::write_file,
            files::file_stamp,
            files::create_file,
            files::create_directory,
            files::rename_path,
            files::delete_path,
            files::stat_paths,
            files::save_pasted_image,
            launch_files,
            external::open_external,
            external::open_default,
            external::open_shell,
            external::run_build,
            backup::list_backups,
            backup::read_backup,
            config::load_config,
            config::config_path,
            config::help_path,
            config::load_editor_settings,
            config::log_error,
            session::load_session,
            session::save_session,
            session::load_global_state,
            session::save_last_workspace,
            session::save_folder_state,
            sublime::load_sublime_theme,
            watch::watch_workspace,
            watch::watch_extra_files,
            bib::load_bibliography,
            bib::search_bibliography,
            bib::get_citation,
            bib::check_citation_keys,
            check::check_document,
            spelling::spell_check,
            spelling::add_to_dictionary,
            spelling::spell_reload,
            spelling::personal_dictionary_path,
            render::render_document,
            render::run_cell,
            render::restart_kernel,
            bib::extract_bib_entries,
            project::load_project,
            project::save_project,
            project::save_managed_project,
            project::new_project,
            project::delete_project,
            project::list_projects,
            project::recent_projects,
            project::add_recent_project,
            wordfreq::word_freq_load,
            wordfreq::word_freq_save,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|handle, event| {
            // Kill the python kernel on exit (its stdin-EOF self-exit is the backstop).
            if matches!(event, tauri::RunEvent::Exit) {
                render::shutdown_kernel(handle);
            }
        });
}

#[cfg(test)]
mod tests {
    use super::*;

    fn args(v: &[&str]) -> Vec<String> {
        v.iter().map(|s| s.to_string()).collect()
    }

    #[test]
    fn plain_paths_are_collected() {
        assert_eq!(
            parse_args(args(&["a.md", "C:/docs"])),
            Cli::Open(args(&["a.md", "C:/docs"]))
        );
    }

    #[test]
    fn version_and_help_win_over_paths() {
        assert_eq!(parse_args(args(&["a.md", "--version"])), Cli::Version);
        assert_eq!(parse_args(args(&["-V"])), Cli::Version);
        assert_eq!(parse_args(args(&["--help"])), Cli::Help);
        assert_eq!(parse_args(args(&["-h"])), Cli::Help);
        assert_eq!(parse_args(args(&["-?"])), Cli::Help);
    }

    #[test]
    fn foreign_switches_are_ignored_not_fatal() {
        // WebView2 and Tauri inject their own; refusing to start over one would be awful.
        assert_eq!(
            parse_args(args(&["--webview-flag=1", "a.md", "-Xsomething"])),
            Cli::Open(args(&["a.md"]))
        );
    }

    #[test]
    fn double_dash_makes_everything_a_path() {
        assert_eq!(
            parse_args(args(&["--", "-notes.md", "--version"])),
            Cli::Open(args(&["-notes.md", "--version"]))
        );
    }

    #[test]
    fn existing_paths_keeps_directories() {
        // The D.02 bug: an is_file() filter dropped folders on the floor.
        let dir = std::env::temp_dir();
        let file = dir.join(format!("writedown-cli-{}.md", std::process::id()));
        std::fs::write(&file, "x").unwrap();
        let kept = existing_paths(args(&[
            &dir.to_string_lossy(),
            &file.to_string_lossy(),
            "C:/definitely/not/here.md",
        ]));
        assert_eq!(kept.len(), 2, "folder and file kept, missing path dropped");
        let _ = std::fs::remove_file(&file);
    }
}
