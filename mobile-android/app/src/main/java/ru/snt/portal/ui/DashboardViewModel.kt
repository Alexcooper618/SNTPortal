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
import ru.snt.portal.core.model.WeatherResponse
import ru.snt.portal.core.repository.DashboardRepository
import javax.inject.Inject

data class DashboardUiState(
    val loading: Boolean = true,
    val weather: WeatherResponse? = null,
    val error: String? = null,
)

@HiltViewModel
class DashboardViewModel @Inject constructor(
    private val dashboardRepository: DashboardRepository,
) : ViewModel() {

    private val _uiState = MutableStateFlow(DashboardUiState())
    val uiState: StateFlow<DashboardUiState> = _uiState.asStateFlow()

    init {
        refresh(force = false)
    }

    fun refresh(force: Boolean = true) {
        viewModelScope.launch {
            _uiState.update { it.copy(loading = true, error = null) }
            when (val result = dashboardRepository.loadWeather(force = force)) {
                is ApiResult.Success -> {
                    _uiState.update { it.copy(loading = false, weather = result.data, error = null) }
                }

                is ApiResult.Error -> {
                    _uiState.update { it.copy(loading = false, error = result.message) }
                }
            }
        }
    }
}
