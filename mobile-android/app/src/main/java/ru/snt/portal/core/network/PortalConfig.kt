package ru.snt.portal.core.network

import android.net.Uri
import ru.snt.portal.BuildConfig
import java.util.Locale

data class PortalConfig(
    val portalBaseUrl: String,
    val apiBaseUrl: String,
    val portalHost: String,
)

fun resolvePortalConfig(): PortalConfig {
    val raw = BuildConfig.PORTAL_BASE_URL.trim().removeSuffix("/")
    val uri = Uri.parse(raw)
    val host = uri.host?.lowercase(Locale.US).orEmpty()
    val scheme = uri.scheme?.lowercase(Locale.US).orEmpty()

    require(scheme == "https" && host.isNotBlank()) {
        "Invalid PORTAL_BASE_URL: ${BuildConfig.PORTAL_BASE_URL}"
    }

    val apiHost = if (host.startsWith("app.")) "api.${host.removePrefix("app.")}" else host
    val apiBaseUrl = "$scheme://$apiHost/api/v1/"

    return PortalConfig(
        portalBaseUrl = "$scheme://$host",
        apiBaseUrl = apiBaseUrl,
        portalHost = host,
    )
}

fun buildPortalUrl(path: String): String {
    val config = resolvePortalConfig()
    val normalizedPath = if (path.startsWith("/")) path else "/$path"
    return "${config.portalBaseUrl}$normalizedPath"
}
