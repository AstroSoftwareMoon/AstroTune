// The phone's translation table (core's com.opentune.i18n.Tr), read on the desktop
// from the same files (core/src/main/assets/i18n, packed as resources). The language
// is the one chosen in Settings, or the computer's own; Spanish when the computer
// speaks a language there's no file for. See Downloads.kt for why this file sits here.
package com.opentune.i18n

import androidx.compose.runtime.getValue
import androidx.compose.runtime.setValue
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonPrimitive
import java.util.Locale

object Tr {
    /** The languages there are translations for, by the tag their file is named after. */
    val TAGS = listOf(
        "ar", "bn", "cs", "de", "el", "es", "fa", "fr", "gu", "hi", "hu", "id", "it", "ja", "kn", "ko", "ml", "mr", "ms",
        "nl", "pa", "pl", "pt", "ro", "ru", "sv", "ta", "te", "th", "tr", "uk", "ur", "vi", "zh-CN", "zh-TW",
    )

    @Volatile private var table: Map<String, String> = emptyMap()

    /** The language in use, as its file's tag ("en" for English). */
    var language by androidx.compose.runtime.mutableStateOf("en")
        private set

    private val prefs = java.util.prefs.Preferences.userRoot().node("astrotune/language")

    /** The tag chosen in Settings, or "" to follow the computer. */
    val chosen: String get() = prefs.get("tag", "")

    /** Uses [tag] from now on ("" for the computer's own language) and remembers it. */
    fun choose(tag: String) {
        prefs.put("tag", tag)
        runCatching { prefs.flush() }
        apply(tag)
    }

    /** Reads the remembered choice; called once when the app starts. */
    fun start() = apply(chosen)

    private fun apply(tag: String) {
        val resolved = resolve(tag.ifBlank { Locale.getDefault().toLanguageTag() })
        table = if (resolved == "en") emptyMap() else load(resolved)
        language = resolved
    }

    /** [english] in the current language. */
    fun t(english: String): String {
        language // read, so a text drawn with it redraws when the language changes
        return if (table.isEmpty()) english else table[english] ?: english
    }

    /** [template] in the current language, with `{0}`, `{1}`… replaced by [args] in order. */
    fun f(template: String, vararg args: Any?): String = fill(t(template), args)

    internal fun fill(text: String, args: Array<out Any?>): String {
        if (args.isEmpty() || '{' !in text) return text
        val out = StringBuilder(text.length + 16)
        var i = 0
        while (i < text.length) {
            val c = text[i]
            if (c == '{') {
                val close = text.indexOf('}', i + 1)
                val index = if (close > i + 1) text.substring(i + 1, close).toIntOrNull() else null
                if (index != null && index in args.indices) {
                    out.append(args[index]); i = close + 1; continue
                }
            }
            out.append(c); i++
        }
        return out.toString()
    }

    /** The file [tag] would be read from; English only when asked for, Spanish for a language without a file. */
    internal fun resolve(tag: String): String {
        val locale = Locale.forLanguageTag(tag.replace('_', '-'))
        val lang = when (locale.language) { "in" -> "id"; "iw" -> "he"; else -> locale.language }
        if (lang == "en") return "en"
        if (lang == "zh") {
            val traditional = locale.script == "Hant" || locale.country in setOf("TW", "HK", "MO") || tag.equals("zh-TW", true)
            return if (traditional) "zh-TW" else "zh-CN"
        }
        return if (lang in TAGS) lang else "es"
    }

    private fun load(tag: String): Map<String, String> = runCatching {
        val text = Tr::class.java.classLoader.getResourceAsStream("i18n/$tag.json")!!.bufferedReader().use { it.readText() }
        (Json.parseToJsonElement(text) as JsonObject).mapValues { it.value.jsonPrimitive.content }
    }.getOrDefault(emptyMap())
}
