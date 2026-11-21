package com.astrotune.rs

import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import androidx.media3.common.AudioAttributes
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.session.LibraryResult
import androidx.media3.session.MediaLibraryService
import androidx.media3.session.MediaSession
import com.google.common.collect.ImmutableList
import com.google.common.util.concurrent.Futures
import com.google.common.util.concurrent.ListenableFuture
import org.json.JSONArray
import org.json.JSONObject

/**
 * AstroTune's player on Android: keeps music going with the screen off, puts the controls in the
 * notification, on the lock screen and on Bluetooth headsets, and lets Android Auto browse
 * Recents, Liked songs and your playlists.
 *
 * The audio comes from AstroTune's own server inside the app (127.0.0.1 only), the same Rust
 * code the window uses, so nothing here talks to the internet by itself.
 */
class PlaybackService : MediaLibraryService() {
    private var session: MediaLibrarySession? = null

    override fun onCreate() {
        super.onCreate()
        val player = ExoPlayer.Builder(this)
            .setAudioAttributes(
                AudioAttributes.Builder().setUsage(C.USAGE_MEDIA).setContentType(C.AUDIO_CONTENT_TYPE_MUSIC).build(),
                true,
            )
            .setHandleAudioBecomingNoisy(true)
            .setWakeMode(C.WAKE_MODE_NETWORK)
            .build()
        val open = PendingIntent.getActivity(
            this, 0, Intent(this, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
        // A stream that drops mid-song is picked up again from the same second, a few times,
        // instead of moving on: the app's server fetches a fresh address when the old one expired.
        player.addListener(object : Player.Listener {
            private var retries = 0
            private val main = android.os.Handler(android.os.Looper.getMainLooper())
            override fun onMediaItemTransition(mediaItem: MediaItem?, reason: Int) { retries = 0 }
            override fun onPlayerError(error: PlaybackException) {
                if (retries >= 3) return
                retries++
                val index = player.currentMediaItemIndex
                val position = player.currentPosition
                main.postDelayed({
                    player.seekTo(index, position)
                    player.prepare()
                    player.play()
                }, 700L * retries)
            }
        })
        session = MediaLibrarySession.Builder(this, player, Library(this)).setSessionActivity(open).build()
    }

    override fun onGetSession(controllerInfo: MediaSession.ControllerInfo): MediaLibrarySession? = session

    override fun onTaskRemoved(rootIntent: Intent?) {
        val p = session?.player
        if (p == null || !p.playWhenReady || p.mediaItemCount == 0) stopSelf()
    }

    override fun onDestroy() {
        session?.run {
            player.release()
            release()
        }
        session = null
        super.onDestroy()
    }

    /** The tree Android Auto (and any media browser) shows. */
    private class Library(private val context: Context) : MediaLibrarySession.Callback {
        override fun onGetLibraryRoot(
            session: MediaLibrarySession,
            browser: MediaSession.ControllerInfo,
            params: LibraryParams?,
        ): ListenableFuture<LibraryResult<MediaItem>> =
            Futures.immediateFuture(LibraryResult.ofItem(folder(ROOT, "AstroTune"), params))

        override fun onGetItem(
            session: MediaLibrarySession,
            browser: MediaSession.ControllerInfo,
            mediaId: String,
        ): ListenableFuture<LibraryResult<MediaItem>> {
            val item = allTracks(context).firstOrNull { it.mediaId == mediaId } ?: folder(mediaId, mediaId)
            return Futures.immediateFuture(LibraryResult.ofItem(item, null))
        }

        override fun onGetChildren(
            session: MediaLibrarySession,
            browser: MediaSession.ControllerInfo,
            parentId: String,
            page: Int,
            pageSize: Int,
            params: LibraryParams?,
        ): ListenableFuture<LibraryResult<ImmutableList<MediaItem>>> {
            val lib = Bridge.library(context)
            val es = Bridge.spanish(context)
            val items: List<MediaItem> = when {
                parentId == ROOT -> listOf(
                    folder(RECENTS, if (es) "Recientes" else "Recents"),
                    folder(LIKED, if (es) "Favoritos" else "Liked songs"),
                    folder(PLAYLISTS, if (es) "Listas" else "Playlists"),
                )
                parentId == RECENTS -> tracks(lib.optJSONArray("recents"))
                parentId == LIKED -> tracks(lib.optJSONArray("liked"))
                parentId == PLAYLISTS -> (0 until (lib.optJSONArray("playlists")?.length() ?: 0)).map { i ->
                    val p = lib.getJSONArray("playlists").getJSONObject(i)
                    folder("$PLAYLIST_PREFIX$i", p.optString("name"))
                }
                parentId.startsWith(PLAYLIST_PREFIX) -> {
                    val i = parentId.removePrefix(PLAYLIST_PREFIX).toIntOrNull() ?: -1
                    tracks(lib.optJSONArray("playlists")?.optJSONObject(i)?.optJSONArray("tracks"))
                }
                else -> emptyList()
            }
            val from = (page * pageSize).coerceAtMost(items.size)
            val to = (from + pageSize).coerceAtMost(items.size)
            return Futures.immediateFuture(LibraryResult.ofItemList(ImmutableList.copyOf(items.subList(from, to)), params))
        }

        /** Items picked in Android Auto arrive with an id only: give them their address. */
        override fun onAddMediaItems(
            mediaSession: MediaSession,
            controller: MediaSession.ControllerInfo,
            mediaItems: MutableList<MediaItem>,
        ): ListenableFuture<MutableList<MediaItem>> {
            val known = allTracks(context).associateBy { it.mediaId }
            val out = mediaItems.map { m ->
                if (m.localConfiguration != null) m else (known[m.mediaId] ?: m).buildUpon().setUri(Bridge.uriFor(context, m.mediaId)).build()
            }.toMutableList()
            return Futures.immediateFuture(out)
        }

        private fun allTracks(c: Context): List<MediaItem> {
            val lib = Bridge.library(c)
            val all = tracks(lib.optJSONArray("recents")) + tracks(lib.optJSONArray("liked"))
            val pls = lib.optJSONArray("playlists")
            val inPls = (0 until (pls?.length() ?: 0)).flatMap { tracks(pls!!.getJSONObject(it).optJSONArray("tracks")) }
            return all + inPls
        }

        private fun tracks(a: JSONArray?): List<MediaItem> =
            (0 until (a?.length() ?: 0)).map { Bridge.item(context, a!!.getJSONObject(it)) }

        private fun folder(id: String, title: String): MediaItem = MediaItem.Builder()
            .setMediaId(id)
            .setMediaMetadata(
                MediaMetadata.Builder().setTitle(title).setIsBrowsable(true).setIsPlayable(false)
                    .setMediaType(MediaMetadata.MEDIA_TYPE_FOLDER_MIXED).build(),
            ).build()

        companion object {
            const val ROOT = "root"
            const val RECENTS = "recents"
            const val LIKED = "liked"
            const val PLAYLISTS = "playlists"
            const val PLAYLIST_PREFIX = "pl:"
        }
    }
}

/** What the window tells the native side: where the audio server is, and the library for Android Auto. */
object Bridge {
    private const val PREFS = "astrotune_native"

    fun prefs(c: Context) = c.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    fun setBase(c: Context, base: String) = prefs(c).edit().putString("base", base).apply()

    fun setLibrary(c: Context, json: String) = prefs(c).edit().putString("library", json).apply()

    fun setSpanish(c: Context, es: Boolean) = prefs(c).edit().putBoolean("es", es).apply()

    fun spanish(c: Context) = prefs(c).getBoolean("es", true)

    fun library(c: Context): JSONObject = runCatching { JSONObject(prefs(c).getString("library", "{}")!!) }.getOrDefault(JSONObject())

    fun uriFor(c: Context, id: String): Uri = Uri.parse((prefs(c).getString("base", "") ?: "") + id)

    fun item(c: Context, t: JSONObject): MediaItem {
        val id = t.optString("id")
        val cover = t.optString("cover").takeIf { it.isNotBlank() && it != "null" }
        val meta = MediaMetadata.Builder()
            .setTitle(t.optString("title"))
            .setArtist(t.optString("artist"))
            .setAlbumTitle(t.optString("album").takeIf { it.isNotBlank() && it != "null" })
            .setArtworkUri(cover?.let(Uri::parse))
            .setIsBrowsable(false)
            .setIsPlayable(true)
            .setMediaType(MediaMetadata.MEDIA_TYPE_MUSIC)
            .setExtras(Bundle().apply { putLong("duration", t.optLong("duration")) })
            .build()
        return MediaItem.Builder().setMediaId(id).setUri(uriFor(c, id)).setMediaMetadata(meta).build()
    }
}
