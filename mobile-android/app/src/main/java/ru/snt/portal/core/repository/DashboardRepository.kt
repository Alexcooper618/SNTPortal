package ru.snt.portal.core.repository

import com.google.gson.Gson
import okhttp3.MediaType.Companion.toMediaTypeOrNull
import okhttp3.MultipartBody
import okhttp3.RequestBody.Companion.toRequestBody
import ru.snt.portal.core.model.ApiResult
import ru.snt.portal.core.model.BillingBalanceMeResponse
import ru.snt.portal.core.model.BillingSntBalanceResponse
import ru.snt.portal.core.model.SntExpenseDto
import ru.snt.portal.core.model.WeatherResponse
import ru.snt.portal.core.network.PortalApi
import ru.snt.portal.core.network.toUserMessage
import javax.inject.Inject
import javax.inject.Singleton

data class DashboardData(
    val weather: WeatherResponse?,
    val myBalance: BillingBalanceMeResponse,
    val sntBalance: BillingSntBalanceResponse,
)

@Singleton
class DashboardRepository @Inject constructor(
    private val api: PortalApi,
    private val gson: Gson,
) {
    private var cachedData: DashboardData? = null
    private var fetchedAtMs: Long = 0L

    suspend fun loadDashboard(force: Boolean = false): ApiResult<DashboardData> {
        val now = System.currentTimeMillis()
        if (!force && cachedData != null && now - fetchedAtMs <= DASHBOARD_TTL_MS) {
            return ApiResult.Success(cachedData!!)
        }

        val weather = runCatching { api.getCurrentWeather() }.getOrNull()
        val myBalanceResult = runCatching { api.getMyBillingBalance() }
        val sntBalanceResult = runCatching { api.getSntBillingBalance() }

        if (myBalanceResult.isSuccess && sntBalanceResult.isSuccess) {
            val next = DashboardData(
                weather = weather ?: cachedData?.weather,
                myBalance = myBalanceResult.getOrNull() ?: BillingBalanceMeResponse(),
                sntBalance = sntBalanceResult.getOrNull() ?: BillingSntBalanceResponse(),
            )
            cachedData = next
            fetchedAtMs = now
            return ApiResult.Success(next)
        }

        val fallback = cachedData
        return if (fallback != null) {
            ApiResult.Success(fallback)
        } else {
            val primaryError = myBalanceResult.exceptionOrNull() ?: sntBalanceResult.exceptionOrNull()
            if (primaryError != null) {
                val (message, code) = primaryError.toUserMessage(gson)
                ApiResult.Error(message, code)
            } else {
                ApiResult.Error("Не удалось загрузить данные главной")
            }
        }
    }

    suspend fun loadSntExpenses(limit: Int = 200): ApiResult<List<SntExpenseDto>> {
        return runCatching { api.getSntExpenses(limit).items }
            .fold(
                onSuccess = { ApiResult.Success(it) },
                onFailure = {
                    val (message, code) = it.toUserMessage(gson)
                    ApiResult.Error(message, code)
                },
            )
    }

    suspend fun registerSntExpense(
        amountCents: Int,
        purpose: String,
        attachment: MultipartBody.Part?,
    ): ApiResult<SntExpenseDto> {
        val amountPart = amountCents.toString().toRequestBody("text/plain".toMediaTypeOrNull())
        val purposePart = purpose.trim().toRequestBody("text/plain".toMediaTypeOrNull())
        return runCatching {
            api.createSntExpense(
                amountCents = amountPart,
                purpose = purposePart,
                attachment = attachment,
            ).expense
        }.fold(
            onSuccess = { ApiResult.Success(it) },
            onFailure = {
                val (message, code) = it.toUserMessage(gson)
                ApiResult.Error(message, code)
            },
        )
    }

    companion object {
        private const val DASHBOARD_TTL_MS = 30_000L
    }
}
