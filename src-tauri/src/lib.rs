mod config;
mod files;
mod session;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            if let Err(e) = config::ensure_setup(&app.handle()) {
                eprintln!("writedown: setup failed: {e}");
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            files::list_directory,
            files::read_file,
            files::write_file,
            config::load_config,
            session::load_session,
            session::save_session,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
