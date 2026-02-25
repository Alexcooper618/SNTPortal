package ru.snt.portal.core.repository

import com.google.gson.Gson
import ru.snt.portal.core.model.ApiResult
import ru.snt.portal.core.model.LoginRequest
import ru.snt.portal.core.model.SessionState
import ru.snt.portal.core.model.TenantItem
import ru.snt.portal.core.network.PortalApi
import ru.snt.portal.core.network.toUserMessage
import ru.snt.portal.core.session.SessionStore
import ru.snt.portal.core.session.withMustChangePasswordFlag
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class AuthRepository @Inject constructor(
    private val api: PortalApi,
    private val sessionStore: SessionStore,
    private val gson: Gson,
) {
    suspend fun loadTenants(search: String? = null): ApiResult<List<TenantItem>> = try {
        val response = api.getTenants(search = search)
        ApiResult.Success(response.items)
    } catch (error: Throwable) {
        val (message, code) = error.toUserMessage(gson)
        ApiResult.Error(message, code)
    }

    suspend fun login(tenantSlug: String, phone: String, password: String): ApiResult<SessionState> = try {
        val response = api.login(
            tenantSlug = tenantSlug,
            body = LoginRequest(phone = phone, password = password),
        )

        val session = SessionState(
            tenantSlug = tenantSlug,
            accessToken = response.accessToken,
            refreshToken = response.refreshToken,
            user = response.user,
        ).withMustChangePasswordFlag(response.mustChangePassword)

        sessionStore.save(session)
        ApiResult.Success(session)
    } catch (error: Throwable) {
        val (message, code) = error.toUserMessage(gson)
        ApiResult.Error(message, code)
    }

    fun currentSession(): SessionState? = sessionStore.current()

    fun observeSession() = sessionStore.session

    fun logout() {
        sessionStore.clear()
    }
}
