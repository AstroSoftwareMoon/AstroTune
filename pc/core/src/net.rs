use std::{
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    },
};

use rustypipe::{
    client::RustyPipe,
    model::{AudioFormat, Thumbnail, TrackItem},
    param::StreamFilter,
};
use rustypipe_downloader::Downloader;

use crate::{model::Track, privacy::ConnLog};

/// The one place AstroTune talks to the internet: YouTube Music, for search, playlists,
/// lyrics and the audio itself. It sends no account, no identifier of its own and no
/// telemetry, and it refuses to do anything in offline mode.
pub struct Net {
    rp: RustyPipe,
    dl: Downloader,
    log: Arc<ConnLog>,
    offline: Arc<AtomicBool>,
}

fn err<E: std::fmt::Display>(e: E) -> String {
    e.to_string()
}

fn upscale(url: &str) -> String {
    // Google image hosts take the size in the address: ask for a sharp square.
    if let Some(i) = url.rfind("=w") {
        if url[i..].contains("-h") {
            return format!("{}=w1200-h1200-l90-rj", &url[..i]);
        }
    }
    url.to_string()
}

fn best_cover(v: &[Thumbnail]) -> Option<String> {
    v.iter().max_by_key(|t| t.width).map(|t| upscale(&t.url))
}

fn to_track(t: &TrackItem) -> Track {
    Track {
        id: t.id.clone(),
        title: t.name.clone(),
        artist: t.artists.iter().map(|a| a.name.as_str()).collect::<Vec<_>>().join(", "),
        album: t.album.as_ref().map(|a| a.name.clone()),
        duration: t.duration.unwrap_or(0),
        cover: best_cover(&t.cover),
    }
}

/// The playlist id from a pasted link (`...list=ID`) or the id itself.
pub fn playlist_id(input: &str) -> Option<String> {
    let s = input.trim();
    if let Some(i) = s.find("list=") {
        let id: String = s[i + 5..].chars().take_while(|c| c.is_ascii_alphanumeric() || *c == '_' || *c == '-').collect();
        return if id.is_empty() { None } else { Some(id) };
    }
    if !s.is_empty() && s.chars().all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-') {
        return Some(s.to_string());
    }
    None
}

impl Net {
    pub fn new(cache_dir: PathBuf, log: Arc<ConnLog>, offline: Arc<AtomicBool>) -> Result<Self, String> {
        let rp = RustyPipe::builder().storage_dir(cache_dir).build().map_err(err)?;
        let dl = Downloader::new(&rp);
        Ok(Self { rp, dl, log, offline })
    }

    fn online(&self) -> Result<(), String> {
        if self.offline.load(Ordering::Relaxed) {
            Err("offline".to_string())
        } else {
            Ok(())
        }
    }

    pub async fn search(&self, query: &str) -> Result<Vec<Track>, String> {
        self.online()?;
        self.log.note("music.youtube.com");
        let r = self.rp.query().music_search_tracks(query).await.map_err(err)?;
        Ok(r.items.items.iter().map(to_track).collect())
    }

    pub async fn playlist(&self, input: &str) -> Result<(String, Vec<Track>), String> {
        self.online()?;
        let id = playlist_id(input).ok_or_else(|| "bad-link".to_string())?;
        self.log.note("music.youtube.com");
        let mut p = self.rp.query().music_playlist(&id).await.map_err(err)?;
        let _ = p.tracks.extend_limit(&self.rp.query(), 500).await;
        Ok((p.name.clone(), p.tracks.items.iter().map(to_track).collect()))
    }

    pub async fn lyrics(&self, video_id: &str) -> Result<Option<String>, String> {
        self.online()?;
        self.log.note("music.youtube.com");
        let d = self.rp.query().music_details(video_id).await.map_err(err)?;
        match d.lyrics_id {
            Some(id) => Ok(Some(self.rp.query().music_lyrics(id).await.map_err(err)?.body)),
            None => Ok(None),
        }
    }

    /// Downloads the track's audio (AAC in an .m4a) to `dest`.
    pub async fn fetch_audio(&self, video_id: &str, dest: &Path) -> Result<(), String> {
        self.online()?;
        self.log.note("music.youtube.com");
        self.log.note("googlevideo.com");
        let filter = StreamFilter::new().no_video().audio_formats(vec![AudioFormat::M4a]);
        self.dl
            .id(video_id)
            .to_file(dest)
            .stream_filter(filter)
            .download()
            .await
            .map_err(err)?;
        Ok(())
    }
}
