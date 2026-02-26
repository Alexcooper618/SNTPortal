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
import ru.snt.portal.core.model.ChatContactDto
import ru.snt.portal.core.model.ChatMessageDto
import ru.snt.portal.core.model.ChatRoomDto
import ru.snt.portal.core.repository.ChatRepository
import javax.inject.Inject

data class ChatUiState(
    val rooms: List<ChatRoomDto> = emptyList(),
    val contacts: List<ChatContactDto> = emptyList(),
    val selectedRoomId: String? = null,
    val messages: List<ChatMessageDto> = emptyList(),
    val roomLoading: Boolean = false,
    val contactsLoading: Boolean = false,
    val messagesLoading: Boolean = false,
    val sending: Boolean = false,
    val mutatingMessage: Boolean = false,
    val mediaSending: Boolean = false,
    val mediaRetryAvailable: Boolean = false,
    val mediaRetryLabel: String = "",
    val uploadingTopicPhoto: Boolean = false,
    val isMuted: Boolean = false,
    val draftMessage: String = "",
    val replyToMessage: ChatMessageDto? = null,
    val editingMessageId: String? = null,
    val error: String? = null,
)

private data class PendingMediaRetry(
    val roomId: String,
    val kind: String,
    val durationSec: Int,
    val mediaPart: MultipartBody.Part,
    val width: Int?,
    val height: Int?,
    val caption: String?,
    val replyToMessageId: String?,
    val label: String,
)

