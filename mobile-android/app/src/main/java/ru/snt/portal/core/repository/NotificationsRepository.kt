package ru.snt.portal.core.repository

import com.google.gson.Gson
import ru.snt.portal.core.model.ApiResult
import ru.snt.portal.core.model.PushTokenDeleteRequest
import ru.snt.portal.core.model.PushTokenRequest
import ru.snt.portal.core.network.PortalApi
import ru.snt.portal.core.network.toUserMessage
import ru.snt.portal.core.session.SessionStore
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class NotificationsRepository @Inject constructor(
    private val api: PortalApi,
    private val sessionStore: SessionStore,
    private val gson: Gson,
) {
    suspend fun registerPushToken(token: String, deviceName: String?): ApiResult<Unit> {
        if (sessionStore.current() == null) return ApiResult.Error("Сессия не найдена")

        return try {
            api.registerPushToken(
                PushTokenRequest(
                    token = token,
                    platform = "ANDROID",
                    deviceName = deviceName,
                ),
            )
            ApiResult.Success(Unit)
        } catch (error: Throwable) {
            val (message, code) = error.toUserMessage(gson)
            ApiResult.Error(message, code)
        }
    }

    suspend fun unregisterPushToken(token: String): ApiResult<Unit> {
        if (sessionStore.current() == null) return ApiResult.Error("Сессия не найдена")

        return try {
            api.unregisterPushToken(PushTokenDeleteRequest(token = token))
            ApiResult.Success(Unit)
        } catch (error: Throwable) {
            val (message, code) = error.toUserMessage(gson)
            ApiResult.Error(message, code)
        }
    }
}

