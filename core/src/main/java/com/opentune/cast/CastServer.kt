package com.opentune.cast

import android.content.Context
import android.net.Uri
import com.opentune.data.DebugLog as Log
import com.opentune.data.Http
import java.io.BufferedInputStream
import java.io.File
import java.io.InputStream
import java.io.OutputStream
import java.net.InetAddress
import java.net.ServerSocket
import java.net.Socket
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.Executors
import kotlinx.coroutines.runBlocking
import okhttp3.Request

/**
 * A small web server on the phone that a cast device fetches songs from.
 * Each song gets an unguessable path for as long as it's cast; behind it is
 * a file on the phone (a download or a song from the phone's library) or a
 * stream the phone fetches and passes through, with the headers the stream
 * needs, which a TV couldn't send itself. Ranges are honoured so the
 * device can seek.
 */
object CastServer {
    private const val TAG = "CastServer"

    /** Where a cast song's bytes come from. */
    sealed interface Source {
        val contentType: String

        class OnPhone(val file: File, override val contentType: String) : Source
        class Content(val uri: Uri, override val contentType: String) : Source

        /**
         * A stream on the web. [open] gives its address and headers; it's
         * asked again with `fresh = true` if the address stops working.
         */
        class Web(override val contentType: String, val open: suspend (fresh: Boolean) -> Pair<String, Map<String, String>>) : Source {
            /** The stream's size once known, so each of the device's requests doesn't ask again. */
            @Volatile var length: Long = -1L
        }
    }

    private var server: ServerSocket? = null
    private val pool = Executors.newCachedThreadPool()
    private val sources = ConcurrentHashMap<String, Source>()
    private lateinit var app: Context

    /** Starts listening if it isn't; returns the port. */
    @Synchronized
    fun start(context: Context): Int {
        app = context.applicationContext
        server?.takeIf { !it.isClosed }?.let { return it.localPort }
        val s = ServerSocket(0)
        server = s
        pool.execute {
            while (!s.isClosed) {
                val client = runCatching { s.accept() }.getOrNull() ?: break
                pool.execute { runCatching { serve(client) }.onFailure { Log.d(TAG, "request ended: ${it.message}") } }
            }
        }
        return s.localPort
    }

    @Synchronized
    fun stop() {
        runCatching { server?.close() }
        server = null
        sources.clear()
    }

    /** Puts [source] up and returns its address as seen from [host] (the phone's address on the device's network). */
    fun publish(source: Source, host: InetAddress): String {
        val port = server?.localPort ?: error("not started")
        // Only a few songs need to be reachable at once: the one playing and the one before.
        if (sources.size > 8) sources.keys.take(sources.size - 8).forEach(sources::remove)
        val token = UUID.randomUUID().toString().replace("-", "")
        sources[token] = source
        val ext = when (source.contentType) {
            "audio/mp4" -> "m4a"
            "audio/webm" -> "webm"
            "audio/mpeg" -> "mp3"
            "audio/flac" -> "flac"
            "audio/ogg" -> "ogg"
            else -> "audio"
        }
        return "http://${host.hostAddress}:$port/s/$token.$ext"
    }

