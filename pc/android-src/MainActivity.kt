package com.astrotune.rs

import android.Manifest
import android.content.BroadcastReceiver
import android.content.ComponentName
import android.content.Intent
import android.content.IntentFilter
import android.media.AudioManager
import android.content.Context
import android.content.pm.PackageManager
import android.net.wifi.WifiManager
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.webkit.JavascriptInterface
import android.webkit.WebView
import androidx.media3.common.MediaItem
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.session.MediaController
import androidx.media3.session.SessionToken
import com.google.common.util.concurrent.ListenableFuture
import com.google.common.util.concurrent.MoreExecutors
import org.json.JSONArray
import org.json.JSONObject

/**
 * The window, plus a bridge (window.AstroNative) to the native player in [PlaybackService].
 * The bridge only plays, pauses and moves through the queue; it can't read anything.
 */
class MainActivity : TauriActivity() {
    private val main = Handler(Looper.getMainLooper())
    private var web: WebView? = null
    private var controllerFuture: ListenableFuture<MediaController>? = null
    private val controller: MediaController? get() = controllerFuture?.takeIf { it.isDone }?.let { runCatching { it.get() }.getOrNull() }
    private var multicast: WifiManager.MulticastLock? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS), 7)
        }
        // Finding Chromecast / DLNA speakers needs multicast on the Wi-Fi (local network only).
        multicast = (applicationContext.getSystemService(Context.WIFI_SERVICE) as? WifiManager)
            ?.createMulticastLock("astrotune-cast")?.apply { setReferenceCounted(false); acquire() }
        val token = SessionToken(this, ComponentName(this, PlaybackService::class.java))
        controllerFuture = MediaController.Builder(this, token).buildAsync().also { f ->
            f.addListener({ runCatching { f.get().addListener(events) } }, MoreExecutors.directExecutor())
        }
        main.post(ticker)
        // Volume keys: when music is sent to a speaker, the window turns the speaker up or down too.
        volumeControlStream = AudioManager.STREAM_MUSIC
        val filter = IntentFilter("android.media.VOLUME_CHANGED_ACTION")
        if (Build.VERSION.SDK_INT >= 33) registerReceiver(volumeKeys, filter, Context.RECEIVER_EXPORTED) else registerReceiver(volumeKeys, filter)
    }

    private val volumeKeys = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            if (intent?.getIntExtra("android.media.EXTRA_VOLUME_STREAM_TYPE", -1) != AudioManager.STREAM_MUSIC) return
            val am = getSystemService(Context.AUDIO_SERVICE) as? AudioManager ?: return
            val max = am.getStreamMaxVolume(AudioManager.STREAM_MUSIC).takeIf { it > 0 } ?: return
            js(JSONObject().put("type", "sysvol").put("value", am.getStreamVolume(AudioManager.STREAM_MUSIC).toDouble() / max))
        }
    }

    override fun onWebViewCreate(webView: WebView) {
        web = webView
        webView.addJavascriptInterface(Native(), "AstroNative")
    }

    override fun onDestroy() {
        main.removeCallbacks(ticker)
        runCatching { unregisterReceiver(volumeKeys) }
        controllerFuture?.let { MediaController.releaseFuture(it) }
        multicast?.takeIf { it.isHeld }?.release()
        super.onDestroy()
    }

    private fun js(o: JSONObject) {
        main.post { web?.evaluateJavascript("window.__astroNative&&window.__astroNative(${o})", null) }
    }

    private val ticker = object : Runnable {
        override fun run() {
            controller?.let { c ->
                if (c.mediaItemCount > 0) {
                    js(JSONObject().put("type", "tick").put("pos", c.currentPosition / 1000.0).put("paused", !c.isPlaying).put("index", c.currentMediaItemIndex))
                }
            }
            main.postDelayed(this, 500)
        }
    }

    private val events = object : Player.Listener {
        override fun onMediaItemTransition(mediaItem: MediaItem?, reason: Int) {
            val c = controller ?: return
            js(JSONObject().put("type", "index").put("index", c.currentMediaItemIndex).put("id", mediaItem?.mediaId ?: ""))
        }

        override fun onIsPlayingChanged(isPlaying: Boolean) {
            js(JSONObject().put("type", "state").put("playing", isPlaying))
        }

        override fun onPlaybackStateChanged(state: Int) {
            if (state == Player.STATE_ENDED) js(JSONObject().put("type", "ended"))
        }

        override fun onPlayerError(error: PlaybackException) {
            js(JSONObject().put("type", "error").put("message", error.errorCodeName))
        }
    }

    /** Everything runs on the main thread, where the player lives. */
    private inner class Native {
        private fun on(block: (MediaController) -> Unit) = main.post { controller?.let(block) }

        @JavascriptInterface fun available(): Boolean = true

        @JavascriptInterface fun setBase(base: String) = Bridge.setBase(applicationContext, base)

        @JavascriptInterface fun setLanguage(lang: String) = Bridge.setSpanish(applicationContext, lang != "en")

        /** Library for Android Auto: {recents:[track], liked:[track], playlists:[{name, tracks}]} */
        @JavascriptInterface fun setLibrary(json: String) = Bridge.setLibrary(applicationContext, json)

        @JavascriptInterface fun setQueue(json: String, index: Int, startSeconds: Double, play: Boolean) {
            val arr = runCatching { JSONArray(json) }.getOrNull() ?: return
            val items = (0 until arr.length()).map { Bridge.item(applicationContext, arr.getJSONObject(it)) }
            on { c ->
                c.setMediaItems(items, index.coerceIn(0, (items.size - 1).coerceAtLeast(0)), (startSeconds * 1000).toLong())
                c.prepare()
                c.playWhenReady = play
            }
        }

        @JavascriptInterface fun insert(json: String, at: Int) {
            val t = runCatching { JSONObject(json) }.getOrNull() ?: return
            on { c -> c.addMediaItem(at.coerceIn(0, c.mediaItemCount), Bridge.item(applicationContext, t)) }
        }

        @JavascriptInterface fun playIndex(index: Int) = on { c -> c.seekTo(index, 0); c.prepare(); c.play() }
        @JavascriptInterface fun play() = on { c -> c.prepare(); c.play() }
        @JavascriptInterface fun pause() = on { it.pause() }
        @JavascriptInterface fun seek(seconds: Double) = on { it.seekTo((seconds * 1000).toLong()) }
        @JavascriptInterface fun next() = on { it.seekToNextMediaItem() }
        @JavascriptInterface fun prev() = on { it.seekToPrevious() }
        @JavascriptInterface fun setShuffle(enabled: Boolean) = on { it.shuffleModeEnabled = enabled }

        /** 0 off, 1 all, 2 one (the window's order). */
        @JavascriptInterface fun setRepeat(mode: Int) = on {
            it.repeatMode = when (mode) { 1 -> Player.REPEAT_MODE_ALL; 2 -> Player.REPEAT_MODE_ONE; else -> Player.REPEAT_MODE_OFF }
        }

        @JavascriptInterface fun setVolume(v: Double) = on { it.volume = v.toFloat().coerceIn(0f, 1f) }
        @JavascriptInterface fun stop() = on { it.stop(); it.clearMediaItems() }
    }
}
