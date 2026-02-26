package ru.snt.portal.core.repository

import androidx.room.withTransaction
import com.google.gson.Gson
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.MultipartBody
import okhttp3.RequestBody.Companion.toRequestBody
import ru.snt.portal.core.model.ApiResult
import ru.snt.portal.core.model.ChatContactDto
import ru.snt.portal.core.model.ChatMessageAuthor
import ru.snt.portal.core.model.ChatMessageDto
import ru.snt.portal.core.model.ChatMuteRoomRequest
import ru.snt.portal.core.model.ChatReplyDto
import ru.snt.portal.core.model.ChatRoomDto
import ru.snt.portal.core.model.ChatRoomPeer
import ru.snt.portal.core.model.ChatSendMessageRequest
import ru.snt.portal.core.model.ChatUpdateMessageRequest
import ru.snt.portal.core.network.PortalApi
import ru.snt.portal.core.network.toUserMessage
import ru.snt.portal.core.session.SessionStore
import ru.snt.portal.core.storage.PortalDatabase
import ru.snt.portal.core.storage.dao.ChatMessageDao
import ru.snt.portal.core.storage.dao.ChatRoomDao
import ru.snt.portal.core.storage.entity.CachedChatMessageEntity
import ru.snt.portal.core.storage.entity.CachedChatRoomEntity
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class ChatRepository @Inject constructor(
    private val api: PortalApi,
    private val gson: Gson,
    private val sessionStore: SessionStore,
    private val database: PortalDatabase,
    private val roomDao: ChatRoomDao,
    private val messageDao: ChatMessageDao,
) {
    private var roomsFetchedAtMs: Long = 0L
    private val messagesFetchedAtMsByRoom = mutableMapOf<String, Long>()
    private val textMediaType = "text/plain".toMediaType()

    suspend fun loadRooms(force: Boolean = false): ApiResult<List<ChatRoomDto>> {
        val tenantSlug = sessionStore.current()?.tenantSlug
        if (tenantSlug.isNullOrBlank()) {
            return ApiResult.Error("Сессия не найдена")
        }

        val now = System.currentTimeMillis()
        val cached = roomDao.getRooms(tenantSlug).map { it.toModel() }
        if (!force && cached.isNotEmpty() && now - roomsFetchedAtMs <= ROOMS_TTL_MS) {
            return ApiResult.Success(cached)
        }

        return try {
            val response = api.getChatRooms()
            database.withTransaction {
                roomDao.clearTenantRooms(tenantSlug)
                roomDao.upsertRooms(response.items.map { it.toEntity(tenantSlug) })
            }
            roomsFetchedAtMs = now
            ApiResult.Success(response.items)
        } catch (error: Throwable) {
            if (cached.isNotEmpty()) {
                ApiResult.Success(cached)
            } else {
                val (message, code) = error.toUserMessage(gson)
                ApiResult.Error(message, code)
            }
        }
    }

    suspend fun loadMessages(roomId: String, force: Boolean = false): ApiResult<List<ChatMessageDto>> {
        val tenantSlug = sessionStore.current()?.tenantSlug
        if (tenantSlug.isNullOrBlank()) {
            return ApiResult.Error("Сессия не найдена")
        }

        val now = System.currentTimeMillis()
        val cached = messageDao.getRoomMessages(tenantSlug, roomId).map { it.toModel() }
        val fetchedAt = messagesFetchedAtMsByRoom[roomId] ?: 0L
        if (!force && cached.isNotEmpty() && now - fetchedAt <= MESSAGES_TTL_MS) {
            return ApiResult.Success(cached)
        }

        return try {
            val response = api.getRoomMessages(roomId = roomId)
            database.withTransaction {
                messageDao.clearRoomMessages(tenantSlug, roomId)
                messageDao.upsertMessages(response.items.map { it.toEntity(tenantSlug, roomId) })
            }
            messagesFetchedAtMsByRoom[roomId] = now
            ApiResult.Success(response.items)
        } catch (error: Throwable) {
            if (cached.isNotEmpty()) {
                ApiResult.Success(cached)
            } else {
                val (message, code) = error.toUserMessage(gson)
                ApiResult.Error(message, code)
            }
        }
    }

    suspend fun sendMessage(roomId: String, body: String, replyToMessageId: String? = null): ApiResult<ChatMessageDto> {
        val tenantSlug = sessionStore.current()?.tenantSlug
        if (tenantSlug.isNullOrBlank()) {
            return ApiResult.Error("Сессия не найдена")
        }

        return try {
            val response = api.sendMessage(
                roomId = roomId,
                body = ChatSendMessageRequest(
                    body = body,
                    replyToMessageId = replyToMessageId,
                ),
            )
            val message = response.message
            messageDao.upsertMessages(listOf(message.toEntity(tenantSlug, roomId)))
            messagesFetchedAtMsByRoom[roomId] = System.currentTimeMillis()
            runCatching { api.markRoomRead(roomId) }
            ApiResult.Success(message)
        } catch (error: Throwable) {
            val (message, code) = error.toUserMessage(gson)
            ApiResult.Error(message, code)
        }
    }

    suspend fun editMessage(roomId: String, messageId: String, body: String): ApiResult<ChatMessageDto> {
        val tenantSlug = sessionStore.current()?.tenantSlug
        if (tenantSlug.isNullOrBlank()) {
            return ApiResult.Error("Сессия не найдена")
        }

        return try {
            val response = api.editMessage(
                messageId = messageId,
                body = ChatUpdateMessageRequest(body = body),
            )
            val message = response.message
            messageDao.upsertMessages(listOf(message.toEntity(tenantSlug, roomId)))
            messagesFetchedAtMsByRoom[roomId] = System.currentTimeMillis()
            ApiResult.Success(message)
        } catch (error: Throwable) {
            val (message, code) = error.toUserMessage(gson)
            ApiResult.Error(message, code)
        }
    }

    suspend fun deleteMessage(roomId: String, messageId: String): ApiResult<Unit> {
        val tenantSlug = sessionStore.current()?.tenantSlug
        if (tenantSlug.isNullOrBlank()) {
            return ApiResult.Error("Сессия не найдена")
        }

        return try {
            api.deleteMessage(messageId = messageId)
            messagesFetchedAtMsByRoom.remove(roomId)
            loadMessages(roomId = roomId, force = true)
            ApiResult.Success(Unit)
        } catch (error: Throwable) {
            val (message, code) = error.toUserMessage(gson)
            ApiResult.Error(message, code)
        }
    }

    suspend fun sendMediaMessage(
        roomId: String,
        kind: String,
        durationSec: Int,
        media: MultipartBody.Part,
        width: Int? = null,
        height: Int? = null,
        caption: String? = null,
        replyToMessageId: String? = null,
    ): ApiResult<ChatMessageDto> {
        val tenantSlug = sessionStore.current()?.tenantSlug
        if (tenantSlug.isNullOrBlank()) {
            return ApiResult.Error("Сессия не найдена")
        }

        return try {
            val response = api.sendMediaMessage(
                roomId = roomId,
                kind = kind.toRequestBody(textMediaType),
                durationSec = durationSec.toString().toRequestBody(textMediaType),
                width = width?.toString()?.toRequestBody(textMediaType),
                height = height?.toString()?.toRequestBody(textMediaType),
                caption = caption?.toRequestBody(textMediaType),
                replyToMessageId = replyToMessageId?.toRequestBody(textMediaType),
                media = media,
            )
            val message = response.message
            messageDao.upsertMessages(listOf(message.toEntity(tenantSlug, roomId)))
            messagesFetchedAtMsByRoom[roomId] = System.currentTimeMillis()
            runCatching { api.markRoomRead(roomId) }
            ApiResult.Success(message)
        } catch (error: Throwable) {
            val (message, code) = error.toUserMessage(gson)
            ApiResult.Error(message, code)
        }
    }

    suspend fun loadContacts(): ApiResult<List<ChatContactDto>> {
        if (sessionStore.current() == null) {
            return ApiResult.Error("Сессия не найдена")
        }

        return try {
            val response = api.getChatContacts()
            ApiResult.Success(response.items)
        } catch (error: Throwable) {
            val (message, code) = error.toUserMessage(gson)
            ApiResult.Error(message, code)
        }
    }

    suspend fun openDirectRoom(userId: Int): ApiResult<ChatRoomDto> {
        val tenantSlug = sessionStore.current()?.tenantSlug
        if (tenantSlug.isNullOrBlank()) {
            return ApiResult.Error("Сессия не найдена")
        }

        return try {
            val response = api.openDirectRoom(userId = userId)
            val room = response.room
            roomDao.upsertRooms(listOf(room.toEntity(tenantSlug)))
            ApiResult.Success(room)
        } catch (error: Throwable) {
            val (message, code) = error.toUserMessage(gson)
            ApiResult.Error(message, code)
        }
    }

    suspend fun setRoomMuted(roomId: String, muted: Boolean): ApiResult<Boolean> {
        val tenantSlug = sessionStore.current()?.tenantSlug
        if (tenantSlug.isNullOrBlank()) {
            return ApiResult.Error("Сессия не найдена")
        }

        return try {
            val response = api.setRoomMute(roomId = roomId, body = ChatMuteRoomRequest(muted))
            val room = roomDao.getRooms(tenantSlug).firstOrNull { it.id == roomId }
            if (room != null) {
                roomDao.upsertRooms(listOf(room.copy(isMuted = response.isMuted)))
            }
            ApiResult.Success(response.isMuted)
        } catch (error: Throwable) {
            val (message, code) = error.toUserMessage(gson)
            ApiResult.Error(message, code)
        }
    }

    suspend fun uploadTopicPhoto(roomId: String, photo: MultipartBody.Part): ApiResult<String?> {
        if (sessionStore.current() == null) {
            return ApiResult.Error("Сессия не найдена")
        }

        return try {
            val response = api.uploadTopicPhoto(roomId = roomId, photo = photo)
            ApiResult.Success(response.photoUrl)
        } catch (error: Throwable) {
            val (message, code) = error.toUserMessage(gson)
            ApiResult.Error(message, code)
        }
    }

    suspend fun deleteTopicPhoto(roomId: String): ApiResult<String?> {
        if (sessionStore.current() == null) {
            return ApiResult.Error("Сессия не найдена")
        }

        return try {
            val response = api.deleteTopicPhoto(roomId = roomId)
            ApiResult.Success(response.photoUrl)
        } catch (error: Throwable) {
            val (message, code) = error.toUserMessage(gson)
            ApiResult.Error(message, code)
        }
    }

    suspend fun markRoomRead(roomId: String) {
        runCatching { api.markRoomRead(roomId) }
    }

    private fun ChatRoomDto.toEntity(tenantSlug: String): CachedChatRoomEntity = CachedChatRoomEntity(
        id = id,
        tenantSlug = tenantSlug,
        name = name,
        title = title.ifBlank { name },
        kind = kind,
        photoUrl = photoUrl,
        isMuted = isMuted,
        isPrivate = isPrivate,
        peerName = peer?.name,
        peerAvatarUrl = peer?.avatarUrl,
        updatedAt = updatedAt,
        unreadCount = unreadCount,
        lastReadAt = lastReadAt,
        lastMessageId = lastMessage?.id,
        lastMessageBody = lastMessage?.body,
        lastMessageCreatedAt = lastMessage?.createdAt,
        lastMessageUpdatedAt = lastMessage?.updatedAt,
        lastMessageIsEdited = lastMessage?.isEdited ?: false,
        lastMessageEditedAt = lastMessage?.editedAt,
        lastMessageIsDeleted = lastMessage?.isDeleted ?: false,
        lastMessageAuthorId = lastMessage?.author?.id,
        lastMessageAuthorName = lastMessage?.author?.name,
        lastMessageAuthorRole = lastMessage?.author?.role,
        lastMessageAuthorAvatarUrl = lastMessage?.author?.avatarUrl,
    )

    private fun CachedChatRoomEntity.toModel(): ChatRoomDto = ChatRoomDto(
        id = id,
        name = name,
        isPrivate = isPrivate,
        updatedAt = updatedAt,
        photoUrl = photoUrl,
        isMuted = isMuted,
        title = title.ifBlank { name },
        kind = kind.ifBlank { if (isPrivate) "DIRECT" else "TOPIC" },
        peer = if (peerName.isNullOrBlank()) {
            null
        } else {
            ChatRoomPeer(
                id = -1,
                name = peerName,
                role = if (isPrivate) "USER" else "",
                avatarUrl = peerAvatarUrl,
            )
        },
        members = emptyList(),
        lastMessage = if (
            lastMessageId != null &&
                lastMessageAuthorId != null &&
                lastMessageAuthorName != null &&
                lastMessageAuthorRole != null &&
                lastMessageCreatedAt != null &&
                lastMessageUpdatedAt != null &&
                lastMessageBody != null
        ) {
            ChatMessageDto(
                id = lastMessageId,
                body = lastMessageBody,
                createdAt = lastMessageCreatedAt,
                updatedAt = lastMessageUpdatedAt,
                isEdited = lastMessageIsEdited,
                editedAt = lastMessageEditedAt,
                isDeleted = lastMessageIsDeleted,
                author = ChatMessageAuthor(
                    id = lastMessageAuthorId,
                    name = lastMessageAuthorName,
                    role = lastMessageAuthorRole,
                    avatarUrl = lastMessageAuthorAvatarUrl,
                ),
                replyTo = null,
                attachments = emptyList(),
            )
        } else {
            null
        },
        unreadCount = unreadCount,
        lastReadAt = lastReadAt,
    )

    private fun ChatMessageDto.toEntity(tenantSlug: String, roomId: String): CachedChatMessageEntity = CachedChatMessageEntity(
        id = id,
        tenantSlug = tenantSlug,
        roomId = roomId,
        body = body,
        createdAt = createdAt,
        updatedAt = updatedAt,
        isEdited = isEdited,
        editedAt = editedAt,
        isDeleted = isDeleted,
        authorId = author.id,
        authorName = author.name,
        authorRole = author.role,
        authorAvatarUrl = author.avatarUrl,
        replyToId = replyTo?.id,
        replyToBodyPreview = replyTo?.bodyPreview,
        replyToAuthorName = replyTo?.authorName,
        replyToIsDeleted = replyTo?.isDeleted,
    )

    private fun CachedChatMessageEntity.toModel(): ChatMessageDto = ChatMessageDto(
        id = id,
        body = body,
        createdAt = createdAt,
        updatedAt = updatedAt,
        isEdited = isEdited,
        editedAt = editedAt,
        isDeleted = isDeleted,
        author = ChatMessageAuthor(
            id = authorId,
            name = authorName,
            role = authorRole,
            avatarUrl = authorAvatarUrl,
        ),
        replyTo = if (replyToId != null && replyToBodyPreview != null && replyToAuthorName != null) {
            ChatReplyDto(
                id = replyToId,
                bodyPreview = replyToBodyPreview,
                authorName = replyToAuthorName,
                isDeleted = replyToIsDeleted ?: false,
            )
        } else {
            null
        },
        attachments = emptyList(),
    )

    companion object {
        private const val ROOMS_TTL_MS = 30_000L
        private const val MESSAGES_TTL_MS = 20_000L
    }
}
