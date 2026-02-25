package ru.snt.portal.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable

private val PortalDarkScheme = darkColorScheme(
    primary = NeoPrimary,
    onPrimary = NeoText,
    secondary = NeoSecondary,
    onSecondary = NeoText,
    tertiary = NeoAccent,
    background = NeoBg,
    onBackground = NeoText,
    surface = NeoSurface,
    onSurface = NeoText,
    surfaceVariant = NeoSurface2,
    error = NeoError,
)

@Composable
fun SntPortalTheme(
    content: @Composable () -> Unit,
) {
    MaterialTheme(
        colorScheme = PortalDarkScheme,
        typography = Typography,
        content = content,
    )
}
