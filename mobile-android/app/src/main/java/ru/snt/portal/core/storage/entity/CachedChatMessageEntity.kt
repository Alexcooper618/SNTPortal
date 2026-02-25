package ru.snt.portal.core.storage.entity

import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey

@Entity(
    tableName = "cached_chat_messages",
    indices = [
        Index(value = ["tenantSlug", "roomId", "createdAt"], name = "idx_messages_room_created"),
    ],
)
data class CachedChatMessageEntity(
    @PrimaryKey
    val id: String,
    val tenantSlug: String,
    val roomId: String,
    val body: String,
    val createdAt: String,
    val updatedAt: String,
    val isEdited: Boolean,
    val editedAt: String?,
    val isDeleted: Boolean,
    val authorId: Int,
    val authorName: String,
    val authorRole: String,
    val replyToId: String?,
    val replyToBodyPreview: String?,
    val replyToAuthorName: String?,
    val replyToIsDeleted: Boolean?,
)
