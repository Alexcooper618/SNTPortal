package ru.snt.portal.core.storage.entity

import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey

@Entity(
    tableName = "cached_chat_rooms",
    indices = [Index(value = ["tenantSlug", "updatedAt"], name = "idx_rooms_tenant_updated")],
)
data class CachedChatRoomEntity(
    @PrimaryKey
    val id: String,
    val tenantSlug: String,
    val name: String,
    val isPrivate: Boolean,
    val updatedAt: String,
    val unreadCount: Int,
    val lastReadAt: String?,
    val lastMessageId: String?,
    val lastMessageBody: String?,
    val lastMessageCreatedAt: String?,
    val lastMessageUpdatedAt: String?,
    val lastMessageIsEdited: Boolean,
    val lastMessageEditedAt: String?,
    val lastMessageIsDeleted: Boolean,
    val lastMessageAuthorId: Int?,
    val lastMessageAuthorName: String?,
    val lastMessageAuthorRole: String?,
)
