package ru.snt.portal

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.core.app.NotificationCompat
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import dagger.hilt.android.AndroidEntryPoint
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import ru.snt.portal.core.repository.NotificationsRepository
import javax.inject.Inject

@AndroidEntryPoint
class PortalFirebaseMessagingService : FirebaseMessagingService() {

    @Inject
    lateinit var notificationsRepository: NotificationsRepository

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    override fun onNewToken(token: String) {
        super.onNewToken(token)
        scope.launch {
            notificationsRepository.registerPushToken(
                token = token,
                deviceName = "${Build.MANUFACTURER} ${Build.MODEL}",
            )
        }
    }

    override fun onMessageReceived(remoteMessage: RemoteMessage) {
        super.onMessageReceived(remoteMessage)

        val roomId = remoteMessage.data["roomId"]?.trim().orEmpty()
        if (roomId.isBlank()) return

        val title = remoteMessage.notification?.title
            ?: remoteMessage.data["title"]
            ?: "СНТ Портал"
        val body = remoteMessage.notification?.body
            ?: remoteMessage.data["body"]
            ?: "Новое сообщение в чате"

        val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        ensureChatChannel(manager)

        val intent = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP
            putExtra(MainActivity.EXTRA_CHAT_ROOM_ID, roomId)
        }
        val pendingIntent = PendingIntent.getActivity(
            this,
            roomId.hashCode(),
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )

        val notification = NotificationCompat.Builder(this, CHAT_CHANNEL_ID)
            .setSmallIcon(android.R.drawable.stat_notify_chat)
            .setContentTitle(title)
            .setContentText(body)
            .setAutoCancel(true)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setContentIntent(pendingIntent)
            .build()

        manager.notify(roomId.hashCode(), notification)
    }

    private fun ensureChatChannel(manager: NotificationManager) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val existing = manager.getNotificationChannel(CHAT_CHANNEL_ID)
        if (existing != null) return

        val channel = NotificationChannel(
            CHAT_CHANNEL_ID,
            "Сообщения чата",
            NotificationManager.IMPORTANCE_HIGH,
        ).apply {
            description = "Уведомления о новых сообщениях и ответах"
        }
        manager.createNotificationChannel(channel)
    }

    companion object {
        private const val CHAT_CHANNEL_ID = "chat_messages"
    }
}
