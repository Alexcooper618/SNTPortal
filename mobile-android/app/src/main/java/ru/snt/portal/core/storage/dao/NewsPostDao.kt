package ru.snt.portal.core.storage.dao

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import ru.snt.portal.core.storage.entity.CachedNewsPostEntity

@Dao
interface NewsPostDao {
    @Query("SELECT * FROM cached_news_posts WHERE tenantSlug = :tenantSlug ORDER BY id DESC")
    suspend fun getFeed(tenantSlug: String): List<CachedNewsPostEntity>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsertPosts(items: List<CachedNewsPostEntity>)

    @Query("DELETE FROM cached_news_posts WHERE tenantSlug = :tenantSlug")
    suspend fun clearTenantFeed(tenantSlug: String)
}
