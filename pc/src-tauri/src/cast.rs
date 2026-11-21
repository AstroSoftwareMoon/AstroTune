//! Sending music to speakers and TVs on the local network.
//!
//! * Google Cast (Chromecast, Google Home / Nest speakers, TVs with Chromecast built in): found over
//!   mDNS (`_googlecast._tcp`), driven with the Cast v2 protocol (length-prefixed protobuf over TLS
//!   on port 8009) and Google's Default Media Receiver.
//! * DLNA / UPnP renderers (many smart TVs, Sonos, AV receivers): found over SSDP and driven with
//!   the AVTransport SOAP service.
//!
//! The speaker fetches the song from AstroTune's own server on this computer (see `server`), so
//! nothing goes through any outside service. Alexa has no open protocol for this; use it as a
//! Bluetooth speaker.
use std::{
    io::{Read, Write},
    net::{SocketAddr, TcpStream, UdpSocket},
    sync::{mpsc, Arc, Mutex},
    time::{Duration, Instant},
};

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tauri::{AppHandle, Emitter};

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Device {
    pub kind: String,
    pub id: String,
    pub name: String,
    pub host: String,
    pub port: u16,
    /// DLNA: AVTransport and RenderingControl control URLs.
    pub control: String,
    pub volume_control: String,
}

#[derive(Clone, Serialize)]
pub struct Media {
    pub url: String,
    pub mime: String,
    pub title: String,
    pub artist: String,
    pub cover: Option<String>,
    pub duration: f64,
    pub start: f64,
}

pub enum Cmd {
    Load(Media),
    Play,
    Pause,
    Seek(f64),
    Volume(f32),
    Stop,
}

pub struct Session {
    #[allow(dead_code)]
    pub device: Device,
    tx: mpsc::Sender<Cmd>,
}

impl Session {
    pub fn send(&self, c: Cmd) {
        let _ = self.tx.send(c);
    }
}

// ------------------------------------------------------------------ discovery

pub fn discover(wait: Duration) -> Vec<Device> {
    let (a, b) = std::thread::scope(|s| {
        let g = s.spawn(|| discover_cast(wait));
        let d = s.spawn(|| discover_dlna(wait));
        (g.join().unwrap_or_default(), d.join().unwrap_or_default())
    });
    let mut all = a;
    all.extend(b);
    all
}

fn discover_cast(wait: Duration) -> Vec<Device> {
    let Ok(md) = mdns_sd::ServiceDaemon::new() else { return vec![] };
    let Ok(rx) = md.browse("_googlecast._tcp.local.") else { return vec![] };
    let end = Instant::now() + wait;
    let mut out: Vec<Device> = vec![];
    while let Some(left) = end.checked_duration_since(Instant::now()) {
        match rx.recv_timeout(left) {
            Ok(mdns_sd::ServiceEvent::ServiceResolved(info)) => {
                let Some(ip) = info.get_addresses_v4().into_iter().next().map(|a| a.to_string()) else { continue };
                let name = info.get_property_val_str("fn").unwrap_or(info.get_hostname()).to_string();
                let id = info.get_property_val_str("id").unwrap_or(info.get_fullname()).to_string();
                if !out.iter().any(|d| d.id == id) {
                    out.push(Device { kind: "cast".into(), id, name, host: ip, port: info.get_port(), control: String::new(), volume_control: String::new() });
                }
            }
            Ok(_) => {}
            Err(_) => break,
        }
    }
    let _ = md.shutdown();
    out
}

fn http_get(url: &str) -> Option<String> {
    // Plain HTTP on the local network; tiny on purpose (device description documents).
    let rest = url.strip_prefix("http://")?;
    let (hostport, path) = rest.split_once('/').map(|(h, p)| (h, format!("/{p}"))).unwrap_or((rest, "/".into()));
    let addr: SocketAddr = if hostport.contains(':') { hostport.parse().ok()? } else { format!("{hostport}:80").parse().ok()? };
    let mut s = TcpStream::connect_timeout(&addr, Duration::from_secs(2)).ok()?;
    s.set_read_timeout(Some(Duration::from_secs(3))).ok()?;
    write!(s, "GET {path} HTTP/1.1\r\nHost: {hostport}\r\nConnection: close\r\n\r\n").ok()?;
    let mut buf = Vec::new();
    let _ = s.read_to_end(&mut buf);
    let text = String::from_utf8_lossy(&buf).to_string();
    Some(text.split_once("\r\n\r\n").map(|(_, b)| b.to_string()).unwrap_or(text))
}

