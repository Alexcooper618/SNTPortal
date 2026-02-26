package ru.snt.portal.core.model

data class ApiErrorPayload(
    val code: String? = null,
    val message: String? = null,
)

data class OkResponse(
    val ok: Boolean = true,
)

data class TenantItem(
    val slug: String,
    val name: String,
    val location: String? = null,
)

data class TenantsResponse(
    val items: List<TenantItem> = emptyList(),
)

data class LoginRequest(
    val phone: String,
    val password: String,
)

data class RefreshRequest(
    val refreshToken: String,
)

data class AuthUser(
    val id: Int,
    val tenantId: Int,
    val name: String,
    val phone: String,
    val role: String,
    val avatarUrl: String? = null,
    val mustChangePassword: Boolean = false,
)

data class LoginResponse(
    val user: AuthUser,
    val accessToken: String,
    val refreshToken: String,
    val mustChangePassword: Boolean? = null,
)

data class SessionState(
    val tenantSlug: String,
    val accessToken: String,
    val refreshToken: String,
    val user: AuthUser,
)

data class WeatherTenant(
    val id: Int,
    val slug: String,
    val name: String,
    val address: String? = null,
    val location: String? = null,
    val timeZone: String? = null,
)

data class WeatherCurrent(
    val temperatureC: Double,
    val weatherCode: Int? = null,
    val fetchedAt: String,
)

data class WeatherResponse(
    val tenant: WeatherTenant,
    val weather: WeatherCurrent,
)

data class ChatUnreadSummary(
    val unreadRooms: Int = 0,
    val unreadMessages: Int = 0,
)

data class ChatMessageAuthor(
    val id: Int,
    val name: String,
    val role: String,
    val avatarUrl: String? = null,
)

data class ChatReplyDto(
    val id: String,
    val bodyPreview: String,
    val authorName: String,
    val isDeleted: Boolean,
)

data class ChatMessageAttachmentDto(
    val id: String,
    val mediaType: String,
    val fileUrl: String,
    val mimeType: String,
    val sizeBytes: Long,
    val durationSec: Int,
    val width: Int? = null,
    val height: Int? = null,
)

data class ChatMessageDto(
    val id: String,
    val body: String,
    val createdAt: String,
    val updatedAt: String,
    val isEdited: Boolean,
    val editedAt: String? = null,
    val isDeleted: Boolean,
    val author: ChatMessageAuthor,
    val replyTo: ChatReplyDto? = null,
    val attachments: List<ChatMessageAttachmentDto> = emptyList(),
)

data class ChatRoomMemberUser(
    val id: Int,
    val name: String,
    val role: String,
    val avatarUrl: String? = null,
)

data class ChatRoomMember(
    val id: String,
    val user: ChatRoomMemberUser,
)

data class ChatRoomPeer(
    val id: Int,
    val name: String,
    val role: String,
    val avatarUrl: String? = null,
)

data class ChatRoomDto(
    val id: String,
    val name: String,
    val isPrivate: Boolean,
    val updatedAt: String,
    val photoUrl: String? = null,
    val isMuted: Boolean = false,
    val kind: String = if (isPrivate) "DIRECT" else "TOPIC",
    val title: String = name,
    val peer: ChatRoomPeer? = null,
    val members: List<ChatRoomMember> = emptyList(),
    val lastMessage: ChatMessageDto? = null,
    val unreadCount: Int = 0,
    val lastReadAt: String? = null,
)

data class ChatRoomsResponse(
    val items: List<ChatRoomDto> = emptyList(),
    val summary: ChatUnreadSummary = ChatUnreadSummary(),
)

data class ChatMessagesResponse(
    val room: ChatRoomDto,
    val items: List<ChatMessageDto> = emptyList(),
)

data class ChatSendMessageRequest(
    val body: String,
    val replyToMessageId: String? = null,
)

data class ChatSendMessageResponse(
    val message: ChatMessageDto,
)

data class ChatUpdateMessageRequest(
    val body: String,
)

data class ChatMediaUploadResponse(
    val message: ChatMessageDto,
)

data class ChatDirectRoomResponse(
    val room: ChatRoomDto,
)

data class ChatMuteRoomRequest(
    val muted: Boolean,
)

data class ChatMuteRoomResponse(
    val ok: Boolean,
    val roomId: String,
    val isMuted: Boolean,
)

data class ChatRoomPhotoResponse(
    val ok: Boolean,
    val roomId: String,
    val photoUrl: String? = null,
)

data class ChatContactDto(
    val id: Int,
    val name: String,
    val role: String,
    val avatarUrl: String? = null,
    val ownedPlots: List<ChatContactPlotDto> = emptyList(),
)

data class ChatContactPlotDto(
    val id: Int,
    val number: String,
)

data class ChatContactsResponse(
    val items: List<ChatContactDto> = emptyList(),
)

data class PushTokenRequest(
    val token: String,
    val platform: String = "ANDROID",
    val deviceName: String? = null,
)

data class PushTokenDeleteRequest(
    val token: String,
)

data class PushTokenDeleteResponse(
    val ok: Boolean = true,
    val removed: Int = 0,
)

data class NewsAuthor(
    val id: Int,
    val name: String,
)

data class NewsAttachment(
    val id: Int,
    val fileName: String,
    val fileUrl: String,
    val mediaType: String,
    val mimeType: String,
    val sizeBytes: Long,
    val sortOrder: Int,
)

data class NewsPost(
    val id: Int,
    val title: String,
    val body: String,
    val status: String,
    val createdAt: String,
    val updatedAt: String,
    val publishedAt: String? = null,
    val author: NewsAuthor,
    val attachments: List<NewsAttachment> = emptyList(),
    val likedByMe: Boolean = false,
    val likesCount: Int = 0,
    val commentsCount: Int = 0,
)

data class NewsFeedResponse(
    val items: List<NewsPost> = emptyList(),
    val nextCursor: Int? = null,
)

data class NewsCreatePostResponse(
    val post: NewsPost,
)

data class NewsLikeResponse(
    val liked: Boolean,
    val likesCount: Int,
)

data class NewsStory(
    val id: String,
    val caption: String? = null,
    val mediaType: String,
    val fileUrl: String,
    val createdAt: String,
    val expiresAt: String,
    val viewedByMe: Boolean,
    val viewsCount: Int,
)

data class NewsStoryGroup(
    val author: NewsAuthor,
    val stories: List<NewsStory> = emptyList(),
    val hasUnseen: Boolean,
    val lastStoryAt: String,
)

data class NewsStoriesResponse(
    val items: List<NewsStoryGroup> = emptyList(),
)

data class NewsCreateStoryResponse(
    val story: NewsStory,
)

data class NewsStoryViewResponse(
    val ok: Boolean = true,
    val viewedAt: String? = null,
)

data class UserEnvelopeResponse(
    val user: AuthUser,
)
