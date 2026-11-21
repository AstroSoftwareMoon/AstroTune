package com.opentune.desktop

import com.opentune.data.Http
import com.opentune.data.innertube.Innertube
import com.opentune.data.innertube.PlayerClient
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.longOrNull
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.TimeUnit
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import okhttp3.RequestBody.Companion.toRequestBody
import org.schabi.newpipe.extractor.NewPipe
import org.schabi.newpipe.extractor.ServiceList
import org.schabi.newpipe.extractor.downloader.Downloader
import org.schabi.newpipe.extractor.downloader.Request
import org.schabi.newpipe.extractor.downloader.Response
import org.schabi.newpipe.extractor.exceptions.ReCaptchaException
import org.schabi.newpipe.extractor.stream.AudioStream
import org.schabi.newpipe.extractor.stream.DeliveryMethod

/**
 * Where a song's audio is, found the way the phone app finds it
 * (core/.../StreamResolver.kt): its player identities walked in its order,
 * each URL tried with a real 2 MB range before it counts, and NewPipe as the
 * last resort. AAC in MP4 for JavaFX on every system, and Opus, YouTube's
 * best, for FFmpeg. Every stream carries the headers its URL has to be
 * fetched with, or googlevideo throttles or refuses it.
 */
object Streams {
    data class Stream(
        val url: String,
        val kbps: Int,
        val mimeType: String,
        val headers: Map<String, String> = PlayerClient.forStreamUrl(url).mediaHeaders(),
        val size: Long? = null,
    )

    /** The phone's walk (StreamResolver.CLIENTS), minus ANDROID, whose formats are all ciphered. */
    private val order = java.util.concurrent.CopyOnWriteArrayList(
        listOf(
            PlayerClient.ANDROID_MUSIC,
            PlayerClient.TVHTML5,
            PlayerClient.ANDROID_VR,
            PlayerClient.ANDROID_VR_LEGACY,
            PlayerClient.IOS,
            PlayerClient.IOS_RECENT,
        ),
    )

    /** A URL from [client] was refused part way: it goes to the back of the walk. */
    fun demote(url: String) {
        val client = PlayerClient.forStreamUrl(url)
        val c = order.firstOrNull { it.clientName == client.clientName && it.clientVersion == client.clientVersion }
            ?: order.firstOrNull { it.clientName == client.clientName } ?: return
        if (order.remove(c)) order.add(c)
    }

    /** Which of a song's streams: AAC for JavaFX, or Opus (YouTube's best) for FFmpeg. */
    enum class Kind(val extension: String) { AAC("m4a"), OPUS("webm") }

    /** YouTube's addresses last about six hours; reused for well under that. */
    private const val KEEP_MS = 60 * 60 * 1000L
    private val found = ConcurrentHashMap<String, Pair<Long, Stream>>()
    private fun key(videoId: String, kind: Kind) = "$videoId/$kind"

    /** One extraction at a time: they share NewPipe's state and slow each other right down. */
    private val gate = Mutex()

    private val init by lazy { NewPipe.init(OkHttpDownloader) }

    suspend fun resolve(videoId: String, fresh: Boolean = false, kind: Kind = Kind.AAC): Stream {
        if (!fresh) found[key(videoId, kind)]?.let { (at, s) -> if (System.currentTimeMillis() - at < KEEP_MS) return s }
        return gate.withLock {
            withContext(Dispatchers.IO) {
                val errors = mutableListOf<String>()
                fromClients(videoId, kind, errors)?.let { return@withContext it }
                runCatching { fromNewPipe(videoId, kind) }.getOrElse { errors += "NewPipe: ${it.message}"; null }
                    ?.let { return@withContext it }
                error(errors.joinToString(" · ").ifBlank { "No ${kind.name} audio for $videoId" })
            }
        }
    }

    private suspend fun fromClients(videoId: String, kind: Kind, errors: MutableList<String>): Stream? {
        var refreshed = false
        runCatching { Innertube.ensureVisitorData() }
        for (client in order.toList()) {
            val response = try {
                Innertube.player(videoId, client)
            } catch (e: Innertube.UnplayableException) {
                errors += "${client.clientName}: ${e.message}"
                if (e.looksLikeBotCheck && !refreshed) {
                    refreshed = true
                    runCatching { Innertube.ensureVisitorData(refresh = true) }
                }
                if (e.isPermanent) break
                continue
            } catch (e: Exception) {
                errors += "${client.clientName}: ${e.message}"
                continue
            }
            val now = System.currentTimeMillis()
            val streams = Kind.entries.associateWith { k -> pickFormat(response, k)?.let { f -> toStream(f, client) } }
            val wanted = streams[kind] ?: run { errors += "${client.clientName}: no ${kind.name} url"; null } ?: continue
            if (!probe(wanted)) {
                errors += "${client.clientName}: googlevideo refused the link"
                continue
            }
            // Promote the identity that served, like the phone's clientOrder.
            if (order.remove(client)) order.add(0, client)
            streams.forEach { (k, s) -> if (s != null) found[key(videoId, k)] = now to s }
            return wanted
        }
        return null
    }

