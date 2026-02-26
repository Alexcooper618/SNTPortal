package ru.snt.portal

import android.content.Intent
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.runtime.mutableStateOf
import androidx.core.view.WindowCompat
import dagger.hilt.android.AndroidEntryPoint
import ru.snt.portal.ui.NativePortalApp
import ru.snt.portal.ui.theme.SntPortalTheme
import javax.inject.Inject
import javax.inject.Named

@AndroidEntryPoint
class MainActivity : ComponentActivity() {

    @Inject
    @Named("portalBaseUrl")
    lateinit var portalBaseUrl: String

    @Inject
    @Named("apiBaseUrl")
    lateinit var apiBaseUrl: String

    private val launchChatRoomIdState = mutableStateOf<String?>(null)
    private val launchRequestIdState = mutableStateOf(0L)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        configureSystemBars()
        applyLaunchIntent(intent)

        setContent {
            SntPortalTheme {
                NativePortalApp(
                    nativeEnabled = BuildConfig.NATIVE_APP_ENABLED,
                    portalBaseUrl = portalBaseUrl,
                    apiBaseUrl = apiBaseUrl,
                    launchChatRoomId = launchChatRoomIdState.value,
                    launchRequestId = launchRequestIdState.value,
                )
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        applyLaunchIntent(intent)
    }

    override fun onResume() {
        super.onResume()
        configureSystemBars()
    }

    private fun applyLaunchIntent(intent: Intent?) {
        val roomId = intent?.getStringExtra(EXTRA_CHAT_ROOM_ID)?.trim().orEmpty()
        if (roomId.isBlank()) return
        launchChatRoomIdState.value = roomId
        launchRequestIdState.value = System.currentTimeMillis()
        intent?.removeExtra(EXTRA_CHAT_ROOM_ID)
    }

    private fun configureSystemBars() {
        WindowCompat.setDecorFitsSystemWindows(window, true)

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            window.isStatusBarContrastEnforced = false
            window.isNavigationBarContrastEnforced = false
        }
    }

    companion object {
        const val EXTRA_CHAT_ROOM_ID = "ru.snt.portal.extra.CHAT_ROOM_ID"
    }
}
