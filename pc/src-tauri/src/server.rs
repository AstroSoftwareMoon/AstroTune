//! AstroTune's own little HTTP server.
//!
//! * Local (127.0.0.1 only, always on): hands the web view the audio. googlevideo wants the
//!   bytes asked for by the same app identity that got the URL (see astrotune-core's `yt`),
//!   which a web view can't do, so the request goes through here. Range requests pass through,
//!   so seeking is instant. Cached songs are served from disk.
//! * Local network (off until the person turns on "Connect your phone" or casts): serves the
//!   phone remote page, its small JSON API, and the audio for Chromecast / DLNA speakers.
//!   Every address carries a random token made at start, so only someone who scanned the QR
//!   code (or a device AstroTune itself sent a song to) can use it.
use std::{
    collections::HashMap,
    fs::File,
    io::{Read, Seek, SeekFrom},
    net::UdpSocket,
    path::PathBuf,
    sync::{mpsc, Arc, Mutex},
    time::Instant,
};

use astrotune_core::{net::Net, yt::Stream};
use futures_util::StreamExt;
use serde_json::{json, Value};
use tauri::{AppHandle, Emitter};
use tiny_http::{Header, Method, Request, Response, Server, StatusCode};

pub struct Hub {
    pub net: Arc<Net>,
    pub cache: PathBuf,
    streams: Mutex<HashMap<String, (Instant, Stream)>>,
    pub local_port: Mutex<u16>,
    pub token: String,
    lan: Mutex<Option<(Arc<Server>, u16)>>,
    pub lan_token: String,
    pub remote_state: Mutex<Value>,
    pub handle: AppHandle,
}

pub fn random_token() -> String {
    let mut b = [0u8; 16];
    getrandom::getrandom(&mut b).expect("random");
    b.iter().map(|x| format!("{x:02x}")).collect()
}

/// This computer's address on the local network (no packet is sent: a UDP "connect" only picks the route).
pub fn lan_ip() -> Option<String> {
    let s = UdpSocket::bind("0.0.0.0:0").ok()?;
    s.connect("192.168.0.1:9").or_else(|_| s.connect("10.0.0.1:9")).ok()?;
    Some(s.local_addr().ok()?.ip().to_string())
}

fn safe_id(id: &str) -> String {
    id.chars().filter(|c| c.is_ascii_alphanumeric() || *c == '_' || *c == '-').collect()
}

fn hdr(k: &str, v: &str) -> Header {
    Header::from_bytes(k.as_bytes(), v.as_bytes()).unwrap()
}

/// A blocking reader over chunks that an async task pushes in.
struct ChanReader {
    rx: mpsc::Receiver<Vec<u8>>,
    buf: Vec<u8>,
    pos: usize,
}
impl Read for ChanReader {
    fn read(&mut self, out: &mut [u8]) -> std::io::Result<usize> {
        while self.pos >= self.buf.len() {
            match self.rx.recv() {
                Ok(b) => {
                    self.buf = b;
                    self.pos = 0;
                }
                Err(_) => return Ok(0),
            }
        }
        let n = out.len().min(self.buf.len() - self.pos);
        out[..n].copy_from_slice(&self.buf[self.pos..self.pos + n]);
        self.pos += n;
        Ok(n)
    }
}

fn parse_range(v: &str, len: u64) -> Option<(u64, u64)> {
    let r = v.trim().strip_prefix("bytes=")?;
    let (a, b) = r.split_once('-')?;
    let (start, end) = if a.is_empty() {
        let n: u64 = b.parse().ok()?;
        (len.saturating_sub(n), len - 1)
    } else {
        let s: u64 = a.parse().ok()?;
        let e = if b.is_empty() { len - 1 } else { b.parse::<u64>().ok()?.min(len - 1) };
        (s, e)
    };
    (start <= end && start < len).then_some((start, end))
}

impl Hub {
    pub fn new(net: Arc<Net>, cache: PathBuf, handle: AppHandle) -> Arc<Self> {
        let hub = Arc::new(Hub {
            net,
            cache,
            streams: Mutex::new(HashMap::new()),
            local_port: Mutex::new(0),
            token: random_token(),
            lan: Mutex::new(None),
            lan_token: random_token(),
            remote_state: Mutex::new(json!({})),
            handle,
        });
        if let Ok(server) = Server::http("127.0.0.1:0") {
            let port = server.server_addr().to_ip().map(|a| a.port()).unwrap_or(0);
            *hub.local_port.lock().unwrap() = port;
            let server = Arc::new(server);
            let h = hub.clone();
            std::thread::spawn(move || {
                for req in server.incoming_requests() {
                    let h = h.clone();
                    std::thread::spawn(move || h.handle(req, false));
                }
            });
        }
        hub
    }