    private fun serve(socket: Socket) = socket.use { s ->
        s.soTimeout = 30_000
        val input = BufferedInputStream(s.getInputStream())
        val requestLine = readLine(input) ?: return
        val headers = HashMap<String, String>()
        while (true) {
            val line = readLine(input) ?: break
            if (line.isEmpty()) break
            val colon = line.indexOf(':')
            if (colon > 0) headers[line.substring(0, colon).trim().lowercase()] = line.substring(colon + 1).trim()
        }
        val (method, path) = requestLine.split(' ').let { (it.getOrNull(0) ?: "") to (it.getOrNull(1) ?: "") }
        val out = s.getOutputStream()
        val token = path.removePrefix("/s/").substringBefore('.').substringBefore('?')
        val source = sources[token]
        if (source == null || (method != "GET" && method != "HEAD")) {
            respond(out, "404 Not Found", mapOf("Content-Length" to "0"))
            return
        }
        val range = headers["range"]
        val head = method == "HEAD"
        when (source) {
            is Source.OnPhone -> sendLocal(out, source.contentType, source.file.length(), range, head) { source.file.inputStream() }
            is Source.Content -> {
                val length = runCatching { app.contentResolver.openFileDescriptor(source.uri, "r")?.use { it.statSize } }.getOrNull() ?: -1L
                sendLocal(out, source.contentType, length, range, head) { app.contentResolver.openInputStream(source.uri) ?: error("can't open ${source.uri}") }
            }
            is Source.Web -> sendWeb(out, source, range, head)
        }
    }

    private fun sendLocal(out: OutputStream, type: String, length: Long, range: String?, head: Boolean, open: () -> InputStream) {
        val span = Ranges.parse(range, length)
        val headers = linkedMapOf("Content-Type" to type, "Accept-Ranges" to "bytes") + DLNA_HEADERS
        if (span == null || length < 0) {
            respond(out, "200 OK", headers + (if (length >= 0) mapOf("Content-Length" to "$length") else emptyMap()))
            if (!head) open().use { it.copyTo(out) }
        } else {
            val (start, end) = span
            respond(out, "206 Partial Content", headers + mapOf("Content-Length" to "${end - start + 1}", "Content-Range" to "bytes $start-$end/$length"))
            if (!head) open().use { input ->
                var skip = start
                while (skip > 0) {
                    val n = input.skip(skip)
                    if (n <= 0) break
                    skip -= n
                }
                copy(input, out, end - start + 1)
            }
        }
    }

    /**
     * A web stream, passed through in pieces. The device asks for the whole song (or the rest of
     * it) at once; googlevideo serves a doubted session small ranges and cuts big ones off part way,
     * which left the device stalled mid-song until it gave up and the song was skipped. So the
     * phone answers the device's range itself and fetches it 1 MB at a time, and a piece that fails
     * is fetched again, from a fresh address after a refusal, carrying on from the same byte.
     */
    private fun sendWeb(out: OutputStream, source: Source.Web, range: String?, head: Boolean) {
        var fresh = false
        var address = runCatching { runBlocking { source.open(false) } }.getOrNull()
        val length = source.length.takeIf { it > 0 } ?: run {
            var found = -1L
            for (attempt in 0 until 3) {
                val (url, extra) = address ?: break
                found = runCatching { lengthOf(url, extra) }.getOrDefault(-1L)
                if (found > 0) break
                address = runCatching { runBlocking { source.open(true) } }.getOrNull()
            }
            found.also { if (it > 0) source.length = it }
        }
        if (address == null || length <= 0) {
            respond(out, "502 Bad Gateway", mapOf("Content-Length" to "0"))
            return
        }
        val span = Ranges.parse(range, length)
        val (start, end) = span ?: (0L to length - 1)
        val headers = linkedMapOf("Content-Type" to source.contentType, "Accept-Ranges" to "bytes") + DLNA_HEADERS
        if (span == null) respond(out, "200 OK", headers + mapOf("Content-Length" to "$length"))
        else respond(out, "206 Partial Content", headers + mapOf("Content-Length" to "${end - start + 1}", "Content-Range" to "bytes $start-$end/$length"))
        if (head) return
        var at = start
        var failures = 0
        val buffer = ByteArray(64 * 1024)
        while (at <= end) {
            val (url, extra) = address ?: return
            val to = minOf(end, at + PIECE - 1)
            val before = at
            val ok = runCatching {
                val request = Request.Builder().url(url).apply {
                    extra.forEach { (k, v) -> header(k, v) }
                    header("Range", "bytes=$at-$to")
                }.build()
                Http.client.newCall(request).execute().use { response ->
                    if (response.code == 403 || response.code == 410) fresh = true
                    if (!response.isSuccessful) return@use false
                    val input = response.body?.byteStream() ?: return@use false
                    while (at <= to) {
                        val n = input.read(buffer, 0, minOf(buffer.size.toLong(), to - at + 1).toInt())
                        if (n < 0) break
                        // The device closing its connection (a seek, the next song) ends this, which is fine.
                        try { out.write(buffer, 0, n) } catch (_: java.io.IOException) { return }
                        at += n
                    }
                    true
                }
            }.getOrDefault(false) && at > before
            if (ok) { failures = 0; continue }
            if (++failures > 5) return
            Thread.sleep(300L * failures)
            if (fresh || failures >= 2) {
                address = runCatching { runBlocking { source.open(true) } }.getOrNull() ?: address
                fresh = false
            }
        }
        runCatching { out.flush() }
    }

