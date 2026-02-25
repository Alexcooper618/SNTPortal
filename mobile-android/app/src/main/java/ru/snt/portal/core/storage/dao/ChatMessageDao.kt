package ru.snt.portal.core.storage.dao

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import ru.snt.portal.core.storage.entity.CachedChatMessageEntity

@Dao
interface ChatMessageDao {
    @Query(
        "SELECT * FROM cached_chat_messages WHERE tenantSlug = :tenantSlug AND roomId = :roomId ORDER BY createdAt ASC"
    )
    suspend fun getRoomMessages(tenantSlug: String, roomId: String): List<CachedChatMessageEntity>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsertMessages(items: List<CachedChatMessageEntity>)

    @Query("DELETE FROM cached_chat_messages WHERE tenantSlug = :tenantSlug AND roomId = :roomId")
    suspend fun clearRoomMessages(tenantSlug: String, roomId: String)
}
