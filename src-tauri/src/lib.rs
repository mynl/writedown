mod bib;
mod config;
mod files;
mod quarto;
mod session;
mod sublime;
mod watch;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(watch::WatchState::default())
        .manage(bib::BibState::default())
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
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            files::list_directory,
            files::list_all_files,
            files::read_file,
            files::write_file,
            config::load_config,
            config::config_path,
            config::load_editor_settings,
            config::log_error,
            session::load_session,
            session::save_session,
            session::load_last_workspace,
            session::save_last_workspace,
            sublime::load_sublime_theme,
            watch::watch_workspace,
            bib::load_bibliography,
            bib::search_bibliography,
            bib::get_citation,
            quarto::find_quarto,
            quarto::render_with_quarto,
            quarto::open_output,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
