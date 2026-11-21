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

/// Same identities and versions as the Android app, in the order it walks them.
pub const CLIENTS: &[Client] = &[
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
];

static LAST_GOOD: AtomicUsize = AtomicUsize::new(0);

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

async fn ask(http: &reqwest::Client, c: &Client, video_id: &str, hl: &str, opus_first: bool) -> Result<Stream, String> {
    let mut client = json!({
        "clientName": c.name, "clientVersion": c.version, "osName": c.os_name, "osVersion": c.os_version,
        "deviceMake": c.make, "deviceModel": c.model, "hl": hl, "gl": "US",
    });
    if let Some(s) = c.sdk {
        client["androidSdkVersion"] = json!(s);
    }
    let body = json!({ "context": { "client": client }, "videoId": video_id, "contentCheckOk": true, "racyCheckOk": true });
    let resp = http
        .post("https://www.youtube.com/youtubei/v1/player?prettyPrint=false")
        .header("User-Agent", c.ua)
        .header("X-YouTube-Client-Name", c.id)
        .header("X-YouTube-Client-Version", c.version)
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

/// Walks the identities, starting with the one that worked last time.
pub async fn stream(http: &reqwest::Client, video_id: &str, hl: &str, opus_first: bool) -> Result<Stream, String> {
    let start = LAST_GOOD.load(Ordering::Relaxed);
    let mut errors = Vec::new();
    for k in 0..CLIENTS.len() {
        let i = (start + k) % CLIENTS.len();
        match ask(http, &CLIENTS[i], video_id, hl, opus_first).await {
            Ok(s) => {
                LAST_GOOD.store(i, Ordering::Relaxed);
                return Ok(s);
            }
            Err(e) => errors.push(e),
        }
    }
    Err(errors.join(" · "))
}