    /** The full size of the stream at [url], from a one-byte range's Content-Range. */
    private fun lengthOf(url: String, extra: Map<String, String>): Long {
        val request = Request.Builder().url(url).apply {
            extra.forEach { (k, v) -> header(k, v) }
            header("Range", "bytes=0-0")
        }.build()
        Http.client.newCall(request).execute().use { r ->
            if (!r.isSuccessful) return -1L
            r.header("Content-Range")?.substringAfterLast('/')?.toLongOrNull()?.let { return it }
            return if (r.code == 200) r.header("Content-Length")?.toLongOrNull() ?: -1L else -1L
        }
    }

    private const val PIECE = 1024L * 1024L

    private fun respond(out: OutputStream, status: String, headers: Map<String, String>) {
        val text = buildString {
            append("HTTP/1.1 ").append(status).append("\r\n")
            headers.forEach { (k, v) -> append(k).append(": ").append(v).append("\r\n") }
            append("Connection: close\r\n\r\n")
        }
        out.write(text.toByteArray(Charsets.ISO_8859_1))
        out.flush()
    }

    private fun copy(input: InputStream, out: OutputStream, count: Long) {
        val buffer = ByteArray(64 * 1024)
        var left = count
        while (left > 0) {
            val n = input.read(buffer, 0, minOf(buffer.size.toLong(), left).toInt())
            if (n < 0) break
            out.write(buffer, 0, n)
            left -= n
        }
    }

    private fun readLine(input: InputStream): String? {
        val sb = StringBuilder()
        while (true) {
            val c = input.read()
            if (c < 0) return if (sb.isEmpty()) null else sb.toString()
            if (c == '\n'.code) return sb.toString().trimEnd('\r')
            sb.append(c.toChar())
            if (sb.length > 8192) return null
        }
    }

    /** What DLNA renderers look for before they'll stream and seek. */
    private val DLNA_HEADERS = mapOf(
        "transferMode.dlna.org" to "Streaming",
        "contentFeatures.dlna.org" to "DLNA.ORG_OP=01;DLNA.ORG_CI=0;DLNA.ORG_FLAGS=01700000000000000000000000000000",
    )
}

internal object Ranges {
    /** The first byte range in a Range header, as inclusive (start, end) within [length]; null for the whole thing. */
    fun parse(header: String?, length: Long): Pair<Long, Long>? {
        if (header == null || length <= 0) return null
        val spec = header.substringAfter("bytes=", "").substringBefore(',').trim()
        if (spec.isEmpty()) return null
        val from = spec.substringBefore('-').trim()
        val to = spec.substringAfter('-', "").trim()
        return if (from.isEmpty()) {
            val suffix = to.toLongOrNull() ?: return null
            (length - suffix).coerceAtLeast(0) to length - 1
        } else {
            val start = from.toLongOrNull() ?: return null
            if (start >= length) return null
            val end = to.toLongOrNull()?.coerceAtMost(length - 1) ?: (length - 1)
            start to end
        }
    }
}
