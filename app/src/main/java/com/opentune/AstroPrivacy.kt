package com.opentune

import android.content.Context
import android.content.SharedPreferences
import com.opentune.data.Privacy
import com.opentune.data.history.History
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow

/** AstroTune's own privacy switches. Kept in one small file on the phone, never sent anywhere. */
object AstroPrivacy {
    private lateinit var prefs: SharedPreferences

    private val _offline = MutableStateFlow(false)
    val offline: StateFlow<Boolean> = _offline
    private val _guest = MutableStateFlow(false)
    val guest: StateFlow<Boolean> = _guest
    private val _lock = MutableStateFlow(false)
    val lock: StateFlow<Boolean> = _lock
    private val _secure = MutableStateFlow(false)
    val secure: StateFlow<Boolean> = _secure
    private val _historyDays = MutableStateFlow(0)
    /** Days of listening history kept; 0 keeps it all. */
    val historyDays: StateFlow<Int> = _historyDays

    fun init(context: Context) {
        prefs = context.getSharedPreferences("astro_privacy", Context.MODE_PRIVATE)
        _offline.value = prefs.getBoolean("offline", false)
        _guest.value = prefs.getBoolean("guest", false)
        _lock.value = prefs.getBoolean("lock", false)
        _secure.value = prefs.getBoolean("secure", false)
        _historyDays.value = prefs.getInt("history_days", 0)
        Privacy.offline = _offline.value
        Privacy.guest = _guest.value
        pruneHistory()
    }

    fun setOffline(v: Boolean) { _offline.value = v; Privacy.offline = v; prefs.edit().putBoolean("offline", v).apply() }
    fun setGuest(v: Boolean) { _guest.value = v; Privacy.guest = v; prefs.edit().putBoolean("guest", v).apply() }
    fun setLock(v: Boolean) { _lock.value = v; prefs.edit().putBoolean("lock", v).apply() }
    fun setSecure(v: Boolean) { _secure.value = v; prefs.edit().putBoolean("secure", v).apply() }
    fun setHistoryDays(d: Int) { _historyDays.value = d; prefs.edit().putInt("history_days", d).apply(); pruneHistory() }

    private fun pruneHistory() {
        val d = _historyDays.value
        if (d > 0) History.pruneOlderThan(d)
    }
}
