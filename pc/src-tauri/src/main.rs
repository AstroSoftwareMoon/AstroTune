// AstroTune for PC. A small Rust shell around a local web interface: the window can only call the
// commands below, it has no network access of its own (see the CSP in tauri.conf.json), and nothing
// is sent anywhere except the music requests made by astrotune-core.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::{
    fs::{self, File},
    io::BufReader,
    path::PathBuf,
    sync::{
        atomic::{AtomicBool, Ordering},
        mpsc, Arc, Mutex,
    },
    time::Duration,
};

use astrotune_core::{
    model::{AppState as LibState, Settings, Track},
    net::Net,
    privacy::{Conn, ConnLog},
    store::Store,
};
use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, State};

enum Audio {
    Play(PathBuf),
    Pause,
    Resume,
    Seek(f64),
    Volume(f32),
}

struct App {
    store: Arc<Store>,
    net: Arc<Net>,
    log: Arc<ConnLog>,
    offline: Arc<AtomicBool>,
    audio: Mutex<mpsc::Sender<Audio>>,
    cache: PathBuf,
}

#[derive(Clone, Serialize)]
struct Tick {
    pos: f64,
    paused: bool,
}

fn send(app: &App, cmd: Audio) {
    if let Ok(tx) = app.audio.lock() {
        let _ = tx.send(cmd);
    }
}

/// Audio runs on its own thread: the output device must stay on the thread that opened it.
fn audio_thread(rx: mpsc::Receiver<Audio>, handle: AppHandle, volume: f32) {
    let sink = match rodio::DeviceSinkBuilder::open_default_sink() {
        Ok(s) => s,
        Err(e) => {
            let _ = handle.emit("player-error", format!("No audio output: {e}"));
            while rx.recv().is_ok() {}
            return;
        }
    };
    let mut player: Option<rodio::Player> = None;
    let mut volume = volume;
    let mut ended_sent = true;
    loop {
        match rx.recv_timeout(Duration::from_millis(250)) {
            Ok(Audio::Play(path)) => {
                if let Some(p) = player.take() {
                    p.stop();
                }
                let p = rodio::Player::connect_new(sink.mixer());
                p.set_volume(volume);
                match File::open(&path)
                    .map_err(|e| e.to_string())
                    .and_then(|f| rodio::Decoder::new(BufReader::new(f)).map_err(|e| e.to_string()))
                {
                    Ok(dec) => {
                        p.append(dec);
                        player = Some(p);
                        ended_sent = false;
                    }
                    Err(e) => {
                        let _ = handle.emit("player-error", format!("Can't play this track: {e}"));
                    }
                }
            }
            Ok(Audio::Pause) => {
                if let Some(p) = &player {
                    p.pause();
                }
            }
            Ok(Audio::Resume) => {
                if let Some(p) = &player {
                    p.play();
                }
            }
            Ok(Audio::Seek(s)) => {
                if let Some(p) = &player {
                    let _ = p.try_seek(Duration::from_secs_f64(s.max(0.0)));
                }
            }
            Ok(Audio::Volume(v)) => {
                volume = v.clamp(0.0, 1.0);
                if let Some(p) = &player {
                    p.set_volume(volume);
                }
            }
            Err(mpsc::RecvTimeoutError::Timeout) => {}
            Err(mpsc::RecvTimeoutError::Disconnected) => break,
        }
        if let Some(p) = &player {
            let _ = handle.emit("player-tick", Tick { pos: p.get_pos().as_secs_f64(), paused: p.is_paused() });
            if p.empty() && !ended_sent {
                ended_sent = true;
                let _ = handle.emit("player-ended", ());
            }
        }
    }
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

#[tauri::command]
async fn play(app: State<'_, App>, track: Track) -> Result<(), String> {
    let safe: String = track.id.chars().filter(|c| c.is_ascii_alphanumeric() || *c == '_' || *c == '-').collect();
    let path = app.cache.join(format!("{safe}.m4a"));
    if !path.exists() {
        let _ = fs::create_dir_all(&app.cache);
        let part = app.cache.join(format!("{safe}.part.m4a"));
        app.net.fetch_audio(&track.id, &part).await?;
        fs::rename(&part, &path).map_err(|e| e.to_string())?;
        trim_cache(&app.cache);
    }
    app.store.record_play(&track);
    send(&app, Audio::Play(path));
    Ok(())
}

#[tauri::command]
fn pause(app: State<'_, App>) {
    send(&app, Audio::Pause);
}

#[tauri::command]
fn resume(app: State<'_, App>) {
    send(&app, Audio::Resume);
}

#[tauri::command]
fn seek(app: State<'_, App>, seconds: f64) {
    send(&app, Audio::Seek(seconds));
}

#[tauri::command]
fn set_volume(app: State<'_, App>, volume: f32) {
    send(&app, Audio::Volume(volume));
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

fn main() {
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
            let (tx, rx) = mpsc::channel();
            let handle = tauri_app.handle().clone();
            let volume = settings.volume;
            std::thread::spawn(move || audio_thread(rx, handle, volume));
            tauri_app.manage(App { store, net, log, offline, audio: Mutex::new(tx), cache: cache.join("audio") });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            search,
            play,
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
