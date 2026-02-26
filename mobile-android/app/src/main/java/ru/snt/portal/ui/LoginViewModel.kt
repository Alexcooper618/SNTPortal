package ru.snt.portal.ui

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import ru.snt.portal.core.model.ApiResult
import ru.snt.portal.core.model.TenantItem
import ru.snt.portal.core.repository.AuthRepository
import javax.inject.Inject

data class LoginUiState(
    val tenantSlug: String = "",
    val phone: String = "+7",
    val password: String = "",
    val isLoading: Boolean = false,
    val tenants: List<TenantItem> = emptyList(),
    val error: String? = null,
)

@HiltViewModel
class LoginViewModel @Inject constructor(
    private val authRepository: AuthRepository,
) : ViewModel() {

    private val _uiState = MutableStateFlow(LoginUiState())
    val uiState: StateFlow<LoginUiState> = _uiState.asStateFlow()

    init {
        loadTenants()
    }

    fun onTenantChange(value: String) {
        _uiState.update { it.copy(tenantSlug = value.trim(), error = null) }
    }

    fun onPhoneChange(value: String) {
        _uiState.update { it.copy(phone = normalizeRuPhone(value), error = null) }
    }

    fun onPasswordChange(value: String) {
        _uiState.update { it.copy(password = value, error = null) }
    }

    fun loadTenants(search: String? = null) {
        viewModelScope.launch {
            when (val result = authRepository.loadTenants(search)) {
                is ApiResult.Success -> {
                    _uiState.update {
                        it.copy(
                            tenants = result.data,
                            tenantSlug = it.tenantSlug.ifBlank { result.data.firstOrNull()?.slug.orEmpty() },
                        )
                    }
                }

                is ApiResult.Error -> {
                    _uiState.update { it.copy(error = result.message) }
                }
            }
        }
    }

    fun login() {
        val state = _uiState.value
        if (state.tenantSlug.isBlank() || state.phone.isBlank() || state.password.isBlank()) {
            _uiState.update { it.copy(error = "Заполните СНТ, телефон и пароль") }
            return
        }
        if (!isValidRuPhone(state.phone)) {
            _uiState.update { it.copy(error = "Введите телефон в формате +7XXXXXXXXXX") }
            return
        }

        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, error = null) }
            when (
                val result = authRepository.login(
                    tenantSlug = state.tenantSlug,
                    phone = state.phone,
                    password = state.password,
                )
            ) {
                is ApiResult.Success -> {
                    _uiState.update { it.copy(isLoading = false, password = "") }
                }

                is ApiResult.Error -> {
                    _uiState.update { it.copy(isLoading = false, error = result.message) }
                }
            }
        }
    }

    private fun normalizeRuPhone(raw: String): String {
        val digitsOnly = raw.filter { it.isDigit() }
        if (digitsOnly.isEmpty()) return "+7"

        val normalizedDigits = when {
            digitsOnly.startsWith("7") -> digitsOnly
            digitsOnly.startsWith("8") -> "7${digitsOnly.drop(1)}"
            else -> "7$digitsOnly"
        }.take(11)

        return "+$normalizedDigits"
    }

    private fun isValidRuPhone(value: String): Boolean {
        val digits = value.filter { it.isDigit() }
        return digits.length == 11 && digits.startsWith("7")
    }
}
