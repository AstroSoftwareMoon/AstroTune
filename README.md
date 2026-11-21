<p align="center"><img src="docs/banner.png" alt="AstroTune" width="100%"></p>

<p align="center"><img src="docs/logo.png" alt="Logo de AstroTune" width="160"></p>

# AstroTune

> **100 % privado y anónimo**: sin cuenta, sin rastreo, sin ubicación y sin envío de datos.

Reproductor de música para Android de la familia **Astro**, con el logo de la luna y la nota.

AstroTune es un fork de [OpenTune](https://github.com/justshivv/Opentune) de justshivv, distribuido bajo **GPL-3.0** (ver `LICENSE` y `THIRD_PARTY_NOTICES.md`). El README original se conserva en [`docs/UPSTREAM_README.md`](docs/UPSTREAM_README.md).

## Cambios respecto a OpenTune

- Nueva marca: nombre AstroTune, icono de la app, animación de apertura y banner con la luna.
- Identificador propio (`com.astrotune`): se instala junto a OpenTune sin pisarlo.
- Las estadísticas de uso están desactivadas: no se envía nada a los servidores originales.
- El comprobador de actualizaciones apunta a este repositorio.

## Privacidad y anonimato

AstroTune es privado y anónimo por diseño.

- **No pide ubicación**: el permiso se ha eliminado del manifiesto y el código de localización está desactivado (también el geocodificador, que enviaría coordenadas).
- **No usa el micrófono**: se ha quitado el permiso de grabación, así que no se envía audio a ningún servicio de reconocimiento.

- Sin estadísticas de uso, sin analíticas y sin informes de fallos remotos.
- Sin configuración remota, sin bloqueo remoto de versión, sin comprobación automática de actualizaciones ni catálogo de addons de terceros: un interceptor central (`Privacy.kt`) corta cualquier conexión a los servidores del autor original.
- Copias de seguridad de Android desactivadas y sin permiso para instalar paquetes.
- Solo se conecta a los servicios que necesita tu reproducción (música, letras, metadatos) y a tu propio servidor si usas uno.
- No hay cuenta ni identificador de instalación: nada te identifica.
- El repositorio es privado.

## Compilar

Cada push compila el APK en GitHub Actions (pestaña **Actions** → artefacto `AstroTune-debug-apk`).

En local: `./gradlew :app:assembleDebug` (JDK 21 y Android SDK 37).

## Nota

Las funciones que dependen de los servidores del autor original (addon sin pérdida con verificación de firma) pueden no funcionar en este fork.
