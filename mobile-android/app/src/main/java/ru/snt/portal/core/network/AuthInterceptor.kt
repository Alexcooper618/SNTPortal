package ru.snt.portal.core.network

import okhttp3.Interceptor
import okhttp3.Response
import ru.snt.portal.core.session.SessionStore
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class AuthInterceptor @Inject constructor(
    private val sessionStore: SessionStore,
) : Interceptor {
    override fun intercept(chain: Interceptor.Chain): Response {
        val currentSession = sessionStore.current()
        val requestBuilder = chain.request().newBuilder()

        if (currentSession != null) {
            requestBuilder.header("Authorization", "Bearer ${currentSession.accessToken}")
            requestBuilder.header("x-tenant-slug", currentSession.tenantSlug)
        }

        return chain.proceed(requestBuilder.build())
    }
}
