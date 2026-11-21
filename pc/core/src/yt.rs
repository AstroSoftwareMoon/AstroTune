//! Audio streams from YouTube, asked for the same way the Android app does
//! (core/.../innertube/PlayerClient.kt and StreamResolver.kt).
//!
//! The `player` endpoint is asked as an app client that answers with plain `url` fields,
//! so no player JavaScript has to be downloaded or "deobfuscated". Which identities are
//! answered changes without notice, so this is a list to walk, in the app's order, and the
//! one that worked last is tried first next time. The User-Agent of the identity that minted
//! a URL has to be repeated when the bytes are fetched, or googlevideo throttles or refuses it:
//! that's why every stream carries its `ua`.

use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Mutex;

use serde_json::{json, Value};

#[derive(Clone, Copy)]
pub struct Client {
    pub name: &'static str,
    pub version: &'static str,
    pub id: &'static str,
    pub ua: &'static str,
    pub os_name: &'static str,
    pub os_version: &'static str,
    pub make: &'static str,
    pub model: &'static str,
    pub sdk: Option<u32>,
}

/// Same identities and versions as the Android app, in the order it walks them
/// (StreamResolver.kt: ANDROID_MUSIC first, the one googlevideo still serves without a token).
pub const CLIENTS: &[Client] = &[
    Client {
        name: "ANDROID_MUSIC",
        version: "8.39.42",
        id: "21",
        ua: "com.google.android.apps.youtube.music/8.39.42 (Linux; U; Android 15; en_US; Pixel 9 Pro; Build/AP4A.250205.002) gzip",
        os_name: "Android",
        os_version: "15",
        make: "Google",
        model: "Pixel 9 Pro",
        sdk: Some(35),
    },
    Client {
        name: "ANDROID_VR",
        version: "1.65.10",
        id: "28",
        ua: "com.google.android.apps.youtube.vr.oculus/1.65.10 (Linux; U; Android 12L; eureka-user Build/SQ3A.220605.009.A1) gzip",
        os_name: "Android",
        os_version: "12L",
        make: "Oculus",
        model: "Quest 3",
        sdk: Some(32),
    },
    Client {
        name: "ANDROID_VR",
        version: "1.43.32",
        id: "28",
        ua: "com.google.android.apps.youtube.vr.oculus/1.43.32 (Linux; U; Android 12; en_US; Quest 3; Build/SQ3A.220605.009.A1; Cronet/107.0.5284.2)",
        os_name: "Android",
        os_version: "12L",
        make: "Oculus",
        model: "Quest 3",
        sdk: Some(32),
    },
    Client {
        name: "IOS",
        version: "21.29.1",
        id: "5",
        ua: "com.google.ios.youtube/21.29.1 (iPhone16,2; U; CPU iOS 18_5 like Mac OS X;)",
        os_name: "iPhone",
        os_version: "18.5.22F70",
        make: "Apple",
        model: "iPhone16,2",
        sdk: None,
    },
    Client {
        name: "IOS",
        version: "21.26.4",
        id: "5",
        ua: "com.google.ios.youtube/21.26.4 (iPhone16,2; U; CPU iOS 18_3_2 like Mac OS X;)",
        os_name: "iPhone",
        os_version: "18.3.2.22D82",
        make: "Apple",
        model: "iPhone16,2",
        sdk: None,
    },
];

static LAST_GOOD: AtomicUsize = AtomicUsize::new(0);
static VISITOR: Mutex<Option<String>> = Mutex::new(None);

const WEB_UA: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";

/// A visitor id, minted from the web player's service-worker bootstrap like the app does
/// (Innertube.kt fetchVisitorData). Without one, more identities are asked to sign in.
async fn visitor(http: &reqwest::Client, refresh: bool) -> Option<String> {
    if !refresh {
        if let Some(v) = VISITOR.lock().unwrap().clone() {
            return Some(v);
        }
    }
    let body = http.get("https://www.youtube.com/sw.js_data").header("User-Agent", WEB_UA).send().await.ok()?.text().await.ok()?;
    let v = find_visitor(&body)?;
    *VISITOR.lock().unwrap() = Some(v.clone());
    Some(v)
}

fn find_visitor(body: &str) -> Option<String> {
    // Protobuf-in-base64 starting "Cg", 40+ chars; nothing else in there has that shape.
    let b = body.as_bytes();
    let mut i = 0;
    while i + 2 < b.len() {
        if b[i] == b'"' && b[i + 1] == b'C' && b[i + 2] == b'g' {
            let rest = &body[i + 1..];
            let end = rest.find('"').unwrap_or(0);
            let cand = &rest[..end];
            if cand.len() >= 42 && cand.bytes().all(|c| c.is_ascii_alphanumeric() || c == b'_' || c == b'-' || c == b'%') {
                return Some(cand.to_string());
            }
        }
        i += 1;
    }
    None
}

