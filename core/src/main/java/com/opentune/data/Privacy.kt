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
        chain.proceed(chain.request())
    }
}
