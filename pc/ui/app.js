"use strict";
// AstroTune (Rust) — PC and Android. Mirrors the Android app: Home, Explore, Library, Search, the
// artwork-coloured player and its settings. The interface never touches the network itself: every
// request goes through the Rust core.
const TAURI = window.__TAURI__;
const MOCK = !TAURI;
const MARK = '<svg class="x" viewBox="23.82 28.18 60.17 51.58" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="gph" x1=".1" y1="1" x2=".8" y2=".2"><stop offset="0" stop-color="#7a00ff"/><stop offset=".5" stop-color="#d900e6"/><stop offset="1" stop-color="#ff0aa0"/></linearGradient></defs><path d="M83.99,33.47 L83.62,33.34 L82.56,33.78 L81.63,33.96 L80.20,33.96 L78.52,33.53 L77.33,32.97 L75.90,32.04 L73.60,30.23 L72.11,29.24 L69.99,28.36 L68.62,28.18 L67.50,28.24 L66.13,28.74 L65.57,29.24 L65.20,30.17 L65.20,59.04 L65.08,59.66 L64.64,60.72 L63.89,61.84 L63.02,62.77 L61.40,64.02 L59.85,64.89 L58.11,65.57 L56.68,65.95 L54.81,66.20 L52.69,66.20 L51.57,66.07 L49.58,65.64 L48.09,65.14 L45.48,63.83 L43.11,62.09 L41.49,60.47 L40.12,58.67 L39.38,57.42 L38.13,54.50 L37.64,52.57 L37.45,51.26 L37.39,48.65 L37.76,46.04 L38.69,43.11 L40.12,40.37 L41.87,38.01 L43.61,36.20 L45.16,34.90 L46.53,33.96 L48.15,33.03 L50.20,32.10 L50.58,31.60 L50.52,31.04 L50.02,30.60 L48.96,30.36 L46.53,30.36 L44.17,30.73 L41.99,31.29 L39.94,32.04 L37.45,33.22 L35.77,34.21 L34.09,35.40 L32.16,37.01 L29.98,39.25 L28.43,41.24 L27.18,43.17 L25.94,45.60 L25.25,47.28 L24.32,50.45 L23.82,53.69 L23.82,57.11 L24.13,59.48 L24.63,61.65 L25.25,63.58 L26.19,65.76 L27.37,67.94 L28.30,69.37 L30.11,71.67 L32.22,73.85 L33.47,74.91 L35.40,76.28 L36.89,77.15 L38.69,78.02 L41.37,78.95 L43.92,79.51 L45.60,79.70 L47.59,79.76 L49.96,79.57 L52.01,79.20 L54.31,78.52 L56.80,77.46 L58.48,76.52 L59.72,75.72 L61.96,73.91 L63.77,72.04 L64.95,70.55 L65.95,69.06 L66.88,67.38 L67.69,65.51 L68.44,63.21 L68.81,61.47 L69.06,59.48 L69.12,37.26 L69.68,36.95 L71.30,37.01 L72.98,37.57 L75.28,38.69 L76.59,39.07 L78.45,39.13 L79.70,38.88 L81.44,38.01 L82.68,36.83 L83.12,36.20 L83.74,34.90 L83.99,34.03 Z" fill="url(#gph)"/></svg>';
const VERSION = "1.8.0";
let markN = 0;
const mark = () => MARK.replaceAll("gph", "gph" + ++markN).replace("<svg ", '<svg style="width:100%;height:auto" ');
const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// ---------------------------------------------------------------- icons
const P = (d, fill) => `<svg viewBox="0 0 24 24" ${fill ? 'fill="currentColor"' : 'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"'}>${d}</svg>`;
const IC = {
  play: P('<path d="M7 4.5v15a1 1 0 0 0 1.5.86l12.5-7.5a1 1 0 0 0 0-1.72L8.5 3.64A1 1 0 0 0 7 4.5z"/>', 1),
  pause: P('<rect x="6" y="4" width="4.2" height="16" rx="1.2"/><rect x="13.8" y="4" width="4.2" height="16" rx="1.2"/>', 1),
  prev: P('<path d="M6 5h2.2v14H6zm14 .8v12.4a.8.8 0 0 1-1.2.7L9.4 12.7a.8.8 0 0 1 0-1.4l9.4-6.2a.8.8 0 0 1 1.2.7z"/>', 1),
  next: P('<path d="M15.8 5H18v14h-2.2zM4 5.8v12.4a.8.8 0 0 0 1.2.7l9.4-6.2a.8.8 0 0 0 0-1.4L5.2 5.1A.8.8 0 0 0 4 5.8z"/>', 1),
  heart: P('<path d="M12 20.5s-7.5-4.6-9.4-9.5C1.300 7.600 3.600 4.500 7 4.500c2.100 0 3.600 1.100 5 3 1.400-1.900 2.900-3 5-3 3.400 0 5.700 3.100 4.400 6.500-1.900 4.900-9.400 9.500-9.400 9.500z"/>'),
  heartF: P('<path d="M12 20.5s-7.5-4.6-9.4-9.5C1.300 7.600 3.600 4.500 7 4.500c2.100 0 3.600 1.100 5 3 1.400-1.900 2.900-3 5-3 3.400 0 5.700 3.100 4.400 6.500-1.900 4.900-9.400 9.500-9.400 9.500z"/>', 1),
  more: P('<circle cx="5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="19" cy="12" r="1.8"/>', 1),
  down: P('<path d="m6 9 6 6 6-6"/>'),
  back: P('<path d="M19 12H5m6-7-7 7 7 7"/>'),
  shuffle: P('<path d="M16 3h5v5M4 20 21 3M21 16v5h-5M15 15l6 6M4 4l5 5"/>'),
  repeat: P('<path d="m17 2 4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14M7 22l-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/>'),
  repeat1: P('<path d="m17 2 4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14M7 22l-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/><path d="M11 10h1v4"/>'),
  lyrics: P('<path d="M4 6h10M4 10h10M4 14h6"/><circle cx="17.5" cy="16.5" r="2.5"/><path d="M20 16.5V6l2-1"/>'),
  queue: P('<path d="M3 6h13M3 12h13M3 18h8"/><path d="M17 14v7l5-3.5z" fill="currentColor"/>'),
  timer: P('<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2.5M9 2h6"/>'),
  radio: P('<circle cx="12" cy="12" r="2"/><path d="M16.2 7.8a6 6 0 0 1 0 8.4M7.8 16.2a6 6 0 0 1 0-8.4M19 5a10 10 0 0 1 0 14M5 19A10 10 0 0 1 5 5"/>'),
  next2: P('<path d="M3 6h13M3 12h9M3 18h9"/><path d="m16 13 5 3-5 3z" fill="currentColor"/>'),
  addq: P('<path d="M3 6h13M3 12h13M3 18h8M18 15v6M15 18h6"/>'),
  plus: P('<path d="M12 5v14M5 12h14"/>'),
  addpl: P('<path d="M3 6h13M3 12h13M3 18h8"/><path d="M19 14v8M15 18h8"/>'),
  artist: P('<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>'),
  album: P('<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="2.5"/>'),
  trash: P('<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>'),
  x: P('<path d="M6 6l12 12M18 6 6 18"/>'),
  check: P('<path d="m5 12.5 4.5 4.5L19 7.5"/>'),
  gear: P('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.700 1.700 0 0 0 .3 1.800l.1.1a2 2 0 1 1-2.800 2.800l-.1-.1a1.700 1.700 0 0 0-1.800-.3 1.700 1.700 0 0 0-1 1.500V21a2 2 0 0 1-4 0v-.1a1.700 1.700 0 0 0-1.100-1.500 1.700 1.700 0 0 0-1.800.3l-.1.1a2 2 0 1 1-2.800-2.800l.1-.1a1.700 1.700 0 0 0 .3-1.800 1.700 1.700 0 0 0-1.500-1H3a2 2 0 0 1 0-4h.1a1.700 1.700 0 0 0 1.500-1.100 1.700 1.700 0 0 0-.3-1.800l-.1-.1a2 2 0 1 1 2.800-2.800l.1.1a1.700 1.700 0 0 0 1.800.3H9a1.700 1.700 0 0 0 1-1.500V3a2 2 0 0 1 4 0v.1a1.700 1.700 0 0 0 1 1.500 1.700 1.700 0 0 0 1.800-.3l.1-.1a2 2 0 1 1 2.800 2.800l-.1.1a1.700 1.700 0 0 0-.3 1.800V9a1.700 1.700 0 0 0 1.500 1H21a2 2 0 0 1 0 4h-.1a1.700 1.700 0 0 0-1.500 1z"/>'),
  history: P('<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 7v5l3 2"/>'),
  link: P('<path d="M10 13a5 5 0 0 0 7.500.5l3-3a5 5 0 0 0-7-7l-1.700 1.700"/><path d="M14 11a5 5 0 0 0-7.500-.5l-3 3a5 5 0 0 0 7 7l1.700-1.700"/>'),
  shield: P('<path d="M12 3l8 3v6c0 4.500-3.200 8-8 9-4.800-1-8-4.500-8-9V6z"/><path d="m9 12 2 2 4-4"/>'),
  cloudoff: P('<path d="m2 2 20 20M5.800 8.400A5 5 0 0 0 7 18h10m3.400-1.600A4 4 0 0 0 17.500 9H17a7 7 0 0 0-8.600-4.900"/>'),
  ghost: P('<path d="M9 10h.01M15 10h.01M12 2a8 8 0 0 0-8 8v12l3-3 2.500 2.500L12 19l2.500 2.500L17 19l3 3V10a8 8 0 0 0-8-8z"/>'),
  globe: P('<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>'),
  palette: P('<circle cx="13.500" cy="6.500" r="1"/><circle cx="17.500" cy="10.500" r="1"/><circle cx="8.500" cy="7.500" r="1"/><circle cx="6.500" cy="12.500" r="1"/><path d="M12 2a10 10 0 0 0 0 20c.900 0 1.600-.700 1.600-1.600 0-.400-.200-.800-.400-1.100-.300-.300-.400-.700-.400-1.100 0-.900.700-1.600 1.600-1.600H16a6 6 0 0 0 6-6c0-4.900-4.500-8.600-10-8.600z"/>'),
  moon: P('<path d="M21 13A9 9 0 1 1 11 3a7 7 0 0 0 10 10z"/>'),
  drop: P('<path d="M12 2.700 6.300 8.400a8 8 0 1 0 11.400 0z"/>'),
  sparkle: P('<path d="M12 3l1.800 5.200L19 10l-5.200 1.800L12 17l-1.800-5.200L5 10l5.200-1.800zM19 15l.9 2.100L22 18l-2.100.9L19 21l-.9-2.100L16 18l2.100-.9z"/>'),
  info: P('<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.500v.01"/>'),
  eye: P('<path d="M2 12s3.500-7 10-7 10 7 10 7-3.500 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>'),
  wave: P('<path d="M2 12h2l3-7 4 14 3-9 2 4h6"/>'),
  note: P('<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>'),
  key: P('<circle cx="7.500" cy="15.500" r="4.500"/><path d="m10.700 12.300 8.800-8.800M16 7l3 3M14 9l2 2"/>'),
  rew: P('<path d="M11 6.5v11a.6.6 0 0 1-1 .45L3.4 12.45a.6.6 0 0 1 0-.9L10 6.05a.6.6 0 0 1 1 .45zm10 0v11a.6.6 0 0 1-1 .45l-6.6-5.5a.6.6 0 0 1 0-.9L20 6.05a.6.6 0 0 1 1 .45z"/>', 1),
  ff: P('<path d="M13 6.5v11a.6.6 0 0 0 1 .45l6.6-5.5a.6.6 0 0 0 0-.9L14 6.05a.6.6 0 0 0-1 .45zm-10 0v11a.6.6 0 0 0 1 .45l6.6-5.5a.6.6 0 0 0 0-.9L4 6.05a.6.6 0 0 0-1 .45z"/>', 1),
  volLo: P('<path d="M4 9h3l4-4v14l-4-4H4z" fill="currentColor"/>'),
  volHi: P('<path d="M4 9h3l4-4v14l-4-4H4z" fill="currentColor"/><path d="M15 8.5a5 5 0 0 1 0 7M18 6a8.500 8.500 0 0 1 0 12"/>'),
  phone: P('<rect x="7" y="2.5" width="10" height="19" rx="2.2"/><path d="M11 18.5h2"/>'),
  pc: P('<rect x="3" y="4" width="18" height="12" rx="1.8"/><path d="M8 20h8M12 16v4"/>'),
  lyrb: P('<path d="M5 4h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H9l-5 4V6a2 2 0 0 1 1-2z"/><path d="M8 9h8M8 13h5"/>'),
  share: P('<circle cx="18" cy="5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="19" r="2.5"/><path d="m8.2 10.8 7.6-4.4M8.2 13.2l7.6 4.4"/>'),
  chev: P('<path d="m9 6 6 6-6 6"/>'),
  person: P('<circle cx="12" cy="8.5" r="4"/><path d="M4.5 20.5c1.200-3.900 4.200-6 7.500-6s6.300 2.100 7.500 6z"/>', 1),
  search: P('<circle cx="11" cy="11" r="7"/><path d="m20 20-3.500-3.500"/>'),
};
const placeholder = (kind) => `<div class="art ph-art">${kind === "artist" ? IC.artist : kind === "album" ? IC.album : IC.note}</div>`;
const img = (src, cls, kind) => (src ? `<img class="${cls}" src="${esc(src)}" loading="lazy" alt="">` : placeholder(kind).replace('class="art', `class="${cls}`));

