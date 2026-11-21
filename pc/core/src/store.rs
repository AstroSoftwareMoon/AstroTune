use std::{
    fs, io,
    path::PathBuf,
    sync::Mutex,
};

use crate::model::*;

const MAX_HISTORY: usize = 3000;

/// The user's settings and library, as two small JSON files in the app's own data folder.
pub struct Store {
    dir: PathBuf,
    settings: Mutex<Settings>,
    library: Mutex<Library>,
}

impl Store {
    pub fn open(dir: PathBuf) -> Self {
        let _ = fs::create_dir_all(&dir);
        let settings = fs::read(dir.join("settings.json"))
            .ok()
            .and_then(|b| serde_json::from_slice(&b).ok())
            .unwrap_or_default();
        let library = fs::read(dir.join("library.json"))
            .ok()
            .and_then(|b| serde_json::from_slice(&b).ok())
            .unwrap_or_default();
        let s = Self { dir, settings: Mutex::new(settings), library: Mutex::new(library) };
        s.prune();
        s
    }

    fn write_atomic(&self, name: &str, bytes: &[u8]) -> io::Result<()> {
        let tmp = self.dir.join(format!("{name}.tmp"));
        fs::write(&tmp, bytes)?;
        fs::rename(&tmp, self.dir.join(name))
    }

    fn save_settings(&self, s: &Settings) {
        if let Ok(b) = serde_json::to_vec_pretty(s) {
            let _ = self.write_atomic("settings.json", &b);
        }
    }

    fn save_library(&self, l: &Library) {
        if let Ok(b) = serde_json::to_vec(l) {
            let _ = self.write_atomic("library.json", &b);
        }
    }

    pub fn settings(&self) -> Settings {
        self.settings.lock().map(|s| s.clone()).unwrap_or_default()
    }

    pub fn library(&self) -> Library {
        self.library.lock().map(|l| l.clone()).unwrap_or_default()
    }

    pub fn state(&self) -> AppState {
        AppState { settings: self.settings(), library: self.library() }
    }

    pub fn set_settings(&self, new: Settings) {
        if let Ok(mut s) = self.settings.lock() {
            *s = new;
            self.save_settings(&s);
        }
        self.prune();
    }

    /// Drops history older than the chosen number of days.
    pub fn prune(&self) {
        let days = self.settings().history_days;
        if days == 0 {
            return;
        }
        let cutoff = now_ms() - days as i64 * 86_400_000;
        if let Ok(mut l) = self.library.lock() {
            let before = l.history.len();
            l.history.retain(|h| h.played_at >= cutoff);
            if l.history.len() != before {
                self.save_library(&l);
            }
        }
    }

    pub fn record_play(&self, t: &Track) {
        if self.settings().guest {
            return;
        }
        if let Ok(mut l) = self.library.lock() {
            l.history.insert(0, HistoryEntry { track: t.clone(), played_at: now_ms() });
            l.history.truncate(MAX_HISTORY);
            self.save_library(&l);
        }
    }

    pub fn clear_history(&self) {
        if let Ok(mut l) = self.library.lock() {
            l.history.clear();
            self.save_library(&l);
        }
    }

    /// Returns whether the track is now a favourite.
    pub fn toggle_favorite(&self, t: Track) -> bool {
        let mut now_fav = false;
        if let Ok(mut l) = self.library.lock() {
            if let Some(i) = l.favorites.iter().position(|x| x.id == t.id) {
                l.favorites.remove(i);
            } else {
                l.favorites.insert(0, t);
                now_fav = true;
            }
            self.save_library(&l);
        }
        now_fav
    }

    pub fn create_playlist(&self, name: String, tracks: Vec<Track>) -> Playlist {
        let p = Playlist { id: format!("pl{}", now_ms()), name, tracks };
        if let Ok(mut l) = self.library.lock() {
            l.playlists.push(p.clone());
            self.save_library(&l);
        }
        p
    }

    pub fn delete_playlist(&self, id: &str) {
        if let Ok(mut l) = self.library.lock() {
            l.playlists.retain(|p| p.id != id);
            self.save_library(&l);
        }
    }

    pub fn add_to_playlist(&self, id: &str, t: Track) {
        if let Ok(mut l) = self.library.lock() {
            if let Some(p) = l.playlists.iter_mut().find(|p| p.id == id) {
                if !p.tracks.iter().any(|x| x.id == t.id) {
                    p.tracks.push(t);
                }
            }
            self.save_library(&l);
        }
    }

    pub fn remove_from_playlist(&self, id: &str, track_id: &str) {
        if let Ok(mut l) = self.library.lock() {
            if let Some(p) = l.playlists.iter_mut().find(|p| p.id == id) {
                p.tracks.retain(|x| x.id != track_id);
            }
            self.save_library(&l);
        }
    }

    /// Deletes everything the app has saved and resets it in memory.
    pub fn erase_all(&self) {
        if let Ok(mut l) = self.library.lock() {
            *l = Library::default();
        }
        if let Ok(mut s) = self.settings.lock() {
            *s = Settings::default();
        }
        let _ = fs::remove_dir_all(&self.dir);
    }
}
