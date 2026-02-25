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
import ru.snt.portal.core.model.ChatMessageDto
import ru.snt.portal.core.model.ChatRoomDto
import ru.snt.portal.core.repository.ChatRepository
import javax.inject.Inject

data class ChatUiState(
    val rooms: List<ChatRoomDto> = emptyList(),
    val selectedRoomId: String? = null,
    val messages: List<ChatMessageDto> = emptyList(),
    val roomLoading: Boolean = false,
    val messagesLoading: Boolean = false,
    val sending: Boolean = false,
    val draftMessage: String = "",
    val error: String? = null,
)

@HiltViewModel
class ChatViewModel @Inject constructor(
    private val chatRepository: ChatRepository,
) : ViewModel() {

    private val _uiState = MutableStateFlow(ChatUiState())
    val uiState: StateFlow<ChatUiState> = _uiState.asStateFlow()

    private val messagesCacheByRoom = mutableMapOf<String, List<ChatMessageDto>>()
    private var activeMessagesRequestSeq: Long = 0L

    init {
        loadRooms(force = false)
    }

    fun loadRooms(force: Boolean = true) {
        viewModelScope.launch {
            _uiState.update { it.copy(roomLoading = true, error = null) }
            when (val result = chatRepository.loadRooms(force = force)) {
                is ApiResult.Success -> {
                    val selected = _uiState.value.selectedRoomId ?: result.data.firstOrNull()?.id
                    _uiState.update {
                        it.copy(
                            roomLoading = false,
                            rooms = result.data,
                            selectedRoomId = selected,
                            error = null,
                        )
                    }
                    if (selected != null) {
                        val cachedMessages = messagesCacheByRoom[selected]
                        if (!cachedMessages.isNullOrEmpty()) {
                            _uiState.update { it.copy(messages = cachedMessages, messagesLoading = false) }
                        }
                        loadMessages(selected, force = false)
                    }
                }

                is ApiResult.Error -> {
                    _uiState.update { it.copy(roomLoading = false, error = result.message) }
                }
            }
        }
    }

    fun selectRoom(roomId: String) {
        if (_uiState.value.selectedRoomId == roomId) return

        val cachedMessages = messagesCacheByRoom[roomId].orEmpty()
        _uiState.update {
            it.copy(
                selectedRoomId = roomId,
                messages = cachedMessages,
                messagesLoading = cachedMessages.isEmpty(),
                rooms = it.rooms.map { room -> if (room.id == roomId) room.copy(unreadCount = 0) else room },
                error = null,
            )
        }

        viewModelScope.launch {
            chatRepository.markRoomRead(roomId)
        }

        loadMessages(roomId, force = false)
    }

    fun loadMessages(roomId: String, force: Boolean = true) {
        val requestSeq = ++activeMessagesRequestSeq
        viewModelScope.launch {
            val hasCached = messagesCacheByRoom[roomId]?.isNotEmpty() == true
            _uiState.update {
                if (it.selectedRoomId != roomId) it
                else it.copy(messagesLoading = !hasCached, error = null)
            }

            when (val result = chatRepository.loadMessages(roomId = roomId, force = force)) {
                is ApiResult.Success -> {
                    messagesCacheByRoom[roomId] = result.data

                    val latestState = _uiState.value
                    if (latestState.selectedRoomId != roomId || requestSeq != activeMessagesRequestSeq) {
                        return@launch
                    }

                    _uiState.update {
                        it.copy(
                            messagesLoading = false,
                            messages = result.data,
                            rooms = it.rooms.map { room ->
                                if (room.id == roomId) room.copy(unreadCount = 0) else room
                            },
                            error = null,
                        )
                    }

                    viewModelScope.launch {
                        chatRepository.markRoomRead(roomId)
                    }
                }

                is ApiResult.Error -> {
                    val latestState = _uiState.value
                    if (latestState.selectedRoomId != roomId || requestSeq != activeMessagesRequestSeq) {
                        return@launch
                    }

                    _uiState.update {
                        it.copy(
                            messagesLoading = false,
                            error = result.message,
                        )
                    }
                }
            }
        }
    }

    fun onDraftChanged(value: String) {
        _uiState.update { it.copy(draftMessage = value) }
    }

    fun sendMessage() {
        val state = _uiState.value
        val roomId = state.selectedRoomId ?: return
        val text = state.draftMessage.trim()
        if (text.isBlank()) return

        viewModelScope.launch {
            _uiState.update { it.copy(sending = true, error = null) }
            when (val result = chatRepository.sendMessage(roomId = roomId, body = text)) {
                is ApiResult.Success -> {
                    val updatedMessages = _uiState.value.messages + result.data
                    messagesCacheByRoom[roomId] = updatedMessages

                    _uiState.update {
                        it.copy(
                            sending = false,
                            draftMessage = "",
                            messages = updatedMessages,
                            rooms = it.rooms.map { room ->
                                if (room.id == roomId) room.copy(unreadCount = 0, lastMessage = result.data)
                                else room
                            },
                        )
                    }
                }

                is ApiResult.Error -> {
                    _uiState.update { it.copy(sending = false, error = result.message) }
                }
            }
        }
    }
}