fn tag<'a>(xml: &'a str, name: &str) -> Option<&'a str> {
    let open = format!("<{name}>");
    let i = xml.find(&open)? + open.len();
    let j = xml[i..].find(&format!("</{name}>"))? + i;
    Some(xml[i..j].trim())
}

fn service_control(xml: &str, kind: &str) -> Option<String> {
    let mut rest = xml;
    while let Some(i) = rest.find("<service>") {
        let end = rest[i..].find("</service>").map(|e| i + e)?;
        let block = &rest[i..end];
        if tag(block, "serviceType").is_some_and(|t| t.contains(kind)) {
            return tag(block, "controlURL").map(|s| s.to_string());
        }
        rest = &rest[end..];
    }
    None
}

fn join_url(location: &str, path: &str) -> String {
    if path.starts_with("http") {
        return path.to_string();
    }
    let base = location.split('/').take(3).collect::<Vec<_>>().join("/");
    if path.starts_with('/') { format!("{base}{path}") } else { format!("{base}/{path}") }
}

fn discover_dlna(wait: Duration) -> Vec<Device> {
    let Ok(sock) = UdpSocket::bind("0.0.0.0:0") else { return vec![] };
    let _ = sock.set_read_timeout(Some(Duration::from_millis(300)));
    let msg = "M-SEARCH * HTTP/1.1\r\nHOST: 239.255.255.250:1900\r\nMAN: \"ssdp:discover\"\r\nMX: 2\r\nST: urn:schemas-upnp-org:service:AVTransport:1\r\n\r\n";
    for _ in 0..2 {
        let _ = sock.send_to(msg.as_bytes(), "239.255.255.250:1900");
    }
    let end = Instant::now() + wait;
    let mut locations = vec![];
    let mut buf = [0u8; 2048];
    while Instant::now() < end {
        if let Ok((n, _)) = sock.recv_from(&mut buf) {
            let text = String::from_utf8_lossy(&buf[..n]).to_string();
            for line in text.lines() {
                if let Some((k, v)) = line.split_once(':') {
                    if k.trim().eq_ignore_ascii_case("location") {
                        let l = v.trim().to_string();
                        if !locations.contains(&l) {
                            locations.push(l);
                        }
                    }
                }
            }
        }
    }
    locations
        .into_iter()
        .filter_map(|loc| {
            let xml = http_get(&loc)?;
            let control = join_url(&loc, &service_control(&xml, "AVTransport")?);
            let volume_control = service_control(&xml, "RenderingControl").map(|c| join_url(&loc, &c)).unwrap_or_default();
            let name = tag(&xml, "friendlyName").unwrap_or("DLNA").to_string();
            let host = loc.split('/').nth(2).unwrap_or("").split(':').next().unwrap_or("").to_string();
            let id = tag(&xml, "UDN").unwrap_or(&loc).to_string();
            Some(Device { kind: "dlna".into(), id, name, host, port: 0, control, volume_control })
        })
        .collect()
}

// ------------------------------------------------------------------ sessions

pub fn connect(device: Device, handle: AppHandle) -> Result<Session, String> {
    let (tx, rx) = mpsc::channel();
    let d = device.clone();
    match device.kind.as_str() {
        "cast" => {
            let conn = CastConn::open(&d.host, d.port)?;
            std::thread::spawn(move || cast_loop(conn, rx, handle));
        }
        _ => {
            std::thread::spawn(move || dlna_loop(d, rx, handle));
        }
    }
    Ok(Session { device, tx })
}

// ---- Google Cast v2

#[derive(Debug)]
struct NoVerify;
impl rustls::client::danger::ServerCertVerifier for NoVerify {
    // Cast devices present self-signed certificates; the connection only ever goes to an address on the local network.
    fn verify_server_cert(&self, _: &rustls::pki_types::CertificateDer<'_>, _: &[rustls::pki_types::CertificateDer<'_>], _: &rustls::pki_types::ServerName<'_>, _: &[u8], _: rustls::pki_types::UnixTime) -> Result<rustls::client::danger::ServerCertVerified, rustls::Error> {
        Ok(rustls::client::danger::ServerCertVerified::assertion())
    }
    fn verify_tls12_signature(&self, _: &[u8], _: &rustls::pki_types::CertificateDer<'_>, _: &rustls::DigitallySignedStruct) -> Result<rustls::client::danger::HandshakeSignatureValid, rustls::Error> {
        Ok(rustls::client::danger::HandshakeSignatureValid::assertion())
    }
    fn verify_tls13_signature(&self, _: &[u8], _: &rustls::pki_types::CertificateDer<'_>, _: &rustls::DigitallySignedStruct) -> Result<rustls::client::danger::HandshakeSignatureValid, rustls::Error> {
        Ok(rustls::client::danger::HandshakeSignatureValid::assertion())
    }
    fn supported_verify_schemes(&self) -> Vec<rustls::SignatureScheme> {
        rustls::crypto::ring::default_provider().signature_verification_algorithms.supported_schemes()
    }
}

