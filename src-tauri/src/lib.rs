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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
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
            files::list_all_files,
            files::read_file,
            files::write_file,
            files::create_file,
            files::create_directory,
            files::rename_path,
            files::delete_path,
            external::open_external,
            external::open_shell,
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
