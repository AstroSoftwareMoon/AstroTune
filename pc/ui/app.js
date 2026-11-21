"use strict";
// AstroTune PC front end. It never touches the network: every request goes through the Rust commands.
const TAURI = window.__TAURI__;
const MOCK = !TAURI;
const MARK = '<svg class="x" viewBox="23.82 28.18 60.17 51.58" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="gph" x1=".1" y1="1" x2=".8" y2=".2"><stop offset="0" stop-color="#7a00ff"/><stop offset=".5" stop-color="#d900e6"/><stop offset="1" stop-color="#ff0aa0"/></linearGradient></defs><path d="M83.99,33.47 L83.62,33.34 L82.56,33.78 L81.63,33.96 L80.20,33.96 L78.52,33.53 L77.33,32.97 L75.90,32.04 L73.60,30.23 L72.11,29.24 L69.99,28.36 L68.62,28.18 L67.50,28.24 L66.13,28.74 L65.57,29.24 L65.20,30.17 L65.20,59.04 L65.08,59.66 L64.64,60.72 L63.89,61.84 L63.02,62.77 L61.40,64.02 L59.85,64.89 L58.11,65.57 L56.68,65.95 L54.81,66.20 L52.69,66.20 L51.57,66.07 L49.58,65.64 L48.09,65.14 L45.48,63.83 L43.11,62.09 L41.49,60.47 L40.12,58.67 L39.38,57.42 L38.13,54.50 L37.64,52.57 L37.45,51.26 L37.39,48.65 L37.76,46.04 L38.69,43.11 L40.12,40.37 L41.87,38.01 L43.61,36.20 L45.16,34.90 L46.53,33.96 L48.15,33.03 L50.20,32.10 L50.58,31.60 L50.52,31.04 L50.02,30.60 L48.96,30.36 L46.53,30.36 L44.17,30.73 L41.99,31.29 L39.94,32.04 L37.45,33.22 L35.77,34.21 L34.09,35.40 L32.16,37.01 L29.98,39.25 L28.43,41.24 L27.18,43.17 L25.94,45.60 L25.25,47.28 L24.32,50.45 L23.82,53.69 L23.82,57.11 L24.13,59.48 L24.63,61.65 L25.25,63.58 L26.19,65.76 L27.37,67.94 L28.30,69.37 L30.11,71.67 L32.22,73.85 L33.47,74.91 L35.40,76.28 L36.89,77.15 L38.69,78.02 L41.37,78.95 L43.92,79.51 L45.60,79.70 L47.59,79.76 L49.96,79.57 L52.01,79.20 L54.31,78.52 L56.80,77.46 L58.48,76.52 L59.72,75.72 L61.96,73.91 L63.77,72.04 L64.95,70.55 L65.95,69.06 L66.88,67.38 L67.69,65.51 L68.44,63.21 L68.81,61.47 L69.06,59.48 L69.12,37.26 L69.68,36.95 L71.30,37.01 L72.98,37.57 L75.28,38.69 L76.59,39.07 L78.45,39.13 L79.70,38.88 L81.44,38.01 L82.68,36.83 L83.12,36.20 L83.74,34.90 L83.99,34.03 Z" fill="url(#gph)"/></svg>';
const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const I18N = {
  es: { search: "Buscar", favorites: "Favoritas", playlists: "Playlists", history: "Historial", privacy: "Privacidad",
    tag: "Privada y anónima. Sin cuenta, sin rastreo, sin ubicación.", splash: "PRIVADA · ANÓNIMA",
    ph: "Busca canciones, artistas...", nores: "Escribe algo para buscar música.", searching: "Buscando...", offline: "Modo sin conexión activado: no se hace ninguna petición a internet.",
    nofav: "Aún no tienes favoritas.\nPulsa el corazón en cualquier canción.", nohist: "Sin historial.", nopl: "Aún no tienes playlists.",
    newpl: "Nueva playlist", create: "Crear", cancel: "Cancelar", name: "Nombre", import: "Importar enlace", importph: "Pega un enlace de playlist de YouTube Music",
    imported: "Playlist importada", playall: "Reproducir todo", del: "Eliminar", tracks: "canciones", addto: "Añadir a playlist", added: "Añadida",
    noplayable: "No se pudo reproducir", loading: "Cargando", lyrics: "Letra", nolyr: "Sin letra para esta canción.", lyrload: "Cargando letra...",
    ptitle: "Privada y anónima", pa: "AstroTune no tiene cuenta, no te identifica y no envía estadísticas ni datos tuyos a ningún sitio.",
    pl1: "Sin cuenta ni identificador de instalación: eres anónimo.", pl2: "Sin ubicación, sin micrófono, sin telemetría.", pl3: "Tu biblioteca, historial y ajustes viven solo en este PC.",
    pl4: "La interfaz no puede acceder a internet: solo el núcleo pide música a YouTube Music.",
    off: "Modo sin conexión", offd: "Bloquea todo internet. Solo suena la música ya reproducida (guardada en caché).",
    guest: "Modo invitado", guestd: "Reproduce sin guardar nada en el historial.", hdays: "Borrado automático del historial", hdd: "Elimina lo que supere el tiempo elegido.",
    forever: "Conservar todo", d7: "7 días", d30: "30 días", d90: "90 días",
    conns: "Dónde se conecta AstroTune", connsd: "Servidores contactados desde que abriste la app. Esta lista no sale de tu PC.", noconn: "Ninguna conexión todavía.", req: "peticiones",
    clearh: "Borrar historial", erase: "Borrar todo", erased: "¿Borrar todo?", erasedd: "Se eliminan biblioteca, historial, ajustes y caché de este PC y la app se cierra. No se puede deshacer.",
    fullscreen: "F11: pantalla completa", yes: "Borrar", close: "Cerrar", badlink: "Enlace no válido" },
  en: { search: "Search", favorites: "Favorites", playlists: "Playlists", history: "History", privacy: "Privacy",
    tag: "Private and anonymous. No account, no tracking, no location.", splash: "PRIVATE · ANONYMOUS",
    ph: "Search songs, artists...", nores: "Type something to search for music.", searching: "Searching...", offline: "Offline mode is on: no request is made to the internet.",
    nofav: "No favorites yet.\nTap the heart on any song.", nohist: "No history.", nopl: "No playlists yet.",
    newpl: "New playlist", create: "Create", cancel: "Cancel", name: "Name", import: "Import link", importph: "Paste a YouTube Music playlist link",
    imported: "Playlist imported", playall: "Play all", del: "Delete", tracks: "songs", addto: "Add to playlist", added: "Added",
    noplayable: "Couldn't play this", loading: "Loading", lyrics: "Lyrics", nolyr: "No lyrics for this song.", lyrload: "Loading lyrics...",
    ptitle: "Private and anonymous", pa: "AstroTune has no account, doesn't identify you and sends no statistics or personal data anywhere.",
    pl1: "No account and no install ID: you stay anonymous.", pl2: "No location, no microphone, no telemetry.", pl3: "Your library, history and settings live only on this PC.",
    pl4: "The interface can't reach the internet: only the core asks YouTube Music for music.",
    off: "Offline mode", offd: "Blocks all internet. Only already played music (cached) plays.",
    guest: "Guest mode", guestd: "Plays without saving anything to history.", hdays: "Delete history automatically", hdd: "Removes anything older than the chosen time.",
    forever: "Keep everything", d7: "7 days", d30: "30 days", d90: "90 days",
    conns: "Where AstroTune connects", connsd: "Servers reached since you opened the app. This list never leaves your PC.", noconn: "No connections yet.", req: "requests",
    clearh: "Clear history", erase: "Erase everything", erased: "Erase everything?", erasedd: "Deletes library, history, settings and cache from this PC and closes the app. This can't be undone.",
    fullscreen: "F11: full screen", yes: "Erase", close: "Close", badlink: "Invalid link" },
};
Object.assign(I18N.es, {
  queue: "Cola", noqueue: "La cola está vacía. Reproduce algo para empezar.", fav: "Favorita",
  foryou: "Para ti", foryoud: "Sugerencias de los artistas que elegiste. Solo se buscan esos nombres.",
  t_shuffle: "Aleatorio", t_prev: "Anterior", t_pp: "Reproducir / pausa", t_next: "Siguiente", t_repeat: "Repetir", t_np: "Pantalla completa del reproductor", t_close: "Cerrar", t_sleep: "Temporizador de apagado",
  min: "min", sleepoff: "Desactivar temporizador", sleepset: "La música se pausará en {n} min", sleepdone: "Temporizador: música pausada",
  langtastes: "Idioma y gustos", lang: "Idioma", langd: "Cambia el idioma de toda la app al instante.", tastes: "Tus artistas", tastesd: "Solo se guardan en tu PC. Pulsa uno para quitarlo.", addart: "Añadir otro artista...", add: "Añadir", repeatwel: "Ver la bienvenida otra vez",
  wlang: "Elige tu idioma · Choose your language", wlangs: "Puedes cambiarlo cuando quieras en Privacidad.",
  sect: "Tu música, solo tuya", sects: "AstroTune está hecha alrededor de tu privacidad. Esto es lo que garantiza:",
  sec1: "Sin cuenta, sin registro y sin identificador: nadie sabe quién eres.", sec2: "Ningún dato tuyo sale de tu PC. Biblioteca, historial y ajustes se guardan solo aquí.", sec3: "Sin ubicación, sin micrófono, sin cámara, sin anuncios y sin telemetría.", sec4: "La interfaz está aislada y no puede acceder a internet; solo el núcleo pide la música.", sec5: "Código abierto y sin programas de terceros dentro. Cada descarga incluye su suma SHA-256 para comprobarla.",
  artt: "¿Qué artistas te gustan?", arts: "Elige los que quieras para que te sugiera música. Se guarda solo en tu PC y no se comparte con nadie.",
  prit: "Tu nivel de privacidad", pris: "Puedes cambiarlo cuando quieras en Privacidad.",
  next: "Continuar", back: "Atrás", skip: "Saltar", start: "Empezar",
});
Object.assign(I18N.en, {
  queue: "Queue", noqueue: "The queue is empty. Play something to start.", fav: "Favorite",
  foryou: "For you", foryoud: "Suggestions from the artists you picked. Only those names are searched.",
  t_shuffle: "Shuffle", t_prev: "Previous", t_pp: "Play / pause", t_next: "Next", t_repeat: "Repeat", t_np: "Full screen player", t_close: "Close", t_sleep: "Sleep timer",
  min: "min", sleepoff: "Turn off timer", sleepset: "Music will pause in {n} min", sleepdone: "Timer: music paused",
  langtastes: "Language and tastes", lang: "Language", langd: "Changes the language of the whole app instantly.", tastes: "Your artists", tastesd: "Stored only on this PC. Tap one to remove it.", addart: "Add another artist...", add: "Add", repeatwel: "Show the welcome again",
  wlang: "Elige tu idioma · Choose your language", wlangs: "You can change it any time in Privacy.",
  sect: "Your music, only yours", sects: "AstroTune is built around your privacy. This is what it guarantees:",
  sec1: "No account, no sign-up and no identifier: nobody knows who you are.", sec2: "None of your data leaves your PC. Library, history and settings are stored only here.", sec3: "No location, no microphone, no camera, no ads and no telemetry.", sec4: "The interface is sealed and can't reach the internet; only the core asks for music.", sec5: "Open source with no third-party programs inside. Every download ships its SHA-256 checksum so you can verify it.",
  artt: "Which artists do you like?", arts: "Pick any you like so I can suggest music. It's stored only on this PC and shared with nobody.",
  prit: "Your privacy level", pris: "You can change it any time in Privacy.",
  next: "Continue", back: "Back", skip: "Skip", start: "Start",
});
let LANG = (navigator.language || "es").toLowerCase().startsWith("en") ? "en" : "es";
const t = (k, v) => { let s = I18N[LANG][k] ?? I18N.es[k] ?? k; if (v) for (const x in v) s = s.replace("{" + x + "}", v[x]); return s; };
const ARTISTS = ["Bad Bunny", "Rosalía", "Dua Lipa", "The Weeknd", "Queen", "Daft Punk", "Taylor Swift", "Quevedo", "Aitana", "C. Tangana", "Estopa", "Coldplay", "Imagine Dragons", "Billie Eilish", "Feid", "Karol G", "Arctic Monkeys", "Linkin Park", "Rauw Alejandro", "Amaral", "Mecano", "Fito y Fitipaldis", "Ed Sheeran", "Metallica"];

