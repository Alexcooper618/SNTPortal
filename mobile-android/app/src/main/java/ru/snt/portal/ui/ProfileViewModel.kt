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
import ru.snt.portal.core.repository.ProfileRepository
import javax.inject.Inject

data class ProfileUiState(
    val uploadingAvatar: Boolean = false,
    val removingAvatar: Boolean = false,
    val error: String? = null,
    val notice: String? = null,
)

@HiltViewModel
class ProfileViewModel @Inject constructor(
    private val profileRepository: ProfileRepository,
) : ViewModel() {

    private val _uiState = MutableStateFlow(ProfileUiState())
    val uiState: StateFlow<ProfileUiState> = _uiState.asStateFlow()

    fun uploadAvatar(avatar: MultipartBody.Part) {
        viewModelScope.launch {
            _uiState.update { it.copy(uploadingAvatar = true, error = null, notice = null) }
            when (val result = profileRepository.uploadAvatar(avatar)) {
                is ApiResult.Success -> {
                    _uiState.update {
                        it.copy(
                            uploadingAvatar = false,
                            notice = "Аватар обновлен",
                        )
                    }
                }

                is ApiResult.Error -> {
                    _uiState.update { it.copy(uploadingAvatar = false, error = result.message) }
                }
            }
        }
    }

    fun removeAvatar() {
        viewModelScope.launch {
            _uiState.update { it.copy(removingAvatar = true, error = null, notice = null) }
            when (val result = profileRepository.removeAvatar()) {
                is ApiResult.Success -> {
                    _uiState.update {
                        it.copy(
                            removingAvatar = false,
                            notice = "Аватар удален",
                        )
                    }
                }

                is ApiResult.Error -> {
                    _uiState.update { it.copy(removingAvatar = false, error = result.message) }
                }
            }
        }
    }

    fun clearNotice() {
        _uiState.update { it.copy(notice = null) }
    }

    fun setError(message: String) {
        _uiState.update { it.copy(error = message) }
    }
}
