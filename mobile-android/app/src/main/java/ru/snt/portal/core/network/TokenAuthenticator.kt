package ru.snt.portal.core.network

import com.google.gson.Gson
import okhttp3.Authenticator
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.Response
import okhttp3.Route
import ru.snt.portal.core.model.LoginResponse
import ru.snt.portal.core.model.RefreshRequest
import ru.snt.portal.core.session.SessionStore
import ru.snt.portal.core.session.withMustChangePasswordFlag
import java.io.IOException
import javax.inject.Inject
import javax.inject.Named
import javax.inject.Singleton

@Singleton
class TokenAuthenticator @Inject constructor(
    @Named("apiBaseUrl") private val apiBaseUrl: String,
    private val sessionStore: SessionStore,
    private val gson: Gson,
) : Authenticator {

    private val refreshClient: OkHttpClient by lazy {
        OkHttpClient.Builder().build()
    }

    override fun authenticate(route: Route?, response: Response): Request? {
        if (responseCount(response) >= 2) return null

        val existing = sessionStore.current() ?: return null
        val path = response.request.url.encodedPath
        if (path.contains("/auth/refresh") || path.contains("/auth/login")) {
            return null
        }

        val refreshPayload = RefreshRequest(refreshToken = existing.refreshToken)
        val refreshRequestBody = gson.toJson(refreshPayload)
            .toRequestBody("application/json".toMediaType())

        val refreshRequest = Request.Builder()
            .url("${apiBaseUrl.removeSuffix("/")}/auth/refresh")
            .post(refreshRequestBody)
            .header("x-tenant-slug", existing.tenantSlug)
            .build()

        return try {
            refreshClient.newCall(refreshRequest).execute().use { refreshResponse ->
                if (!refreshResponse.isSuccessful) {
                    sessionStore.clear()
                    return null
                }

                val body = refreshResponse.body?.string().orEmpty()
                if (body.isBlank()) {
                    sessionStore.clear()
                    return null
                }

                val parsed = gson.fromJson(body, LoginResponse::class.java)
                val updatedSession = existing.copy(
                    accessToken = parsed.accessToken,
                    refreshToken = parsed.refreshToken,
                    user = parsed.user,
                ).withMustChangePasswordFlag(parsed.mustChangePassword)

                sessionStore.save(updatedSession)

                response.request.newBuilder()
                    .header("Authorization", "Bearer ${updatedSession.accessToken}")
                    .header("x-tenant-slug", updatedSession.tenantSlug)
                    .build()
            }
        } catch (_error: IOException) {
            null
        } catch (_error: Throwable) {
            null
        }
    }

    private fun responseCount(response: Response): Int {
        var count = 1
        var current = response.priorResponse
        while (current != null) {
            count++
            current = current.priorResponse
        }
        return count
    }
}