// ---------- backend bridge (mock data when opened in a plain browser, for design previews) ----------
const demo = [
  ["Nebula Drive", "Luna Park", "Midnight Orbit", 214], ["Violet Hour", "Astra", "Violet Hour", 187], ["Pink Gravity", "Moon Club", "Soft Planets", 241],
  ["Afterglow", "Satellite", "Low Orbit", 198], ["Cosmic Dust", "Lyra", "Stardust", 226], ["Eclipse", "Nova", "Eclipse", 205],
].map(([title, artist, album, duration], i) => ({ id: "demo" + i, title, artist, album, duration, cover: null }));
let mockState = { settings: { offline: false, guest: false, history_days: 0, volume: 0.8, lang: "", onboarded: !/welcome/.test(location.hash), artists: ["Rosalía", "Queen"] }, library: { favorites: [demo[1]], playlists: [{ id: "p1", name: "Late night", tracks: demo.slice(0, 4) }], history: demo.slice(0, 3).map((x, i) => ({ track: x, played_at: Date.now() - i * 3.6e6 })) } };
const api = MOCK
  ? { invoke: async (cmd, a = {}) => (cmd === "set_settings" ? (mockState = { ...mockState, settings: a.settings }) : ({ search: demo, get_state: mockState, connections: [{ host: "music.youtube.com", requests: 4, last: Date.now() }, { host: "googlevideo.com", requests: 2, last: Date.now() - 60000 }], lyrics: "Demo lyrics\nLine two\nLine three" }[cmd] ?? mockState)) }
  : { invoke: (cmd, a) => TAURI.core.invoke(cmd, a) };
