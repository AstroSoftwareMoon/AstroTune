// AstroTune (PC and Android, Rust). A small Rust shell around a local web interface: the window can only call the
// commands below, it has no network access of its own (see the CSP in tauri.conf.json), and nothing
// is sent anywhere except the music requests made by astrotune-core.
use std::{
    fs,
    path::PathBuf,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    },
};

use astrotune_core::{
    model::{AppState as LibState, Settings, Track},
    net::Net,
    privacy::{Conn, ConnLog},
    store::Store,
};
use tauri::{AppHandle, Manager, State};

mod audio;

struct App {
    store: Arc<Store>,
    net: Arc<Net>,
    log: Arc<ConnLog>,
    offline: Arc<AtomicBool>,
    audio: audio::Player,
    cache: PathBuf,
}

/// Keeps the audio cache small: the 40 most recent tracks stay, so replays work even offline.
fn trim_cache(dir: &PathBuf) {
    let Ok(rd) = fs::read_dir(dir) else { return };
    let mut files: Vec<_> = rd
        .filter_map(|e| e.ok())
        .filter_map(|e| Some((e.metadata().ok()?.modified().ok()?, e.path())))
        .collect();
    files.sort_by(|a, b| b.0.cmp(&a.0));
    for (_, p) in files.into_iter().skip(40) {
        let _ = fs::remove_file(p);
    }
}

#[tauri::command]
async fn search(app: State<'_, App>, query: String) -> Result<Vec<Track>, String> {
    app.net.search(&query).await
}

async fn ensure_audio(app: &App, track: &Track) -> Result<PathBuf, String> {
    let safe: String = track.id.chars().filter(|c| c.is_ascii_alphanumeric() || *c == '_' || *c == '-').collect();
    let path = app.cache.join(format!("{safe}.m4a"));
    if !path.exists() {
        let _ = fs::create_dir_all(&app.cache);
        let part = app.cache.join(format!("{safe}.part.m4a"));
        app.net.fetch_audio(&track.id, &part).await?;
        fs::rename(&part, &path).map_err(|e| e.to_string())?;
        trim_cache(&app.cache);
    }
    app.store.record_play(track);
    Ok(path)
}

/// Desktop: download (or reuse the cached file) and play it through the native audio thread.
#[tauri::command]
async fn play(app: State<'_, App>, track: Track) -> Result<(), String> {
    let path = ensure_audio(&app, &track).await?;
    app.audio.play(path);
    Ok(())
}

/// Mobile: download (or reuse the cached file) and hand back its path; the web view plays it.
#[tauri::command]
async fn fetch_track(app: State<'_, App>, track: Track) -> Result<String, String> {
    let path = ensure_audio(&app, &track).await?;
    Ok(path.to_string_lossy().into_owned())
}

#[tauri::command]
fn pause(app: State<'_, App>) {
    app.audio.pause();
}

#[tauri::command]
fn resume(app: State<'_, App>) {
    app.audio.resume();
}

#[tauri::command]
fn seek(app: State<'_, App>, seconds: f64) {
    app.audio.seek(seconds);
}

#[tauri::command]
fn set_volume(app: State<'_, App>, volume: f32) {
    app.audio.volume(volume);
    let mut s = app.store.settings();
    s.volume = volume;
    app.store.set_settings(s);
}

#[tauri::command]
async fn lyrics(app: State<'_, App>, id: String) -> Result<Option<String>, String> {
    app.net.lyrics(&id).await
}

#[tauri::command]
async fn import_playlist(app: State<'_, App>, link: String) -> Result<LibState, String> {
    let (name, tracks) = app.net.playlist(&link).await?;
    app.store.create_playlist(name, tracks);
    Ok(app.store.state())
}

#[tauri::command]
fn get_state(app: State<'_, App>) -> LibState {
    app.store.state()
}

#[tauri::command]
fn toggle_favorite(app: State<'_, App>, track: Track) -> LibState {
    app.store.toggle_favorite(track);
    app.store.state()
}

#[tauri::command]
fn create_playlist(app: State<'_, App>, name: String) -> LibState {
    app.store.create_playlist(name, vec![]);
    app.store.state()
}

#[tauri::command]
fn delete_playlist(app: State<'_, App>, id: String) -> LibState {
    app.store.delete_playlist(&id);
    app.store.state()
}

#[tauri::command]
fn add_to_playlist(app: State<'_, App>, id: String, track: Track) -> LibState {
    app.store.add_to_playlist(&id, track);
    app.store.state()
}

#[tauri::command]
fn remove_from_playlist(app: State<'_, App>, id: String, track_id: String) -> LibState {
    app.store.remove_from_playlist(&id, &track_id);
    app.store.state()
}

#[tauri::command]
fn set_settings(app: State<'_, App>, settings: Settings) -> LibState {
    app.offline.store(settings.offline, Ordering::Relaxed);
    app.store.set_settings(settings);
    app.store.state()
}

#[tauri::command]
fn clear_history(app: State<'_, App>) -> LibState {
    app.store.clear_history();
    app.store.state()
}

#[tauri::command]
fn connections(app: State<'_, App>) -> Vec<Conn> {
    app.log.list()
}

#[tauri::command]
fn erase_all(app: State<'_, App>, handle: AppHandle) {
    app.store.erase_all();
    let _ = fs::remove_dir_all(&app.cache);
    handle.exit(0);
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|tauri_app| {
            let data = tauri_app.path().app_data_dir()?;
            let cache = tauri_app.path().app_cache_dir()?;
            let store = Arc::new(Store::open(data));
            let settings = store.settings();
            let offline = Arc::new(AtomicBool::new(settings.offline));
            let log = Arc::new(ConnLog::default());
            let net = Arc::new(
                Net::new(cache.join("client"), log.clone(), offline.clone()).map_err(|e| -> Box<dyn std::error::Error> { e.into() })?,
            );
            let audio = audio::Player::new(tauri_app.handle().clone(), settings.volume);
            tauri_app.manage(App { store, net, log, offline, audio, cache: cache.join("audio") });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            search,
            play,
            fetch_track,
            pause,
            resume,
            seek,
            set_volume,
            lyrics,
            import_playlist,
            get_state,
            toggle_favorite,
            create_playlist,
            delete_playlist,
            add_to_playlist,
            remove_from_playlist,
            set_settings,
            clear_history,
            connections,
            erase_all
        ])
        .run(tauri::generate_context!())
        .expect("error while running AstroTune");
}
