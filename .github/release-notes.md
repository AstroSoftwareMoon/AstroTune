<p align="center"><img src="https://github.com/AstroSoftwareMoon/AstroTune/blob/main/docs/banner.png?raw=true" alt="AstroTune" width="100%"></p>

# 🌙 AstroTune · privada y anónima

Reproductor de música **sin cuenta, sin ubicación, sin micrófono, sin anuncios y sin telemetría**. Ningún dato tuyo sale de tu dispositivo. Biblioteca, historial y ajustes viven solo en tu móvil, tele u ordenador.

## ⬇️ Descargas

| Plataforma | Archivo |
|---|---|
| 📱 Android (Android Auto, Chromecast, DLNA) | `*-android-universal.apk` (o el de tu arquitectura; `arm64-v8a` en casi todos) |
| 📱 Android (Rust, beta) | `*-android-rust-beta.apk`: versión en Rust, con el mismo aspecto y el mismo icono que la normal |
| 📺 Android TV / Google TV | `*-android-tv.apk` |
| 🪟 Windows 10/11 | `*-windows-x64.exe` |
| 🐧 Linux | `*-linux-x64.deb` · `.rpm` · `.AppImage` |
| 🍎 macOS Apple Silicon (M1 o superior) | `*-macos-apple-silicon.dmg` |
| 🍎 macOS Intel | `*-macos-intel.dmg` |

## ✨ AstroTune para PC (Rust)

**Idéntica a la app de Android**: mismas secciones (Inicio, Explorar, Biblioteca, Buscar), reproductor con el color de la carátula, letras, cola, temporizador, radio, ajustes de apariencia y privacidad, cristal líquido y el mismo icono. Al abrirla por primera vez eliges **idioma (Español / English)**, ves qué garantiza la privacidad, eliges tus artistas y ajustas el nivel de privacidad.

<img src="https://github.com/AstroSoftwareMoon/AstroTune/blob/main/docs/screenshots/1-bienvenida.png?raw=true" alt="Bienvenida: idioma" width="49%">
<img src="https://github.com/AstroSoftwareMoon/AstroTune/blob/main/docs/screenshots/2-seguridad.png?raw=true" alt="Bienvenida: privacidad" width="49%">
<img src="https://github.com/AstroSoftwareMoon/AstroTune/blob/main/docs/screenshots/3-artistas.png?raw=true" alt="Bienvenida: artistas" width="49%">
<img src="https://github.com/AstroSoftwareMoon/AstroTune/blob/main/docs/screenshots/4-privacidad-inicial.png?raw=true" alt="Bienvenida: estilo" width="49%">
<img src="https://github.com/AstroSoftwareMoon/AstroTune/blob/main/docs/screenshots/5-buscar.png?raw=true" alt="Inicio" width="49%">
<img src="https://github.com/AstroSoftwareMoon/AstroTune/blob/main/docs/screenshots/6-reproductor.png?raw=true" alt="Reproductor" width="49%">
<img src="https://github.com/AstroSoftwareMoon/AstroTune/blob/main/docs/screenshots/7-privacidad.png?raw=true" alt="Ajustes" width="100%">

<sub>Capturas de la interfaz con datos de ejemplo.</sub>

### 📱 En el móvil (Rust): Inicio, reproductor, Explorar y Ajustes

<img src="https://github.com/AstroSoftwareMoon/AstroTune/blob/main/docs/screenshots/m-1-buscar.png?raw=true" width="24%">
<img src="https://github.com/AstroSoftwareMoon/AstroTune/blob/main/docs/screenshots/m-2-reproductor.png?raw=true" width="24%">
<img src="https://github.com/AstroSoftwareMoon/AstroTune/blob/main/docs/screenshots/m-3-artistas.png?raw=true" width="24%">
<img src="https://github.com/AstroSoftwareMoon/AstroTune/blob/main/docs/screenshots/m-4-privacidad.png?raw=true" width="24%">

## 🔒 Privacidad y seguridad

- Sin cuenta, sin registro, sin identificador de instalación.
- La interfaz de PC está aislada (CSP estricta) y no puede acceder a internet; solo el núcleo pide la música.
- Modo sin conexión, modo invitado y borrado automático del historial.
- Panel que muestra a qué servidores se conecta la app (la lista no sale de tu equipo).
- Código abierto (GPL-3.0), sin programas de terceros dentro y con `SHA256SUMS.txt` para comprobar cada descarga.

## ⚠️ Importante

Las builds no llevan certificado de pago: **Windows SmartScreen** y **macOS Gatekeeper** pueden avisar (en macOS: clic derecho → Abrir). Los APK de Android están firmados con clave de depuración (desinstala la versión anterior antes de actualizar). Alexa no admite emisión directa: úsala como altavoz Bluetooth.

Fork de OpenTune.
