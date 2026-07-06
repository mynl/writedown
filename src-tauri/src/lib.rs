mod config;
mod files;
mod session;
mod sublime;
mod watch;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(watch::WatchState::default())
        .setup(|app| {
            if let Err(e) = config::ensure_setup(&app.handle()) {
                eprintln!("writedown: setup failed: {e}");
            }
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
            session::load_session,
            session::save_session,
            session::load_last_workspace,
            session::save_last_workspace,
            sublime::load_sublime_theme,
            watch::watch_workspace,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