@HiltViewModel
class ChatViewModel @Inject constructor(
    private val chatRepository: ChatRepository,
) : ViewModel() {

    private val _uiState = MutableStateFlow(ChatUiState())
    val uiState: StateFlow<ChatUiState> = _uiState.asStateFlow()

    private val messagesCacheByRoom = mutableMapOf<String, List<ChatMessageDto>>()
    private var activeMessagesRequestSeq: Long = 0L
    private var pendingMediaRetry: PendingMediaRetry? = null

    init {
        loadRooms(force = false)
        loadContacts(force = false)
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
                            isMuted = result.data.firstOrNull { room -> room.id == selected }?.isMuted ?: false,
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

    fun loadContacts(force: Boolean = true) {
        if (!force && _uiState.value.contacts.isNotEmpty()) return

        viewModelScope.launch {
            _uiState.update { it.copy(contactsLoading = true, error = null) }
            when (val result = chatRepository.loadContacts()) {
                is ApiResult.Success -> {
                    _uiState.update { it.copy(contactsLoading = false, contacts = result.data, error = null) }
                }

                is ApiResult.Error -> {
                    _uiState.update { it.copy(contactsLoading = false, error = result.message) }
                }
            }
        }
    }

    fun openDirectChat(userId: Int) {
        viewModelScope.launch {
            _uiState.update { it.copy(roomLoading = true, error = null) }
            when (val result = chatRepository.openDirectRoom(userId)) {
                is ApiResult.Success -> {
                    val room = result.data
                    val nextRooms = (_uiState.value.rooms + room)
                        .associateBy { it.id }
                        .values
                        .toList()
                        .sortedByDescending { it.updatedAt }
                    _uiState.update {
                        it.copy(
                            roomLoading = false,
                            rooms = nextRooms,
                            selectedRoomId = room.id,
                            isMuted = room.isMuted,
                            messages = emptyList(),
                            messagesLoading = true,
                            error = null,
                        )
                    }
                    loadMessages(room.id, force = true)
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
        val room = _uiState.value.rooms.firstOrNull { it.id == roomId }
        _uiState.update {
            it.copy(
                selectedRoomId = roomId,
                messages = cachedMessages,
                messagesLoading = cachedMessages.isEmpty(),
                isMuted = room?.isMuted ?: false,
                replyToMessage = null,
                editingMessageId = null,
                draftMessage = "",
                mediaRetryAvailable = false,
                mediaRetryLabel = "",
                rooms = it.rooms.map { currentRoom ->
                    if (currentRoom.id == roomId) currentRoom.copy(unreadCount = 0) else currentRoom
                },
                error = null,
            )
        }
        pendingMediaRetry = null

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

    fun setMuted(muted: Boolean) {
        val roomId = _uiState.value.selectedRoomId ?: return
        viewModelScope.launch {
            when (val result = chatRepository.setRoomMuted(roomId = roomId, muted = muted)) {
                is ApiResult.Success -> {
                    _uiState.update {
                        it.copy(
                            isMuted = result.data,
                            rooms = it.rooms.map { room ->
                                if (room.id == roomId) room.copy(isMuted = result.data) else room
                            },
                        )
                    }
                }

                is ApiResult.Error -> {
                    _uiState.update { it.copy(error = result.message) }
                }
            }
        }
    }

    fun uploadTopicPhoto(photoPart: MultipartBody.Part) {
        val roomId = _uiState.value.selectedRoomId ?: return
        viewModelScope.launch {
            _uiState.update { it.copy(uploadingTopicPhoto = true, error = null) }
            when (val result = chatRepository.uploadTopicPhoto(roomId = roomId, photo = photoPart)) {
                is ApiResult.Success -> {
                    _uiState.update {
                        it.copy(
                            uploadingTopicPhoto = false,
                            rooms = it.rooms.map { room ->
                                if (room.id == roomId) room.copy(photoUrl = result.data) else room
                            },
                        )
                    }
                }

                is ApiResult.Error -> {
                    _uiState.update { it.copy(uploadingTopicPhoto = false, error = result.message) }
                }
            }
        }
    }

    fun removeTopicPhoto() {
        val roomId = _uiState.value.selectedRoomId ?: return
        viewModelScope.launch {
            _uiState.update { it.copy(uploadingTopicPhoto = true, error = null) }
            when (val result = chatRepository.deleteTopicPhoto(roomId = roomId)) {
                is ApiResult.Success -> {
                    _uiState.update {
                        it.copy(
                            uploadingTopicPhoto = false,
                            rooms = it.rooms.map { room ->
                                if (room.id == roomId) room.copy(photoUrl = result.data) else room
                            },
                        )
                    }
                }

                is ApiResult.Error -> {
                    _uiState.update { it.copy(uploadingTopicPhoto = false, error = result.message) }
                }
            }
        }
    }

    fun beginReply(message: ChatMessageDto) {
        _uiState.update {
            it.copy(
                replyToMessage = message,
                editingMessageId = null,
            )
        }
    }

    fun cancelReply() {
        _uiState.update { it.copy(replyToMessage = null) }
    }

    fun beginEdit(message: ChatMessageDto) {
        _uiState.update {
            it.copy(
                editingMessageId = message.id,
                replyToMessage = null,
                draftMessage = message.body,
            )
        }
    }

    fun cancelEdit() {
        _uiState.update { it.copy(editingMessageId = null, draftMessage = "") }
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
            val editingMessageId = state.editingMessageId
            val result = if (editingMessageId != null) {
                chatRepository.editMessage(roomId = roomId, messageId = editingMessageId, body = text)
            } else {
                chatRepository.sendMessage(
                    roomId = roomId,
                    body = text,
                    replyToMessageId = state.replyToMessage?.id,
                )
            }

            when (result) {
                is ApiResult.Success -> {
                    val updatedMessages = if (editingMessageId != null) {
                        _uiState.value.messages.map { item -> if (item.id == result.data.id) result.data else item }
                    } else {
                        _uiState.value.messages + result.data
                    }
                    messagesCacheByRoom[roomId] = updatedMessages

                    _uiState.update {
                        it.copy(
                            sending = false,
                            draftMessage = "",
                            editingMessageId = null,
                            replyToMessage = null,
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

    fun deleteMessage(messageId: String) {
        val roomId = _uiState.value.selectedRoomId ?: return
        viewModelScope.launch {
            _uiState.update { it.copy(mutatingMessage = true, error = null) }
            when (val result = chatRepository.deleteMessage(roomId = roomId, messageId = messageId)) {
                is ApiResult.Success -> {
                    when (val refreshed = chatRepository.loadMessages(roomId = roomId, force = true)) {
                        is ApiResult.Success -> {
                            messagesCacheByRoom[roomId] = refreshed.data
                            _uiState.update { it.copy(mutatingMessage = false, messages = refreshed.data) }
                        }

                        is ApiResult.Error -> {
                            _uiState.update { it.copy(mutatingMessage = false, error = refreshed.message) }
                        }
                    }
                }

                is ApiResult.Error -> {
                    _uiState.update { it.copy(mutatingMessage = false, error = result.message) }
                }
            }
        }
    }

    fun sendMediaMessage(
        kind: String,
        durationSec: Int,
        mediaPart: MultipartBody.Part,
        retryLabel: String = "Медиа",
        width: Int? = null,
        height: Int? = null,
    ) {
        val state = _uiState.value
        val roomId = state.selectedRoomId ?: return
        val payload = PendingMediaRetry(
            roomId = roomId,
            kind = kind,
            durationSec = durationSec,
            mediaPart = mediaPart,
            width = width,
            height = height,
            caption = state.draftMessage.trim().ifBlank { null },
            replyToMessageId = state.replyToMessage?.id,
            label = retryLabel,
        )
        sendMediaPayload(payload)
    }

    fun retryPendingMedia() {
        val payload = pendingMediaRetry ?: return
        sendMediaPayload(payload)
    }

    fun clearPendingMediaRetry() {
        pendingMediaRetry = null
        _uiState.update {
            it.copy(
                mediaRetryAvailable = false,
                mediaRetryLabel = "",
            )
        }
    }

    private fun sendMediaPayload(payload: PendingMediaRetry) {
        viewModelScope.launch {
            _uiState.update { it.copy(mediaSending = true, error = null) }
            when (
                val result = chatRepository.sendMediaMessage(
                    roomId = payload.roomId,
                    kind = payload.kind,
                    durationSec = payload.durationSec,
                    media = payload.mediaPart,
                    width = payload.width,
                    height = payload.height,
                    caption = payload.caption,
                    replyToMessageId = payload.replyToMessageId,
                )
            ) {
                is ApiResult.Success -> {
                    pendingMediaRetry = null
                    val updatedRoomMessages = messagesCacheByRoom[payload.roomId].orEmpty() + result.data
                    messagesCacheByRoom[payload.roomId] = updatedRoomMessages
                    _uiState.update {
                        val shouldUpdateVisibleRoom = it.selectedRoomId == payload.roomId
                        it.copy(
                            mediaSending = false,
                            mediaRetryAvailable = false,
                            mediaRetryLabel = "",
                            draftMessage = if (shouldUpdateVisibleRoom) "" else it.draftMessage,
                            replyToMessage = if (shouldUpdateVisibleRoom) null else it.replyToMessage,
                            messages = if (shouldUpdateVisibleRoom) updatedRoomMessages else it.messages,
                            rooms = it.rooms.map { room ->
                                if (room.id == payload.roomId) room.copy(unreadCount = 0, lastMessage = result.data)
                                else room
                            },
                        )
                    }
                }

                is ApiResult.Error -> {
                    pendingMediaRetry = payload
                    _uiState.update {
                        it.copy(
                            mediaSending = false,
                            mediaRetryAvailable = true,
                            mediaRetryLabel = payload.label,
                            error = result.message,
                        )
                    }
                }
            }
        }
    }
}
