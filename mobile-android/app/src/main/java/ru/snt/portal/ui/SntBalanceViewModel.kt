package ru.snt.portal.ui

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import okhttp3.MultipartBody
import ru.snt.portal.core.model.ApiResult
import ru.snt.portal.core.model.BillingSntBalanceResponse
import ru.snt.portal.core.model.SntExpenseDto
import ru.snt.portal.core.repository.DashboardRepository
import javax.inject.Inject

data class SntBalanceUiState(
    val loading: Boolean = true,
    val saving: Boolean = false,
    val summary: BillingSntBalanceResponse = BillingSntBalanceResponse(),
    val expenses: List<SntExpenseDto> = emptyList(),
    val error: String? = null,
    val notice: String? = null,
)

@HiltViewModel
class SntBalanceViewModel @Inject constructor(
    private val dashboardRepository: DashboardRepository,
) : ViewModel() {

    private val _uiState = MutableStateFlow(SntBalanceUiState())
    val uiState: StateFlow<SntBalanceUiState> = _uiState.asStateFlow()

    init {
        refresh(force = false)
    }

    fun refresh(force: Boolean = true) {
        viewModelScope.launch {
            _uiState.update { it.copy(loading = true, error = null, notice = null) }

            val dashboardResult = dashboardRepository.loadDashboard(force = force)
            val expensesResult = dashboardRepository.loadSntExpenses()

            val summary = when (dashboardResult) {
                is ApiResult.Success -> dashboardResult.data.sntBalance
                is ApiResult.Error -> _uiState.value.summary
            }

            val expenses = when (expensesResult) {
                is ApiResult.Success -> expensesResult.data
                is ApiResult.Error -> _uiState.value.expenses
            }

            val error = when {
                dashboardResult is ApiResult.Error -> dashboardResult.message
                expensesResult is ApiResult.Error -> expensesResult.message
                else -> null
            }

            _uiState.update {
                it.copy(
                    loading = false,
                    summary = summary,
                    expenses = expenses,
                    error = error,
                    notice = if (error == null) it.notice else null,
                )
            }
        }
    }

    fun registerExpense(
        amountCents: Int,
        purpose: String,
        attachment: MultipartBody.Part?,
    ) {
        viewModelScope.launch {
            _uiState.update { it.copy(saving = true, error = null, notice = null) }
            when (val result = dashboardRepository.registerSntExpense(amountCents, purpose, attachment)) {
                is ApiResult.Success -> {
                    _uiState.update { current ->
                        current.copy(
                            saving = false,
                            notice = "Расход зарегистрирован",
                            expenses = listOf(result.data) + current.expenses,
                        )
                    }
                    refresh(force = true)
                }

                is ApiResult.Error -> {
                    _uiState.update { it.copy(saving = false, error = result.message) }
                }
            }
        }
    }
}