/// Whether googlevideo really serves this URL: a 2 MB range (the size playback asks for, since a
/// doubted session passes small probes and fails big ones), audio back, and bytes that arrive.
async fn probe(http: &reqwest::Client, s: &Stream) -> bool {
    use futures_util::StreamExt;
    let r = http.get(&s.url).header("Range", "bytes=0-2097151").header("User-Agent", &s.ua).send().await;
    let Ok(resp) = r else { return false };
    if !resp.status().is_success() {
        return false;
    }
    let audio = resp.headers().get("content-type").and_then(|v| v.to_str().ok()).is_some_and(|t| t.starts_with("audio/"));
    if !audio {
        return false;
    }
    let mut body = resp.bytes_stream();
    let mut got = 0usize;
    let read = async {
        while let Some(Ok(c)) = body.next().await {
            got += c.len();
            if got >= 16 * 1024 {
                return true;
            }
        }
        false
    };
    tokio::time::timeout(std::time::Duration::from_secs(8), read).await.unwrap_or(false)
}

#[derive(Clone, Debug)]
pub struct Stream {
    pub url: String,
    pub mime: String,
    pub ua: String,
    pub size: Option<u64>,
}

fn pick(formats: &[Value], opus_first: bool) -> Option<&Value> {
    // 140 = AAC 128k in .m4a (plays everywhere), 251 = Opus ~160k in .webm.
    let prefs: &[u64] = if opus_first { &[251, 140, 250, 249, 139] } else { &[140, 251, 250, 249, 139] };
    for itag in prefs {
        if let Some(f) = formats.iter().find(|f| f["itag"].as_u64() == Some(*itag) && f["url"].is_string()) {
            return Some(f);
        }
    }
    formats.iter().find(|f| f["mimeType"].as_str().is_some_and(|m| m.starts_with("audio/")) && f["url"].is_string())
}

async fn ask(http: &reqwest::Client, c: &Client, video_id: &str, hl: &str, opus_first: bool, visitor: Option<&str>) -> Result<Stream, String> {
    let mut client = json!({
        "clientName": c.name, "clientVersion": c.version, "osName": c.os_name, "osVersion": c.os_version,
        "deviceMake": c.make, "deviceModel": c.model, "hl": hl, "gl": "US",
    });
    if let Some(s) = c.sdk {
        client["androidSdkVersion"] = json!(s);
    }
    if let Some(v) = visitor {
        client["visitorData"] = json!(v);
    }
    let body = json!({ "context": { "client": client }, "videoId": video_id, "contentCheckOk": true, "racyCheckOk": true });
    let mut req = http
        .post("https://www.youtube.com/youtubei/v1/player?prettyPrint=false")
        .header("User-Agent", c.ua)
        .header("X-YouTube-Client-Name", c.id)
        .header("X-YouTube-Client-Version", c.version);
    if let Some(v) = visitor {
        req = req.header("X-Goog-Visitor-Id", v);
    }
    let resp = req
        .json(&body)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if !resp.status().is_success() {
        return Err(format!("{} {}: HTTP {}", c.name, c.version, resp.status().as_u16()));
    }
    let v: Value = resp.json().await.map_err(|e| e.to_string())?;
    let status = v["playabilityStatus"]["status"].as_str().unwrap_or("");
    if status != "OK" {
        let why = v["playabilityStatus"]["reason"].as_str().unwrap_or(status);
        return Err(format!("{}: {}", c.name, why));
    }
    let formats = v["streamingData"]["adaptiveFormats"].as_array().cloned().unwrap_or_default();
    let f = pick(&formats, opus_first).ok_or_else(|| format!("{}: no audio url", c.name))?;
    Ok(Stream {
        url: f["url"].as_str().unwrap_or_default().to_string(),
        mime: f["mimeType"].as_str().unwrap_or("audio/mp4").split(';').next().unwrap_or("audio/mp4").to_string(),
        ua: c.ua.to_string(),
        size: f["contentLength"].as_str().and_then(|s| s.parse().ok()),
    })
}

/// Walks the identities, starting with the one that worked last time. A URL counts only once
/// googlevideo has actually served it (see [probe]); a bot check gets one fresh visitor id.
pub async fn stream(http: &reqwest::Client, video_id: &str, hl: &str, opus_first: bool) -> Result<Stream, String> {
    let start = LAST_GOOD.load(Ordering::Relaxed);
    let mut errors = Vec::new();
    let mut v = visitor(http, false).await;
    let mut refreshed = false;
    for k in 0..CLIENTS.len() {
        let i = (start + k) % CLIENTS.len();
        let c = &CLIENTS[i];
        match ask(http, c, video_id, hl, opus_first, v.as_deref()).await {
            Ok(s) => {
                if probe(http, &s).await {
                    LAST_GOOD.store(i, Ordering::Relaxed);
                    return Ok(s);
                }
                errors.push(format!("{} {}: refused by googlevideo", c.name, c.version));
            }
            Err(e) => {
                let l = e.to_lowercase();
                if !refreshed && (l.contains("bot") || l.contains("sign in") || l.contains("login_required")) && !l.contains("confirm your age") {
                    refreshed = true;
                    v = visitor(http, true).await.or(v);
                }
                errors.push(e)
            }
        }
    }
    Err(errors.join(" · "))
}
