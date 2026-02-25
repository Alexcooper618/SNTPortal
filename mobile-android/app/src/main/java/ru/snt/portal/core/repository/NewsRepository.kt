package ru.snt.portal.core.repository

import com.google.gson.Gson
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.MultipartBody
import okhttp3.RequestBody
import okhttp3.RequestBody.Companion.toRequestBody
import ru.snt.portal.core.model.ApiResult
import ru.snt.portal.core.model.NewsAttachment
import ru.snt.portal.core.model.NewsAuthor
import ru.snt.portal.core.model.NewsPost
import ru.snt.portal.core.model.NewsStory
import ru.snt.portal.core.model.NewsStoryGroup
import ru.snt.portal.core.network.PortalApi
import ru.snt.portal.core.network.toUserMessage
import ru.snt.portal.core.session.SessionStore
import ru.snt.portal.core.storage.dao.NewsPostDao
import ru.snt.portal.core.storage.entity.CachedNewsPostEntity
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class NewsRepository @Inject constructor(
    private val api: PortalApi,
    private val gson: Gson,
    private val sessionStore: SessionStore,
    private val newsPostDao: NewsPostDao,
) {
    private var storiesCache: List<NewsStoryGroup> = emptyList()
    private var storiesFetchedAtMs: Long = 0L
    private val feedFetchedAtMsByTenant = mutableMapOf<String, Long>()

    suspend fun loadStories(force: Boolean = false): ApiResult<List<NewsStoryGroup>> {
        val now = System.currentTimeMillis()
        if (!force && storiesCache.isNotEmpty() && now - storiesFetchedAtMs <= STORIES_TTL_MS) {
            return ApiResult.Success(storiesCache)
        }

        return try {
            val response = api.getStories()
            storiesCache = response.items
            storiesFetchedAtMs = now
            ApiResult.Success(response.items)
        } catch (error: Throwable) {
            if (storiesCache.isNotEmpty()) {
                ApiResult.Success(storiesCache)
            } else {
                val (message, code) = error.toUserMessage(gson)
                ApiResult.Error(message, code)
            }
        }
    }

    suspend fun loadFeed(force: Boolean = false): ApiResult<List<NewsPost>> {
        val tenantSlug = sessionStore.current()?.tenantSlug
        if (tenantSlug.isNullOrBlank()) {
            return ApiResult.Error("Сессия не найдена")
        }

        val now = System.currentTimeMillis()
        val cached = newsPostDao.getFeed(tenantSlug).map { it.toModel(gson) }
        val fetchedAt = feedFetchedAtMsByTenant[tenantSlug] ?: 0L
        if (!force && cached.isNotEmpty() && now - fetchedAt <= FEED_TTL_MS) {
            return ApiResult.Success(cached)
        }

        return try {
            val response = api.getNewsFeed(limit = 20)
            newsPostDao.clearTenantFeed(tenantSlug)
            newsPostDao.upsertPosts(response.items.map { it.toEntity(tenantSlug, gson) })
            feedFetchedAtMsByTenant[tenantSlug] = now
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

    suspend fun createPost(body: String, media: List<MultipartBody.Part> = emptyList()): ApiResult<NewsPost> {
        val tenantSlug = sessionStore.current()?.tenantSlug
        if (tenantSlug.isNullOrBlank()) {
            return ApiResult.Error("Сессия не найдена")
        }

        return try {
            val response = api.createPost(
                body = body.toRequestBody(TEXT_MEDIA_TYPE),
                media = media,
            )
            newsPostDao.upsertPosts(listOf(response.post.toEntity(tenantSlug, gson)))
            feedFetchedAtMsByTenant[tenantSlug] = System.currentTimeMillis()
            ApiResult.Success(response.post)
        } catch (error: Throwable) {
            val (message, code) = error.toUserMessage(gson)
            ApiResult.Error(message, code)
        }
    }

    suspend fun toggleLike(post: NewsPost): ApiResult<NewsPost> {
        val tenantSlug = sessionStore.current()?.tenantSlug
        if (tenantSlug.isNullOrBlank()) {
            return ApiResult.Error("Сессия не найдена")
        }

        return try {
            val response = if (post.likedByMe) api.unlikePost(post.id) else api.likePost(post.id)
            val updated = post.copy(
                likedByMe = response.liked,
                likesCount = response.likesCount,
            )
            newsPostDao.upsertPosts(listOf(updated.toEntity(tenantSlug, gson)))
            ApiResult.Success(updated)
        } catch (error: Throwable) {
            val (message, code) = error.toUserMessage(gson)
            ApiResult.Error(message, code)
        }
    }

    suspend fun createStory(
        caption: String?,
        media: MultipartBody.Part,
    ): ApiResult<NewsStory> {
        return try {
            val captionBody: RequestBody? = caption
                ?.trim()
                ?.takeIf { it.isNotEmpty() }
                ?.toRequestBody(TEXT_MEDIA_TYPE)

            val response = api.createStory(caption = captionBody, media = media)
            loadStories(force = true)
            ApiResult.Success(response.story)
        } catch (error: Throwable) {
            val (message, code) = error.toUserMessage(gson)
            ApiResult.Error(message, code)
        }
    }

    suspend fun markStoryViewed(storyId: String): ApiResult<Unit> {
        return try {
            api.markStoryViewed(storyId)
            storiesCache = storiesCache.map { group ->
                val updatedStories = group.stories.map { story ->
                    if (story.id == storyId) story.copy(viewedByMe = true) else story
                }
                group.copy(
                    stories = updatedStories,
                    hasUnseen = updatedStories.any { !it.viewedByMe },
                )
            }
            ApiResult.Success(Unit)
        } catch (error: Throwable) {
            val (message, code) = error.toUserMessage(gson)
            ApiResult.Error(message, code)
        }
    }

    private fun NewsPost.toEntity(tenantSlug: String, gson: Gson): CachedNewsPostEntity = CachedNewsPostEntity(
        id = id,
        tenantSlug = tenantSlug,
        title = title,
        body = body,
        status = status,
        createdAt = createdAt,
        updatedAt = updatedAt,
        publishedAt = publishedAt,
        authorId = author.id,
        authorName = author.name,
        likedByMe = likedByMe,
        likesCount = likesCount,
        commentsCount = commentsCount,
        attachmentsJson = gson.toJson(attachments),
    )

    private fun CachedNewsPostEntity.toModel(gson: Gson): NewsPost {
        val attachments = runCatching {
            gson.fromJson(attachmentsJson, Array<NewsAttachment>::class.java)?.toList().orEmpty()
        }.getOrElse { emptyList() }

        return NewsPost(
            id = id,
            title = title,
            body = body,
            status = status,
            createdAt = createdAt,
            updatedAt = updatedAt,
            publishedAt = publishedAt,
            author = NewsAuthor(id = authorId, name = authorName),
            attachments = attachments,
            likedByMe = likedByMe,
            likesCount = likesCount,
            commentsCount = commentsCount,
        )
    }

    companion object {
        private val TEXT_MEDIA_TYPE = "text/plain".toMediaType()
        private const val STORIES_TTL_MS = 20_000L
        private const val FEED_TTL_MS = 30_000L
    }
}