const listen = (ev, fn) => (MOCK ? null : TAURI.event.listen(ev, (e) => fn(e.payload)));

// ---------- state ----------
let S = { settings: {}, library: { favorites: [], playlists: [], history: [] } };
let view = "search", openPl = null, lastQuery = "", results = [];
let queue = [], qi = -1, cur = null, playing = false, shuffle = false, repeat = false, pos = 0;
const favs = () => new Set(S.library.favorites.map((x) => x.id));

function toast(msg) { const el = $("#toast"); el.textContent = msg; el.classList.add("on"); clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.remove("on"), 3200); }
const fmt = (s) => { s = Math.max(0, Math.floor(s || 0)); return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0"); };
const errText = (e) => (String(e) === "offline" ? t("offline") : String(e) === "bad-link" ? t("badlink") : String(e));
const coverEl = (tr, cls = "cov") => (tr && tr.cover ? `<img class="${cls}" src="${esc(tr.cover)}" loading="lazy" alt="">` : `<div class="${cls}"></div>`);

// ---------- rendering ----------
function row(tr, list, i, extra = "") {
  const fav = favs().has(tr.id);
  return `<div class="row${cur && cur.id === tr.id ? " playing" : ""}" data-i="${i}" data-id="${esc(tr.id)}">
    ${coverEl(tr)}<div style="min-width:0"><div class="t1">${esc(tr.title)}</div><div class="t2">${esc(tr.artist)}${tr.album ? " · " + esc(tr.album) : ""}</div></div>
    <div class="acts"><button class="ib fav${fav ? "" : " off"}" data-a="fav" title="${t("fav")}"><svg viewBox="0 0 24 24" fill="${fav ? "currentColor" : "none"}" stroke="currentColor" stroke-width="2"><path d="M12 20s-7-4.400-9-9.200C1.700 7.600 3.800 4.500 7 4.500c2 0 3.400 1 5 3 1.600-2 3-3 5-3 3.200 0 5.300 3.100 4 6.300-2 4.800-9 9.200-9 9.200z"/></svg></button>
    <button class="ib" data-a="add" title="${t("addto")}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg></button>${extra}<span class="dur">${fmt(tr.duration)}</span></div></div>`;
}
function list(tracks, extra) { return `<div class="list">${tracks.map((x, i) => row(x, tracks, i, extra ? extra(x) : "")).join("")}</div>`; }

function render() {
  document.querySelectorAll(".nav").forEach((n) => n.classList.toggle("on", n.dataset.view === view));
  const v = $("#view");
  if (view === "search") {
    v.innerHTML = `<h1>${t("search")}</h1><div class="search glass pill"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.500-3.500"/></svg><input id="q" placeholder="${t("ph")}" value="${esc(lastQuery)}" autofocus></div><div id="res"></div><div id="foryou"></div>`;
    paintResults(); paintForYou(); $("#q").addEventListener("input", (e) => debounceSearch(e.target.value));
  } else if (view === "favorites") {
    const f = S.library.favorites; v.innerHTML = `<h1>${t("favorites")}</h1>` + (f.length ? `<div class="chips"><button class="btn" data-a="playall">${t("playall")}</button></div>${list(f)}` : `<div class="empty">${esc(t("nofav")).replace("\n", "<br>")}</div>`);
  } else if (view === "history") {
    const h = S.library.history.map((x) => x.track); v.innerHTML = `<h1>${t("history")}</h1>` + (h.length ? `<div class="chips"><button class="btn ghost" data-a="clearh">${t("clearh")}</button></div>${list(h)}` : `<div class="empty">${t("nohist")}</div>`);
  } else if (view === "playlists") {
    if (openPl) {
      const p = S.library.playlists.find((x) => x.id === openPl); if (!p) { openPl = null; return render(); }
      v.innerHTML = `<h1>${esc(p.name)}</h1><div class="chips"><button class="btn" data-a="playall">${t("playall")}</button><button class="btn ghost" data-a="back">←</button><button class="btn danger" data-a="delpl">${t("del")}</button></div>` + (p.tracks.length ? list(p.tracks, (x) => `<button class="ib" data-a="rm" title="${t("del")}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg></button>`) : `<div class="empty">0 ${t("tracks")}</div>`);
    } else {
      v.innerHTML = `<h1>${t("playlists")}</h1><div class="chips"><button class="btn" data-a="newpl">${t("newpl")}</button><button class="btn ghost" data-a="import">${t("import")}</button></div>` +
        (S.library.playlists.length ? `<div class="cards">${S.library.playlists.map((p) => `<div class="card glass" data-pl="${esc(p.id)}"><div class="art">${MARK}</div><div class="t1">${esc(p.name)}</div><div class="t2">${p.tracks.length} ${t("tracks")}</div></div>`).join("")}</div>` : `<div class="empty">${t("nopl")}</div>`);
    }
  } else if (view === "queue") {
    v.innerHTML = `<h1>${t("queue")}</h1>` + (queue.length ? list(queue) : `<div class="empty">${t("noqueue")}</div>`);
  } else if (view === "privacy") {
    const s = S.settings, sw = (k, on) => `<div class="sw${on ? " on" : ""}" data-sw="${k}"></div>`;
    v.innerHTML = `<h1>${t("privacy")}</h1><div class="hero glass"><h2>${t("ptitle")}</h2><p class="sub">${t("pa")}</p><ul><li>${t("pl1")}</li><li>${t("pl2")}</li><li>${t("pl3")}</li><li>${t("pl4")}</li></ul></div>
      <div class="set glass"><div><b>${t("off")}</b><span>${t("offd")}</span></div>${sw("offline", s.offline)}</div>
      <div class="set glass"><div><b>${t("guest")}</b><span>${t("guestd")}</span></div>${sw("guest", s.guest)}</div>
      <div class="set glass"><div><b>${t("hdays")}</b><span>${t("hdd")}</span></div><select id="hd">${[[0, "forever"], [7, "d7"], [30, "d30"], [90, "d90"]].map(([d, k]) => `<option value="${d}"${s.history_days === d ? " selected" : ""}>${t(k)}</option>`).join("")}</select></div>
      <h2>${t("langtastes")}</h2>
      <div class="set glass"><div><b>${t("lang")}</b><span>${t("langd")}</span></div><select id="lang"><option value="es"${LANG === "es" ? " selected" : ""}>Español</option><option value="en"${LANG === "en" ? " selected" : ""}>English</option></select></div>
      <div class="set glass wrap"><div style="flex:1 1 100%"><b>${t("tastes")}</b><span>${t("tastesd")}</span></div><div class="artbox"><div class="arts">${(S.settings.artists || []).map((a) => `<button class="chipsel on" data-rmart="${esc(a)}">${esc(a)} ✕</button>`).join("")}</div><div class="addrow"><input id="newart" placeholder="${t("addart")}"><button class="btn" data-a="addart">${t("add")}</button></div></div></div>
      <div class="chips"><button class="btn ghost" data-a="repeatwel">${t("repeatwel")}</button></div>
      <h2>${t("conns")}</h2><p class="sub">${t("connsd")}</p><div id="conns"></div>
      <div class="chips" style="margin-top:1.4rem"><button class="btn ghost" data-a="clearh">${t("clearh")}</button><button class="btn danger" data-a="erase">${t("erase")}</button></div>`;
    api.invoke("connections").then((c) => { $("#conns").innerHTML = c.length ? c.map((x) => `<div class="conn"><span>${esc(x.host)}</span><span>${x.requests} ${t("req")}</span></div>`).join("") : `<div class="t2">${t("noconn")}</div>`; });
  }
}
function paintResults() {
  const r = $("#res"); if (!r) return;
  if (S.settings.offline) r.innerHTML = `<div class="empty">${t("offline")}</div>`;
  else r.innerHTML = results.length ? list(results) : `<div class="empty">${lastQuery ? "" : t("nores")}</div>`;
}
let forYou = [], fyKey = "";
async function paintForYou() {
  let el = $("#foryou"); if (!el) return;
  const arts = S.settings.artists || [];
  if (!arts.length || S.settings.offline || lastQuery.trim()) { el.innerHTML = ""; return; }
  const key = arts.join("|");
  if (fyKey !== key) {
    fyKey = key; forYou = [];
    el.innerHTML = `<h2>${t("foryou")}</h2><p class="sub">${t("foryoud")}</p><div class="empty">${t("searching")}</div>`;
    const pick = arts.slice().sort(() => Math.random() - 0.5).slice(0, 3);
    const rs = await Promise.all(pick.map((a) => api.invoke("search", { query: a }).catch(() => [])));
    const seen = new Set(); forYou = rs.flatMap((r) => r.slice(0, 5)).filter((x) => !seen.has(x.id) && seen.add(x.id));
  }
  el = $("#foryou"); if (!el || view !== "search" || lastQuery.trim()) return;
  el.innerHTML = forYou.length ? `<h2>${t("foryou")}</h2><p class="sub">${t("foryoud")}</p>${list(forYou)}` : "";
}
let timer; function debounceSearch(q) {
  lastQuery = q; clearTimeout(timer); paintForYou();
  if (!q.trim()) { results = []; return paintResults(); }
  timer = setTimeout(async () => {
    const r = $("#res"); if (r) r.innerHTML = `<div class="empty">${t("searching")}</div>`;
    try { results = await api.invoke("search", { query: q }); } catch (e) { results = []; toast(errText(e)); }
    if (view === "search") paintResults();
  }, 350);
}

// ---------- playback ----------
function setCover(tr) {
  const url = tr && tr.cover;
  $("#bar-cov").src = url || ""; $("#bar-cov").style.visibility = url ? "visible" : "hidden";
  const bg = $("#art-bg"); if (url) { bg.style.backgroundImage = `url("${url}")`; bg.classList.add("on"); } else bg.classList.remove("on");
  $("#bigart").innerHTML = url ? `<img src="${esc(url)}" alt="">` : MARK;
}
function showTrack(tr) {
  cur = tr; $("#bar-title").textContent = tr.title; $("#bar-artist").textContent = tr.artist; $("#np-title").textContent = tr.title; $("#np-artist").textContent = tr.artist;
  setCover(tr); $("#dur").textContent = $("#dur2").textContent = fmt(tr.duration); loadLyrics(tr); render();
}
async function loadLyrics(tr) {
  const el = $("#np-lyr"); el.textContent = t("lyrload");
  try { const l = await api.invoke("lyrics", { id: tr.id }); if (cur && cur.id === tr.id) el.textContent = l || t("nolyr"); } catch (e) { el.textContent = errText(e); }
}
async function playIndex(i) {
  if (!queue.length) return; qi = (i + queue.length) % queue.length; const tr = queue[qi]; showTrack(tr); pos = 0; setPlaying(true);
  try { await api.invoke("play", { track: tr }); } catch (e) { setPlaying(false); toast(t("noplayable") + ": " + errText(e)); }
}
function playList(tracks, i) { queue = tracks.slice(); playIndex(i); }
function setPlaying(p) { playing = p; $("#pp-i2").innerHTML = $("#pp-i").innerHTML = p ? '<path d="M6 4h4v16H6zM14 4h4v16h-4z"/>' : '<path d="M7 4l13 8-13 8z"/>'; }
function next(auto) { if (!queue.length) return; if (auto && repeat) return playIndex(qi); playIndex(shuffle ? Math.floor(Math.random() * queue.length) : qi + 1); }
$("#pp").onclick = () => { if (!cur) return; if (playing) { api.invoke("pause"); setPlaying(false); } else { api.invoke("resume"); setPlaying(true); } };
$("#next").onclick = () => next(false); $("#prev").onclick = () => (pos > 4 ? api.invoke("seek", { seconds: 0 }) : playIndex(qi - 1));
$("#shuffle").onclick = (e) => { shuffle = !shuffle; e.currentTarget.classList.toggle("on", shuffle); };
$("#repeat").onclick = (e) => { repeat = !repeat; e.currentTarget.classList.toggle("on", repeat); };
document.querySelectorAll("[data-proxy]").forEach((b) => (b.onclick = () => $("#" + b.dataset.proxy).click()));
const seek = $("#seek"), seek2 = $("#seek2"), vol = $("#vol");
const paint = (el) => el.style.setProperty("--p", (100 * el.value) / el.max + "%");
seek.oninput = () => { paint(seek); const d = (cur && cur.duration) || 0; $("#cur").textContent = fmt((seek.value / 1000) * d); };
seek.onchange = () => { const d = (cur && cur.duration) || 0; api.invoke("seek", { seconds: (seek.value / 1000) * d }); };
seek2.oninput = () => { paint(seek2); $("#cur2").textContent = fmt((seek2.value / 1000) * ((cur && cur.duration) || 0)); };
seek2.onchange = () => { api.invoke("seek", { seconds: (seek2.value / 1000) * ((cur && cur.duration) || 0) }); };
vol.oninput = () => { paint(vol); api.invoke("set_volume", { volume: vol.value / 100 }); };
listen("player-tick", (p) => { pos = p.pos; if (!seek.matches(":active")) { const d = (cur && cur.duration) || 0; seek.value = d ? Math.min(1000, (p.pos / d) * 1000) : 0; paint(seek); $("#cur").textContent = fmt(p.pos); if (!seek2.matches(":active")) { seek2.value = seek.value; paint(seek2); $("#cur2").textContent = fmt(p.pos); } } if (playing === p.paused) setPlaying(!p.paused); });
listen("player-ended", () => next(true));
listen("player-error", (m) => toast(String(m)));

// ---------- events ----------
document.addEventListener("pointermove", (e) => { const g = e.target.closest && e.target.closest(".glass"); if (g) { const r = g.getBoundingClientRect(); g.style.setProperty("--mx", e.clientX - r.left + "px"); g.style.setProperty("--my", e.clientY - r.top + "px"); } });
document.querySelectorAll(".nav").forEach((n) => (n.onclick = () => { view = n.dataset.view; openPl = null; render(); }));
$("#bar-now").onclick = () => cur && $("#np").classList.add("open");
$("#open-np").onclick = () => $("#np").classList.add("open"); $("#close-np").onclick = () => $("#np").classList.remove("open");
async function toggleFs() { if (MOCK) return; const w = TAURI.window.getCurrentWindow(); await w.setFullscreen(!(await w.isFullscreen())); }
document.addEventListener("keydown", (e) => {
  if (e.key === "F11") { e.preventDefault(); toggleFs(); }
  else if (e.key === "Escape") $("#np").classList.remove("open");
  else if (/INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName)) return;
  else if (e.code === "Space") { e.preventDefault(); $("#pp").click(); }
  else if (e.key === "ArrowRight") api.invoke("seek", { seconds: Math.min((cur && cur.duration) || 0, pos + 10) });
  else if (e.key === "ArrowLeft") api.invoke("seek", { seconds: Math.max(0, pos - 10) });
  else if (e.key === "ArrowUp" || e.key === "ArrowDown") { vol.value = Math.max(0, Math.min(100, +vol.value + (e.key === "ArrowUp" ? 5 : -5))); vol.oninput(); }
  else if (e.key === "n") $("#next").click();
  else if (e.key === "p") $("#prev").click();
});
function menu(x, y, items) {
  document.querySelectorAll(".menu").forEach((m) => m.remove());
  const m = document.createElement("div"); m.className = "menu glass"; m.innerHTML = items.map((it, i) => `<button data-k="${i}">${esc(it[0])}</button>`).join("");
  m.style.left = Math.min(x, innerWidth - 260) + "px"; m.style.top = Math.min(y, innerHeight - 40 - items.length * 44) + "px"; document.body.appendChild(m);
  m.onclick = (e) => { const b = e.target.closest("button"); if (b) { items[b.dataset.k][1](); m.remove(); } };
  setTimeout(() => document.addEventListener("pointerdown", function h(e) { if (!m.contains(e.target)) { m.remove(); document.removeEventListener("pointerdown", h); } }), 0);
}
function dialog(html, onOk, okLabel, danger) {
  const s = document.createElement("div"); s.className = "scrim"; s.innerHTML = `<div class="dialog glass">${html}<div class="row2"><button class="btn ghost" data-x>${t("cancel")}</button><button class="btn${danger ? " danger" : ""}" data-ok>${okLabel}</button></div></div>`;
  document.body.appendChild(s); const inp = s.querySelector("input"); inp && inp.focus();
  s.onclick = (e) => { if (e.target === s || e.target.dataset.x !== undefined) s.remove(); else if (e.target.dataset.ok !== undefined) { const v = inp ? inp.value : ""; s.remove(); onOk(v); } };
  inp && (inp.onkeydown = (e) => e.key === "Enter" && s.querySelector("[data-ok]").click());
}
const setState = (st) => { S = st; };
const saveSettings = async (patch) => setState(await api.invoke("set_settings", { settings: { ...S.settings, ...patch } }));
function curSrc(el) {
  if (el && el.closest && el.closest("#foryou")) return forYou;
  return view === "search" ? results : view === "favorites" ? S.library.favorites : view === "queue" ? queue : view === "history" ? S.library.history.map((x) => x.track) : (S.library.playlists.find((p) => p.id === openPl) || { tracks: [] }).tracks;
}
async function act(a, el, ev) {
  const rowEl = el.closest(".row"); const id = rowEl && rowEl.dataset.id;
  const src = curSrc(el);
  const tr = id && src.find((x) => x.id === id);
  if (a === "fav") { setState(await api.invoke("toggle_favorite", { track: tr })); render(); }
  else if (a === "add") { const pls = S.library.playlists; if (!pls.length) return toast(t("nopl")); menu(ev.clientX, ev.clientY, pls.map((p) => [p.name, async () => { setState(await api.invoke("add_to_playlist", { id: p.id, track: tr })); toast(t("added")); }])); }
  else if (a === "rm") { setState(await api.invoke("remove_from_playlist", { id: openPl, trackId: id })); render(); }
  else if (a === "playall") playList(src, 0);
  else if (a === "back") { openPl = null; render(); }
  else if (a === "delpl") { setState(await api.invoke("delete_playlist", { id: openPl })); openPl = null; render(); }
  else if (a === "newpl") dialog(`<b>${t("newpl")}</b><input placeholder="${t("name")}">`, async (v) => { if (v.trim()) { setState(await api.invoke("create_playlist", { name: v.trim() })); render(); } }, t("create"));
  else if (a === "import") dialog(`<b>${t("import")}</b><input placeholder="${t("importph")}">`, async (v) => { try { setState(await api.invoke("import_playlist", { link: v })); toast(t("imported")); render(); } catch (e) { toast(errText(e)); } }, t("import"));
  else if (a === "addart") { const i = $("#newart"); const n = (i.value || "").trim(); if (n && !(S.settings.artists || []).includes(n)) { await saveSettings({ artists: [...(S.settings.artists || []), n] }); fyKey = ""; render(); } }
  else if (a === "repeatwel") showWelcome();
  else if (a === "clearh") { setState(await api.invoke("clear_history")); render(); }
  else if (a === "erase") dialog(`<b>${t("erased")}</b><span class="t2">${t("erasedd")}</span>`, () => api.invoke("erase_all"), t("yes"), true);
}
$("#view").addEventListener("click", async (e) => {
  const b = e.target.closest("[data-a]"); const rowEl = e.target.closest(".row"); const card = e.target.closest("[data-pl]"); const sw = e.target.closest("[data-sw]");
  const ra = e.target.closest("[data-rmart]");
  if (ra) { await saveSettings({ artists: (S.settings.artists || []).filter((x) => x !== ra.dataset.rmart) }); fyKey = ""; return render(); }
  if (b) { e.stopPropagation(); return act(b.dataset.a, b, e); }
  if (sw) { const s = { ...S.settings, [sw.dataset.sw]: !S.settings[sw.dataset.sw] }; setState(await api.invoke("set_settings", { settings: s })); return render(); }
  if (card) { openPl = card.dataset.pl; return render(); }
  if (rowEl) { const i = +rowEl.dataset.i; const src = curSrc(e.target); playList(src, i); }
});
$("#view").addEventListener("change", async (e) => { if (e.target.id === "lang") { LANG = e.target.value; await saveSettings({ lang: LANG }); applyLang(); render(); } if (e.target.id === "hd") { const s = { ...S.settings, history_days: +e.target.value }; setState(await api.invoke("set_settings", { settings: s })); render(); } });

