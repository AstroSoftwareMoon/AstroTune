use serde::Serialize;
use std::{collections::HashMap, sync::Mutex};

use crate::model::now_ms;

#[derive(Clone, Debug, Serialize)]
pub struct Conn {
    pub host: String,
    pub requests: u64,
    pub last: i64,
}

/// Hosts reached since the app started. Kept in memory only, never written or sent.
#[derive(Default)]
pub struct ConnLog(Mutex<HashMap<String, (u64, i64)>>);

impl ConnLog {
    pub fn note(&self, host: &str) {
        if let Ok(mut m) = self.0.lock() {
            let e = m.entry(host.to_string()).or_insert((0, 0));
            e.0 += 1;
            e.1 = now_ms();
        }
    }

    pub fn list(&self) -> Vec<Conn> {
        let mut v: Vec<Conn> = self
            .0
            .lock()
            .map(|m| m.iter().map(|(h, (n, t))| Conn { host: h.clone(), requests: *n, last: *t }).collect())
            .unwrap_or_default();
        v.sort_by(|a, b| b.last.cmp(&a.last));
        v
    }
}
