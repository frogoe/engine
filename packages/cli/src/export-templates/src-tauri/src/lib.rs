// The frogoe shell: a window onto the game artifact, nothing more.
// `mobile_entry_point` is declared from day one so `tauri ios/android
// init` can attach to this same project without template changes.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