// ---------------------------------------------------------------- language
const I18N = {
  es: {
    home: "Inicio", explore: "Explorar", library: "Biblioteca", search: "Buscar", settings: "Ajustes", splash: "PRIVADA · ANÓNIMA",
    quick: "Selección rápida", recents: "Recientes", madeforyou: "Hecho para ti", yourartists: "Tus artistas", newrel: "Novedades", liked: "Me gusta", seeall: "Ver todo",
    mixof: "Mix de {a}", homeempty: "Elige artistas en Ajustes o busca algo para empezar.\nTu música aparecerá aquí.",
    foryou: "Para ti", moods: "Estados de ánimo y géneros", charts: "Listas", top: "Lo más escuchado", trending: "Tendencias", artists: "Artistas", playlists: "Playlists", albums: "Álbumes", singles: "Sencillos y EP", songs: "Canciones", popular: "Populares",
    history: "Historial", queue: "Cola", newpl: "Nueva playlist", importpl: "Importar playlist", importd: "Pega el enlace de una playlist de YouTube Music.", nplaylists: "{n} playlists", nsongs: "{n} canciones", nopl: "Aún no tienes playlists.",
    ph: "Canciones, artistas, álbumes", searchempty: "Busca tu música favorita.",
    noliked: "Las canciones que te gusten aparecerán aquí.", nohist: "Aún no has escuchado nada.", noqueue: "La cola está vacía.",
    play: "Reproducir", shuffle: "Aleatorio", radio: "Iniciar radio", playnext: "Reproducir a continuación", addqueue: "Añadir a la cola", like: "Me gusta", unlike: "Ya no me gusta", addpl: "Añadir a playlist", goartist: "Ir al artista", goalbum: "Ir al álbum", removepl: "Quitar de la playlist", delpl: "Eliminar playlist",
    playingfrom: "Reproduciendo desde", lyrics: "Letra", nolyrics: "Esta canción no tiene letra disponible.", loadlyr: "Cargando letra…",
    sleep: "Temporizador", sleepoff: "Desactivar", sleepend: "Al terminar la canción", sleepset: "La música se pausará en {n} min", sleepdone: "Temporizador: música pausada", min: "{n} minutos",
    added: "Añadida a {p}", addedq: "Añadida a la cola", next: "Se reproducirá a continuación", created: "Playlist creada", imported: "Playlist importada", name: "Nombre", create: "Crear", cancel: "Cancelar", import: "Importar", del: "Eliminar",
    offline: "El modo sin conexión está activado: AstroTune no se conecta a internet.", err: "No se pudo cargar", noplay: "No se pudo reproducir", badlink: "Enlace no válido", loading: "Cargando…",
    // settings
    appearance: "Apariencia", accent: "Color de acento", accentd: "El mismo que en la app de Android.", pureblack: "Negro puro", pureblackd: "Fondos negros, ideal para pantallas OLED.",
    artcolor: "Color de la carátula", artcolord: "El reproductor toma los colores de la canción.", glass: "Cristal líquido", glassd: "Barra y menús translúcidos.",
    language: "Idioma", playback: "Reproducción", volume: "Volumen",
    privacy: "Privacidad y seguridad", offlinem: "Modo sin conexión", offlined: "Bloquea internet por completo. Solo suena lo que ya está en caché.",
    guest: "Modo invitado", guestd: "Escucha sin guardar nada en el historial.", autodel: "Borrar historial automáticamente", forever: "Nunca", d7: "Después de 7 días", d30: "Después de 30 días", d90: "Después de 90 días",
    conns: "Dónde se conecta AstroTune", connsd: "Servidores contactados en esta sesión. La lista no sale de tu dispositivo.", noconn: "Ninguna conexión todavía.", req: "{n} peticiones",
    clearh: "Borrar historial", clearedh: "Historial borrado", welcomeagain: "Ver la bienvenida otra vez", erase: "Borrar todo", eraset: "¿Borrar todo?", erased: "Se eliminarán biblioteca, historial, ajustes y caché de este dispositivo y la app se cerrará. No se puede deshacer.",
    about: "Acerca de", version: "Versión {v} · Rust", opensource: "Código abierto · GPL-3.0", promise: "Sin cuenta, sin rastreo, sin anuncios, sin ubicación. Ningún dato tuyo sale de tu dispositivo.",
    p1: "Sin cuenta ni identificador: nadie sabe quién eres.", p2: "Biblioteca, historial y ajustes se guardan solo en tu dispositivo.", p3: "Sin ubicación, micrófono, cámara, anuncios ni telemetría.", p4: "La interfaz está aislada y no puede acceder a internet; solo el núcleo Rust pide la música.", p5: "Código abierto, sin programas de terceros dentro y con sumas SHA-256 en cada descarga.",
    // welcome
    wlang: "Elige tu idioma", wlangd: "Choose your language. Puedes cambiarlo cuando quieras en Ajustes.",
    wart: "¿Qué te gusta escuchar?", wartd: "Elige artistas para personalizar Inicio. Se guardan solo en tu dispositivo.", wsearch: "Buscar artistas", wpick: "Elige un artista para empezar", wdone1: "Listo · 1 artista", wdone: "Listo · {n} artistas",
    wlook: "Elige tu estilo", wlookd: "Puedes cambiarlo cuando quieras en Ajustes → Apariencia.", black: "Negro puro", gray: "Oscuro suave",
    wpriv: "Tu música, solo tuya", wprivd: "AstroTune está hecha alrededor de tu privacidad.", wstart: "Empezar a escuchar", skip: "Omitir", continue: "Continuar", back: "Atrás", tryagain: "Reintentar",
  },
  en: {
    home: "Home", explore: "Explore", library: "Library", search: "Search", settings: "Settings", splash: "PRIVATE · ANONYMOUS",
    quick: "Quick picks", recents: "Recents", madeforyou: "Made for you", yourartists: "Your artists", newrel: "New releases", liked: "Liked songs", seeall: "See all",
    mixof: "{a} Mix", homeempty: "Pick artists in Settings or search for something to start.\nYour music will show up here.",
    foryou: "For you", moods: "Moods & genres", charts: "Charts", top: "Top songs", trending: "Trending", artists: "Artists", playlists: "Playlists", albums: "Albums", singles: "Singles & EPs", songs: "Songs", popular: "Popular",
    history: "History", queue: "Queue", newpl: "New playlist", importpl: "Import playlist", importd: "Paste a YouTube Music playlist link.", nplaylists: "{n} playlists", nsongs: "{n} songs", nopl: "No playlists yet.",
    ph: "Songs, artists, albums", searchempty: "Search for your favourite music.",
    noliked: "Songs you like will show up here.", nohist: "You haven't listened to anything yet.", noqueue: "The queue is empty.",
    play: "Play", shuffle: "Shuffle", radio: "Start radio", playnext: "Play next", addqueue: "Add to queue", like: "Like", unlike: "Unlike", addpl: "Add to playlist", goartist: "Go to artist", goalbum: "Go to album", removepl: "Remove from playlist", delpl: "Delete playlist",
    playingfrom: "Playing from", lyrics: "Lyrics", nolyrics: "No lyrics available for this song.", loadlyr: "Loading lyrics…",
    sleep: "Sleep timer", sleepoff: "Turn off", sleepend: "End of track", sleepset: "Music will pause in {n} min", sleepdone: "Sleep timer: music paused", min: "{n} minutes",
    added: "Added to {p}", addedq: "Added to queue", next: "Will play next", created: "Playlist created", imported: "Playlist imported", name: "Name", create: "Create", cancel: "Cancel", import: "Import", del: "Delete",
    offline: "Offline mode is on: AstroTune doesn't connect to the internet.", err: "Couldn't load", noplay: "Couldn't play", badlink: "Invalid link", loading: "Loading…",
    appearance: "Appearance", accent: "Accent colour", accentd: "Same as the Android app.", pureblack: "Pure black", pureblackd: "Black backgrounds, great on OLED screens.",
    artcolor: "Colour from artwork", artcolord: "The player takes its colours from the song.", glass: "Liquid glass", glassd: "Translucent bar and menus.",
    language: "Language", playback: "Playback", volume: "Volume",
    privacy: "Privacy & security", offlinem: "Offline mode", offlined: "Blocks the internet completely. Only cached music plays.",
    guest: "Guest mode", guestd: "Listen without saving anything to history.", autodel: "Delete history automatically", forever: "Never", d7: "After 7 days", d30: "After 30 days", d90: "After 90 days",
    conns: "Where AstroTune connects", connsd: "Servers reached in this session. The list never leaves your device.", noconn: "No connections yet.", req: "{n} requests",
    clearh: "Clear history", clearedh: "History cleared", welcomeagain: "Show the welcome again", erase: "Erase everything", eraset: "Erase everything?", erased: "Library, history, settings and cache are deleted from this device and the app closes. This can't be undone.",
    about: "About", version: "Version {v} · Rust", opensource: "Open source · GPL-3.0", promise: "No account, no tracking, no ads, no location. None of your data leaves your device.",
    p1: "No account and no identifier: nobody knows who you are.", p2: "Library, history and settings are stored only on your device.", p3: "No location, microphone, camera, ads or telemetry.", p4: "The interface is sealed off from the internet; only the Rust core fetches music.", p5: "Open source, no third-party programs inside, SHA-256 checksums for every download.",
    wlang: "Choose your language", wlangd: "Elige tu idioma. You can change it any time in Settings.",
    wart: "What do you like to listen to?", wartd: "Pick artists to tailor Home. They're stored only on your device.", wsearch: "Search artists", wpick: "Pick an artist to start", wdone1: "Done · 1 artist", wdone: "Done · {n} artists",
    wlook: "Choose your style", wlookd: "You can change it any time in Settings → Appearance.", black: "Pure black", gray: "Soft dark",
    wpriv: "Your music, only yours", wprivd: "AstroTune is built around your privacy.", wstart: "Start listening", skip: "Skip", continue: "Continue", back: "Back", tryagain: "Try again",
  },
};
const EN_APP = {"moods": "Moods", "newrel1": "New release", "chart1": "Chart", "playingfromx": "Playing from {0}", "dmix": "Daily Mix {0}", "dmixd": "Daily mixes from what you play, new each day", "lexp": "Your listening experience", "minl": "Minutes listened", "you": "You", "plays": "{0} plays", "since": "Member since", "newplh": "On this device", "importh": "From a YouTube Music link", "onthis": "On this device", "thisphone": "This phone", "thispc": "This computer", "searchset": "Search settings", "seclisten": "Listening", "seclook": "Look and feel", "secpriv": "Privacy", "secabout": "About", "view": "View artist", "openalb": "Open album", "sharel": "Share", "copied": "Link copied", "stopsin": "Stops in {0}", "ringtxt": "Music stops when the ring runs out", "plus5": "+5 min", "turnoff": "Turn off", "endsong": "End of song", "minshort": "min", "theme": "Theme", "dark": "Dark", "gm": "Good morning", "ga": "Good afternoon", "ge": "Good evening", "gn": "Late night", "acct": "Account and settings", "liked": "Liked songs", "playnext": "Play next", "addpl": "Add to playlist", "lyrics": "Lyrics", "charts": "Charts", "madeforyou": "Made for you today", "sleep": "Sleep timer", "newrel": "New releases", "recents": "Recents", "history": "History", "queue": "Queue", "playlists": "Playlists", "albums": "Albums", "artists": "Artists", "songs": "Songs", "radio": "Start radio", "addqueue": "Add to queue", "play": "Play", "shuffle": "Shuffle", "foryou": "For you", "wpick": "Pick an artist to start", "wsearch": "Search artists", "continue": "Continue", "skip": "Skip", "wstart": "Start listening", "ph": "Songs, albums, artists", "appearance": "Appearance", "settings": "Settings", "home": "Home", "explore": "Explore", "library": "Library", "search": "Search"};
let LANG = (navigator.language || "es").toLowerCase().startsWith("en") ? "en" : "es";
if (MOCK && /lang=es/.test(location.search)) LANG = "es";
for (const k in EN_APP) I18N.en[k] = EN_APP[k];
Object.assign(I18N.es, {"newrel1": "Novedad", "chart1": "Lista", "lexp": "Tu experiencia de escucha", "minl": "Minutos escuchados", "you": "Tú", "plays": "{0} reproducciones", "since": "Miembro desde", "newplh": "En este dispositivo", "importh": "Desde un enlace de YouTube Music", "onthis": "En este dispositivo", "thispc": "Este ordenador", "seclisten": "Escucha", "seclook": "Aspecto", "secpriv": "Privacidad", "secabout": "Acerca de", "dmix": "Daily Mix {0}", "dmixd": "Mixes diarios con lo que escuchas, nuevos cada día", "copied": "Enlace copiado", "stopsin": "Se para en {0}", "plus5": "+5 min", "minshort": "min", "theme": "Tema", "dark": "Oscuro", "gm": "Buenos días", "ga": "Buenas tardes", "ge": "Buenas noches", "gn": "Noche", "acct": "Cuenta y ajustes", "view": "Ver artista", "openalb": "Abrir álbum", "sharel": "Compartir", "playingfromx": "Reproduciendo desde {0}", "thisphone": "Este teléfono", "searchset": "Buscar en ajustes", "endsong": "Final de la canción", "turnoff": "Desactivar", "ringtxt": "La música se detiene cuando se acaba el anillo", "moods": "Estados de ánimo"});
// Spanish: the app's own translation of the English label when it has one, so both apps read the same.
const t = (k, v) => { const en = I18N.en[k]; let s = LANG === "es" ? (window.ES_APP && window.ES_APP[en]) || I18N.es[k] || en || k : en ?? I18N.es[k] ?? k; if (v) for (const x in v) s = s.replace("{" + x + "}", v[x]); return s; };