    private fun pickFormat(response: JsonObject, kind: Kind): JsonObject? {
        val formats = response["streamingData"]?.jsonObject?.get("adaptiveFormats")?.jsonArray ?: return null
        val prefs = if (kind == Kind.AAC) listOf(140L, 139L) else listOf(251L, 250L, 249L)
        val usable = formats.map { it.jsonObject }.filter { it["url"]?.jsonPrimitive?.contentOrNull != null }
        return prefs.firstNotNullOfOrNull { itag -> usable.firstOrNull { it["itag"]?.jsonPrimitive?.longOrNull == itag } }
    }

    private fun toStream(f: JsonObject, client: PlayerClient): Stream {
        val url = f["url"]!!.jsonPrimitive.content
        val mime = f["mimeType"]?.jsonPrimitive?.contentOrNull?.substringBefore(';') ?: "audio/mp4"
        val kbps = ((f["averageBitrate"] ?: f["bitrate"])?.jsonPrimitive?.longOrNull ?: 0L).toInt() / 1000
        val size = f["contentLength"]?.jsonPrimitive?.contentOrNull?.toLongOrNull()
        return Stream(url, kbps, mime, client.mediaHeaders(), size)
    }

    /**
     * Whether googlevideo really serves [s]: a 2 MB range (a doubted session passes small probes
     * and refuses the big ranges listening is made of), audio back, and 16 KB of it arriving.
     */
    private fun probe(s: Stream): Boolean = runCatching {
        val b = okhttp3.Request.Builder().url(s.url).header("Range", "bytes=0-${2 * 1024 * 1024 - 1}")
        s.headers.forEach { (k, v) -> b.header(k, v) }
        client.newCall(b.build()).execute().use { r ->
            r.isSuccessful && r.header("Content-Type")?.startsWith("audio/") == true && r.body?.source()?.request(16 * 1024) == true
        }
    }.getOrDefault(false)

    private fun fromNewPipe(videoId: String, kind: Kind): Stream? {
        init
        val extractor = ServiceList.YouTube.getStreamExtractor("https://www.youtube.com/watch?v=$videoId")
        extractor.fetchPage()
        val now = System.currentTimeMillis()
        // Both kinds are kept from the one extraction, so switching engine costs nothing.
        Kind.entries.forEach { k ->
            pick(extractor.audioStreams, k)?.let { s ->
                val st = Stream(s.content, s.averageBitrate, s.format?.mimeType ?: "audio/mp4")
                if (k != kind || probe(st)) found[key(videoId, k)] = now to st
            }
        }
        return found[key(videoId, kind)]?.second
    }

    /** The best stream of [kind] with a plain address; manifests and other codecs left out. */
    internal fun pick(streams: List<AudioStream>, kind: Kind = Kind.AAC): AudioStream? = streams
        .filter { !it.content.isNullOrBlank() && it.deliveryMethod == DeliveryMethod.PROGRESSIVE_HTTP }
        .filter { if (kind == Kind.AAC) it.format?.mimeType == "audio/mp4" else it.format?.mimeType == "audio/webm" }
        .maxByOrNull { it.averageBitrate }

    /** The stream already found for [videoId], for saying what's playing. */
    fun known(videoId: String, kind: Kind = Kind.AAC): Stream? = found[key(videoId, kind)]?.second

    /** Forgets an address the server refused, so the next try finds a new one. */
    fun forget(videoId: String) {
        Kind.entries.forEach { found.remove(key(videoId, it)) }
    }

    private const val NEXT_ENDPOINT = "/youtubei/v1/next"

    /** Well-formed, empty, and over NewPipe's fifty-character floor. */
    private const val EMPTY_NEXT_RESPONSE =
        """{"responseContext":{},"contents":{},"currentVideoEndpoint":{},"trackingParams":""}"""

    private val client = Http.client.newBuilder()
        .connectionPool(okhttp3.ConnectionPool())
        .callTimeout(20, TimeUnit.SECONDS)
        .build()

    private object OkHttpDownloader : Downloader() {
        override fun execute(request: Request): Response {
            // "What plays next" is fetched by NewPipe and never read here, and
            // it's the one request that can hang the whole extraction.
            if (NEXT_ENDPOINT in request.url()) {
                return Response(200, "OK", emptyMap(), EMPTY_NEXT_RESPONSE, request.url())
            }
            val builder = okhttp3.Request.Builder()
                .method(request.httpMethod(), request.dataToSend()?.toRequestBody())
                .url(request.url())
            var hasUserAgent = false
            request.headers().forEach { (name, values) ->
                if (name.equals("User-Agent", ignoreCase = true) && values.isNotEmpty()) hasUserAgent = true
                when {
                    values.size > 1 -> {
                        builder.removeHeader(name)
                        values.forEach { builder.addHeader(name, it) }
                    }
                    values.size == 1 -> builder.header(name, values[0])
                }
            }
            if (!hasUserAgent) {
                builder.header(
                    "User-Agent",
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36",
                )
            }
            val response = client.newCall(builder.build()).execute()
            if (response.code == 429) {
                response.close()
                throw ReCaptchaException("reCaptcha Challenge requested", request.url())
            }
            return Response(response.code, response.message, response.headers.toMultimap(), response.body?.string(), response.request.url.toString())
        }
    }
}