    pub fn cached_file(&self, id: &str) -> PathBuf {
        self.cache.join(format!("{}.m4a", safe_id(id)))
    }

    /// The stream for a track, looked up once and reused for a few hours.
    pub async fn stream(&self, id: &str, fresh: bool) -> Result<Stream, String> {
        if !fresh {
            if let Some((at, s)) = self.streams.lock().unwrap().get(id).cloned() {
                if at.elapsed().as_secs() < 3 * 3600 {
                    return Ok(s);
                }
            }
        }
        let s = self.net.stream(id, false).await?;
        self.streams.lock().unwrap().insert(id.to_string(), (Instant::now(), s.clone()));
        Ok(s)
    }

    pub fn local_url(&self, id: &str) -> String {
        format!("http://127.0.0.1:{}/a/{}/{}", self.local_port.lock().unwrap(), self.token, safe_id(id))
    }

    /// Turns the local-network server on (phone remote, casting). Returns its port.
    pub fn lan_on(self: &Arc<Self>) -> Result<u16, String> {
        if let Some((_, p)) = &*self.lan.lock().unwrap() {
            return Ok(*p);
        }
        let server = Arc::new(Server::http("0.0.0.0:0").map_err(|e| e.to_string())?);
        let port = server.server_addr().to_ip().map(|a| a.port()).unwrap_or(0);
        let (s2, h) = (server.clone(), self.clone());
        std::thread::spawn(move || {
            for req in s2.incoming_requests() {
                let h = h.clone();
                std::thread::spawn(move || h.handle(req, true));
            }
        });
        *self.lan.lock().unwrap() = Some((server, port));
        Ok(port)
    }

    pub fn lan_off(&self) {
        if let Some((s, _)) = self.lan.lock().unwrap().take() {
            s.unblock();
        }
    }

    /// Address of a song for a speaker on the local network.
    pub fn lan_media_url(self: &Arc<Self>, id: &str) -> Result<String, String> {
        let port = self.lan_on()?;
        let ip = lan_ip().ok_or("no-network")?;
        Ok(format!("http://{ip}:{port}/m/{}/{}", self.lan_token, safe_id(id)))
    }

    fn handle(self: Arc<Self>, req: Request, lan: bool) {
        let url = req.url().to_string();
        let path = url.split('?').next().unwrap_or("").to_string();
        let parts: Vec<&str> = path.trim_start_matches('/').split('/').collect();
        // Requests from the network must come from a private address.
        if lan {
            let ok = req.remote_addr().map(|a| match a.ip() {
                std::net::IpAddr::V4(v) => v.is_private() || v.is_loopback() || v.is_link_local(),
                std::net::IpAddr::V6(v) => v.is_loopback() || (v.segments()[0] & 0xfe00) == 0xfc00 || (v.segments()[0] & 0xffc0) == 0xfe80,
            });
            if ok != Some(true) {
                let _ = req.respond(Response::empty(403));
                return;
            }
        }
        match (lan, parts.as_slice()) {
            (false, ["a", t, id]) if *t == self.token => self.audio(req, id),
            (true, ["m", t, id]) if *t == self.lan_token => self.audio(req, id),
            (true, ["r", t]) if *t == self.lan_token => {
                let page = include_str!("../remote.html").replace("__TOKEN__", &self.lan_token);
                let _ = req.respond(Response::from_string(page).with_header(hdr("Content-Type", "text/html; charset=utf-8")).with_header(hdr("Cache-Control", "no-store")));
            }
            (true, ["api", t, "state"]) if *t == self.lan_token => {
                let s = self.remote_state.lock().unwrap().to_string();
                let _ = req.respond(Response::from_string(s).with_header(hdr("Content-Type", "application/json")).with_header(hdr("Cache-Control", "no-store")));
            }
            (true, ["api", t, "cmd"]) if *t == self.lan_token && *req.method() == Method::Post => self.command(req),
            _ => {
                let _ = req.respond(Response::empty(404));
            }
        }
    }