// ---------- sleep timer ----------
let sleepT = null;
function setSleep(n) {
  clearTimeout(sleepT); $("#sleep").classList.toggle("on", !!n);
  if (n) { toast(t("sleepset", { n })); sleepT = setTimeout(() => { if (playing) { api.invoke("pause"); setPlaying(false); } $("#sleep").classList.remove("on"); toast(t("sleepdone")); }, n * 60000); } else toast(t("sleepoff"));
}
$("#sleep").onclick = (e) => { const r = e.currentTarget.getBoundingClientRect(); const items = [15, 30, 45, 60, 90].map((n) => [n + " " + t("min"), () => setSleep(n)]).concat([[t("sleepoff"), () => setSleep(0)]]); menu(r.left - 100, r.top - items.length * 46 - 16, items); };

// ---------- language ----------
function applyLang() {
  document.documentElement.lang = LANG; $("#side-tag").textContent = t("tag"); $("#splash-line").textContent = t("splash");
  document.querySelectorAll("[data-tr]").forEach((n) => (n.textContent = t(n.dataset.tr)));
  const T = { shuffle: "t_shuffle", prev: "t_prev", pp: "t_pp", next: "t_next", repeat: "t_repeat", "open-np": "t_np", "close-np": "t_close", sleep: "t_sleep" };
  for (const id in T) { const el = document.getElementById(id); if (el) el.title = t(T[id]); }
  document.querySelectorAll("[data-proxy]").forEach((b) => (b.title = t({ prev: "t_prev", pp: "t_pp", next: "t_next" }[b.dataset.proxy])));
}