struct CastConn {
    tls: rustls::StreamOwned<rustls::ClientConnection, TcpStream>,
}

fn varint(mut v: u64, out: &mut Vec<u8>) {
    loop {
        let b = (v & 0x7f) as u8;
        v >>= 7;
        if v == 0 {
            out.push(b);
            break;
        }
        out.push(b | 0x80);
    }
}

fn field_str(n: u8, s: &str, out: &mut Vec<u8>) {
    out.push((n << 3) | 2);
    varint(s.len() as u64, out);
    out.extend_from_slice(s.as_bytes());
}

impl CastConn {
    fn open(host: &str, port: u16) -> Result<Self, String> {
        let addr: SocketAddr = format!("{host}:{port}").parse().map_err(|e| format!("{e}"))?;
        let tcp = TcpStream::connect_timeout(&addr, Duration::from_secs(4)).map_err(|e| e.to_string())?;
        tcp.set_read_timeout(Some(Duration::from_millis(500))).ok();
        let cfg = rustls::ClientConfig::builder_with_provider(Arc::new(rustls::crypto::ring::default_provider()))
            .with_safe_default_protocol_versions()
            .map_err(|e| e.to_string())?
            .dangerous()
            .with_custom_certificate_verifier(Arc::new(NoVerify))
            .with_no_client_auth();
        let name = rustls::pki_types::ServerName::try_from(host.to_string()).map_err(|e| e.to_string())?;
        let conn = rustls::ClientConnection::new(Arc::new(cfg), name).map_err(|e| e.to_string())?;
        Ok(Self { tls: rustls::StreamOwned::new(conn, tcp) })
    }

    fn send(&mut self, dest: &str, ns: &str, payload: &Value) -> std::io::Result<()> {
        let mut m = Vec::new();
        m.extend_from_slice(&[0x08, 0x00]); // protocol_version = CASTV2_1_0
        field_str(2, "sender-0", &mut m);
        field_str(3, dest, &mut m);
        field_str(4, ns, &mut m);
        m.extend_from_slice(&[0x28, 0x00]); // payload_type = STRING
        field_str(6, &payload.to_string(), &mut m);
        let mut framed = (m.len() as u32).to_be_bytes().to_vec();
        framed.extend(m);
        self.tls.write_all(&framed)?;
        self.tls.flush()
    }

    /// One message (namespace, payload), or None if nothing arrived in time.
    fn recv(&mut self) -> std::io::Result<Option<(String, Value)>> {
        let mut len = [0u8; 4];
        match self.tls.read_exact(&mut len) {
            Ok(()) => {}
            Err(e) if matches!(e.kind(), std::io::ErrorKind::WouldBlock | std::io::ErrorKind::TimedOut) => return Ok(None),
            Err(e) => return Err(e),
        }
        let n = u32::from_be_bytes(len) as usize;
        let mut buf = vec![0u8; n];
        let mut got = 0;
        while got < n {
            match self.tls.read(&mut buf[got..]) {
                Ok(0) => return Err(std::io::ErrorKind::UnexpectedEof.into()),
                Ok(k) => got += k,
                Err(e) if matches!(e.kind(), std::io::ErrorKind::WouldBlock | std::io::ErrorKind::TimedOut) => continue,
                Err(e) => return Err(e),
            }
        }
        // Minimal protobuf reader: we only need field 4 (namespace) and 6 (payload).
        let (mut i, mut ns, mut payload) = (0usize, String::new(), String::new());
        while i < buf.len() {
            let key = buf[i];
            i += 1;
            let (field, wt) = (key >> 3, key & 7);
            if wt == 0 {
                while i < buf.len() && buf[i] & 0x80 != 0 {
                    i += 1;
                }
                i += 1;
            } else if wt == 2 {
                let (mut l, mut shift) = (0usize, 0);
                while i < buf.len() {
                    let b = buf[i];
                    i += 1;
                    l |= ((b & 0x7f) as usize) << shift;
                    shift += 7;
                    if b & 0x80 == 0 {
                        break;
                    }
                }
                let s = String::from_utf8_lossy(&buf[i..(i + l).min(buf.len())]).to_string();
                i += l;
                if field == 4 {
                    ns = s;
                } else if field == 6 {
                    payload = s;
                }
            } else {
                break;
            }
        }
        Ok(Some((ns, serde_json::from_str(&payload).unwrap_or(Value::Null))))
    }
}

