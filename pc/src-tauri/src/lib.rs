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
    model::{AppState as LibState, Card, Mood, Page, Settings, Track},
    net::Net,
    privacy::{Conn, ConnLog},
    store::Store,
};
use tauri::{AppHandle, Manager, State};

mod audio;
mod cast;
mod server;

struct App {
    store: Arc<Store>,
    net: Arc<Net>,
    log: Arc<ConnLog>,
    offline: Arc<AtomicBool>,
    audio: audio::Player,
    cache: PathBuf,
    hub: Arc<server::Hub>,
    cast: std::sync::Mutex<Option<cast::Session>>,
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
async fn search_artists(app: State<'_, App>, query: String) -> Result<Vec<Card>, String> { app.net.search_artists(&query).await }
#[tauri::command]
async fn search_albums(app: State<'_, App>, query: String) -> Result<Vec<Card>, String> { app.net.search_albums(&query).await }
#[tauri::command]
async fn artist(app: State<'_, App>, id: String) -> Result<Page, String> { app.net.artist(&id).await }
#[tauri::command]
async fn album(app: State<'_, App>, id: String) -> Result<Page, String> { app.net.album(&id).await }
#[tauri::command]
async fn remote_playlist(app: State<'_, App>, id: String) -> Result<Page, String> { app.net.remote_playlist(&id).await }
#[tauri::command]
async fn radio(app: State<'_, App>, id: String) -> Result<Vec<Track>, String> { app.net.radio(&id).await }
#[tauri::command]
async fn new_albums(app: State<'_, App>) -> Result<Vec<Card>, String> { app.net.new_albums().await }
#[tauri::command]
async fn charts(app: State<'_, App>) -> Result<Page, String> { app.net.charts().await }
#[tauri::command]
async fn moods(app: State<'_, App>) -> Result<Vec<Mood>, String> { app.net.moods().await }
#[tauri::command]
async fn mood(app: State<'_, App>, id: String) -> Result<Page, String> { app.net.mood(&id).await }

#[derive(serde::Serialize)]
struct Source {
    kind: &'static str,
    src: String,
    mime: String,
}

fn cached_file(app: &App, id: &str) -> PathBuf {
    let safe: String = id.chars().filter(|c| c.is_ascii_alphanumeric() || *c == '_' || *c == '-').collect();
    app.cache.join(format!("{safe}.m4a"))
}

async fn lookup(app: &App, id: &str) -> Result<Source, String> {
    let file = cached_file(app, id);
    if file.exists() {
        return Ok(Source { kind: "file", src: file.to_string_lossy().into_owned(), mime: "audio/mp4".into() });
    }
    // Look the stream up now (so the first byte comes fast), then hand the window our local address for it.
    let s = app.hub.stream(id, false).await?;
    Ok(Source { kind: "url", src: app.hub.local_url(id), mime: s.mime })
}

/// Where to play a track from: the local copy if there is one, otherwise a direct stream.
/// Records the play in the history.
#[tauri::command]
async fn resolve(app: State<'_, App>, track: Track) -> Result<Source, String> {
    let s = lookup(&app, &track.id).await?;
    app.store.record_play(&track);
    Ok(s)
}

/// Looks the next track up ahead of time, so it starts without waiting.
#[tauri::command]
async fn prefetch(app: State<'_, App>, id: String) -> Result<(), String> {
    lookup(&app, &id).await.map(|_| ())
}

/// Keeps a copy of a streamed track for offline listening (desktop only, where data isn't metered).
#[tauri::command]
async fn keep(app: State<'_, App>, track: Track) -> Result<(), String> {
    if cfg!(target_os = "android") || cached_file(&app, &track.id).exists() {
        return Ok(());
    }
    let safe: String = track.id.chars().filter(|c| c.is_ascii_alphanumeric() || *c == '_' || *c == '-').collect();
    let _ = fs::create_dir_all(&app.cache);
    let part = app.cache.join(format!("{safe}.part.m4a"));
    app.net.fetch_audio(&track.id, &part).await?;
    fs::rename(&part, cached_file(&app, &track.id)).map_err(|e| e.to_string())?;
    trim_cache(&app.cache);
    Ok(())
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


/// Where the native Android player fetches songs from (AstroTune's own server, 127.0.0.1 only).
#[tauri::command]
fn local_base(app: State<'_, App>) -> String {
    format!("http://127.0.0.1:{}/a/{}/", app.hub.local_port.lock().unwrap(), app.hub.token)
}

/// Notes a song in the history (when the native player moved on by itself).
#[tauri::command]
fn record(app: State<'_, App>, track: Track) {
    app.store.record_play(&track);
}

// ------------------------------------------------------------------ phone remote

#[derive(serde::Serialize)]
struct RemoteInfo {
    url: String,
    qr: String,
}

/// Turns on "Connect your phone": a page on this computer, on the local network only, behind a random token.
#[tauri::command]
fn remote_on(app: State<'_, App>) -> Result<RemoteInfo, String> {
    let port = app.hub.lan_on()?;
    let ip = server::lan_ip().ok_or("no-network")?;
    let url = format!("http://{ip}:{port}/r/{}", app.hub.lan_token);
    let qr = qrcode::QrCode::new(url.as_bytes()).map_err(|e| e.to_string())?;
    let svg = qr.render::<qrcode::render::svg::Color>().min_dimensions(240, 240).dark_color(qrcode::render::svg::Color("#000")).light_color(qrcode::render::svg::Color("#fff")).build();
    Ok(RemoteInfo { url, qr: svg })
}

#[tauri::command]
fn remote_off(app: State<'_, App>) {
    if app.cast.lock().unwrap().is_none() {
        app.hub.lan_off();
    }
}

/// What the phone remote shows: the window pushes it whenever it changes.
#[tauri::command]
fn remote_state(app: State<'_, App>, state: serde_json::Value) {
    *app.hub.remote_state.lock().unwrap() = state;
}

// ------------------------------------------------------------------ casting

#[tauri::command]
async fn cast_discover() -> Result<Vec<cast::Device>, String> {
    tauri::async_runtime::spawn_blocking(|| cast::discover(std::time::Duration::from_secs(3))).await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn cast_connect(app: State<'_, App>, handle: AppHandle, device: cast::Device) -> Result<(), String> {
    if let Some(old) = app.cast.lock().unwrap().take() {
        old.send(cast::Cmd::Stop);
    }
    app.hub.lan_on()?;
    let s = tauri::async_runtime::spawn_blocking(move || cast::connect(device, handle)).await.map_err(|e| e.to_string())??;
    *app.cast.lock().unwrap() = Some(s);
    Ok(())
}

#[tauri::command]
async fn cast_load(app: State<'_, App>, track: Track, start: f64) -> Result<(), String> {
    let s = if cached_file(&app, &track.id).exists() { None } else { Some(app.hub.stream(&track.id, false).await?) };
    let url = app.hub.lan_media_url(&track.id)?;
    let mime = s.map(|s| s.mime).unwrap_or_else(|| "audio/mp4".into());
    app.store.record_play(&track);
    let m = cast::Media { url, mime, title: track.title.clone(), artist: track.artist.clone(), cover: track.cover.clone(), duration: track.duration as f64, start };
    match &*app.cast.lock().unwrap() {
        Some(s) => {
            s.send(cast::Cmd::Load(m));
            Ok(())
        }
        None => Err("no-cast".into()),
    }
}

#[tauri::command]
fn cast_cmd(app: State<'_, App>, cmd: String, value: Option<f64>) {
    let c = match cmd.as_str() {
        "play" => cast::Cmd::Play,
        "pause" => cast::Cmd::Pause,
        "seek" => cast::Cmd::Seek(value.unwrap_or(0.0)),
        "volume" => cast::Cmd::Volume(value.unwrap_or(0.5) as f32),
        _ => return,
    };
    if let Some(s) = &*app.cast.lock().unwrap() {
        s.send(c);
    }
}

#[tauri::command]
fn cast_stop(app: State<'_, App>) {
    if let Some(s) = app.cast.lock().unwrap().take() {
        s.send(cast::Cmd::Stop);
    }
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
            let hub = server::Hub::new(net.clone(), cache.join("audio"), tauri_app.handle().clone());
            tauri_app.manage(App { store, net, log, offline, audio, cache: cache.join("audio"), hub, cast: Default::default() });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            search,
            play,
            fetch_track,
            resolve,
            prefetch,
            keep,
            remote_on,
            local_base,
            record,
            remote_off,
            remote_state,
            cast_discover,
            cast_connect,
            cast_load,
            cast_cmd,
            cast_stop,
            search_artists,
            search_albums,
            artist,
            album,
            remote_playlist,
            radio,
            new_albums,
            charts,
            moods,
            mood,
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