// ---------- welcome (first run) ----------
let wstep = 0, wsel = new Set();
const CHECK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l8 3v6c0 4.500-3.200 8-8 9-4.800-1-8-4.500-8-9V6z"/><path d="M9 12l2 2 4-4"/></svg>';
function showWelcome(step = 0) {
  const old = $("#welcome"); if (old) old.remove();
  wstep = step; wsel = new Set(S.settings.artists || []);
  const w = document.createElement("section"); w.id = "welcome"; document.body.appendChild(w);
  w.addEventListener("click", welcomeClick);
  w.addEventListener("change", async (e) => { if (e.target.id === "whd") { await saveSettings({ history_days: +e.target.value }); } });
  w.addEventListener("keydown", (e) => { if (e.key === "Enter" && e.target.id === "wnew") addWelcomeArtist(); });
  drawWelcome();
}
function addWelcomeArtist() { const i = $("#wnew"); const n = (i.value || "").trim(); if (n) { wsel.add(n); drawWelcome(); const j = $("#wnew"); j && j.focus(); } }
function drawWelcome() {
  const w = $("#welcome"); if (!w) return;
  const s = S.settings;
  let body = "";
  if (wstep === 0) body = `<div class="wmark">${MARK}</div><h1>AstroTune</h1><h2>${t("wlang")}</h2><div class="langs"><button class="lang${LANG === "es" ? " on" : ""}" data-l="es">Español</button><button class="lang${LANG === "en" ? " on" : ""}" data-l="en">English</button></div><p class="sub">${t("wlangs")}</p>`;
  else if (wstep === 1) body = `<h1>${t("sect")}</h1><p class="sub">${t("sects")}</p><ul class="wlist">${["sec1", "sec2", "sec3", "sec4", "sec5"].map((k) => `<li>${CHECK}<span>${t(k)}</span></li>`).join("")}</ul>`;
  else if (wstep === 2) {
    const all = [...ARTISTS, ...[...wsel].filter((x) => !ARTISTS.includes(x))];
    body = `<h1>${t("artt")}</h1><p class="sub">${t("arts")}</p><div class="arts">${all.map((a) => `<button class="chipsel${wsel.has(a) ? " on" : ""}" data-art="${esc(a)}">${esc(a)}</button>`).join("")}</div><div class="addrow"><input id="wnew" placeholder="${t("addart")}"><button class="btn ghost" data-w="addart">${t("add")}</button></div>`;
  } else body = `<h1>${t("prit")}</h1><p class="sub">${t("pris")}</p>
    <div class="set glass"><div><b>${t("off")}</b><span>${t("offd")}</span></div><div class="sw${s.offline ? " on" : ""}" data-wsw="offline"></div></div>
    <div class="set glass"><div><b>${t("guest")}</b><span>${t("guestd")}</span></div><div class="sw${s.guest ? " on" : ""}" data-wsw="guest"></div></div>
    <div class="set glass"><div><b>${t("hdays")}</b><span>${t("hdd")}</span></div><select id="whd">${[[0, "forever"], [7, "d7"], [30, "d30"], [90, "d90"]].map(([d, k]) => `<option value="${d}"${s.history_days === d ? " selected" : ""}>${t(k)}</option>`).join("")}</select></div>`;
  const last = wstep === 3;
  w.innerHTML = `<div class="wcard glass">${body}<div class="wnav"><div class="dots">${[0, 1, 2, 3].map((i) => `<i class="${i === wstep ? "on" : ""}"></i>`).join("")}</div><div class="r">${wstep > 0 ? `<button class="btn ghost" data-w="back">${t("back")}</button>` : ""}${wstep === 2 ? `<button class="btn ghost" data-w="skip">${t("skip")}</button>` : ""}<button class="btn" data-w="${last ? "start" : "next"}">${last ? t("start") : t("next")}</button></div></div></div>`;
}
async function welcomeClick(e) {
  const l = e.target.closest("[data-l]"), a = e.target.closest("[data-art]"), sw = e.target.closest("[data-wsw]"), b = e.target.closest("[data-w]");
  if (l) { LANG = l.dataset.l; await saveSettings({ lang: LANG }); applyLang(); render(); return drawWelcome(); }
  if (a) { wsel.has(a.dataset.art) ? wsel.delete(a.dataset.art) : wsel.add(a.dataset.art); return drawWelcome(); }
  if (sw) { await saveSettings({ [sw.dataset.wsw]: !S.settings[sw.dataset.wsw] }); return drawWelcome(); }
  if (!b) return;
  const k = b.dataset.w;
  if (k === "addart") return addWelcomeArtist();
  if (k === "next") { wstep++; return drawWelcome(); }
  if (k === "skip") { wsel = new Set(); wstep++; return drawWelcome(); }
  if (k === "back") { wstep--; return drawWelcome(); }
  if (k === "start") {
    await saveSettings({ onboarded: true, lang: LANG, artists: [...wsel] }); fyKey = "";
    const w = $("#welcome"); w.classList.add("out"); setTimeout(() => w.remove(), 600); render();
  }
}

// ---------- start ----------

(async function init() {
  try { setState(await api.invoke("get_state")); } catch (e) { toast(String(e)); }
  if (S.settings.lang) LANG = S.settings.lang;
  applyLang();
  vol.value = Math.round((S.settings.volume ?? 0.8) * 100); paint(vol); paint(seek); render();
  if (MOCK) { // design previews in a plain browser: #privacy, #favorites, #np ...
    const h = location.hash.slice(1); if (h && h !== "np" && !/welcome/.test(h)) { view = h; render(); }
    if (h === "np") { results = demo; playList(demo, 1); setTimeout(() => $("#np").classList.add("open"), 50); }
    if (h === "") { debounceSearch("neon"); }
  }
  if (!S.settings.onboarded) showWelcome(MOCK ? +(location.hash.match(/welcome(\d)/) || [0, 0])[1] : 0);
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  setTimeout(() => { $("#splash").classList.add("out"); setTimeout(() => $("#splash").remove(), 1200); }, reduce ? 200 : 2600);
})();
