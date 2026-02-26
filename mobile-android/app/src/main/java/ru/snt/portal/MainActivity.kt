package ru.snt.portal

import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
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

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        configureSystemBars()

        setContent {
            SntPortalTheme {
                NativePortalApp(
                    nativeEnabled = BuildConfig.NATIVE_APP_ENABLED,
                    portalBaseUrl = portalBaseUrl,
                    apiBaseUrl = apiBaseUrl,
                )
            }
        }
    }

    override fun onResume() {
        super.onResume()
        configureSystemBars()
    }

    private fun configureSystemBars() {
        WindowCompat.setDecorFitsSystemWindows(window, true)

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            window.isStatusBarContrastEnforced = false
            window.isNavigationBarContrastEnforced = false
        }
    }
}
