package ru.snt.portal.core.network

import okhttp3.MultipartBody
import okhttp3.RequestBody
import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.Header
import retrofit2.http.Multipart
import retrofit2.http.POST
import retrofit2.http.Part
import retrofit2.http.Path
import retrofit2.http.Query
import ru.snt.portal.core.model.ChatMessagesResponse
import ru.snt.portal.core.model.ChatRoomsResponse
import ru.snt.portal.core.model.ChatSendMessageRequest
import ru.snt.portal.core.model.ChatSendMessageResponse
import ru.snt.portal.core.model.LoginRequest
import ru.snt.portal.core.model.LoginResponse
import ru.snt.portal.core.model.NewsCreatePostResponse
import ru.snt.portal.core.model.NewsCreateStoryResponse
import ru.snt.portal.core.model.NewsFeedResponse
import ru.snt.portal.core.model.NewsLikeResponse
import ru.snt.portal.core.model.NewsStoriesResponse
import ru.snt.portal.core.model.NewsStoryViewResponse
import ru.snt.portal.core.model.RefreshRequest
import ru.snt.portal.core.model.TenantsResponse
import ru.snt.portal.core.model.UserEnvelopeResponse
import ru.snt.portal.core.model.WeatherResponse

interface PortalApi {
    @GET("auth/tenants")
    suspend fun getTenants(
        @Query("search") search: String? = null,
        @Query("limit") limit: Int = 100,
        @Query("offset") offset: Int = 0,
    ): TenantsResponse

    @POST("auth/login")
    suspend fun login(
        @Header("x-tenant-slug") tenantSlug: String,
        @Body body: LoginRequest,
    ): LoginResponse

    @POST("auth/refresh")
    suspend fun refresh(
        @Header("x-tenant-slug") tenantSlug: String,
        @Body body: RefreshRequest,
    ): LoginResponse

    @GET("weather/current")
    suspend fun getCurrentWeather(): WeatherResponse

    @GET("chat/rooms")
    suspend fun getChatRooms(): ChatRoomsResponse

    @GET("chat/rooms/{roomId}/messages")
    suspend fun getRoomMessages(
        @Path("roomId") roomId: String,
        @Query("limit") limit: Int = 50,
    ): ChatMessagesResponse

    @POST("chat/rooms/{roomId}/messages")
    suspend fun sendMessage(
        @Path("roomId") roomId: String,
        @Body body: ChatSendMessageRequest,
    ): ChatSendMessageResponse

    @POST("chat/rooms/{roomId}/read")
    suspend fun markRoomRead(@Path("roomId") roomId: String)

    @Multipart
    @POST("users/me/avatar")
    suspend fun uploadMyAvatar(
        @Part avatar: MultipartBody.Part,
    ): UserEnvelopeResponse

    @DELETE("users/me/avatar")
    suspend fun deleteMyAvatar(): UserEnvelopeResponse

    @GET("news/feed")
    suspend fun getNewsFeed(
        @Query("cursor") cursor: Int? = null,
        @Query("limit") limit: Int = 20,
    ): NewsFeedResponse

    @Multipart
    @POST("news/posts")
    suspend fun createPost(
        @Part("body") body: RequestBody,
        @Part media: List<MultipartBody.Part> = emptyList(),
    ): NewsCreatePostResponse

    @POST("news/posts/{postId}/likes")
    suspend fun likePost(@Path("postId") postId: Int): NewsLikeResponse

    @DELETE("news/posts/{postId}/likes")
    suspend fun unlikePost(@Path("postId") postId: Int): NewsLikeResponse

    @GET("news/stories")
    suspend fun getStories(): NewsStoriesResponse

    @Multipart
    @POST("news/stories")
    suspend fun createStory(
        @Part("caption") caption: RequestBody? = null,
        @Part media: MultipartBody.Part,
    ): NewsCreateStoryResponse

    @POST("news/stories/{storyId}/view")
    suspend fun markStoryViewed(@Path("storyId") storyId: String): NewsStoryViewResponse
}
