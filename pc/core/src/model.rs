use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct Track {
    pub id: String,
    pub title: String,
    pub artist: String,
    #[serde(default)]
    pub album: Option<String>,
    /// Seconds.
    #[serde(default)]
    pub duration: u32,
    #[serde(default)]
    pub cover: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Playlist {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub tracks: Vec<Track>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct HistoryEntry {
    pub track: Track,
    /// Unix milliseconds.
    pub played_at: i64,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(default)]
pub struct Settings {
    /// Offline mode: no network request is made at all.
    pub offline: bool,
    /// Guest mode: nothing is added to the history.
    pub guest: bool,
    /// Days of history kept; 0 keeps everything.
    pub history_days: u32,
    pub volume: f32,
}

impl Default for Settings {
    fn default() -> Self {
        Self { offline: false, guest: false, history_days: 0, volume: 0.8 }
    }
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(default)]
pub struct Library {
    pub favorites: Vec<Track>,
    pub playlists: Vec<Playlist>,
    pub history: Vec<HistoryEntry>,
}

#[derive(Clone, Debug, Serialize)]
pub struct AppState {
    pub settings: Settings,
    pub library: Library,
}

pub fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}
