package ru.snt.portal.core.storage.dao

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import ru.snt.portal.core.storage.entity.CachedChatRoomEntity

@Dao
interface ChatRoomDao {
    @Query("SELECT * FROM cached_chat_rooms WHERE tenantSlug = :tenantSlug ORDER BY updatedAt DESC")
    suspend fun getRooms(tenantSlug: String): List<CachedChatRoomEntity>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsertRooms(items: List<CachedChatRoomEntity>)

    @Query("DELETE FROM cached_chat_rooms WHERE tenantSlug = :tenantSlug")
    suspend fun clearTenantRooms(tenantSlug: String)
}
