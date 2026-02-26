package ru.snt.portal.ui

import android.os.Build
import com.google.firebase.messaging.FirebaseMessaging
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.stateIn
import ru.snt.portal.core.model.SessionState
import ru.snt.portal.core.repository.AuthRepository
import ru.snt.portal.core.repository.NotificationsRepository
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class MainViewModel @Inject constructor(
    private val authRepository: AuthRepository,
    private val notificationsRepository: NotificationsRepository,
) : ViewModel() {

    val session: StateFlow<SessionState?> = authRepository.observeSession()
        .stateIn(
            scope = viewModelScope,
            started = SharingStarted.WhileSubscribed(5_000),
            initialValue = authRepository.currentSession(),
        )

    private var pushSyncedForUserId: Int? = null

    fun logout() {
        authRepository.logout()
        pushSyncedForUserId = null
    }

    fun syncPushToken(session: SessionState?) {
        val currentSession = session ?: return
        if (pushSyncedForUserId == currentSession.user.id) return

        val messaging = runCatching { FirebaseMessaging.getInstance() }.getOrNull() ?: return
        messaging.token.addOnCompleteListener { task ->
            if (!task.isSuccessful) return@addOnCompleteListener
            val token = task.result ?: return@addOnCompleteListener
            viewModelScope.launch {
                notificationsRepository.registerPushToken(
                    token = token,
                    deviceName = "${Build.MANUFACTURER} ${Build.MODEL}",
                )
                pushSyncedForUserId = currentSession.user.id
            }
        }
    }
}