const NS_CONN: &str = "urn:x-cast:com.google.cast.tp.connection";
const NS_HEART: &str = "urn:x-cast:com.google.cast.tp.heartbeat";
const NS_RECV: &str = "urn:x-cast:com.google.cast.receiver";
const NS_MEDIA: &str = "urn:x-cast:com.google.cast.media";
const DEFAULT_RECEIVER: &str = "CC1AD845";

fn cast_loop(mut c: CastConn, rx: mpsc::Receiver<Cmd>, handle: AppHandle) {
    let mut req = 1u64;
    let mut transport: Option<String> = None;
    let mut session: Option<i64> = None;
    let mut pending: Option<Media> = None;
    let mut last_ping = Instant::now();
    let _ = c.send("receiver-0", NS_CONN, &json!({"type": "CONNECT"}));
    let _ = c.send("receiver-0", NS_RECV, &json!({"type": "LAUNCH", "appId": DEFAULT_RECEIVER, "requestId": req}));
    let mut last_status = Instant::now();
    loop {
        // commands from the app
        loop {
            match rx.try_recv() {
                Ok(cmd) => {
                    req += 1;
                    let t = transport.clone();
                    match (cmd, t) {
                        (Cmd::Load(m), Some(t)) => {
                            let meta = json!({"metadataType": 3, "title": m.title, "artist": m.artist, "images": m.cover.iter().map(|u| json!({"url": u})).collect::<Vec<_>>()});
                            let _ = c.send(&t, NS_MEDIA, &json!({"type": "LOAD", "requestId": req, "autoplay": true, "currentTime": m.start,
                                "media": {"contentId": m.url, "contentType": m.mime, "streamType": "BUFFERED", "duration": m.duration, "metadata": meta}}));
                        }
                        (Cmd::Load(m), None) => pending = Some(m),
                        (Cmd::Play, Some(t)) => if let Some(s) = session { let _ = c.send(&t, NS_MEDIA, &json!({"type": "PLAY", "mediaSessionId": s, "requestId": req})); },
                        (Cmd::Pause, Some(t)) => if let Some(s) = session { let _ = c.send(&t, NS_MEDIA, &json!({"type": "PAUSE", "mediaSessionId": s, "requestId": req})); },
                        (Cmd::Seek(p), Some(t)) => if let Some(s) = session { let _ = c.send(&t, NS_MEDIA, &json!({"type": "SEEK", "mediaSessionId": s, "currentTime": p, "requestId": req})); },
                        (Cmd::Volume(v), _) => { let _ = c.send("receiver-0", NS_RECV, &json!({"type": "SET_VOLUME", "volume": {"level": v}, "requestId": req})); }
                        (Cmd::Stop, t) => {
                            if let (Some(t), Some(s)) = (t, session) { let _ = c.send(&t, NS_MEDIA, &json!({"type": "STOP", "mediaSessionId": s, "requestId": req})); }
                            let _ = c.send("receiver-0", NS_RECV, &json!({"type": "STOP", "requestId": req}));
                            let _ = handle.emit("cast-status", json!({"state": "closed"}));
                            return;
                        }
                        _ => {}
                    }
                }
                Err(mpsc::TryRecvError::Empty) => break,
                Err(mpsc::TryRecvError::Disconnected) => return,
            }
        }
        if last_ping.elapsed() > Duration::from_secs(5) {
            let _ = c.send("receiver-0", NS_HEART, &json!({"type": "PING"}));
            last_ping = Instant::now();
        }
        if let (Some(t), Some(s)) = (&transport, session) {
            if last_status.elapsed() > Duration::from_secs(1) {
                req += 1;
                let _ = c.send(t, NS_MEDIA, &json!({"type": "GET_STATUS", "mediaSessionId": s, "requestId": req}));
                last_status = Instant::now();
            }
        }
        match c.recv() {
            Ok(Some((ns, v))) => {
                let ty = v["type"].as_str().unwrap_or("");
                if ns == NS_HEART && ty == "PING" {
                    let _ = c.send("receiver-0", NS_HEART, &json!({"type": "PONG"}));
                } else if ns == NS_RECV && ty == "RECEIVER_STATUS" {
                    if transport.is_none() {
                        if let Some(app) = v["status"]["applications"].as_array().and_then(|a| a.iter().find(|x| x["appId"] == DEFAULT_RECEIVER)) {
                            let t = app["transportId"].as_str().unwrap_or("").to_string();
                            let _ = c.send(&t, NS_CONN, &json!({"type": "CONNECT"}));
                            transport = Some(t);
                            let _ = handle.emit("cast-status", json!({"state": "connected"}));
                            if let Some(m) = pending.take() {
                                req += 1;
                                let meta = json!({"metadataType": 3, "title": m.title, "artist": m.artist, "images": m.cover.iter().map(|u| json!({"url": u})).collect::<Vec<_>>()});
                                let _ = c.send(transport.as_ref().unwrap(), NS_MEDIA, &json!({"type": "LOAD", "requestId": req, "autoplay": true, "currentTime": m.start,
                                    "media": {"contentId": m.url, "contentType": m.mime, "streamType": "BUFFERED", "duration": m.duration, "metadata": meta}}));
                            }
                        }
                    }
                    if let Some(l) = v["status"]["volume"]["level"].as_f64() {
                        let _ = handle.emit("cast-status", json!({"volume": l}));
                    }
                } else if ns == NS_MEDIA && ty == "MEDIA_STATUS" {
                    if let Some(st) = v["status"].as_array().and_then(|a| a.first()) {
                        if let Some(id) = st["mediaSessionId"].as_i64() {
                            session = Some(id);
                        }
                        let ps = st["playerState"].as_str().unwrap_or("");
                        let ended = ps == "IDLE" && st["idleReason"] == "FINISHED";
                        let _ = handle.emit("cast-status", json!({"state": "media", "pos": st["currentTime"], "paused": ps != "PLAYING" && ps != "BUFFERING", "ended": ended}));
                    }
                } else if ns == NS_CONN && ty == "CLOSE" {
                    let _ = handle.emit("cast-status", json!({"state": "closed"}));
                    return;
                }
            }
            Ok(None) => {}
            Err(_) => {
                let _ = handle.emit("cast-status", json!({"state": "closed"}));
                return;
            }
        }
    }
}