const SEEDS = ["#ff0aa0", "#aa00ff", "#e53935", "#ff6f00", "#fdd835", "#43a047", "#00897b", "#039be5", "#3949ab", "#8e24aa", "#d81b60", "#6d4c41"];
const ARTISTS = ["Bad Bunny", "Rosalía", "Dua Lipa", "The Weeknd", "Taylor Swift", "Quevedo", "Aitana", "Karol G", "Feid", "Billie Eilish", "Coldplay", "Queen", "Daft Punk", "Arctic Monkeys", "Imagine Dragons", "Rauw Alejandro", "C. Tangana", "Estopa", "Linkin Park", "Ed Sheeran", "Mecano", "Amaral", "Metallica", "Shakira"];

// ---------------------------------------------------------------- backend (mock data in a plain browser, for design previews)
const demo = [
  ["Nebula Drive", "Luna Park", "Midnight Orbit", 214, "#6a2c91"], ["Violet Hour", "Astra", "Violet Hour", 187, "#a0306e"], ["Pink Gravity", "Moon Club", "Soft Planets", 241, "#c2345f"],
  ["Afterglow", "Satellite", "Low Orbit", 198, "#28508f"], ["Cosmic Dust", "Lyra", "Stardust", 226, "#2f7c6c"], ["Eclipse", "Nova", "Eclipse", 205, "#8a5a1e"],
  ["Gold Rush", "Sol", "Daylight", 199, "#9e7b19"], ["Blue Static", "Echo Bay", "Tides", 232, "#1f6c98"],
].map(([title, artist, album, duration, c], i) => ({ id: "demo" + i, title, artist, album, duration, cover: mockCover(c, title) }));
function mockCover(c, label) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 300"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c}"/><stop offset="1" stop-color="#0a0410"/></linearGradient></defs><rect width="300" height="300" fill="url(#g)"/><circle cx="210" cy="90" r="60" fill="#fff" opacity=".12"/><text x="22" y="270" font-family="sans-serif" font-weight="700" font-size="30" fill="#fff" opacity=".85">${label}</text></svg>`;
  return "data:image/svg+xml;utf8," + encodeURIComponent(svg);
}
const mockCards = (kind) => demo.map((d, i) => ({ kind, id: kind + i, title: kind === "artist" ? d.artist : d.album, subtitle: kind === "album" ? "Álbum · " + d.artist : "", cover: d.cover }));
let mockState = { settings: { offline: false, guest: false, history_days: 0, volume: 0.8, lang: "", onboarded: !/welcome/.test(location.hash), artists: ["Luna Park", "Astra", "Moon Club"], accent: "#ff0aa0", pure_black: true, artwork_color: true, glass: true },
  library: { favorites: demo.slice(1, 4), playlists: [{ id: "p1", name: "Noches", tracks: demo.slice(0, 5) }, { id: "p2", name: "Gym", tracks: demo.slice(3, 7) }], history: demo.slice(0, 6).map((x, i) => ({ track: x, played_at: Date.now() - i * 3.6e6 })) } };
const MOODS = [["Chill", "#4a3aa8"], ["Workout", "#8a8a1e"], ["Party", "#c2185b"], ["Focus", "#00796b"], ["Romance", "#ad1457"], ["Pop", "#6a1b9a"], ["Latin", "#e65100"], ["Rock", "#37474f"], ["Sleep", "#283593"], ["Hip-Hop", "#4e342e"]];
const mockApi = async (cmd, a = {}) => {
  await new Promise((r) => setTimeout(r, 60));
  switch (cmd) {
    case "set_settings": mockState = { ...mockState, settings: a.settings }; return mockState;
    case "search": case "radio": return demo;
    case "search_artists": return mockCards("artist").filter((x) => !a.query || x.title.toLowerCase().includes(a.query.toLowerCase().slice(0, 3)) || true);
    case "search_albums": case "new_albums": return mockCards("album");
    case "artist": return { kind: "artist", id: a.id, title: "Luna Park", subtitle: "", cover: demo[0].cover, description: "Dúo de pop espacial. Datos de ejemplo.", tracks: demo.slice(0, 5), shelves: [{ title: "albums", cards: mockCards("album"), tracks: [] }] };
    case "album": case "remote_playlist": return { kind: "album", id: a.id, title: "Midnight Orbit", subtitle: "Luna Park · 2026", cover: demo[0].cover, tracks: demo, shelves: [] };
    case "charts": return { kind: "charts", shelves: [{ title: "top", cards: [], tracks: demo }, { title: "artists", cards: mockCards("artist"), tracks: [] }] };
    case "moods": return MOODS.map(([name, color], i) => ({ id: "m" + i, name, color, is_mood: i < 5 }));
    case "mood": return { kind: "mood", title: "Chill", shelves: [{ title: "Playlists", cards: mockCards("playlist"), tracks: [] }] };
    case "connections": return [{ host: "music.youtube.com", requests: 12, last: Date.now() }, { host: "googlevideo.com", requests: 3, last: Date.now() }];
    case "lyrics": return "Flotando entre luces de neón\nla ciudad se apaga en tu voz\nsomos órbita, somos canción\n\nY si la noche no termina\nque suene otra vez\n(letra de ejemplo)";
    case "get_state": case "toggle_favorite": case "create_playlist": case "delete_playlist": case "add_to_playlist": case "remove_from_playlist": case "clear_history": case "import_playlist": return mockState;
    default: return null;
  }
};
const api = { invoke: MOCK ? mockApi : (cmd, a) => TAURI.core.invoke(cmd, a) };
const listen = (ev, fn) => (MOCK ? null : TAURI.event.listen(ev, (e) => fn(e.payload)));
const memo = new Map();
const cached = (key, fn) => { if (!memo.has(key)) memo.set(key, fn().catch((e) => { memo.delete(key); throw e; })); return memo.get(key); };

// ---------------------------------------------------------------- state
let S = { settings: {}, library: { favorites: [], playlists: [], history: [] } };
const setState = (st) => { if (st) S = st; };
const saveSettings = async (patch) => { setState(await api.invoke("set_settings", { settings: { ...S.settings, ...patch } })); applyLook(); };
const favs = () => new Set(S.library.favorites.map((x) => x.id));
const fmt = (s) => { s = Math.max(0, Math.floor(s || 0)); return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0"); };
const errText = (e) => (String(e) === "offline" ? t("offline") : String(e) === "bad-link" ? t("badlink") : String(e));
function toast(msg) { const el = $("#toast"); el.textContent = msg; el.classList.add("on"); clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.remove("on"), 2800); }

// ---------------------------------------------------------------- look
function hexRgb(h) { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
function applyLook() {
  const s = S.settings, r = document.documentElement;
  const ac = s.accent || SEEDS[0];
  r.style.setProperty("--ac", ac);
  const [R, G, B] = hexRgb(ac); r.style.setProperty("--on-ac", 0.299 * R + 0.587 * G + 0.114 * B > 170 ? "#000" : "#fff");
  r.classList.toggle("gray", s.pure_black === false);
  r.classList.toggle("noglass", s.glass === false);
  r.classList.toggle("nocolor", s.artwork_color === false);
  if (s.artwork_color === false) r.style.setProperty("--tint", "transparent");
  $("#rail-mark").innerHTML = mark();
}
// Dominant colour of a cover (read on a separate CORS image; if the host refuses, keep the accent).
function coverColor(url) {
  return new Promise((res) => {
    if (!url) return res(null);
    const im = new Image(); im.crossOrigin = "anonymous"; im.referrerPolicy = "no-referrer";
    im.onload = () => {
      try {
        const c = document.createElement("canvas"); c.width = c.height = 24; const x = c.getContext("2d"); x.drawImage(im, 0, 0, 24, 24);
        const d = x.getImageData(0, 0, 24, 24).data; let best = null, bs = -1, sum = [0, 0, 0], n = 0;
        for (let i = 0; i < d.length; i += 4) {
          const [r, g, b] = [d[i], d[i + 1], d[i + 2]]; const mx = Math.max(r, g, b), mn = Math.min(r, g, b); const sat = mx ? (mx - mn) / mx : 0; const sc = sat * (mx / 255) * (mx > 40 ? 1 : 0.2);
          sum[0] += r; sum[1] += g; sum[2] += b; n++; if (sc > bs) { bs = sc; best = [r, g, b]; }
        }
        const c0 = bs > 0.18 ? best : sum.map((v) => v / n);
        const k = Math.min(1, 150 / Math.max(...c0, 1)); // keep it deep so white text reads
        res(c0.map((v) => Math.round(v * k)));
      } catch { res(null); }
    };
    im.onerror = () => res(null); im.src = url;
  });
}
async function tintFrom(tr) {
  const rgb = S.settings.artwork_color === false ? null : await coverColor(tr && tr.cover);
  if (!cur || cur.id !== (tr && tr.id)) return;
  const r = document.documentElement;
  if (rgb) { r.style.setProperty("--pc", `rgb(${rgb.join(",")})`); r.style.setProperty("--tint", `rgba(${rgb.join(",")},.35)`); }
  else { r.style.setProperty("--pc", "color-mix(in srgb, var(--ac) 30%, #0b0a0d)"); r.style.setProperty("--tint", "transparent"); }
}

// ---------------------------------------------------------------- navigation
let stack = [{ name: "home" }];
const route = () => stack[stack.length - 1];
const TAB_OF = { home: "home", explore: "explore", library: "library", search: "search" };
function go(name, arg, replace) { const r = { name, arg }; if (replace) stack[stack.length - 1] = r; else stack.push(r); render(); $("#page").scrollTop = 0; }
function tab(name) { if (route().name === name && stack.length === 1) { $("#page").scrollTo({ top: 0 }); return; } stack = [{ name }]; render(); $("#page").scrollTop = 0; }
function back() { if (stack.length > 1) { stack.pop(); render(); } }
const backBtn = (flat) => (stack.length > 1 ? `<button class="ib back ${flat ? "flat" : "glass"}" data-a="back">${IC.back}</button>` : "");
function markTabs() {
  let tb = stack[0].name; document.querySelectorAll("[data-tab]").forEach((b) => b.classList.toggle("on", b.dataset.tab === tb));
}

// ---------------------------------------------------------------- building blocks
let lists = {}; let listSeq = 0;
const reg = (tracks, label) => { const k = "L" + ++listSeq; lists[k] = { tracks, label }; return k; };
function row(tr, key, i, opts = {}) {
  const liked = favs().has(tr.id);
  const lead = opts.num ? `<div class="num">${i + 1}</div>` : img(tr.cover, "cov", "song");
  return `<div class="row${cur && cur.id === tr.id ? " now" : ""}" data-l="${key}" data-i="${i}">${lead}
    <div style="min-width:0"><div class="t1">${esc(tr.title)}</div><div class="t2">${esc(tr.artist)}${tr.album && !opts.noAlbum ? " · " + esc(tr.album) : ""}</div></div>
    <div class="r">${liked ? `<span class="liked">${IC.heartF.replace("<svg", '<svg style="width:18px;height:18px"')}</span>` : ""}<button class="ib" data-a="menu">${IC.more}</button></div></div>`;
}
const rows = (tracks, label, opts) => { const k = reg(tracks, label); return `<div class="rows">${tracks.map((x, i) => row(x, k, i, opts)).join("")}</div>`; };
const card = (c) => `<div class="card ${esc(c.kind)}" data-card="${esc(c.kind)}" data-id="${esc(c.id)}" data-title="${esc(c.title)}">${img(c.cover, "art", c.kind)}<div class="t1">${esc(c.title)}</div>${c.subtitle ? `<div class="t2">${esc(c.subtitle)}</div>` : ""}</div>`;
const songCard = (tr, key, i) => `<div class="card" data-l="${key}" data-i="${i}">${img(tr.cover, "art", "song")}<div class="t1">${esc(tr.title)}</div><div class="t2">${esc(tr.artist)}</div></div>`;
const head = (title, extra = "") => `<div class="sh"><div><h2>${esc(title)}</h2></div>${extra}</div>`;
const shelfOf = (title, cards) => (cards.length ? head(title) + `<div class="shelf">${cards.map(card).join("")}</div>` : "");
const loading = () => `<div class="empty">${t("loading")}</div>`;
const failed = (e) => `<div class="empty">${IC.cloudoff}${esc(S.settings.offline ? t("offline") : t("err") + "\n" + errText(e))}</div>`;
const shelfTitle = (k) => ({ albums: t("albums"), singles: t("singles"), playlists: t("playlists"), top: t("top"), trending: t("trending"), artists: t("artists") }[k] || k);
const pageHead = (title, right = "") => `${backBtn(true)}<div class="ph"><h1>${esc(title)}</h1>${right}</div>`;
const acct = () => `<button class="acct glass" data-a="settings" title="${t("acct")}">${IC.person}</button>`;
const greeting = () => { const h = new Date().getHours(); return t(h >= 5 && h <= 11 ? "gm" : h <= 16 && h >= 12 ? "ga" : h >= 17 && h <= 21 ? "ge" : "gn"); };

// Async parts of a page fill in when ready, if the page is still showing.
let renderId = 0, DMIX = [];
function slot(id, promise, fn) {
  const rid = renderId;
  promise.then((v) => { const el = document.getElementById(id); if (el && rid === renderId) el.innerHTML = fn(v); }).catch((e) => { const el = document.getElementById(id); if (el && rid === renderId) el.innerHTML = fn.onError ? fn.onError(e) : ""; });
  return `<div id="${id}"></div>`;
}

// ---------------------------------------------------------------- pages
const artistImg = (name) => cached("aimg:" + name, () => api.invoke("search_artists", { query: name }).then((r) => (r && r[0]) || { kind: "artist", id: "", title: name, cover: null }));

const PAGES = {
  home() {
    const hist = S.library.history.map((h) => h.track); const arts = S.settings.artists || [];
    let h = `<div class="ph home"><h1>${esc(greeting())}</h1>${acct()}</div>`;
    if (!hist.length && !arts.length && !S.library.favorites.length) return h + `<div class="empty">${IC.note}${t("homeempty")}</div>`;
    // Quick picks: songs like the last one you played, or from your artists
    const seed = hist[0] ? cached("radio:" + hist[0].id, () => api.invoke("radio", { id: hist[0].id })) : arts[0] ? cached("search:" + arts[0], () => api.invoke("search", { query: arts[0] })) : Promise.resolve([]);
    h += slot("qp", seed, (r) => { if (!r || !r.length) return ""; const tr = r.slice(0, 20); const k = reg(tr, t("quick")); return `<div class="sh quick"><h2>${t("quick")}</h2><button class="ib" data-a="go" data-to="history">${IC.history}</button></div><div class="qp">${tr.map((x, i) => row(x, k, i)).join("")}</div>`; });
    if (arts.length) { // Made for you today: daily mixes of up to three of your artists each
      const mixes = []; for (let i = 0; i < arts.length; i += 3) mixes.push(arts.slice(i, i + 3));
      DMIX = mixes;
      h += `<div class="sh"><div><h2>${t("madeforyou")}</h2><div class="sub">${t("dmixd")}</div></div></div><div class="shelf">${mixes.map((m, i) => `<div class="mixc" data-dmix="${i}"><div class="q" id="dm${i}"><i></i><i></i><i></i><i></i><b>${esc(t("dmix", { 0: i + 1 }))}</b><u></u></div><div class="t2">${esc(m.join(", "))}</div></div>`).join("")}</div>`;
      mixes.forEach((m, i) => Promise.all(m.map((a) => cached("search:" + a, () => api.invoke("search", { query: a })).catch(() => []))).then((rs) => {
        const covers = [...new Set(rs.flatMap((r) => r.slice(0, 4).map((x) => x.cover)).filter(Boolean))];
        if (!covers.length) return;
        const step = Math.max(1, Math.floor(covers.length / 4)); const pick = [0, 1, 2, 3].map((k) => covers[(k * step) % covers.length]);
        const el = document.getElementById("dm" + i); if (el) el.querySelectorAll("i").forEach((x, k) => (x.outerHTML = `<img src="${esc(pick[k])}" alt="">`));
      }));
    }
    const uniq = []; const seen = new Set(); for (const x of hist) if (!seen.has(x.id)) { seen.add(x.id); uniq.push(x); }
    if (uniq.length) { const k = reg(uniq, t("recents")); h += head(t("recents"), `<button data-a="go" data-to="history">${t("seeall")}</button>`) + `<div class="shelf">${uniq.slice(0, 15).map((x, i) => songCard(x, k, i)).join("")}</div>`; }
    if (arts.length) {
      h += head(t("yourartists")) + `<div class="shelf">${arts.map((a, i) => `<div class="card artist" data-card="artist" data-id="" data-title="${esc(a)}" id="ya${i}">${placeholder("artist")}<div class="t1">${esc(a)}</div></div>`).join("")}</div>`;
      arts.forEach((a, i) => artistImg(a).then((c) => { const y = document.getElementById("ya" + i); if (y && c.cover) { y.querySelector(".art").outerHTML = `<img class="art" src="${esc(c.cover)}" alt="">`; y.dataset.id = c.id; } }).catch(() => {}));
    }
    if (S.library.favorites.length) { const k = reg(S.library.favorites, t("liked")); h += head(t("liked"), `<button data-a="go" data-to="liked">${t("seeall")}</button>`) + `<div class="shelf">${S.library.favorites.slice(0, 15).map((x, i) => songCard(x, k, i)).join("")}</div>`; }
    h += slot("nr", cached("new", () => api.invoke("new_albums")), (c) => shelfOf(t("newrel"), c || []));
    return h;
  },

  explore(arg) {
    const f = (arg && arg.f) || "foryou"; const arts = S.settings.artists || [];
    let h = `<div class="ph"><h1>${t("explore")}</h1></div>`;
    if (arts.length) h += `<div class="chips">${arts.map((a, i) => `<button class="chip" data-card="artist" data-id="" data-title="${esc(a)}" id="xa${i}" style="padding-left:22px">${esc(a)}</button>`).join("")}</div>`;
    arts.forEach((a, i) => artistImg(a).then((c) => { const el = document.getElementById("xa" + i); if (el && c.cover) { el.insertAdjacentHTML("afterbegin", `<img src="${esc(c.cover)}" alt="">`); el.style.paddingLeft = "16px"; el.dataset.id = c.id; } }).catch(() => {}));
    h += `<div class="chips">${["foryou", "moods", "newrel", "charts"].map((k) => `<button class="chip${f === k ? " on" : ""}" data-a="xf" data-f="${k}">${t(k)}</button>`).join("")}</div>`;
    const board = (m) => `<div class="board">${m.map((x, i) => `<div class="mood" data-mood="${esc(x.id)}" style="background:${esc(x.color)};height:${[150, 110, 190, 130, 170][i % 5]}px">${esc(x.name)}</div>`).join("")}</div>`;
    if (f === "foryou") {
      const both = Promise.all([cached("new", () => api.invoke("new_albums")).catch(() => []), cached("moods", () => api.invoke("moods")).catch(() => []), cached("charts", () => api.invoke("charts")).catch(() => null)]);
      h += slot("xb", both, ([nw, md, ch]) => {
        const moods = (md || []).filter((x) => x.is_mood).concat((md || []).filter((x) => !x.is_mood));
        const items = []; const al = (nw || []).slice(0, 8); const cp = ((ch && ch.shelves.find((s) => s.title === "playlists")) || { cards: [] }).cards.slice(0, 4);
        for (let i = 0; i < 14; i++) { if (moods[i]) items.push({ mood: moods[i] }); if (i % 2 === 0 && al[i / 2]) items.push({ card: al[i / 2], badge: t("newrel1") }); if (i % 3 === 1 && cp[(i - 1) / 3]) items.push({ card: cp[(i - 1) / 3], badge: t("chart1") }); }
        const hs = [150, 196, 120, 176, 140, 210];
        return `<div class="board">${items.map((x, i) => x.mood ? `<div class="mood" data-mood="${esc(x.mood.id)}" style="background:${esc(x.mood.color)};height:${hs[i % 6] - 30}px"><span>${esc(x.mood.name)}</span></div>`
          : `<div class="mood cov" data-card="${esc(x.card.kind)}" data-id="${esc(x.card.id)}" data-title="${esc(x.card.title)}" style="height:${hs[i % 6] + 20}px">${x.card.cover ? `<img src="${esc(x.card.cover)}" alt="" loading="lazy">` : ""}<i class="bdg" style="font-style:normal">${esc(x.badge)}</i><div class="cap">${esc(x.card.title)}<small>${esc(x.card.subtitle || "")}</small></div></div>`).join("")}</div>`;
      });
    } else if (f === "moods") h += slot("xm", cached("moods", () => api.invoke("moods")), (m) => board(m || []));
    else if (f === "newrel") h += slot("xn", cached("new", () => api.invoke("new_albums")), (c) => `<div class="grid" style="margin-top:8px">${(c || []).map(card).join("")}</div>`);
    else h += slot("xc", cached("charts", () => api.invoke("charts")), (p) => p.shelves.map((s) => (s.tracks.length ? head(shelfTitle(s.title)) + rows(s.tracks.slice(0, 20), shelfTitle(s.title), { num: true }) : shelfOf(shelfTitle(s.title), s.cards))).join(""));
    return h;
  },

  library() {
    const L = S.library;
    let h = `<div class="ph" style="padding-top:8px;justify-content:flex-end"><div class="tools glass"><button class="ib" data-a="go" data-to="history">${IC.history}</button><button class="ib" data-a="settings">${IC.gear}</button></div></div><div class="ph" style="padding-top:0"><h1>${t("library")}</h1></div>`;
    const mins = Math.round(L.history.reduce((s, x) => s + (x.track.duration || 0), 0) / 60);
    const first = L.history.length ? new Date(Math.min(...L.history.map((x) => x.played_at))) : new Date();
    h += `<div class="lexp"><div class="mk">${mark()}</div><small>${t("lexp")}</small><div class="big">${mins.toLocaleString()}</div><small>${t("minl")}</small>
      <div class="row2"><div><b>${t("you").toUpperCase()}</b><span>${t("plays", { 0: L.history.length })} · ${first.getFullYear()}</span></div><div class="r"><span style="font-size:10px;letter-spacing:.1em">${t("since").toUpperCase()}</span><b>${String(first.getMonth() + 1).padStart(2, "0")}/${String(first.getFullYear()).slice(2)}</b></div></div></div>`;
    const tile = (ic, title, sub, a) => `<button class="tile" ${a}><div class="ti">${ic}</div><div style="min-width:0"><b>${title}</b><span>${sub}</span></div></button>`;
    h += `<div class="tiles">
      ${tile(IC.heartF, t("liked"), t("nsongs", { n: L.favorites.length }), 'data-a="go" data-to="liked"')}
      ${tile(IC.history, t("history"), t("nsongs", { n: L.history.length }), 'data-a="go" data-to="history"')}
      ${tile(IC.queue, t("queue"), t("nsongs", { n: queue.length }), 'data-a="queue"')}
      ${tile(IC.radio, t("radio"), cur ? esc(cur.title) : t("quick"), 'data-a="libradio"')}
    </div>`;
    h += head(t("playlists"));
    h += `<div class="lrow" data-a="newpl"><div class="ic">${IC.plus}</div><div><div class="t1">${t("newpl")}</div><div class="t2">${t("newplh")}</div></div></div>`;
    h += `<div class="lrow" data-a="importpl"><div class="ic">${IC.link}</div><div><div class="t1">${t("importpl")}</div><div class="t2">${t("importh")}</div></div></div>`;
    if (L.playlists.length) h += `<div class="lsub">${t("onthis")}</div>` + L.playlists.map((p) => `<div class="lrow" data-lpl="${esc(p.id)}"><div class="pc">${plCover(p)}</div><div style="min-width:0"><div class="t1">${esc(p.name)}</div><div class="t2">${t("nsongs", { n: p.tracks.length })}</div></div></div>`).join("");
    return h + `<div style="height:16px"></div>`;
  },

  search(arg) {
    const q = (arg && arg.q) || lastQ; const f = (arg && arg.f) || "songs";
    let h = `${backBtn(true)}<div class="ph"><h1>${t("search")}</h1></div><div class="sbox">${IC.search}<input id="q" placeholder="${t("ph")}" value="${esc(q)}" autocomplete="off" spellcheck="false"></div>`;
    h += `<div class="chips">${["songs", "artists", "albums"].map((k) => `<button class="chip${f === k ? " on" : ""}" data-a="sf" data-f="${k}">${t(k)}</button>`).join("")}</div><div id="sres"></div>`;
    setTimeout(() => { const i = $("#q"); if (i) { if (!MOBILE) i.focus(); i.addEventListener("input", () => searchDebounce(i.value, f)); doSearch(q, f); } });
    return h;
  },

  settings() {
    const s = S.settings; const sw = (on) => `<div class="sw${on ? " on" : ""}"></div>`; const chev = `<div class="chev">${IC.chev}</div>`;
    const set = (ic, title, sub, right, a) => `<div class="set" ${a || ""}><div class="si">${ic}</div><div class="sx"><b>${title}</b>${sub ? `<span>${sub}</span>` : ""}</div>${right ?? ""}</div>`;
    let h = pageHead(t("settings")) + `<div class="sbox set-s">${IC.search}<input id="setq" placeholder="${t("searchset")}" autocomplete="off"></div><div id="setlist">`;
    const hd = { 0: "forever", 7: "d7", 30: "d30", 90: "d90" }[s.history_days || 0] || "forever";
    h += `<div class="gt">${t("seclook")}</div><div class="group">
      ${set(IC.moon, t("pureblack"), t("pureblackd"), sw(s.pure_black !== false), 'data-a="tog" data-k="pure_black"')}
      ${set(IC.sparkle, t("artcolor"), t("artcolord"), sw(s.artwork_color !== false), 'data-a="tog" data-k="artwork_color"')}
      ${set(IC.drop, t("glass"), t("glassd"), sw(s.glass !== false), 'data-a="tog" data-k="glass"')}
      ${set(IC.palette, t("accent"), t("accentd"), "")}<div class="swatches" style="padding-left:62px;margin-top:-6px">${SEEDS.map((c) => `<button class="swatch${(s.accent || SEEDS[0]) === c ? " on" : ""}" style="background:${c}" data-a="accent" data-c="${c}"></button>`).join("")}</div>
      ${set(IC.globe, t("language"), LANG === "es" ? "Español" : "English", chev, 'data-a="lang"')}
    </div>`;
    h += `<div class="gt">${t("seclisten")}</div><div class="group">
      ${set(IC.timer, t("sleep"), sleepAt ? t("sleepset", { n: Math.max(1, Math.round((sleepAt - Date.now()) / 60000)) }) : "", chev, 'data-a="sleep"')}
      ${set(IC.queue, t("queue"), t("nsongs", { n: queue.length }), chev, 'data-a="queue"')}
      ${set(IC.history, t("history"), t("nsongs", { n: S.library.history.length }), chev, 'data-a="go" data-to="history"')}
    </div>`;
    h += `<div class="gt">${t("secpriv")}</div><div class="group">
      ${set(IC.cloudoff, t("offlinem"), t("offlined"), sw(s.offline), 'data-a="tog" data-k="offline"')}
      ${set(IC.ghost, t("guest"), t("guestd"), sw(s.guest), 'data-a="tog" data-k="guest"')}
      ${set(IC.history, t("autodel"), t(hd), chev, 'data-a="autodel"')}
      ${set(IC.eye, t("conns"), t("connsd"), chev, 'data-a="conns"')}
      ${set(IC.trash, t("clearh"), "", "", 'data-a="clearh"')}
      ${set(IC.sparkle, t("welcomeagain"), "", chev, 'data-a="welcome"')}
      <div class="set danger" data-a="erase"><div class="si">${IC.trash}</div><div class="sx"><b>${t("erase")}</b></div></div>
    </div>`;
    h += `<div class="gt">${t("secabout")}</div><div class="group">${["p1", "p2", "p3", "p4", "p5"].map((k) => `<div class="promise">${IC.shield}<span>${t(k)}</span></div>`).join("")}</div>`;
    h += `</div><div class="foot">AstroTune ${VERSION} · Rust · GNU GPL v3</div>`;
    setTimeout(() => { const q = $("#setq"); if (q) q.oninput = () => { const v = q.value.toLowerCase(); document.querySelectorAll("#setlist .set, #setlist .promise, #setlist .swatches").forEach((r) => (r.style.display = !v || r.textContent.toLowerCase().includes(v) ? "" : "none")); }; });
    return h;
  },

  liked() { const f = S.library.favorites; return pageHead(t("liked")) + (f.length ? `<div class="btns">${playBtns()}</div><div style="height:10px"></div>` + rows(f, t("liked")) : `<div class="empty">${IC.heart}${t("noliked")}</div>`); },
  history() { const h = S.library.history.map((x) => x.track); return pageHead(t("history"), h.length ? `<button class="btn tonal" data-a="clearh">${t("clearh")}</button>` : "") + (h.length ? rows(h, t("history")) : `<div class="empty">${IC.history}${t("nohist")}</div>`); },

  localpl(id) {
    const p = S.library.playlists.find((x) => x.id === id); if (!p) return pageHead(t("playlists"));
    return backBtn(true) + `<div class="alb">${plCover(p, "cv")}<div class="meta"><h1>${esc(p.name)}</h1><div class="t2">${t("nsongs", { n: p.tracks.length })}</div></div></div><div class="btns">${p.tracks.length ? playBtns() : ""}<button class="btn tonal" data-a="delpl" data-id="${esc(id)}">${IC.trash}${t("delpl")}</button></div><div style="height:10px"></div>` + rows(p.tracks, p.name, { pl: id });
  },

  artist(a) {
    const p = a.id ? cached("artist:" + a.id, () => api.invoke("artist", { id: a.id })) : artistImg(a.title).then((c) => (c.id ? cached("artist:" + c.id, () => api.invoke("artist", { id: c.id })) : Promise.reject("not found")));
    const fn = (x) => {
      let h = `<div class="hero">${x.cover ? `<img class="bg" src="${esc(x.cover)}" alt="">` : `<div class="bg" style="height:220px;background:linear-gradient(135deg,var(--ac),#000)"></div>`}<div class="shade"></div><h1>${esc(x.title)}</h1></div>`;
      if (x.description) h += `<div class="desc" data-a="desc">${esc(x.description)}</div>`;
      h += `<div style="height:12px"></div><div class="btns">${playBtns(x.tracks.length)}<button class="btn tonal" data-a="artradio">${IC.radio}${t("radio")}</button></div>`;
      if (x.tracks.length) { const k = reg(x.tracks, x.title); h += head(t("popular")) + `<div class="rows">${x.tracks.slice(0, 10).map((tr, i) => row(tr, k, i)).join("")}</div>`; lists.page = k; }
      h += x.shelves.map((s) => shelfOf(shelfTitle(s.title), s.cards)).join("");
      return h;
    };
    fn.onError = (e) => `<div style="padding-top:50px"></div>` + failed(e);
    return `<button class="ib back glass" data-a="back">${IC.back}</button>` + slot("pg", p, fn).replace('<div id="pg">', `<div id="pg">${loading()}`);
  },

  album(a) { return collection(a, cached("album:" + a.id, () => api.invoke("album", { id: a.id })), true); },
  playlist(a) { return collection(a, cached("rpl:" + a.id, () => api.invoke("remote_playlist", { id: a.id }))); },
  mood(a) {
    const fn = (x) => pageHead(x.title || a.title) + x.shelves.map((s) => shelfOf(s.title, s.cards)).join(""); fn.onError = (e) => pageHead(a.title) + failed(e);
    return slot("pg", cached("mood:" + a.id, () => api.invoke("mood", { id: a.id })), fn).replace('<div id="pg">', `<div id="pg">${backBtn(true)}${loading()}`);
  },
};
function collection(a, p, isAlbum) {
  const fn = (x) => { lists.page = reg(x.tracks, x.title); return backBtn(true) + `<div class="alb">${img(x.cover, "cv", isAlbum ? "album" : "song")}<div class="meta"><h1>${esc(x.title)}</h1><div class="t2">${esc(x.subtitle)}${x.tracks.length ? " · " + t("nsongs", { n: x.tracks.length }) : ""}</div></div></div><div class="btns">${playBtns(x.tracks.length)}</div><div style="height:10px"></div><div class="rows">${x.tracks.map((tr, i) => row(tr, lists.page, i, { num: isAlbum, noAlbum: isAlbum })).join("")}</div>`; };
  fn.onError = (e) => backBtn(true) + failed(e);
  return slot("pg", p, fn).replace('<div id="pg">', `<div id="pg">${backBtn(true)}${loading()}`);
}
const playBtns = (n = 1) => (n ? `<button class="btn" data-a="playpage">${IC.play}${t("play")}</button><button class="btn tonal" data-a="shufpage">${IC.shuffle}${t("shuffle")}</button>` : "");
function plCover(p, cls = "art") {
  const c = [...new Set(p.tracks.map((x) => x.cover).filter(Boolean))].slice(0, 4);
  if (c.length < 4) return img(c[0], cls, "song");
  return `<div class="${cls}" style="display:grid;grid-template-columns:1fr 1fr;overflow:hidden;aspect-ratio:1">${c.map((u) => `<img src="${esc(u)}" style="width:100%;height:100%;object-fit:cover" alt="">`).join("")}</div>`;
}

let lastQ = "", sTimer;
function searchDebounce(q, f) { lastQ = q; clearTimeout(sTimer); sTimer = setTimeout(() => doSearch(q, f), 320); }
async function doSearch(q, f) {
  const el = $("#sres"); if (!el) return; lastQ = q;
  if (!q.trim()) { el.innerHTML = `<div class="empty">${IC.search}${t("searchempty")}</div>`; return; }
  el.innerHTML = loading();
  try {
    const cmd = { songs: "search", artists: "search_artists", albums: "search_albums" }[f];
    const r = await cached(cmd + ":" + q, () => api.invoke(cmd, { query: q }));
    if (lastQ !== q || !$("#sres")) return;
    $("#sres").innerHTML = f === "songs" ? rows(r, q) : `<div class="grid">${r.map(card).join("")}</div>`;
  } catch (e) { if ($("#sres")) $("#sres").innerHTML = failed(e); }
}

function render() {
  renderId++; lists = {}; const r = route();
  $("#page").innerHTML = `<div class="wrap">${PAGES[r.name](r.arg)}</div>`;
  markTabs();
}

// ---------------------------------------------------------------- playback engine
// Desktop: Rust plays the file (rodio). Mobile: Rust downloads it, the web view plays it.
const MOBILE = /Android|iPhone|iPad/i.test(navigator.userAgent) || /[?&]mobile/.test(location.search);
// Every platform plays through the web view's <audio>: the Rust core hands it a direct stream (or the
// local copy), so a song starts in a moment instead of after a full download. If the web view can't
// play it, desktop falls back to the native player (rodio) and mobile to a downloaded copy.
const au = new Audio(); au.preload = "auto";
let native = false; // true while the native (rodio) player has the current song
const srcOf = (s) => (s.kind === "file" ? TAURI.core.convertFileSrc(s.src) : s.src);
function tryPlay(url) {
  return new Promise((ok, no) => {
    const fail = () => { cleanup(); no(new Error("media")); };
    const go = () => { cleanup(); ok(); };
    const cleanup = () => { au.removeEventListener("error", fail); au.removeEventListener("playing", go); };
    au.addEventListener("error", fail, { once: true }); au.addEventListener("playing", go, { once: true });
    au.src = url; au.play().catch(fail);
  });
}
let playSeq = 0;
const eng = {
  async play(tr) {
    if (MOCK) return;
    const seq = ++playSeq;
    if (native) { api.invoke("pause"); native = false; }
    au.volume = S.settings.volume ?? 0.8;
    let s = null;
    try { s = await api.invoke("resolve", { track: tr }); if (seq !== playSeq) return; await tryPlay(srcOf(s)); if (s.kind === "url") api.invoke("keep", { track: tr }).catch(() => {}); return; }
    catch (e) { if (seq !== playSeq) return; if (!s && String(e) === "offline") throw e; }
    au.removeAttribute("src"); au.load();
    if (MOBILE) { const p = await api.invoke("fetch_track", { track: tr }); if (seq === playSeq) await tryPlay(TAURI.core.convertFileSrc(p)); }
    else { native = true; await api.invoke("play", { track: tr }); }
  },
  pause: () => (native ? api.invoke("pause") : au.pause()),
  resume: () => (native ? api.invoke("resume") : au.play()),
  seek: (s) => (native ? api.invoke("seek", { seconds: s }) : (au.currentTime = Math.max(0, s))),
  volume: (v) => { au.volume = v; api.invoke("set_volume", { volume: v }); },
};
const prefetchNext = () => { if (MOCK || !queue.length) return; const n = queue[(qi + 1) % queue.length]; if (n && n !== cur) api.invoke("prefetch", { id: n.id }).catch(() => {}); };

let queue = [], qi = -1, cur = null, playing = false, pos = 0, shuffle = false, repeatMode = 0, srcLabel = "", showLyr = false, sleepAt = 0, sleepT = null, sleepEnd = false;
async function playAt(i) {
  if (!queue.length) return; qi = (i + queue.length) % queue.length; const tr = queue[qi];
  cur = tr; pos = 0; setPlaying(true); paintNow(); tintFrom(tr);
  try { await eng.play(tr); prefetchNext(); if (!S.settings.guest) refreshState(); } catch (e) { setPlaying(false); toast(t("noplay") + ": " + errText(e)); }
}
async function refreshState() { try { setState(await api.invoke("get_state")); } catch {} }
function playList(tracks, i, label, shuf) {
  queue = tracks.slice(); srcLabel = label || "";
  if (shuf) { for (let j = queue.length - 1; j > 0; j--) { const k = Math.floor(Math.random() * (j + 1)); [queue[j], queue[k]] = [queue[k], queue[j]]; } i = 0; }
  playAt(i);
}
function next(auto) {
  if (!queue.length) return;
  if (auto && sleepEnd) { sleepEnd = false; setPlaying(false); toast(t("sleepdone")); return; }
  if (auto && repeatMode === 2) return playAt(qi);
  if (shuffle && queue.length > 1) { let k; do k = Math.floor(Math.random() * queue.length); while (k === qi); return playAt(k); }
  if (auto && qi === queue.length - 1 && repeatMode === 0) return autoRadio();
  playAt(qi + 1);
}
async function autoRadio() { // like the app: when the queue ends, keep playing similar songs
  if (!cur || S.settings.offline) { setPlaying(false); return; }
  try { const r = await api.invoke("radio", { id: cur.id }); const add = r.filter((x) => !queue.some((q) => q.id === x.id)); if (add.length) { queue.push(...add); playAt(qi + 1); } else setPlaying(false); } catch { setPlaying(false); }
}
function prev() { if (pos > 4) eng.seek(0); else playAt(qi - 1); }
function toggle() { if (!cur) return; if (playing) { eng.pause(); setPlaying(false); } else { eng.resume(); setPlaying(true); } }
function setPlaying(p) {
  playing = p; document.querySelectorAll(".pp").forEach((e) => (e.innerHTML = p ? IC.pause : IC.play));
  const big = document.querySelector(".pl-ctl .pp"); if (big) big.innerHTML = p ? IC.pause : IC.play;
  $("#player").classList.toggle("paused", !p);
}
function paintNow() {
  if (!cur) return; $("#mini").classList.remove("hidden");
  $("#mini-cov").src = cur.cover || ""; $("#mini-title").textContent = cur.title; $("#mini-artist").textContent = cur.artist;
  document.querySelectorAll(".row").forEach((r) => { const l = lists[r.dataset.l]; r.classList.toggle("now", !!(l && l.tracks[+r.dataset.i] && l.tracks[+r.dataset.i].id === cur.id)); });
  if ("mediaSession" in navigator && window.MediaMetadata) navigator.mediaSession.metadata = new MediaMetadata({ title: cur.title, artist: cur.artist, album: cur.album || "AstroTune", artwork: cur.cover ? [{ src: cur.cover }] : [] });
  drawPlayer(); setPlaying(playing);
}
function onTick(p) {
  pos = p.pos; const d = (cur && cur.duration) || 0; const pct = d ? Math.min(100, (p.pos / d) * 100) : 0;
  $("#mini-prog i").style.width = pct + "%";
  const sk = $("#pl-seek"); if (sk && !sk.matches(":active")) { sk.value = pct * 10; paint(sk); $("#pl-cur").textContent = fmt(p.pos); $("#pl-rem").textContent = "-" + fmt(d - p.pos); }
  if (playing === p.paused) setPlaying(!p.paused);
}
const paint = (el) => el.style.setProperty("--p", (100 * el.value) / el.max + "%");
listen("player-tick", (p) => native && onTick(p)); listen("player-ended", () => native && next(true)); listen("player-error", (m) => toast(String(m)));
au.ontimeupdate = () => !native && onTick({ pos: au.currentTime, paused: au.paused });
au.onpause = au.onplay = () => !native && onTick({ pos: au.currentTime, paused: au.paused });
au.onended = () => !native && next(true);
if ("mediaSession" in navigator) { const ms = navigator.mediaSession; ms.setActionHandler("play", toggle); ms.setActionHandler("pause", toggle); ms.setActionHandler("nexttrack", () => next()); ms.setActionHandler("previoustrack", prev); }

// ---------------------------------------------------------------- full player
function drawPlayer() {
  if (!cur) return; const liked = favs().has(cur.id); const d = cur.duration || 0;
  $("#pl-blur").src = cur.cover || "";
  const from = srcLabel || cur.album || "";
  const dev = MOBILE ? t("thisphone") : t("thispc");
  $("#pl-in").innerHTML = `
    <div class="pl-top" data-p="close" style="cursor:pointer"><div></div><div style="min-width:0"><div class="pl-handle"></div><div class="from">${from ? esc(t("playingfromx", { 0: from })) : "&nbsp;"}</div></div><div></div></div>
    <div class="pl-mid">${showLyr ? `<div class="pl-lyr" id="pl-lyr"><p>${t("loadlyr")}</p></div>` : cur.cover ? `<img class="pl-cov" src="${esc(cur.cover)}" alt="">` : `<div class="pl-cov ph-art" style="display:grid">${mark()}</div>`}</div>
    <div class="pl-low">
      <div class="pl-info"><div style="min-width:0"><div class="t1">${esc(cur.title)}</div><div class="t2" data-p="artist">${esc(cur.artist)}${!MOBILE && cur.album ? " — " + esc(cur.album) : ""}</div></div>
        <button class="circ${liked ? " liked" : ""}" data-p="like">${liked ? IC.heartF : IC.heart}</button><button class="circ" data-p="menu">${IC.more}</button></div>
      <input type="range" id="pl-seek" class="pl-seek" min="0" max="1000" value="${d ? (pos / d) * 1000 : 0}">
      <div class="pl-times"><span id="pl-cur">${fmt(pos)}</span><span id="pl-rem">-${fmt(d - pos)}</span></div>
      <div class="pl-ctl"><button class="ib" data-p="prev">${IC.rew}</button><button class="ib main" data-p="pp"><span class="pp">${playing ? IC.pause : IC.play}</span></button><button class="ib" data-p="next">${IC.ff}</button></div>
      <div class="pl-vol"><span>${IC.volLo}</span><input type="range" id="pl-vol" min="0" max="100" value="${Math.round((S.settings.volume ?? 0.8) * 100)}"><span>${IC.volHi}</span></div>
      <div class="pl-bot"><button class="ib${showLyr ? " on" : ""}" data-p="lyrics">${IC.lyrb}</button>
        <div class="pl-pill"><button class="ib${sleepAt || sleepEnd ? " on" : ""}" data-p="sleep">${IC.timer}</button><button class="ib${shuffle ? " on" : ""}" data-p="shuffle">${IC.shuffle}</button><button class="ib${repeatMode ? " on" : ""}" data-p="repeat">${repeatMode === 2 ? IC.repeat1 : IC.repeat}</button></div>
        <button class="ib" data-p="queue">${IC.queue}</button></div>
      <div class="pl-dev">${esc(dev)}</div>
    </div>`;
  const sk = $("#pl-seek"); paint(sk);
  sk.oninput = () => { paint(sk); $("#pl-cur").textContent = fmt((sk.value / 1000) * d); };
  sk.onchange = () => eng.seek((sk.value / 1000) * d);
  const pv = $("#pl-vol"); paint(pv); pv.oninput = () => { paint(pv); vol.value = pv.value; paint(vol); eng.volume(pv.value / 100); };
  pv.onchange = () => saveSettings({ volume: pv.value / 100 });
  if (showLyr) loadLyrics();
}
async function loadLyrics() {
  const id = cur.id; let l;
  try { l = await cached("lyr:" + id, () => api.invoke("lyrics", { id })); } catch (e) { l = null; }
  const el = $("#pl-lyr"); if (!el || !cur || cur.id !== id) return;
  el.innerHTML = l ? l.split("\n").map((x) => (x.trim() ? `<p>${esc(x)}</p>` : `<p style="height:10px"></p>`)).join("") : `<p>${t("nolyrics")}</p>`;
}
function openPlayer(o) { $("#player").classList.toggle("open", o); $("#player").setAttribute("aria-hidden", !o); }
$("#player").addEventListener("click", async (e) => {
  const b = e.target.closest("[data-p]"); if (!b) return; const k = b.dataset.p;
  if (k === "close") openPlayer(false);
  else if (k === "pp") toggle(); else if (k === "next") next(); else if (k === "prev") prev();
  else if (k === "shuffle") { shuffle = !shuffle; drawPlayer(); }
  else if (k === "repeat") { repeatMode = (repeatMode + 1) % 3; drawPlayer(); }
  else if (k === "lyrics") { showLyr = !showLyr; drawPlayer(); }
  else if (k === "like") { setState(await api.invoke("toggle_favorite", { track: cur })); drawPlayer(); }
  else if (k === "menu") songMenu(cur);
  else if (k === "sleep") sleepSheet();
  else if (k === "queue") queueSheet();
  else if (k === "artist") { openPlayer(false); go("artist", { id: "", title: cur.artist.split(",")[0].trim() }); }
});
// swipe down to close on touch
(() => { let y0 = null; const p = $("#player"); p.addEventListener("touchstart", (e) => { if (!e.target.closest(".pl-lyr,input")) y0 = e.touches[0].clientY; }, { passive: true }); p.addEventListener("touchend", (e) => { if (y0 !== null && e.changedTouches[0].clientY - y0 > 110) openPlayer(false); y0 = null; }); })();

// ---------------------------------------------------------------- sheets (menus)
function sheet(html) { $("#sheet").onclick = null; $("#sheet").innerHTML = `<div class="grab"></div>${html}`; $("#sheet").classList.add("on"); $("#sheet-scrim").classList.add("on"); }
function closeSheet() { $("#sheet").classList.remove("on"); $("#sheet-scrim").classList.remove("on"); }
$("#sheet-scrim").onclick = closeSheet;
let sheetActs = [];
const items = (list) => { sheetActs = list.map((x) => x[2]); return list.map((x, i) => `<button class="mitem${x[3] ? " on" : ""}" data-m="${i}">${x[0]}<span>${esc(x[1])}</span></button>`).join(""); };
$("#sheet").addEventListener("click", (e) => { const b = e.target.closest("[data-m]"); if (b) { const f = sheetActs[+b.dataset.m]; closeSheet(); f && f(); } });
function songMenu(tr, plId) {
  const liked = favs().has(tr.id);
  const goArtist = () => { openPlayer(false); go("artist", { id: "", title: tr.artist.split(",")[0].trim() }); };
  const goAlbum = async () => { openPlayer(false); try { const r = await api.invoke("search_albums", { query: tr.album + " " + tr.artist }); if (r[0]) go("album", r[0]); } catch (e) { toast(errText(e)); } };
  const share = async () => { const u = "https://music.youtube.com/watch?v=" + tr.id; try { await navigator.clipboard.writeText(u); toast(t("copied")); } catch { toast(u); } };
  const top = [[liked ? IC.heartF : IC.heart, t("like"), async () => { setState(await api.invoke("toggle_favorite", { track: tr })); rerender(); }, liked], [IC.addpl, t("playlists"), () => pickPlaylist(tr)], [IC.radio, t("radio"), () => startRadio(tr)], [IC.share, t("sharel"), share]];
  const list = [
    [IC.next2, t("playnext"), () => { if (!cur) return playList([tr], 0); queue.splice(qi + 1, 0, tr); toast(t("next")); prefetchNext(); }],
    [IC.addq, t("addqueue"), () => { if (!cur) return playList([tr], 0); queue.push(tr); toast(t("addedq")); }],
    [IC.radio, t("radio"), () => startRadio(tr)],
    [IC.artist, t("view"), goArtist],
  ];
  if (tr.album) list.push([IC.album, t("openalb"), goAlbum]);
  if (plId) list.push([IC.trash, t("removepl"), async () => { setState(await api.invoke("remove_from_playlist", { id: plId, trackId: tr.id })); render(); }]);
  sheet(`<div class="sh-head">${img(tr.cover, "", "song")}<div style="min-width:0"><div class="t1">${esc(tr.title)}</div><div class="t2">${esc(tr.artist)}</div></div></div>
    <div class="acts4">${top.map((x, i) => `<button data-m="${i}" class="${x[3] ? "on" : ""}"><i>${x[0]}</i>${esc(x[1])}</button>`).join("")}</div>
    ${list.map((x, i) => `<button class="mitem" data-m="${i + top.length}">${x[0]}<span>${esc(x[1])}</span></button>`).join("")}`);
  sheetActs = [...top, ...list].map((x) => x[2]);
}
async function startRadio(tr) { try { toast(t("loading")); const r = await api.invoke("radio", { id: tr.id }); playList([tr, ...r.filter((x) => x.id !== tr.id)], 0, t("radio") + " · " + tr.title); } catch (e) { toast(errText(e)); } }
function pickPlaylist(tr) {
  sheet(`<div class="sh-title">${t("addpl")}</div>` + items([[IC.plus, t("newpl"), () => newPlaylist(tr)], ...S.library.playlists.map((p) => [IC.note, p.name, async () => { setState(await api.invoke("add_to_playlist", { id: p.id, track: tr })); toast(t("added", { p: p.name })); }])]));
}
function prompt(title, text, ph, ok, fn) {
  sheet(`<div class="sh-title">${title}</div>${text ? `<div class="sh-text">${text}</div>` : ""}<input class="field" id="pf" placeholder="${esc(ph)}"><div class="sh-act"><button class="btn tonal" data-x>${t("cancel")}</button><button class="btn ac" data-ok>${ok}</button></div>`);
  const i = $("#pf"); setTimeout(() => i.focus(), 250);
  const go2 = () => { const v = i.value.trim(); closeSheet(); if (v) fn(v); };
  $("#sheet [data-ok]").onclick = go2; $("#sheet [data-x]").onclick = closeSheet; i.onkeydown = (e) => e.key === "Enter" && go2();
}
function newPlaylist(tr) { prompt(t("newpl"), "", t("name"), t("create"), async (n) => { setState(await api.invoke("create_playlist", { name: n })); const p = S.library.playlists[S.library.playlists.length - 1]; if (tr && p) setState(await api.invoke("add_to_playlist", { id: p.id, track: tr })); toast(t("created")); rerender(); }); }
function queueSheet() {
  const k = reg(queue, t("queue"));
  sheet(`<div class="sh-title">${t("queue")}</div>` + (queue.length ? `<div class="rows">${queue.map((x, i) => row(x, k, i)).join("")}</div>` : `<div class="sh-text">${t("noqueue")}</div>`));
  const n = $("#sheet .row.now"); n && n.scrollIntoView({ block: "center" });
}
function sleepSheet() {
  const left = sleepAt ? Math.max(0, sleepAt - Date.now()) : 0; const mm = fmt(left / 1000);
  sheet(`<div class="st-h"><div class="bx">${IC.moon}</div><div><b>${t("sleep")}</b>${sleepAt ? `<span>${t("stopsin", { 0: mm })}</span>` : sleepEnd ? `<span>${t("endsong")}</span>` : ""}</div><button class="x" data-st="close">${IC.x}</button></div>
    ${sleepAt ? `<div class="ring"><div class="o">${mm}</div><div><p>${t("ringtxt")}</p><div class="bb"><button data-st="plus">${t("plus5")}</button><button class="p" data-st="off">${t("turnoff")}</button></div></div></div>` : ""}
    <div class="tgrid">${[15, 30, 45, 60, 90].map((n) => `<button data-st="${n}"><b>${n}</b><span>${t("minshort")}</span></button>`).join("")}<button data-st="end">${IC.note}<span>${t("endsong")}</span></button></div>`);
  sheetActs = [];
  $("#sheet").onclick = (e) => { const b = e.target.closest("[data-st]"); if (!b) return; const k = b.dataset.st; closeSheet();
    if (k === "close") return; if (k === "off") return setSleep(0); if (k === "plus") return setSleep(Math.round(left / 60000) + 5);
    if (k === "end") { setSleep(0, true); sleepEnd = true; drawPlayer(); return toast(t("endsong")); } setSleep(+k); };
}
function setSleep(n, quiet) {
  clearTimeout(sleepT); sleepAt = 0; sleepEnd = false;
  if (n) { sleepAt = Date.now() + n * 60000; toast(t("sleepset", { n })); sleepT = setTimeout(() => { if (playing) toggle(); sleepAt = 0; toast(t("sleepdone")); drawPlayer(); }, n * 60000); }
  else if (!quiet) toast(t("sleepoff"));
  drawPlayer(); if (route().name === "settings") render();
}
const rerender = () => { if (route().name !== "search") render(); else doSearch(lastQ, (route().arg || {}).f || "songs"); if (cur) drawPlayer(); };

// ---------------------------------------------------------------- page actions
$("#page").addEventListener("click", async (e) => {
  const a = e.target.closest("[data-a]");
  if (a) {
    const k = a.dataset.a; e.stopPropagation();
    if (k === "back") return back();
    if (k === "settings") return go("settings");
    if (k === "go") return go(a.dataset.to);
    if (k === "menu") { const r = a.closest(".row"); const l = lists[r.dataset.l]; return songMenu(l.tracks[+r.dataset.i], (route().name === "localpl" && route().arg) || null); }
    if (k === "playlist") { const l = lists[a.dataset.l]; return playList(l.tracks, 0, l.label); }
    if (k === "playpage" || k === "shufpage") { const l = lists[pageList()]; if (l) playList(l.tracks, 0, l.label, k === "shufpage"); return; }
    if (k === "artradio") { const l = lists[pageList()]; if (l && l.tracks[0]) startRadio(l.tracks[0]); return; }
    if (k === "xf") return go("explore", { f: a.dataset.f }, true);
    if (k === "sf") return go("search", { q: lastQ, f: a.dataset.f }, true);
    if (k === "desc") return a.classList.toggle("open");
    if (k === "queue") return queueSheet();
    if (k === "libradio") { const s = cur || S.library.history.map((x) => x.track)[0] || S.library.favorites[0]; if (s) startRadio(s); return; }
    if (k === "newpl") return newPlaylist();
    if (k === "importpl") return prompt(t("importpl"), t("importd"), "https://music.youtube.com/playlist?list=…", t("import"), async (v) => { try { setState(await api.invoke("import_playlist", { link: v })); toast(t("imported")); render(); } catch (err) { toast(errText(err)); } });
    if (k === "delpl") { setState(await api.invoke("delete_playlist", { id: a.dataset.id })); return back(); }
    if (k === "clearh") { setState(await api.invoke("clear_history")); toast(t("clearedh")); return render(); }
    if (k === "accent") { await saveSettings({ accent: a.dataset.c }); return render(); }
    if (k === "tog") { const key = a.dataset.k; const v = key === "offline" || key === "guest" ? !S.settings[key] : S.settings[key] === false; await saveSettings({ [key]: v }); memo.clear(); if (cur) tintFrom(cur); return render(); }
    if (k === "lang") return sheet(`<div class="sh-title">${t("language")}</div>` + items([["🇪🇸", "Español", () => setLang("es"), LANG === "es"], ["🇬🇧", "English", () => setLang("en"), LANG === "en"]]));
    if (k === "autodel") return sheet(`<div class="sh-title">${t("autodel")}</div>` + items([[0, "forever"], [7, "d7"], [30, "d30"], [90, "d90"]].map(([d, kk]) => [IC.history, t(kk), async () => { await saveSettings({ history_days: d }); render(); }, (S.settings.history_days || 0) === d])));
    if (k === "conns") { const c = await api.invoke("connections"); return sheet(`<div class="sh-title">${t("conns")}</div><div class="sh-text">${t("connsd")}</div>` + (c.length ? c.map((x) => `<div class="conn"><span>${esc(x.host)}</span><span>${t("req", { n: x.requests })}</span></div>`).join("") : `<div class="sh-text">${t("noconn")}</div>`)); }
    if (k === "sleep") return sleepSheet();
    if (k === "welcome") return showWelcome();
    if (k === "erase") { sheet(`<div class="sh-title">${t("eraset")}</div><div class="sh-text">${t("erased")}</div><div class="sh-act"><button class="btn tonal" data-x>${t("cancel")}</button><button class="btn danger" data-ok>${t("del")}</button></div>`); $("#sheet [data-x]").onclick = closeSheet; $("#sheet [data-ok]").onclick = () => api.invoke("erase_all"); return; }
    return;
  }
  const dm = e.target.closest("[data-dmix]");
  if (dm) { const arts = DMIX[+dm.dataset.dmix] || []; try { toast(t("loading")); const rs = await Promise.all(arts.map((a) => cached("search:" + a, () => api.invoke("search", { query: a })).catch(() => []))); const seeds = rs.map((r) => r[0]).filter(Boolean); const rad = seeds[0] ? await api.invoke("radio", { id: seeds[0].id }) : []; const all = []; const seen = new Set(); [...seeds, ...rs.flatMap((r) => r.slice(1, 5)), ...rad].forEach((x) => { if (!seen.has(x.id)) { seen.add(x.id); all.push(x); } }); for (let i = all.length - 1; i > 0; i--) { const k = Math.floor(Math.random() * (i + 1)); [all[i], all[k]] = [all[k], all[i]]; } if (all.length) { playList(all, 0, t("dmix", { 0: +dm.dataset.dmix + 1 })); openPlayer(true); } } catch (err) { toast(errText(err)); } return; }
  const mix = e.target.closest("[data-mix]");
  if (mix) { const name = mix.dataset.mix; try { toast(t("loading")); const r = await cached("search:" + name, () => api.invoke("search", { query: name })); if (r[0]) { const rad = await api.invoke("radio", { id: r[0].id }); playList([r[0], ...rad.filter((x) => x.id !== r[0].id)], 0, t("mixof", { a: name })); openPlayer(true); } } catch (err) { toast(errText(err)); } return; }
  const c = e.target.closest("[data-card]"); if (c) return go(c.dataset.card === "artist" ? "artist" : c.dataset.card === "album" ? "album" : "playlist", { id: c.dataset.id, title: c.dataset.title });
  const m = e.target.closest("[data-mood]"); if (m) return go("mood", { id: m.dataset.mood, title: m.textContent });
  const lp = e.target.closest("[data-lpl]"); if (lp) return go("localpl", lp.dataset.lpl);
  const r = e.target.closest("[data-l]"); if (r && lists[r.dataset.l]) { const l = lists[r.dataset.l]; playList(l.tracks, +r.dataset.i, l.label); }
});
const pageList = () => lists.page || Object.keys(lists).filter((k) => k !== "page").pop();
$("#sheet").addEventListener("click", (e) => { const r = e.target.closest(".row"); if (!r || e.target.closest("[data-a]")) return; const l = lists[r.dataset.l]; if (l) { const i = +r.dataset.i; if (l.tracks === queue) playAt(i); else playList(l.tracks, i, l.label); closeSheet(); } });
$("#sheet").addEventListener("click", (e) => { const a = e.target.closest("[data-a=menu]"); if (a) { const r = a.closest(".row"); const l = lists[r.dataset.l]; songMenu(l.tracks[+r.dataset.i]); } }, true);
document.querySelectorAll("[data-tab]").forEach((b) => (b.onclick = () => tab(b.dataset.tab)));
$("#mini").onclick = (e) => { if (!e.target.closest("button,input")) openPlayer(true); };
$("#mini-pp").onclick = toggle; $("#mini-next").onclick = () => next(); $("#mini-prev").onclick = prev;
const vol = $("#vol"); vol.oninput = () => { paint(vol); eng.volume(vol.value / 100); };
async function setLang(l) { LANG = l; await saveSettings({ lang: l }); applyLang(); render(); }
function applyLang() { document.documentElement.lang = LANG; document.querySelectorAll("[data-tr]").forEach((n) => (n.textContent = t(n.dataset.tr))); if (cur) drawPlayer(); }
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") { if ($("#sheet").classList.contains("on")) closeSheet(); else if ($("#player").classList.contains("open")) openPlayer(false); else back(); return; }
  if (e.key === "F11") { e.preventDefault(); if (!MOCK) { const w = TAURI.window.getCurrentWindow(); w.isFullscreen().then((f) => w.setFullscreen(!f)); } return; }
  if (/INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName)) return;
  if (e.code === "Space") { e.preventDefault(); toggle(); }
  else if (e.key === "ArrowRight") eng.seek(Math.min((cur && cur.duration) || 0, pos + 10));
  else if (e.key === "ArrowLeft") eng.seek(Math.max(0, pos - 10));
  else if (e.key === "ArrowUp" || e.key === "ArrowDown") { vol.value = Math.max(0, Math.min(100, +vol.value + (e.key === "ArrowUp" ? 5 : -5))); vol.oninput(); }
  else if (e.key === "n") next(); else if (e.key === "p") prev(); else if (e.key === "/") { e.preventDefault(); tab("search"); }
});
window.addEventListener("popstate", () => back());

// ---------------------------------------------------------------- welcome (first run), like the app's WelcomeScreen
let wstep = 0, wsel = [], wq = "", wres = null;
const WSTEPS = 4;
function showWelcome(step = 0) {
  wstep = step; wsel = [...(S.settings.artists || [])]; wq = ""; wres = null;
  let w = $("#welcome"); if (w) w.remove(); w = document.createElement("section"); w.id = "welcome"; document.body.appendChild(w);
  w.addEventListener("click", welcomeClick); w.addEventListener("input", (e) => { if (e.target.id === "wq") { wq = e.target.value; clearTimeout(sTimer); sTimer = setTimeout(wsearch, 350); } });
  drawWelcome();
}
async function wsearch() {
  if (!wq.trim()) { wres = null; return drawArtists(); }
  try { wres = await cached("search_artists:" + wq, () => api.invoke("search_artists", { query: wq })); } catch { wres = []; }
  drawArtists();
}
function face(name, i) {
  const on = wsel.includes(name);
  return `<div class="ac${on ? " on" : ""}" data-art="${esc(name)}"><div class="face" id="wf${i}"><div class="ini">${esc(name[0])}</div><div class="ck">${IC.check}</div></div><span>${esc(name)}</span></div>`;
}
function drawArtists() {
  const g = $("#agrid"); if (!g) return;
  const names = wres ? wres.map((c) => c.title) : [...wsel.filter((x) => !ARTISTS.includes(x)), ...ARTISTS];
  g.innerHTML = names.map(face).join("");
  names.forEach((n, i) => { const c = wres && wres[i]; const put = (u) => { const f = document.getElementById("wf" + i); if (f && u && f.parentElement.dataset.art === n) f.insertAdjacentHTML("afterbegin", `<img src="${esc(u)}" alt="">`); };
    if (c) { if (c.cover) { put(c.cover); memo.set("aimg:" + n, Promise.resolve(c)); } } else artistImg(n).then((x) => put(x.cover)).catch(() => {}); });
  drawWBottom();
}
function drawWBottom() {
  const b = $("#wbot"); if (!b) return; const last = wstep === WSTEPS - 1;
  let label = last ? t("wstart") : t("continue"), dis = false, faces = "";
  if (wstep === 1) { const n = wsel.length; label = n === 0 ? t("wpick") : n === 1 ? t("wdone1") : t("wdone", { n }); dis = n === 0;
    faces = n ? `<div class="faces">${wsel.slice(-3).reverse().map((x) => `<i style="display:block"></i>`).join("")}</div>` : ""; }
  b.innerHTML = `${faces}<button class="btn" data-w="next" ${dis ? "disabled" : ""}>${label}</button>`;
  if (wstep === 1) wsel.slice(-3).reverse().forEach((x, i) => artistImg(x).then((c) => { const el = b.querySelectorAll(".faces i")[i]; if (el && c.cover) el.outerHTML = `<img src="${esc(c.cover)}" alt="">`; }).catch(() => {}));
}
function drawWelcome() {
  const w = $("#welcome"); if (!w) return; const s = S.settings;
  const top = `<div class="w-top"><div>${wstep > 0 ? `<button class="ib" data-w="back">${IC.back}</button>` : ""}</div><div class="dots">${Array.from({ length: WSTEPS }, (_, i) => `<i class="${i === wstep ? "on" : ""}"></i>`).join("")}</div>${wstep === 1 ? `<button class="r" data-w="skip">${t("skip")}</button>` : "<div></div>"}</div>`;
  let body = "";
  if (wstep === 0) body = `<div style="width:76px;margin:10px 0 18px">${mark()}</div><h1>${t("wlang")}</h1><p>${t("wlangd")}</p><div class="langs">${[["es", "Español", "🇪🇸"], ["en", "English", "🇬🇧"]].map(([c, n, f]) => `<button class="lang${LANG === c ? " on" : ""}" data-l="${c}"><span>${f}&nbsp;&nbsp;${n}</span>${LANG === c ? IC.check : ""}</button>`).join("")}</div>`;
  else if (wstep === 1) body = `<h1>${t("wart")}</h1><p>${t("wartd")}</p><div class="sbox" style="margin:0 0 20px">${IC.search}<input id="wq" placeholder="${t("wsearch")}" value="${esc(wq)}" autocomplete="off"></div><div class="agrid" id="agrid"></div>`;
  else if (wstep === 2) body = `<h1>${t("wlook")}</h1><p>${t("wlookd")}</p><div class="looks">${[[true, "black", "#000"], [false, "gray", "#131116"]].map(([v, k, bg]) => `<button class="look${(s.pure_black !== false) === v ? " on" : ""}" data-look="${v}"><div class="pv" style="background:${bg};border:1px solid rgba(255,255,255,.1)"></div><b>${t(k)}</b></button>`).join("")}</div><div class="gt" style="padding-left:0">${t("accent")}</div><div class="swatches" style="padding:4px 0">${SEEDS.map((c) => `<button class="swatch${(s.accent || SEEDS[0]) === c ? " on" : ""}" style="background:${c}" data-wc="${c}"></button>`).join("")}</div>`;
  else body = `<div style="width:76px;margin:10px 0 18px">${mark()}</div><h1>${t("wpriv")}</h1><p>${t("wprivd")}</p><div class="group" style="margin:0 0 14px">${["p1", "p2", "p3", "p4", "p5"].map((k) => `<div class="promise">${IC.shield}<span>${t(k)}</span></div>`).join("")}</div>
    <div class="group" style="margin:0"><div class="set" data-wt="offline"><div class="si">${IC.cloudoff}</div><div class="sx"><b>${t("offlinem")}</b><span>${t("offlined")}</span></div><div class="sw${s.offline ? " on" : ""}"></div></div><div class="set" data-wt="guest"><div class="si">${IC.ghost}</div><div class="sx"><b>${t("guest")}</b><span>${t("guestd")}</span></div><div class="sw${s.guest ? " on" : ""}"></div></div></div>`;
  w.innerHTML = `${top}<div class="w-body">${body}</div><div class="w-bot" id="wbot"></div>`;
  if (wstep === 1) drawArtists(); else drawWBottom();
}
async function welcomeClick(e) {
  const l = e.target.closest("[data-l]"), a = e.target.closest("[data-art]"), b = e.target.closest("[data-w]"), lk = e.target.closest("[data-look]"), wc = e.target.closest("[data-wc]"), wt = e.target.closest("[data-wt]");
  if (l) { LANG = l.dataset.l; await saveSettings({ lang: LANG }); applyLang(); render(); return drawWelcome(); }
  if (a) { const n = a.dataset.art; wsel = wsel.includes(n) ? wsel.filter((x) => x !== n) : [...wsel, n]; a.classList.toggle("on"); return drawWBottom(); }
  if (lk) { await saveSettings({ pure_black: lk.dataset.look === "true" }); return drawWelcome(); }
  if (wc) { await saveSettings({ accent: wc.dataset.wc }); return drawWelcome(); }
  if (wt) { await saveSettings({ [wt.dataset.wt]: !S.settings[wt.dataset.wt] }); return drawWelcome(); }
  if (!b) return; const k = b.dataset.w;
  if (k === "back") { wstep--; return drawWelcome(); }
  if (k === "skip") { wstep++; return drawWelcome(); }
  if (k === "next") {
    if (wstep < WSTEPS - 1) { wstep++; return drawWelcome(); }
    await saveSettings({ onboarded: true, lang: LANG, artists: wsel }); memo.clear();
    const w = $("#welcome"); w.classList.add("out"); setTimeout(() => w.remove(), 500); stack = [{ name: "home" }]; render();
  }
}

// ---------------------------------------------------------------- opening, exactly like the app's OpeningReveal
const MARK_PATH = "M83.99,33.47 L83.62,33.34 L82.56,33.78 L81.63,33.96 L80.20,33.96 L78.52,33.53 L77.33,32.97 L75.90,32.04 L73.60,30.23 L72.11,29.24 L69.99,28.36 L68.62,28.18 L67.50,28.24 L66.13,28.74 L65.57,29.24 L65.20,30.17 L65.20,59.04 L65.08,59.66 L64.64,60.72 L63.89,61.84 L63.02,62.77 L61.40,64.02 L59.85,64.89 L58.11,65.57 L56.68,65.95 L54.81,66.20 L52.69,66.20 L51.57,66.07 L49.58,65.64 L48.09,65.14 L45.48,63.83 L43.11,62.09 L41.49,60.47 L40.12,58.67 L39.38,57.42 L38.13,54.50 L37.64,52.57 L37.45,51.26 L37.39,48.65 L37.76,46.04 L38.69,43.11 L40.12,40.37 L41.87,38.01 L43.61,36.20 L45.16,34.90 L46.53,33.96 L48.15,33.03 L50.20,32.10 L50.58,31.60 L50.52,31.04 L50.02,30.60 L48.96,30.36 L46.53,30.36 L44.17,30.73 L41.99,31.29 L39.94,32.04 L37.45,33.22 L35.77,34.21 L34.09,35.40 L32.16,37.01 L29.98,39.25 L28.43,41.24 L27.18,43.17 L25.94,45.60 L25.25,47.28 L24.32,50.45 L23.82,53.69 L23.82,57.11 L24.13,59.48 L24.63,61.65 L25.25,63.58 L26.19,65.76 L27.37,67.94 L28.30,69.37 L30.11,71.67 L32.22,73.85 L33.47,74.91 L35.40,76.28 L36.89,77.15 L38.69,78.02 L41.37,78.95 L43.92,79.51 L45.60,79.70 L47.59,79.76 L49.96,79.57 L52.01,79.20 L54.31,78.52 L56.80,77.46 L58.48,76.52 L59.72,75.72 L61.96,73.91 L63.77,72.04 L64.95,70.55 L65.95,69.06 L66.88,67.38 L67.69,65.51 L68.44,63.21 L68.81,61.47 L69.06,59.48 L69.12,37.26 L69.68,36.95 L71.30,37.01 L72.98,37.57 L75.28,38.69 L76.59,39.07 L78.45,39.13 L79.70,38.88 L81.44,38.01 L82.68,36.83 L83.12,36.20 L83.74,34.90 L83.99,34.03 Z";
function bezier(x1, y1, x2, y2) {
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx, cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  const X = (t) => ((ax * t + bx) * t + cx) * t, Y = (t) => ((ay * t + by) * t + cy) * t, dX = (t) => (3 * ax * t + 2 * bx) * t + cx;
  return (x) => { if (x <= 0) return 0; if (x >= 1) return 1; let t = x; for (let i = 0; i < 8; i++) { const d = dX(t); if (Math.abs(d) < 1e-6) break; t -= (X(t) - x) / d; } t = Math.min(1, Math.max(0, t)); return Y(t); };
}
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
function opening(onDive) {
  return new Promise((done) => {
    const cv = $("#opening"); const dpr = Math.min(devicePixelRatio || 1, 2);
    const fit = () => { cv.width = innerWidth * dpr; cv.height = innerHeight * dpr; }; fit();
    const x = cv.getContext("2d"); const mark = new Path2D(MARK_PATH);
    const SETTLE = 620, HOLD = 120, DIVE = 900, ZOOM = 90, VP = 108;
    const eSettle = bezier(0.2, 0, 0, 1), eDive = bezier(0.6, 0, 0.85, 0.35);
    const t0 = performance.now();
    const frame = (now) => {
      const fixed = MOCK && /[?&]t=(\d+)/.exec(location.search); const el = fixed ? +fixed[1] : now - t0; const st = eSettle(Math.min(1, el / SETTLE)); const dl = el - SETTLE - HOLD; const d = dl > 0 ? eDive(Math.min(1, dl / DIVE)) : 0;
      const W = innerWidth, H = innerHeight; x.setTransform(dpr, 0, 0, dpr, 0, 0); x.clearRect(0, 0, W, H);
      const base = 240 / VP; const breathe = 1 + 0.05 * Math.sin(Math.PI * st); const s = base * breathe * Math.exp(Math.log(ZOOM) * d * d);
      const win = smooth(0.04, 0.28, d), fade = 1 - smooth(0.8, 1, d);
      x.globalCompositeOperation = "source-over"; x.globalAlpha = fade; x.fillStyle = "#000"; x.fillRect(0, 0, W, H);
      x.translate(W / 2 - (VP / 2) * s, H / 2 - (VP / 2) * s); x.scale(s, s);
      x.globalAlpha = 1 - win; x.fillStyle = "#fff"; x.fill(mark);
      if (st >= 0.05 && st <= 0.98 && d === 0) { // a band of light runs across the mark as it settles
        const gx = -30 + 170 * st; const g = x.createLinearGradient(gx - 18, 30, gx + 18, 78);
        g.addColorStop(0, "rgba(218,218,218,0)"); g.addColorStop(0.5, "rgba(218,218,218,.9)"); g.addColorStop(1, "rgba(218,218,218,0)");
        x.save(); x.clip(mark); x.globalAlpha = 1; x.globalCompositeOperation = "source-atop"; x.fillStyle = g; x.fillRect(0, 0, VP, VP); x.restore();
      }
      if (win > 0) { x.globalCompositeOperation = "destination-out"; x.globalAlpha = win; x.fillStyle = "#000"; x.fill(mark); x.globalCompositeOperation = "source-over"; }
      if (fade > 0) { x.globalAlpha = fade; x.strokeStyle = "#fff"; x.lineJoin = "round"; x.lineWidth = 2.5 / s; x.stroke(mark); }
      onDive(dl > 0 ? d : 0);
      if (fixed) return; if (dl < DIVE) requestAnimationFrame(frame); else { onDive(1); cv.remove(); done(); }
    };
    requestAnimationFrame(frame);
  });
}
function appDive(d) { // the app comes forward as it's revealed (1.14 → 1)
  const s = d >= 1 ? "" : `scale(${1.14 - 0.14 * (1 - (1 - d) * (1 - d))})`;
  $("#app").style.transform = s; $("#chrome").style.transform = s;
}

// ---------------------------------------------------------------- start
(async function init() {
  try { setState(await api.invoke("get_state")); } catch (e) { toast(String(e)); }
  if (S.settings.lang) LANG = S.settings.lang;
  applyLook(); applyLang();
  vol.value = Math.round((S.settings.volume ?? 0.8) * 100); paint(vol);
  const h = MOCK ? location.hash.slice(1) : "";
  if (h && PAGES[h]) stack = [{ name: h }];
  render();
  if (MOCK && h === "player") { queue = demo; playList(demo, 1, "Midnight Orbit"); openPlayer(true); setPlaying(true); }
  if (MOCK && h === "lyrics") { playList(demo, 1, "Midnight Orbit"); showLyr = true; drawPlayer(); openPlayer(true); }
  if (MOCK && h === "artist") go("artist", { id: "x", title: "Luna Park" });
  if (MOCK && h === "album") go("album", { id: "x", title: "" });
  if (MOCK && h === "menu") { playList(demo, 0); setTimeout(() => songMenu(demo[2]), 100); }
  if (MOCK && (h === "home" || h === "library")) { playList(demo, 0, "Noches"); setTimeout(() => setPlaying(true)); }
  if (!S.settings.onboarded) showWelcome(MOCK ? +((h.match(/welcome(\d)/) || [0, 0])[1]) : 0);
  if (matchMedia("(prefers-reduced-motion: reduce)").matches || (MOCK && h)) { $("#opening").remove(); return; }
  appDive(0); opening(appDive);
})();