    fn command(&self, mut req: Request) {
        let mut body = String::new();
        let _ = req.as_reader().take(64 * 1024).read_to_string(&mut body);
        let v: Value = serde_json::from_str(&body).unwrap_or(json!({}));
        let reply = if v["cmd"] == "search" {
            let q = v["q"].as_str().unwrap_or("").to_string();
            let net = self.net.clone();
            match tauri::async_runtime::block_on(async move { net.search(&q).await }) {
                Ok(r) => json!({ "ok": true, "results": r }),
                Err(e) => json!({ "ok": false, "error": e }),
            }
        } else {
            let _ = self.handle.emit("remote-cmd", v);
            json!({ "ok": true })
        };
        let _ = req.respond(Response::from_string(reply.to_string()).with_header(hdr("Content-Type", "application/json")));
    }

    fn audio(self: Arc<Self>, req: Request, id: &str) {
        let range = req.headers().iter().find(|h| h.field.equiv("Range")).map(|h| h.value.as_str().to_string());
        let file = self.cached_file(id);
        if file.exists() {
            return serve_file(req, file, range);
        }
        let id = id.to_string();
        let (tx_head, rx_head) = mpsc::channel::<Result<(u16, Vec<(String, String)>, Option<usize>), String>>();
        let (tx, rx) = mpsc::sync_channel::<Vec<u8>>(32);
        let hub = self.clone();
        tauri::async_runtime::spawn(async move {
            let mut fresh = false;
            for _ in 0..2 {
                let s = match hub.stream(&id, fresh).await {
                    Ok(s) => s,
                    Err(e) => {
                        let _ = tx_head.send(Err(e));
                        return;
                    }
                };
                hub.net.note_media();
                let mut r = hub.net.http().get(&s.url);
                if !s.ua.is_empty() {
                    r = r.header("User-Agent", &s.ua);
                }
                r = r.header("Range", range.clone().unwrap_or_else(|| "bytes=0-".into()));
                let resp = match r.send().await {
                    Ok(x) => x,
                    Err(e) => {
                        let _ = tx_head.send(Err(e.to_string()));
                        return;
                    }
                };
                let st = resp.status().as_u16();
                if (st == 403 || st == 410) && !fresh {
                    fresh = true; // the address went stale: get a new one once
                    continue;
                }
                let mut headers = vec![("Content-Type".to_string(), s.mime.clone()), ("Accept-Ranges".into(), "bytes".into())];
                for k in ["Content-Range"] {
                    if let Some(v) = resp.headers().get(k).and_then(|v| v.to_str().ok()) {
                        headers.push((k.into(), v.into()));
                    }
                }
                // A request without a Range header gets a plain 200 with the whole length.
                let (code, len) = if range.is_none() && st == 206 {
                    (200, s.size.map(|n| n as usize).or(resp.content_length().map(|n| n as usize)))
                } else {
                    (st, resp.content_length().map(|n| n as usize))
                };
                if code == 200 {
                    headers.retain(|(k, _)| k != "Content-Range");
                }
                let _ = tx_head.send(Ok((code, headers, len)));
                let mut body = resp.bytes_stream();
                while let Some(chunk) = body.next().await {
                    match chunk {
                        Ok(b) => {
                            if tx.send(b.to_vec()).is_err() {
                                return;
                            }
                        }
                        Err(_) => return,
                    }
                }
                return;
            }
        });
        match rx_head.recv() {
            Ok(Ok((code, headers, len))) => {
                let mut resp = Response::new(StatusCode(code), vec![], ChanReader { rx, buf: vec![], pos: 0 }, len, None);
                for (k, v) in headers {
                    resp.add_header(hdr(&k, &v));
                }
                let _ = req.respond(resp);
            }
            Ok(Err(e)) => {
                let _ = req.respond(Response::from_string(e).with_status_code(502));
            }
            Err(_) => {
                let _ = req.respond(Response::empty(502));
            }
        }
    }
}

fn serve_file(req: Request, path: PathBuf, range: Option<String>) {
    let Ok(mut f) = File::open(&path) else {
        let _ = req.respond(Response::empty(404));
        return;
    };
    let len = f.metadata().map(|m| m.len()).unwrap_or(0);
    let ct = hdr("Content-Type", "audio/mp4");
    let ar = hdr("Accept-Ranges", "bytes");
    if let Some((a, b)) = range.as_deref().and_then(|r| parse_range(r, len)) {
        let _ = f.seek(SeekFrom::Start(a));
        let n = (b - a + 1) as usize;
        let resp = Response::new(StatusCode(206), vec![ct, ar, hdr("Content-Range", &format!("bytes {a}-{b}/{len}"))], f.take(n as u64), Some(n), None);
        let _ = req.respond(resp);
    } else {
        let _ = req.respond(Response::new(StatusCode(200), vec![ct, ar], f, Some(len as usize), None));
    }
}
