use std::{
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    },
};

use rustypipe::{
    client::RustyPipe,
    model::{AlbumItem, AlbumType, ArtistItem, AudioFormat, MusicPlaylistItem, Thumbnail, TrackItem},
    param::StreamFilter,
};

use crate::{
    model::{Card, Mood, Page, Shelf, Track},
    privacy::ConnLog,
};

/// The one place AstroTune talks to the internet: YouTube Music, for search, playlists,
/// lyrics and the audio itself. It sends no account, no identifier of its own and no
/// telemetry, and it refuses to do anything in offline mode.
pub struct Net {
    rp: RustyPipe,
    http: reqwest::Client,
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

fn album_card(a: &AlbumItem) -> Card {
    let kind = match a.album_type {
        AlbumType::Single => "Single",
        AlbumType::Ep => "EP",
        _ => "Album",
    };
    let by = a.artists.iter().map(|x| x.name.as_str()).collect::<Vec<_>>().join(", ");
    let sub = match (a.year, by.is_empty()) {
        (Some(y), false) => format!("{kind} · {by} · {y}"),
        (Some(y), true) => format!("{kind} · {y}"),
        (None, false) => format!("{kind} · {by}"),
        _ => kind.to_string(),
    };
    Card { kind: "album".into(), id: a.id.clone(), title: a.name.clone(), subtitle: sub, cover: best_cover(&a.cover) }
}

fn playlist_card(p: &MusicPlaylistItem) -> Card {
    let sub = p.channel.as_ref().map(|c| c.name.clone()).unwrap_or_default();
    Card { kind: "playlist".into(), id: p.id.clone(), title: p.name.clone(), subtitle: sub, cover: best_cover(&p.thumbnail) }
}

fn artist_card(a: &ArtistItem) -> Card {
    Card { kind: "artist".into(), id: a.id.clone(), title: a.name.clone(), subtitle: String::new(), cover: best_cover(&a.avatar) }
}

fn shelf(title: &str, cards: Vec<Card>, tracks: Vec<Track>) -> Option<Shelf> {
    if cards.is_empty() && tracks.is_empty() {
        None
    } else {
        Some(Shelf { title: title.into(), cards, tracks })
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
        let http = reqwest::Client::builder()
            .connect_timeout(std::time::Duration::from_secs(10))
            .build()
            .map_err(err)?;
        Ok(Self { rp, http, log, offline })
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

    pub async fn search_artists(&self, query: &str) -> Result<Vec<Card>, String> {
        self.online()?;
        self.log.note("music.youtube.com");
        let r = self.rp.query().music_search_artists(query).await.map_err(err)?;
        Ok(r.items.items.iter().map(artist_card).collect())
    }

    pub async fn search_albums(&self, query: &str) -> Result<Vec<Card>, String> {
        self.online()?;
        self.log.note("music.youtube.com");
        let r = self.rp.query().music_search_albums(query).await.map_err(err)?;
        Ok(r.items.items.iter().map(album_card).collect())
    }

    pub async fn artist(&self, id: &str) -> Result<Page, String> {
        self.online()?;
        self.log.note("music.youtube.com");
        let a = self.rp.query().music_artist(id, false).await.map_err(err)?;
        let (albums, singles): (Vec<_>, Vec<_>) = a.albums.iter().partition(|x| x.album_type != AlbumType::Single);
        let shelves = [
            shelf("albums", albums.iter().map(|x| album_card(x)).collect(), vec![]),
            shelf("singles", singles.iter().map(|x| album_card(x)).collect(), vec![]),
            shelf("playlists", a.playlists.iter().map(playlist_card).collect(), vec![]),
        ]
        .into_iter()
        .flatten()
        .collect();
        Ok(Page {
            kind: "artist".into(),
            id: a.id.clone(),
            title: a.name.clone(),
            subtitle: a.subscriber_count.map(|s| s.to_string()).unwrap_or_default(),
            cover: best_cover(&a.header_image),
            description: a.description.clone(),
            tracks: a.tracks.iter().map(to_track).collect(),
            shelves,
        })
    }

    pub async fn album(&self, id: &str) -> Result<Page, String> {
        self.online()?;
        self.log.note("music.youtube.com");
        let a = self.rp.query().music_album(id).await.map_err(err)?;
        let cover = best_cover(&a.cover);
        let tracks = a
            .tracks
            .iter()
            .map(|t| {
                let mut x = to_track(t);
                if x.cover.is_none() {
                    x.cover = cover.clone();
                }
                if x.album.is_none() {
                    x.album = Some(a.name.clone());
                }
                x
            })
            .collect();
        let by = a.artists.iter().map(|x| x.name.as_str()).collect::<Vec<_>>().join(", ");
        Ok(Page {
            kind: "album".into(),
            id: a.id.clone(),
            title: a.name.clone(),
            subtitle: match a.year { Some(y) => format!("{by} · {y}"), None => by },
            cover,
            description: None,
            tracks,
            shelves: vec![],
        })
    }

    pub async fn remote_playlist(&self, id: &str) -> Result<Page, String> {
        self.online()?;
        self.log.note("music.youtube.com");
        let mut p = self.rp.query().music_playlist(id).await.map_err(err)?;
        let _ = p.tracks.extend_limit(&self.rp.query(), 300).await;
        Ok(Page {
            kind: "playlist".into(),
            id: p.id.clone(),
            title: p.name.clone(),
            subtitle: p.channel.as_ref().map(|c| c.name.clone()).unwrap_or_default(),
            cover: best_cover(&p.thumbnail),
            description: None,
            tracks: p.tracks.items.iter().map(to_track).collect(),
            shelves: vec![],
        })
    }

    /// Songs like this one ("start radio").
    pub async fn radio(&self, video_id: &str) -> Result<Vec<Track>, String> {
        self.online()?;
        self.log.note("music.youtube.com");
        let r = self.rp.query().music_radio_track(video_id).await.map_err(err)?;
        Ok(r.items.iter().map(to_track).collect())
    }

    pub async fn new_albums(&self) -> Result<Vec<Card>, String> {
        self.online()?;
        self.log.note("music.youtube.com");
        Ok(self.rp.query().music_new_albums().await.map_err(err)?.iter().map(album_card).collect())
    }

    pub async fn charts(&self) -> Result<Page, String> {
        self.online()?;
        self.log.note("music.youtube.com");
        let c = self.rp.query().music_charts(None).await.map_err(err)?;
        let shelves = [
            shelf("top", vec![], c.top_tracks.iter().map(to_track).collect()),
            shelf("trending", vec![], c.trending_tracks.iter().map(to_track).collect()),
            shelf("artists", c.artists.iter().map(artist_card).collect(), vec![]),
            shelf("playlists", c.playlists.iter().map(playlist_card).collect(), vec![]),
        ]
        .into_iter()
        .flatten()
        .collect();
        Ok(Page { kind: "charts".into(), shelves, ..Default::default() })
    }

    pub async fn moods(&self) -> Result<Vec<Mood>, String> {
        self.online()?;
        self.log.note("music.youtube.com");
        let g = self.rp.query().music_genres().await.map_err(err)?;
        Ok(g.iter()
            .map(|x| Mood { id: x.id.clone(), name: x.name.clone(), color: format!("#{:06x}", x.color & 0xffffff), is_mood: x.is_mood })
            .collect())
    }

    pub async fn mood(&self, id: &str) -> Result<Page, String> {
        self.online()?;
        self.log.note("music.youtube.com");
        let g = self.rp.query().music_genre(id).await.map_err(err)?;
        let shelves = g
            .sections
            .iter()
            .filter_map(|s| shelf(&s.name, s.playlists.iter().map(playlist_card).collect(), vec![]))
            .collect();
        Ok(Page { kind: "mood".into(), id: g.id.clone(), title: g.name.clone(), shelves, ..Default::default() })
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

    /// A direct audio stream for the track, so playback starts at once instead of after a full
    /// download. `opus_first` prefers Opus/WebM (Linux web views play it out of the box).
    pub async fn stream(&self, video_id: &str, opus_first: bool) -> Result<crate::yt::Stream, String> {
        self.online()?;
        self.log.note("youtube.com");
        // First the Android app's way (app identities with plain URLs); rustypipe only as a fallback.
        match crate::yt::stream(&self.http, video_id, "es", opus_first).await {
            Ok(s) => Ok(s),
            Err(first) => {
                let p = self.rp.query().player(video_id).await.map_err(|e| format!("{first} · {e}"))?;
                let formats = if opus_first { vec![AudioFormat::Webm, AudioFormat::M4a] } else { vec![AudioFormat::M4a, AudioFormat::Webm] };
                for f in formats {
                    let filter = StreamFilter::new().no_video().audio_formats(vec![f]);
                    if let Some(s) = p.select_audio_stream(&filter) {
                        return Ok(crate::yt::Stream { url: s.url.clone(), mime: s.mime.split(';').next().unwrap_or("audio/mp4").into(), ua: String::new(), size: Some(s.size) });
                    }
                }
                Err(first)
            }
        }
    }

    /// The shared HTTP client (used by the local audio server).
    pub fn http(&self) -> &reqwest::Client {
        &self.http
    }

    /// Notes a googlevideo fetch in the connection log.
    pub fn note_media(&self) {
        self.log.note("googlevideo.com");
    }

    /// Downloads the track's audio to `dest`, in 8 MB ranges with the identity that minted the URL.
    pub async fn fetch_audio(&self, video_id: &str, dest: &Path) -> Result<(), String> {
        use tokio::io::AsyncWriteExt;
        let s = self.stream(video_id, false).await?;
        self.note_media();
        let mut out = tokio::fs::File::create(dest).await.map_err(err)?;
        let total = match s.size {
            Some(n) => n,
            None => {
                let r = self.media_get(&s, None).send().await.map_err(err)?;
                let b = r.bytes().await.map_err(err)?;
                out.write_all(&b).await.map_err(err)?;
                return Ok(());
            }
        };
        let mut at = 0u64;
        while at < total {
            let end = (at + 8 * 1024 * 1024).min(total) - 1;
            let r = self.media_get(&s, Some((at, end))).send().await.map_err(err)?;
            if !r.status().is_success() {
                return Err(format!("HTTP {}", r.status().as_u16()));
            }
            let b = r.bytes().await.map_err(err)?;
            if b.is_empty() {
                break;
            }
            out.write_all(&b).await.map_err(err)?;
            at += b.len() as u64;
        }
        out.flush().await.map_err(err)?;
        Ok(())
    }

    /// A request for the stream's bytes, dressed as the client that minted the URL.
    pub fn media_get(&self, s: &crate::yt::Stream, range: Option<(u64, u64)>) -> reqwest::RequestBuilder {
        let mut r = self.http.get(&s.url);
        if !s.ua.is_empty() {
            r = r.header("User-Agent", &s.ua);
        }
        if let Some((a, b)) = range {
            r = r.header("Range", format!("bytes={a}-{b}"));
        }
        r
    }
}
