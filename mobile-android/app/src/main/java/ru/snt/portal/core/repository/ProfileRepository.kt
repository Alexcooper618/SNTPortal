package ru.snt.portal.core.repository

import com.google.gson.Gson
import okhttp3.MultipartBody
import ru.snt.portal.core.model.ApiResult
import ru.snt.portal.core.model.AuthUser
import ru.snt.portal.core.network.PortalApi
import ru.snt.portal.core.network.toUserMessage
import ru.snt.portal.core.session.SessionStore
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class ProfileRepository @Inject constructor(
    private val api: PortalApi,
    private val gson: Gson,
    private val sessionStore: SessionStore,
) {
    suspend fun uploadAvatar(avatar: MultipartBody.Part): ApiResult<AuthUser> {
        if (sessionStore.current() == null) return ApiResult.Error("Сессия не найдена")

        return try {
            val response = api.uploadMyAvatar(avatar = avatar)
            sessionStore.updateUser(response.user)
            ApiResult.Success(response.user)
        } catch (error: Throwable) {
            val (message, code) = error.toUserMessage(gson)
            ApiResult.Error(message, code)
        }
    }

    suspend fun removeAvatar(): ApiResult<AuthUser> {
        if (sessionStore.current() == null) return ApiResult.Error("Сессия не найдена")

        return try {
            val response = api.deleteMyAvatar()
            sessionStore.updateUser(response.user)
            ApiResult.Success(response.user)
        } catch (error: Throwable) {
            val (message, code) = error.toUserMessage(gson)
            ApiResult.Error(message, code)
        }
    }
}
