<p align="center"><img src="https://github.com/AstroSoftwareMoon/AstroTune/blob/main/docs/banner.png?raw=true" alt="AstroTune" width="100%"></p>

# 🌙 AstroTune 2.0 · privada y anónima

Reproductor de música **sin cuenta, sin ubicación, sin micrófono, sin anuncios y sin telemetría**. Biblioteca, historial y ajustes viven solo en tu móvil, tele u ordenador.

## ⬇️ Descargas

| Plataforma | Archivo |
|---|---|
| 📱 Android (Android Auto, Chromecast, DLNA) | `*-android-universal.apk` (o el de tu arquitectura; `arm64-v8a` en casi todos) |
| 📺 Android TV / Google TV | `*-android-tv.apk` |
| 🪟 Windows 10/11 | `*-windows-x64-setup.exe` · `.msi` · `-portable.zip` |
| 🐧 Linux | `*-linux-amd64.deb` · `*-linux-x86_64.rpm` · `-portable.tar.gz` |
| 🍎 macOS Apple Silicon (M1 o superior) | `*-macos-apple-silicon.dmg` |
| 🍎 macOS Intel | `*-macos-intel.dmg` |

## ✨ Novedades de la 2.0

- **AstroTune para PC, hecha desde la app de Android.** Ya no hay versión en Rust: la de Windows, macOS y Linux compila el mismo código que el móvil (YouTube Music, letras de todas las fuentes, ajustes, mixes diarios, estadísticas) y se ve igual: dock y barra lateral con cristal, reproductor con el color de la carátula, letras sincronizadas, cola, radio, complementos de audio sin pérdida (FLAC), Discord y Last.fm.
- **Reproduce como el móvil.** El audio se pide con las mismas identidades y en el mismo orden que la app de Android, cada enlace se prueba antes de usarlo y, si YouTube corta a mitad, sigue desde el mismo punto con un enlace nuevo.
- **Volumen al enviar**: con Google Home, Chromecast o DLNA, los botones de volumen del móvil suben y bajan el altavoz.
- Arreglado que algunas canciones se saltaran a mitad (SponsorBlock y reintentos).

## 🔒 Privacidad y seguridad

- Sin cuenta, sin registro, sin identificador de instalación.
- Modo sin conexión, modo invitado y borrado automático del historial.
- Código abierto (GPL-3.0) y `SHA256SUMS.txt` para comprobar cada descarga.

## ⚠️ Importante

Las builds no llevan certificado de pago: **Windows SmartScreen** y **macOS Gatekeeper** pueden avisar (en macOS: clic derecho → Abrir). Los APK de Android están firmados con clave de depuración (desinstala la versión anterior antes de actualizar). Alexa no admite emisión directa: úsala como altavoz Bluetooth.
