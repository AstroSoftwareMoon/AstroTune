package com.opentune.data

import java.io.IOException
import okhttp3.Interceptor
import okhttp3.Response

/**
 * AstroTune privacy mode. The app never talks to servers run by the original
 * OpenTune author or to project telemetry/update endpoints: no usage statistics,
 * no remote configuration, no remote update lock, no community add-on catalog.
 * Music, lyrics and metadata providers that the user's own playback needs are
 * still reachable.
 */
object Privacy {
    const val OFFLINE_SERVICES = true

    /** Offline mode: every request to a host outside the user's own network is refused. */
    @Volatile var offline = false

    /** Guest mode: nothing is added to the listening history. */
    @Volatile var guest = false

    private val seen = java.util.concurrent.ConcurrentHashMap<String, LongArray>()

    /** Hosts the app reached since it started: host, requests, last time (ms). Never leaves the phone. */
    fun recent(): List<Triple<String, Long, Long>> =
        seen.entries.map { Triple(it.key, it.value[0], it.value[1]) }.sortedByDescending { it.third }

    private fun isLocal(host: String): Boolean =
        host == "localhost" || host.endsWith(".local") || host.startsWith("127.") || host.startsWith("10.") ||
            host.startsWith("192.168.") || Regex("""172\.(1[6-9]|2\d|3[01])\..*""").matches(host)

    private val BLOCKED_SUFFIXES = listOf(
        "rethinknow.in",
        "justshivv.github.io",
        "astrosoftwaremoon.github.io",
        "api.github.com",
        "workers.dev",
        "deplexo.com",
    )

    fun blocked(host: String): Boolean =
        BLOCKED_SUFFIXES.any { host == it || host.endsWith(".$it") }

    val interceptor = Interceptor { chain ->
        val host = chain.request().url.host
        if (blocked(host)) throw IOException("Blocked by AstroTune privacy mode: $host")
        if (offline && !isLocal(host)) throw IOException("AstroTune offline mode: $host")
        seen.compute(host) { _, v -> (v ?: LongArray(2)).also { it[0]++; it[1] = System.currentTimeMillis() } }
        chain.proceed(chain.request())
    }
}
