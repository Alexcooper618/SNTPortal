package ru.snt.portal.core.storage

import androidx.room.Database
import androidx.room.RoomDatabase
import ru.snt.portal.core.storage.dao.ChatMessageDao
import ru.snt.portal.core.storage.dao.ChatRoomDao
import ru.snt.portal.core.storage.dao.NewsPostDao
import ru.snt.portal.core.storage.entity.CachedChatMessageEntity
import ru.snt.portal.core.storage.entity.CachedChatRoomEntity
import ru.snt.portal.core.storage.entity.CachedNewsPostEntity

@Database(
    entities = [
        CachedChatRoomEntity::class,
        CachedChatMessageEntity::class,
        CachedNewsPostEntity::class,
    ],
    version = 2,
    exportSchema = false,
)
abstract class PortalDatabase : RoomDatabase() {
    abstract fun chatRoomDao(): ChatRoomDao
    abstract fun chatMessageDao(): ChatMessageDao
    abstract fun newsPostDao(): NewsPostDao
}
