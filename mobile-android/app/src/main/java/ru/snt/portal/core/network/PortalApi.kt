package ru.snt.portal.core.network

import okhttp3.MultipartBody
import okhttp3.RequestBody
import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.Header
import retrofit2.http.HTTP
import retrofit2.http.Multipart
import retrofit2.http.PATCH
import retrofit2.http.POST
import retrofit2.http.Part
import retrofit2.http.Path
import retrofit2.http.Query
import ru.snt.portal.core.model.BillingBalanceMeResponse
import ru.snt.portal.core.model.BillingSntBalanceResponse
import ru.snt.portal.core.model.ChatContactsResponse
import ru.snt.portal.core.model.ChatDirectRoomResponse
import ru.snt.portal.core.model.ChatMessagesResponse
import ru.snt.portal.core.model.ChatMediaUploadResponse
import ru.snt.portal.core.model.ChatMuteRoomRequest
import ru.snt.portal.core.model.ChatMuteRoomResponse
import ru.snt.portal.core.model.ChatRoomPhotoResponse
import ru.snt.portal.core.model.ChatRoomsResponse
import ru.snt.portal.core.model.ChatSendMessageRequest
import ru.snt.portal.core.model.ChatSendMessageResponse
import ru.snt.portal.core.model.ChatUpdateMessageRequest
import ru.snt.portal.core.model.LoginRequest
import ru.snt.portal.core.model.LoginResponse
import ru.snt.portal.core.model.NewsCreatePostResponse
import ru.snt.portal.core.model.NewsCreateStoryResponse
import ru.snt.portal.core.model.NewsFeedResponse
import ru.snt.portal.core.model.NewsLikeResponse
import ru.snt.portal.core.model.NewsStoriesResponse
import ru.snt.portal.core.model.NewsStoryViewResponse
import ru.snt.portal.core.model.OkResponse
import ru.snt.portal.core.model.PushTokenDeleteRequest
import ru.snt.portal.core.model.PushTokenDeleteResponse
import ru.snt.portal.core.model.PushTokenRequest
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

    @GET("billing/balance/me")
    suspend fun getMyBillingBalance(): BillingBalanceMeResponse

    @GET("billing/balance/snt")
    suspend fun getSntBillingBalance(): BillingSntBalanceResponse

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

    @PATCH("chat/messages/{messageId}")
    suspend fun editMessage(
        @Path("messageId") messageId: String,
        @Body body: ChatUpdateMessageRequest,
    ): ChatSendMessageResponse

    @DELETE("chat/messages/{messageId}")
    suspend fun deleteMessage(
        @Path("messageId") messageId: String,
    ): OkResponse

    @Multipart
    @POST("chat/rooms/{roomId}/messages/media")
    suspend fun sendMediaMessage(
        @Path("roomId") roomId: String,
        @Part("kind") kind: RequestBody,
        @Part("durationSec") durationSec: RequestBody,
        @Part("width") width: RequestBody? = null,
        @Part("height") height: RequestBody? = null,
        @Part("caption") caption: RequestBody? = null,
        @Part("replyToMessageId") replyToMessageId: RequestBody? = null,
        @Part media: MultipartBody.Part,
    ): ChatMediaUploadResponse

    @PATCH("chat/rooms/{roomId}/notifications")
    suspend fun setRoomMute(
        @Path("roomId") roomId: String,
        @Body body: ChatMuteRoomRequest,
    ): ChatMuteRoomResponse

    @Multipart
    @POST("chat/rooms/{roomId}/photo")
    suspend fun uploadTopicPhoto(
        @Path("roomId") roomId: String,
        @Part photo: MultipartBody.Part,
    ): ChatRoomPhotoResponse

    @DELETE("chat/rooms/{roomId}/photo")
    suspend fun deleteTopicPhoto(
        @Path("roomId") roomId: String,
    ): ChatRoomPhotoResponse

    @GET("chat/contacts")
    suspend fun getChatContacts(): ChatContactsResponse

    @POST("chat/direct/{userId}")
    suspend fun openDirectRoom(
        @Path("userId") userId: Int,
    ): ChatDirectRoomResponse

    @POST("chat/rooms/{roomId}/read")
    suspend fun markRoomRead(@Path("roomId") roomId: String)

    @POST("users/me/push-token")
    suspend fun registerPushToken(
        @Body body: PushTokenRequest,
    ): OkResponse

    @HTTP(method = "DELETE", path = "users/me/push-token", hasBody = true)
    suspend fun unregisterPushToken(
        @Body body: PushTokenDeleteRequest,
    ): PushTokenDeleteResponse

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
