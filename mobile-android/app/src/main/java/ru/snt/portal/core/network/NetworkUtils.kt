package ru.snt.portal.core.network

import com.google.gson.Gson
import retrofit2.HttpException
import ru.snt.portal.core.model.ApiErrorPayload

fun Throwable.toUserMessage(gson: Gson): Pair<String, String?> {
    return when (this) {
        is HttpException -> {
            val payload = runCatching {
                response()?.errorBody()?.string()?.takeIf { it.isNotBlank() }
                    ?.let { gson.fromJson(it, ApiErrorPayload::class.java) }
            }.getOrNull()

            val message = payload?.message ?: message() ?: "Ошибка сервера (${code()})"
            message to payload?.code
        }

        else -> (message ?: "Сетевой сбой. Попробуйте снова") to null
    }
}
