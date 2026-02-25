package ru.snt.portal.core.repository

import com.google.gson.Gson
import ru.snt.portal.core.model.ApiResult
import ru.snt.portal.core.model.WeatherResponse
import ru.snt.portal.core.network.PortalApi
import ru.snt.portal.core.network.toUserMessage
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class DashboardRepository @Inject constructor(
    private val api: PortalApi,
    private val gson: Gson,
) {
    private var cachedWeather: WeatherResponse? = null
    private var weatherFetchedAtMs: Long = 0L

    suspend fun loadWeather(force: Boolean = false): ApiResult<WeatherResponse> {
        val now = System.currentTimeMillis()
        if (!force && cachedWeather != null && now - weatherFetchedAtMs <= WEATHER_TTL_MS) {
            return ApiResult.Success(cachedWeather!!)
        }

        return try {
            val response = api.getCurrentWeather()
            cachedWeather = response
            weatherFetchedAtMs = now
            ApiResult.Success(response)
        } catch (error: Throwable) {
            val fallback = cachedWeather
            if (fallback != null) {
                ApiResult.Success(fallback)
            } else {
                val (message, code) = error.toUserMessage(gson)
                ApiResult.Error(message, code)
            }
        }
    }

    companion object {
        private const val WEATHER_TTL_MS = 30_000L
    }
}
