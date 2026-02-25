package ru.snt.portal.core.session

import android.content.Context
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import com.google.gson.Gson
import com.google.gson.JsonSyntaxException
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import ru.snt.portal.core.model.AuthUser
import ru.snt.portal.core.model.SessionState
import javax.inject.Inject
import javax.inject.Singleton

interface SessionStore {
    val session: StateFlow<SessionState?>
    fun current(): SessionState?
    fun save(value: SessionState)
    fun clear()
    fun updateTokens(accessToken: String, refreshToken: String)
}

@Singleton
class EncryptedSessionStore @Inject constructor(
    @ApplicationContext context: Context,
    private val gson: Gson,
) : SessionStore {
    private val preferences = EncryptedSharedPreferences.create(
        context,
        PREFS_FILE,
        MasterKey.Builder(context).setKeyScheme(MasterKey.KeyScheme.AES256_GCM).build(),
        EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
        EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
    )

    private val _session = MutableStateFlow(readSession())
    override val session: StateFlow<SessionState?> = _session.asStateFlow()

    override fun current(): SessionState? = _session.value

    override fun save(value: SessionState) {
        preferences.edit().putString(KEY_SESSION_JSON, gson.toJson(value)).apply()
        _session.value = value
    }

    override fun clear() {
        preferences.edit().remove(KEY_SESSION_JSON).apply()
        _session.value = null
    }

    override fun updateTokens(accessToken: String, refreshToken: String) {
        val existing = _session.value ?: return
        val updated = existing.copy(accessToken = accessToken, refreshToken = refreshToken)
        save(updated)
    }

    private fun readSession(): SessionState? {
        val raw = preferences.getString(KEY_SESSION_JSON, null) ?: return null
        return try {
            gson.fromJson(raw, SessionState::class.java)
        } catch (_error: JsonSyntaxException) {
            null
        }
    }

    companion object {
        private const val PREFS_FILE = "snt_portal_secure"
        private const val KEY_SESSION_JSON = "session_json"
    }
}

fun SessionState.displayRole(): String = when (user.role.uppercase()) {
    "CHAIRMAN" -> "Председатель"
    "ADMIN" -> "Админ"
    else -> "Житель"
}

fun SessionState.displayName(): String = user.name.ifBlank { "Пользователь" }

fun SessionState.withMustChangePasswordFlag(flag: Boolean?): SessionState {
    if (flag == null) return this
    val updatedUser = AuthUser(
        id = user.id,
        tenantId = user.tenantId,
        name = user.name,
        phone = user.phone,
        role = user.role,
        mustChangePassword = flag,
    )
    return copy(user = updatedUser)
}
