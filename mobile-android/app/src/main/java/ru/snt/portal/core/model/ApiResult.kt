package ru.snt.portal.core.model

sealed interface ApiResult<out T> {
    data class Success<T>(val data: T) : ApiResult<T>
    data class Error(val message: String, val code: String? = null) : ApiResult<Nothing>
}
