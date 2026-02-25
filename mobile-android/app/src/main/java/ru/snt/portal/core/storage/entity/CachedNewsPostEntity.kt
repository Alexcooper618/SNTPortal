package ru.snt.portal.core.storage.entity

import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey

@Entity(
    tableName = "cached_news_posts",
    indices = [Index(value = ["tenantSlug", "id"], name = "idx_news_tenant_id")],
)
data class CachedNewsPostEntity(
    @PrimaryKey
    val id: Int,
    val tenantSlug: String,
    val title: String,
    val body: String,
    val status: String,
    val createdAt: String,
    val updatedAt: String,
    val publishedAt: String?,
    val authorId: Int,
    val authorName: String,
    val likedByMe: Boolean,
    val likesCount: Int,
    val commentsCount: Int,
    val attachmentsJson: String,
)
