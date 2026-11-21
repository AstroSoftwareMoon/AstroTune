#!/usr/bin/env python3
"""Adds AstroTune's native Android parts to the project `tauri android init` generates.

* MainActivity with the window.AstroNative bridge, and PlaybackService (Media3): background
  playback, notification / lock screen / Bluetooth controls and Android Auto.
* Manifest: the service, Android Auto's descriptor, the permissions they need, and a network
  config that allows plain HTTP only to the app's own 127.0.0.1 audio server.
* Gradle: Media3.

Run from pc/: python3 android-src/patch.py
"""
import pathlib
import re
import shutil
import sys

ROOT = pathlib.Path("src-tauri/gen/android")
APP = ROOT / "app"
PKG = "com.astrotune.rs"
SRC = pathlib.Path("android-src")


def main() -> None:
    java = APP / "src/main/java" / PKG.replace(".", "/")
    if not java.is_dir():
        sys.exit(f"missing {java}: run `tauri android init` first")
    for f in ("MainActivity.kt", "PlaybackService.kt"):
        shutil.copy(SRC / f, java / f)
    res = APP / "src/main/res/xml"
    res.mkdir(parents=True, exist_ok=True)
    for f in (SRC / "res/xml").iterdir():
        shutil.copy(f, res / f.name)

    man = APP / "src/main/AndroidManifest.xml"
    m = man.read_text()
    perms = [
        "android.permission.FOREGROUND_SERVICE",
        "android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK",
        "android.permission.POST_NOTIFICATIONS",
        "android.permission.WAKE_LOCK",
        "android.permission.ACCESS_WIFI_STATE",
        "android.permission.CHANGE_WIFI_MULTICAST_STATE",
    ]
    add = "".join(f'    <uses-permission android:name="{p}" />\n' for p in perms if p not in m)
    m = m.replace("<application", add + "    <application", 1) if add else m
    if "networkSecurityConfig" not in m:
        m = m.replace("<application", '<application\n        android:networkSecurityConfig="@xml/astrotune_network"', 1)
    service = """
        <service
            android:name=".PlaybackService"
            android:exported="true"
            android:foregroundServiceType="mediaPlayback">
            <intent-filter>
                <action android:name="androidx.media3.session.MediaLibraryService" />
                <action android:name="android.media.browse.MediaBrowserService" />
            </intent-filter>
        </service>
        <meta-data
            android:name="com.google.android.gms.car.application"
            android:resource="@xml/automotive_app_desc" />
    </application>"""
    if "PlaybackService" not in m:
        m = m.replace("</application>", service.lstrip("\n"), 1)
    man.write_text(m)

    g = APP / "build.gradle.kts"
    s = g.read_text()
    deps = [
        'implementation("androidx.media3:media3-exoplayer:1.5.1")',
        'implementation("androidx.media3:media3-session:1.5.1")',
    ]
    if "media3-session" not in s:
        s = re.sub(r"dependencies\s*\{", "dependencies {\n    " + "\n    ".join(deps), s, count=1)
    g.write_text(s)
    print("AstroTune native parts added:", java)


if __name__ == "__main__":
    main()
