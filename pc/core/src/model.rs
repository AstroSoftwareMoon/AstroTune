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
    /// "es" / "en"; empty until the person picks one in the welcome screen.
    pub lang: String,
    /// False until the welcome screen has been completed.
    pub onboarded: bool,
    /// Favourite artists chosen in the welcome screen. Stored only on this PC.
    pub artists: Vec<String>,
    /// Accent colour, as in the Android app ("#ff0aa0" = Astro pink).
    pub accent: String,
    /// True black surfaces, for OLED screens.
    pub pure_black: bool,
    /// Tint the player and the app from the playing cover.
    pub artwork_color: bool,
    /// Liquid glass on the dock and sheets.
    pub glass: bool,
}

impl Default for Settings {
    fn default() -> Self {
        Self { offline: false, guest: false, history_days: 0, volume: 0.8, lang: String::new(), onboarded: false, artists: Vec::new(), accent: "#ff0aa0".into(), pure_black: true, artwork_color: true, glass: true }
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

/// An album, playlist or artist tile, as shown on shelves.
#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq)]
pub struct Card {
    pub kind: String,
    pub id: String,
    pub title: String,
    pub subtitle: String,
    pub cover: Option<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct Shelf {
    pub title: String,
    pub cards: Vec<Card>,
    pub tracks: Vec<Track>,
}

/// An artist, album or remote playlist page.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct Page {
    pub kind: String,
    pub id: String,
    pub title: String,
    pub subtitle: String,
    pub cover: Option<String>,
    pub description: Option<String>,
    pub tracks: Vec<Track>,
    pub shelves: Vec<Shelf>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct Mood {
    pub id: String,
    pub name: String,
    pub color: String,
    pub is_mood: bool,
}