// ---- DLNA / UPnP AVTransport

fn soap(url: &str, service: &str, action: &str, args: &str) -> Option<String> {
    let body = format!(
        "<?xml version=\"1.0\" encoding=\"utf-8\"?><s:Envelope xmlns:s=\"http://schemas.xmlsoap.org/soap/envelope/\" s:encodingStyle=\"http://schemas.xmlsoap.org/soap/encoding/\"><s:Body><u:{action} xmlns:u=\"urn:schemas-upnp-org:service:{service}:1\">{args}</u:{action}></s:Body></s:Envelope>"
    );
    let rest = url.strip_prefix("http://")?;
    let (hostport, path) = rest.split_once('/').map(|(h, p)| (h, format!("/{p}"))).unwrap_or((rest, "/".into()));
    let addr: SocketAddr = if hostport.contains(':') { hostport.parse().ok()? } else { format!("{hostport}:80").parse().ok()? };
    let mut s = TcpStream::connect_timeout(&addr, Duration::from_secs(3)).ok()?;
    s.set_read_timeout(Some(Duration::from_secs(4))).ok()?;
    write!(s, "POST {path} HTTP/1.1\r\nHost: {hostport}\r\nContent-Type: text/xml; charset=\"utf-8\"\r\nSOAPAction: \"urn:schemas-upnp-org:service:{service}:1#{action}\"\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}", body.len()).ok()?;
    let mut buf = Vec::new();
    let _ = s.read_to_end(&mut buf);
    Some(String::from_utf8_lossy(&buf).to_string())
}

fn xml_esc(s: &str) -> String {
    s.replace('&', "&amp;").replace('<', "&lt;").replace('>', "&gt;").replace('"', "&quot;")
}

fn hms(t: f64) -> String {
    let t = t.max(0.0) as u64;
    format!("{}:{:02}:{:02}", t / 3600, (t / 60) % 60, t % 60)
}

fn secs(s: &str) -> f64 {
    s.split(':').fold(0.0, |a, p| a * 60.0 + p.split('.').next().unwrap_or("0").parse::<f64>().unwrap_or(0.0))
}

