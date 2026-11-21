//! Audio output. On desktop a dedicated thread owns the output device (rodio). On Android the web
//! view plays the cached file itself (see `fetch_track`), so this is a no-op there.
#[cfg(not(target_os = "android"))]
mod imp {
    use std::{fs::File, io::BufReader, path::PathBuf, sync::{mpsc, Mutex}, time::Duration};
    use serde::Serialize;
    use tauri::{AppHandle, Emitter};

    enum Audio {
        Play(PathBuf),
        Pause,
        Resume,
        Seek(f64),
        Volume(f32),
    }

    #[derive(Clone, Serialize)]
    struct Tick {
        pos: f64,
        paused: bool,
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

    pub struct Player(Mutex<mpsc::Sender<Audio>>);

    impl Player {
        pub fn new(handle: AppHandle, volume: f32) -> Self {
            let (tx, rx) = mpsc::channel();
            std::thread::spawn(move || audio_thread(rx, handle, volume));
            Player(Mutex::new(tx))
        }
        fn send(&self, cmd: Audio) {
            if let Ok(tx) = self.0.lock() {
                let _ = tx.send(cmd);
            }
        }
        pub fn play(&self, path: PathBuf) { self.send(Audio::Play(path)) }
        pub fn pause(&self) { self.send(Audio::Pause) }
        pub fn resume(&self) { self.send(Audio::Resume) }
        pub fn seek(&self, s: f64) { self.send(Audio::Seek(s)) }
        pub fn volume(&self, v: f32) { self.send(Audio::Volume(v)) }
    }
}

#[cfg(target_os = "android")]
mod imp {
    use std::path::PathBuf;
    use tauri::AppHandle;

    pub struct Player;

    impl Player {
        pub fn new(_handle: AppHandle, _volume: f32) -> Self { Player }
        pub fn play(&self, _path: PathBuf) {}
        pub fn pause(&self) {}
        pub fn resume(&self) {}
        pub fn seek(&self, _s: f64) {}
        pub fn volume(&self, _v: f32) {}
    }
}

pub use imp::Player;