fn dlna_loop(d: Device, rx: mpsc::Receiver<Cmd>, handle: AppHandle) {
    let _ = handle.emit("cast-status", json!({"state": "connected"}));
    let playing = Arc::new(Mutex::new(false));
    let mut last = Instant::now();
    let mut loaded = false;
    loop {
        match rx.recv_timeout(Duration::from_millis(500)) {
            Ok(Cmd::Load(m)) => {
                let didl = format!(
                    "<DIDL-Lite xmlns=\"urn:schemas-upnp-org:metadata-1-0/DIDL-Lite/\" xmlns:dc=\"http://purl.org/dc/elements/1.1/\" xmlns:upnp=\"urn:schemas-upnp-org:metadata-1-0/upnp/\"><item id=\"0\" parentID=\"-1\" restricted=\"1\"><dc:title>{}</dc:title><upnp:artist>{}</upnp:artist><upnp:class>object.item.audioItem.musicTrack</upnp:class>{}<res protocolInfo=\"http-get:*:{}:*\">{}</res></item></DIDL-Lite>",
                    xml_esc(&m.title), xml_esc(&m.artist), m.cover.as_ref().map(|c| format!("<upnp:albumArtURI>{}</upnp:albumArtURI>", xml_esc(c))).unwrap_or_default(), m.mime, xml_esc(&m.url)
                );
                let _ = soap(&d.control, "AVTransport", "Stop", "<InstanceID>0</InstanceID>");
                let _ = soap(&d.control, "AVTransport", "SetAVTransportURI", &format!("<InstanceID>0</InstanceID><CurrentURI>{}</CurrentURI><CurrentURIMetaData>{}</CurrentURIMetaData>", xml_esc(&m.url), xml_esc(&didl)));
                let _ = soap(&d.control, "AVTransport", "Play", "<InstanceID>0</InstanceID><Speed>1</Speed>");
                if m.start > 1.0 {
                    let _ = soap(&d.control, "AVTransport", "Seek", &format!("<InstanceID>0</InstanceID><Unit>REL_TIME</Unit><Target>{}</Target>", hms(m.start)));
                }
                *playing.lock().unwrap() = true;
                loaded = true;
            }
            Ok(Cmd::Play) => { let _ = soap(&d.control, "AVTransport", "Play", "<InstanceID>0</InstanceID><Speed>1</Speed>"); *playing.lock().unwrap() = true; }
            Ok(Cmd::Pause) => { let _ = soap(&d.control, "AVTransport", "Pause", "<InstanceID>0</InstanceID>"); *playing.lock().unwrap() = false; }
            Ok(Cmd::Seek(p)) => { let _ = soap(&d.control, "AVTransport", "Seek", &format!("<InstanceID>0</InstanceID><Unit>REL_TIME</Unit><Target>{}</Target>", hms(p))); }
            Ok(Cmd::Volume(v)) => if !d.volume_control.is_empty() {
                let _ = soap(&d.volume_control, "RenderingControl", "SetVolume", &format!("<InstanceID>0</InstanceID><Channel>Master</Channel><DesiredVolume>{}</DesiredVolume>", (v * 100.0) as u32));
            },
            Ok(Cmd::Stop) => {
                let _ = soap(&d.control, "AVTransport", "Stop", "<InstanceID>0</InstanceID>");
                let _ = handle.emit("cast-status", json!({"state": "closed"}));
                return;
            }
            Err(mpsc::RecvTimeoutError::Disconnected) => return,
            Err(mpsc::RecvTimeoutError::Timeout) => {}
        }
        if loaded && last.elapsed() > Duration::from_secs(1) {
            last = Instant::now();
            let pos = soap(&d.control, "AVTransport", "GetPositionInfo", "<InstanceID>0</InstanceID>").and_then(|x| tag(&x, "RelTime").map(secs));
            let state = soap(&d.control, "AVTransport", "GetTransportInfo", "<InstanceID>0</InstanceID>").and_then(|x| tag(&x, "CurrentTransportState").map(|s| s.to_string()));
            let st = state.unwrap_or_default();
            let ended = st == "STOPPED" && *playing.lock().unwrap();
            if ended {
                *playing.lock().unwrap() = false;
            }
            let _ = handle.emit("cast-status", json!({"state": "media", "pos": pos.unwrap_or(0.0), "paused": st != "PLAYING" && st != "TRANSITIONING", "ended": ended}));
        }
    }
}
