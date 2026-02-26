package ru.snt.portal.ui

import android.annotation.SuppressLint
import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.provider.OpenableColumns
import android.webkit.MimeTypeMap
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.VideoView
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Add
import androidx.compose.material.icons.outlined.Article
import androidx.compose.material.icons.outlined.ChatBubbleOutline
import androidx.compose.material.icons.outlined.Home
import androidx.compose.material.icons.outlined.Map
import androidx.compose.material.icons.outlined.Payments
import androidx.compose.material.icons.outlined.Person
import androidx.compose.material3.AssistChip
import androidx.compose.material3.AssistChipDefaults
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ElevatedCard
import androidx.compose.material3.ExposedDropdownMenuBox
import androidx.compose.material3.ExposedDropdownMenuDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.compose.ui.window.Dialog
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import coil.compose.AsyncImage
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaTypeOrNull
import okhttp3.MultipartBody
import okhttp3.RequestBody
import okio.BufferedSink
import java.io.IOException
import ru.snt.portal.core.model.NewsAttachment
import ru.snt.portal.core.model.NewsPost
import ru.snt.portal.core.model.NewsStoryGroup
import ru.snt.portal.core.model.SessionState
import ru.snt.portal.core.session.displayName
import ru.snt.portal.core.session.displayRole

private enum class NativeTab(val title: String) {
    Dashboard("Главная"),
    News("Новости"),
    Chat("Чат"),
    Profile("Профиль"),
}

private data class PickedMedia(
    val uri: Uri,
    val fileName: String,
    val mimeType: String,
)

private data class StoryViewerState(
    val groupIndex: Int,
)

private const val MAX_POST_MEDIA = 10

@Composable
fun NativePortalApp(
    nativeEnabled: Boolean,
    portalBaseUrl: String,
    apiBaseUrl: String,
    modifier: Modifier = Modifier,
    mainViewModel: MainViewModel = hiltViewModel(),
    loginViewModel: LoginViewModel = hiltViewModel(),
) {
    val session by mainViewModel.session.collectAsStateWithLifecycle()

    Surface(modifier = modifier.fillMaxSize()) {
        if (!nativeEnabled) {
            WebFallbackScreen(
                title = "СНТ Портал",
                initialUrl = portalBaseUrl,
                onClose = {},
                closeEnabled = false,
            )
            return@Surface
        }

        if (session == null) {
            LoginScreen(loginViewModel)
            return@Surface
        }

        PortalScaffold(
            session = session!!,
            portalBaseUrl = portalBaseUrl,
            apiBaseUrl = apiBaseUrl,
            onLogout = mainViewModel::logout,
        )
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun LoginScreen(viewModel: LoginViewModel) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    var tenantExpanded by rememberSaveable { mutableStateOf(false) }
    var tenantQuery by rememberSaveable { mutableStateOf("") }
    val selectedTenant = remember(state.tenantSlug, state.tenants) {
        state.tenants.firstOrNull { it.slug == state.tenantSlug }
    }
    val filteredTenants = remember(tenantQuery, state.tenants) {
        val query = tenantQuery.trim()
        if (query.isBlank()) {
            state.tenants
        } else {
            state.tenants.filter { tenant ->
                tenant.name.contains(query, ignoreCase = true) ||
                    tenant.slug.contains(query, ignoreCase = true)
            }
        }
    }

    LaunchedEffect(state.tenantSlug, state.tenants, tenantExpanded) {
        if (!tenantExpanded) {
            tenantQuery = selectedTenant?.name ?: state.tenantSlug
        }
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(horizontal = 20.dp, vertical = 24.dp),
        verticalArrangement = Arrangement.Center,
    ) {
        Text(
            text = "СНТ Портал",
            style = MaterialTheme.typography.headlineMedium,
            fontWeight = FontWeight.Bold,
        )
        Spacer(modifier = Modifier.height(6.dp))
        Text(
            text = "Нативный клиент v1",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Spacer(modifier = Modifier.height(20.dp))

        ExposedDropdownMenuBox(
            expanded = tenantExpanded,
            onExpandedChange = { tenantExpanded = it },
            modifier = Modifier.fillMaxWidth(),
        ) {
            OutlinedTextField(
                value = tenantQuery,
                onValueChange = { newQuery ->
                    tenantQuery = newQuery
                    viewModel.onTenantChange("")
                    tenantExpanded = true
                },
                label = { Text("СНТ") },
                placeholder = { Text("Выберите СНТ") },
                modifier = Modifier
                    .menuAnchor()
                    .fillMaxWidth(),
                singleLine = true,
                trailingIcon = {
                    ExposedDropdownMenuDefaults.TrailingIcon(expanded = tenantExpanded)
                },
            )

            DropdownMenu(
                expanded = tenantExpanded,
                onDismissRequest = { tenantExpanded = false },
            ) {
                if (filteredTenants.isEmpty()) {
                    DropdownMenuItem(
                        text = { Text("Ничего не найдено") },
                        onClick = {},
                        enabled = false,
                    )
                } else {
                    filteredTenants.forEach { tenant ->
                        DropdownMenuItem(
                            text = { Text(tenant.name, maxLines = 1, overflow = TextOverflow.Ellipsis) },
                            onClick = {
                                viewModel.onTenantChange(tenant.slug)
                                tenantQuery = tenant.name
                                tenantExpanded = false
                            },
                        )
                    }
                }
            }
        }

        Spacer(modifier = Modifier.height(12.dp))
        OutlinedTextField(
            value = state.phone,
            onValueChange = viewModel::onPhoneChange,
            label = { Text("Телефон") },
            modifier = Modifier.fillMaxWidth(),
            singleLine = true,
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone),
        )

        Spacer(modifier = Modifier.height(10.dp))
        OutlinedTextField(
            value = state.password,
            onValueChange = viewModel::onPasswordChange,
            label = { Text("Пароль") },
            modifier = Modifier.fillMaxWidth(),
            singleLine = true,
            visualTransformation = PasswordVisualTransformation(),
        )

        state.error?.let { errorText ->
            Spacer(modifier = Modifier.height(10.dp))
            Text(
                text = errorText,
                color = MaterialTheme.colorScheme.error,
                style = MaterialTheme.typography.bodyMedium,
            )
        }

        Spacer(modifier = Modifier.height(18.dp))
        Button(
            onClick = viewModel::login,
            modifier = Modifier
                .fillMaxWidth()
                .height(52.dp),
            enabled = !state.isLoading,
        ) {
            if (state.isLoading) {
                CircularProgressIndicator(modifier = Modifier.size(18.dp), strokeWidth = 2.dp)
            } else {
                Text("Войти")
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun PortalScaffold(
    session: SessionState,
    portalBaseUrl: String,
    apiBaseUrl: String,
    onLogout: () -> Unit,
    dashboardViewModel: DashboardViewModel = hiltViewModel(),
    chatViewModel: ChatViewModel = hiltViewModel(),
    newsViewModel: NewsViewModel = hiltViewModel(),
) {
    var tab by rememberSaveable { mutableStateOf(NativeTab.Dashboard) }
    var webPath by rememberSaveable { mutableStateOf<String?>(null) }

    if (webPath != null) {
        WebFallbackScreen(
            title = "Веб-раздел",
            initialUrl = "${portalBaseUrl}${webPath}",
            onClose = { webPath = null },
            closeEnabled = true,
        )
        return
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Column {
                        Text(tab.title)
                        Text(
                            text = "${session.displayName()} · ${session.displayRole()}",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                },
            )
        },
        bottomBar = {
            NavigationBar(modifier = Modifier.navigationBarsPadding()) {
                NavigationBarItem(
                    selected = tab == NativeTab.Dashboard,
                    onClick = { tab = NativeTab.Dashboard },
                    icon = { Icon(Icons.Outlined.Home, contentDescription = null) },
                    label = { Text("Главная") },
                )
                NavigationBarItem(
                    selected = tab == NativeTab.News,
                    onClick = { tab = NativeTab.News },
                    icon = { Icon(Icons.Outlined.Article, contentDescription = null) },
                    label = { Text("Новости") },
                )
                NavigationBarItem(
                    selected = tab == NativeTab.Chat,
                    onClick = { tab = NativeTab.Chat },
                    icon = { Icon(Icons.Outlined.ChatBubbleOutline, contentDescription = null) },
                    label = { Text("Чат") },
                )
                NavigationBarItem(
                    selected = tab == NativeTab.Profile,
                    onClick = { tab = NativeTab.Profile },
                    icon = { Icon(Icons.Outlined.Person, contentDescription = null) },
                    label = { Text("Профиль") },
                )
            }
        },
    ) { padding ->
        AnimatedContent(
            targetState = tab,
            transitionSpec = {
                fadeIn(animationSpec = tween(180)) togetherWith fadeOut(animationSpec = tween(140))
            },
            modifier = Modifier
                .fillMaxSize()
                .padding(padding),
            label = "tab-content",
        ) { targetTab ->
            when (targetTab) {
                NativeTab.Dashboard -> DashboardScreen(
                    viewModel = dashboardViewModel,
                    onOpenWebSection = { path -> webPath = path },
                )

                NativeTab.News -> NewsScreen(viewModel = newsViewModel, apiBaseUrl = apiBaseUrl)
                NativeTab.Chat -> ChatScreen(viewModel = chatViewModel, currentUserId = session.user.id)
                NativeTab.Profile -> ProfileScreen(
                    session = session,
                    onLogout = onLogout,
                    onOpenWebSection = { path -> webPath = path },
                )
            }
        }
    }
}

@Composable
private fun DashboardScreen(
    viewModel: DashboardViewModel,
    onOpenWebSection: (String) -> Unit,
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()

    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item {
            ElevatedCard(
                shape = RoundedCornerShape(22.dp),
                colors = CardDefaults.elevatedCardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant),
            ) {
                Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("Панель жителя", style = MaterialTheme.typography.labelLarge)
                    Text(
                        "Добро пожаловать",
                        style = MaterialTheme.typography.headlineSmall,
                        fontWeight = FontWeight.Bold,
                    )

                    if (state.loading) {
                        CircularProgressIndicator(modifier = Modifier.size(22.dp), strokeWidth = 2.dp)
                    } else if (state.weather != null) {
                        val weather = state.weather!!
                        Text(
                            "${weather.tenant.name}, ${weather.tenant.location ?: weather.tenant.address ?: ""}",
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                        Text(
                            "${weather.weather.temperatureC.toInt()}°C",
                            style = MaterialTheme.typography.displaySmall,
                            fontWeight = FontWeight.Bold,
                        )
                    }

                    state.error?.let { errorText ->
                        Text(errorText, color = MaterialTheme.colorScheme.error)
                    }

                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Button(onClick = { onOpenWebSection("/payments") }) {
                            Icon(Icons.Outlined.Payments, contentDescription = null)
                            Spacer(modifier = Modifier.size(6.dp))
                            Text("Оплатить")
                        }
                        OutlinedButton(onClick = { onOpenWebSection("/incidents") }) {
                            Text("Обращения")
                        }
                    }
                }
            }
        }

        item {
            TextButton(onClick = { viewModel.refresh(force = true) }) {
                Text("Обновить данные")
            }
        }
    }
}

@Composable
private fun ChatScreen(viewModel: ChatViewModel, currentUserId: Int) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()

    Column(modifier = Modifier.fillMaxSize()) {
        LazyRow(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 12.dp, vertical = 10.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            items(state.rooms, key = { it.id }) { room ->
                val selected = room.id == state.selectedRoomId
                AssistChip(
                    onClick = { viewModel.selectRoom(room.id) },
                    label = {
                        Text(
                            if (room.unreadCount > 0) "${room.name} · ${room.unreadCount}" else room.name,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                    },
                    colors = if (selected) {
                        AssistChipDefaults.assistChipColors(
                            containerColor = MaterialTheme.colorScheme.primary.copy(alpha = 0.3f),
                        )
                    } else {
                        AssistChipDefaults.assistChipColors()
                    },
                )
            }
        }

        if ((state.roomLoading && state.rooms.isEmpty()) || (state.messagesLoading && state.messages.isEmpty())) {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(vertical = 6.dp),
                contentAlignment = Alignment.Center,
            ) {
                CircularProgressIndicator(modifier = Modifier.size(20.dp), strokeWidth = 2.dp)
            }
        }

        LazyColumn(
            modifier = Modifier
                .weight(1f)
                .fillMaxWidth()
                .padding(horizontal = 12.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
            reverseLayout = false,
        ) {
            items(state.messages, key = { it.id }) { message ->
                val mine = message.author.id == currentUserId
                MessageBubble(
                    author = message.author.name,
                    body = message.body,
                    createdAt = message.createdAt,
                    mine = mine,
                )
            }
        }

        state.error?.let { errorText ->
            Text(
                text = errorText,
                color = MaterialTheme.colorScheme.error,
                modifier = Modifier.padding(horizontal = 12.dp, vertical = 4.dp),
            )
        }

        Row(
            modifier = Modifier
                .fillMaxWidth()
                .navigationBarsPadding()
                .imePadding()
                .padding(12.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            OutlinedTextField(
                value = state.draftMessage,
                onValueChange = viewModel::onDraftChanged,
                modifier = Modifier
                    .weight(1f)
                    .height(56.dp),
                placeholder = { Text("Сообщение") },
                singleLine = true,
            )
            Button(
                onClick = viewModel::sendMessage,
                enabled = !state.sending,
                modifier = Modifier.height(56.dp),
            ) {
                if (state.sending) {
                    CircularProgressIndicator(modifier = Modifier.size(16.dp), strokeWidth = 2.dp)
                } else {
                    Text("Отправить")
                }
            }
        }
    }
}

@Composable
private fun MessageBubble(
    author: String,
    body: String,
    createdAt: String,
    mine: Boolean,
) {
    val bg = if (mine) MaterialTheme.colorScheme.primary.copy(alpha = 0.26f) else MaterialTheme.colorScheme.surfaceVariant

    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = if (mine) Arrangement.End else Arrangement.Start,
    ) {
        Card(
            shape = RoundedCornerShape(18.dp),
            colors = CardDefaults.cardColors(containerColor = bg),
            modifier = Modifier.fillMaxWidth(0.76f),
        ) {
            Column(modifier = Modifier.padding(horizontal = 12.dp, vertical = 8.dp)) {
                if (!mine) {
                    Text(
                        author,
                        style = MaterialTheme.typography.labelMedium,
                        color = MaterialTheme.colorScheme.primary,
                    )
                    Spacer(modifier = Modifier.height(4.dp))
                }
                Text(body, style = MaterialTheme.typography.bodyLarge)
                Spacer(modifier = Modifier.height(4.dp))
                Text(
                    text = createdAt.replace("T", " ").take(16),
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}

@Composable
private fun NewsScreen(
    viewModel: NewsViewModel,
    apiBaseUrl: String,
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    val context = LocalContext.current
    val coroutineScope = rememberCoroutineScope()

    val postMedia = remember { mutableStateListOf<PickedMedia>() }
    var storyMedia by remember { mutableStateOf<PickedMedia?>(null) }
    var storyCaption by rememberSaveable { mutableStateOf("") }
    var storyViewer by remember { mutableStateOf<StoryViewerState?>(null) }

    val postPicker = rememberLauncherForActivityResult(ActivityResultContracts.OpenMultipleDocuments()) { uris ->
        uris.mapNotNull { uri -> context.resolvePickedMedia(uri) }
            .forEach { item ->
                if (postMedia.size >= MAX_POST_MEDIA) {
                    return@forEach
                }
                if (postMedia.none { it.uri == item.uri }) {
                    postMedia.add(item)
                }
            }
    }

    val storyPicker = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        storyMedia = uri?.let { context.resolvePickedMedia(it) }
    }

    LaunchedEffect(state.notice) {
        when (state.notice) {
            "Пост опубликован" -> {
                postMedia.clear()
                viewModel.clearNotice()
            }

            "История опубликована" -> {
                storyMedia = null
                storyCaption = ""
                viewModel.clearNotice()
            }
        }
    }

    val activeGroup = remember(storyViewer, state.stories) {
        storyViewer?.let { state.stories.getOrNull(it.groupIndex) }
    }

    if (activeGroup != null) {
        StoryViewerDialog(
            group = activeGroup,
            apiBaseUrl = apiBaseUrl,
            onClose = { storyViewer = null },
            onMarkViewed = viewModel::markStoryViewed,
        )
    }

    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item {
            ElevatedCard {
                Column(
                    modifier = Modifier.padding(12.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                        AssistChip(
                            onClick = { storyPicker.launch(arrayOf("image/*", "video/*")) },
                            label = { Text("Ваша история") },
                            leadingIcon = {
                                Icon(Icons.Outlined.Add, contentDescription = null)
                            },
                        )
                        if (state.publishingStory) {
                            CircularProgressIndicator(modifier = Modifier.size(18.dp), strokeWidth = 2.dp)
                        }
                    }

                    if (storyMedia != null) {
                        Text(
                            storyMedia!!.fileName,
                            style = MaterialTheme.typography.bodySmall,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                        OutlinedTextField(
                            value = storyCaption,
                            onValueChange = { storyCaption = it },
                            modifier = Modifier.fillMaxWidth(),
                            label = { Text("Подпись к истории") },
                            singleLine = true,
                        )
                        Button(
                            onClick = {
                                val media = storyMedia ?: return@Button
                                coroutineScope.launch {
                                    val part = buildMultipartPart(context, media, "media")
                                    if (part != null) {
                                        viewModel.publishStory(part, caption = storyCaption)
                                    }
                                }
                            },
                            enabled = !state.publishingStory,
                            modifier = Modifier.fillMaxWidth(),
                        ) {
                            Text("Опубликовать историю")
                        }
                    }

                    if (state.loadingStories && state.stories.isEmpty()) {
                        CircularProgressIndicator(modifier = Modifier.size(18.dp), strokeWidth = 2.dp)
                    }

                    LazyRow(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        items(state.stories.indices.toList(), key = { index -> state.stories[index].author.id }) { index ->
                            val group = state.stories[index]
                            StoryChip(
                                group = group,
                                apiBaseUrl = apiBaseUrl,
                                onClick = { storyViewer = StoryViewerState(groupIndex = index) },
                            )
                        }
                    }
                }
            }
        }

        item {
            ElevatedCard {
                Column(
                    modifier = Modifier.padding(12.dp),
                    verticalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    OutlinedTextField(
                        value = state.postDraft,
                        onValueChange = viewModel::onPostDraftChanged,
                        modifier = Modifier.fillMaxWidth(),
                        minLines = 3,
                        label = { Text("Новый пост") },
                    )

                    if (postMedia.isNotEmpty()) {
                        LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            items(postMedia, key = { it.uri.toString() }) { media ->
                                PostMediaPreview(
                                    media = media,
                                    onRemove = { postMedia.remove(media) },
                                )
                            }
                        }
                    }

                    Text(
                        text = "До $MAX_POST_MEDIA фото/видео в одном посте",
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )

                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        OutlinedButton(
                            onClick = { postPicker.launch(arrayOf("image/*", "video/*")) },
                            modifier = Modifier.weight(1f),
                            enabled = !state.publishing && postMedia.size < MAX_POST_MEDIA,
                        ) {
                            Text(if (postMedia.size >= MAX_POST_MEDIA) "Лимит достигнут" else "Добавить медиа")
                        }
                        Button(
                            onClick = {
                                coroutineScope.launch {
                                    val parts = buildMultipartParts(context, postMedia, "media")
                                    viewModel.publishPost(parts)
                                }
                            },
                            enabled = !state.publishing,
                            modifier = Modifier.weight(1f),
                        ) {
                            if (state.publishing) {
                                CircularProgressIndicator(modifier = Modifier.size(16.dp), strokeWidth = 2.dp)
                            } else {
                                Text("Опубликовать")
                            }
                        }
                    }
                }
            }
        }

        state.error?.let { errorText ->
            item {
                Text(errorText, color = MaterialTheme.colorScheme.error)
            }
        }

        items(state.feed, key = { it.id }) { post ->
            NewsPostCard(
                post = post,
                apiBaseUrl = apiBaseUrl,
                onToggleLike = { viewModel.toggleLike(post) },
            )
        }

        if (state.loadingFeed) {
            item {
                Box(modifier = Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator()
                }
            }
        }
    }
}

@Composable
private fun StoryChip(
    group: NewsStoryGroup,
    apiBaseUrl: String,
    onClick: () -> Unit,
) {
    val firstStory = group.stories.firstOrNull()
    val previewUrl = firstStory?.let { resolveMediaUrl(apiBaseUrl, it.fileUrl) }

    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        modifier = Modifier.clickable(onClick = onClick),
    ) {
        Box(
            modifier = Modifier
                .size(62.dp)
                .clip(CircleShape)
                .background(
                    if (group.hasUnseen) MaterialTheme.colorScheme.primary
                    else MaterialTheme.colorScheme.surfaceVariant,
                ),
            contentAlignment = Alignment.Center,
        ) {
            if (firstStory != null && firstStory.mediaType == "IMAGE" && previewUrl != null) {
                AsyncImage(
                    model = previewUrl,
                    contentDescription = group.author.name,
                    modifier = Modifier.fillMaxSize(),
                    contentScale = ContentScale.Crop,
                )
            } else {
                Text(group.author.name.take(1), color = MaterialTheme.colorScheme.onPrimary)
            }
        }
        Spacer(modifier = Modifier.height(4.dp))
        Text(
            group.author.name,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            style = MaterialTheme.typography.labelSmall,
            modifier = Modifier.size(width = 72.dp, height = 16.dp),
        )
    }
}

@Composable
private fun PostMediaPreview(
    media: PickedMedia,
    onRemove: () -> Unit,
) {
    ElevatedCard(
        modifier = Modifier.size(width = 140.dp, height = 92.dp),
        shape = RoundedCornerShape(12.dp),
    ) {
        Column(modifier = Modifier.fillMaxSize().padding(8.dp), verticalArrangement = Arrangement.SpaceBetween) {
            Text(
                text = if (media.mimeType.startsWith("image/")) "Фото" else "Видео",
                style = MaterialTheme.typography.labelMedium,
            )
            Text(
                text = media.fileName,
                style = MaterialTheme.typography.bodySmall,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
            )
            TextButton(onClick = onRemove) {
                Text("Убрать")
            }
        }
    }
}

@Composable
private fun StoryViewerDialog(
    group: NewsStoryGroup,
    apiBaseUrl: String,
    onClose: () -> Unit,
    onMarkViewed: (String) -> Unit,
) {
    var activeIndex by remember(group.author.id) { mutableIntStateOf(0) }
    val story = group.stories.getOrNull(activeIndex)

    if (story == null) {
        onClose()
        return
    }

    LaunchedEffect(story.id) {
        onMarkViewed(story.id)
    }

    Dialog(onDismissRequest = onClose) {
        Surface(
            modifier = Modifier.fillMaxSize(),
            color = Color(0xFF030814),
        ) {
            Column(modifier = Modifier.fillMaxSize().padding(12.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(
                        text = group.author.name,
                        style = MaterialTheme.typography.titleLarge,
                        color = Color.White,
                    )
                    TextButton(onClick = onClose) {
                        Text("Закрыть")
                    }
                }

                StoryMedia(
                    mediaType = story.mediaType,
                    mediaUrl = resolveMediaUrl(apiBaseUrl, story.fileUrl),
                    modifier = Modifier
                        .fillMaxWidth()
                        .weight(1f),
                )

                if (!story.caption.isNullOrBlank()) {
                    Text(story.caption, color = Color.White)
                }

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                ) {
                    OutlinedButton(
                        onClick = {
                            if (activeIndex > 0) activeIndex -= 1
                        },
                        enabled = activeIndex > 0,
                    ) {
                        Text("Назад")
                    }

                    Text(
                        text = "${activeIndex + 1} / ${group.stories.size}",
                        color = Color.White,
                        modifier = Modifier.align(Alignment.CenterVertically),
                    )

                    OutlinedButton(
                        onClick = {
                            if (activeIndex < group.stories.lastIndex) {
                                activeIndex += 1
                            } else {
                                onClose()
                            }
                        },
                    ) {
                        Text(if (activeIndex < group.stories.lastIndex) "Далее" else "Готово")
                    }
                }
            }
        }
    }
}

@Composable
private fun StoryMedia(
    mediaType: String,
    mediaUrl: String,
    modifier: Modifier = Modifier,
) {
    if (mediaType == "VIDEO") {
        AndroidView(
            modifier = modifier,
            factory = { context ->
                VideoView(context).apply {
                    setVideoURI(Uri.parse(mediaUrl))
                    setOnPreparedListener { player ->
                        player.isLooping = true
                        start()
                    }
                }
            },
            update = { videoView ->
                if (videoView.tag != mediaUrl) {
                    videoView.tag = mediaUrl
                    videoView.setVideoURI(Uri.parse(mediaUrl))
                    videoView.setOnPreparedListener { player ->
                        player.isLooping = true
                        videoView.start()
                    }
                }
            },
        )
    } else {
        AsyncImage(
            model = mediaUrl,
            contentDescription = null,
            modifier = modifier,
            contentScale = ContentScale.Fit,
        )
    }
}

@Composable
private fun NewsPostCard(
    post: NewsPost,
    apiBaseUrl: String,
    onToggleLike: () -> Unit,
) {
    ElevatedCard(modifier = Modifier.fillMaxWidth()) {
        Column(modifier = Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text(post.author.name, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
            Text(post.createdAt.replace("T", " ").take(16), style = MaterialTheme.typography.labelSmall)
            Text(post.body)

            if (post.attachments.isNotEmpty()) {
                NewsMediaStrip(attachments = post.attachments, apiBaseUrl = apiBaseUrl)
            }

            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                AssistChip(
                    onClick = onToggleLike,
                    label = { Text(if (post.likedByMe) "♥ ${post.likesCount}" else "♡ ${post.likesCount}") },
                )
                AssistChip(
                    onClick = {},
                    label = { Text("💬 ${post.commentsCount}") },
                )
            }
        }
    }
}

@Composable
private fun NewsMediaStrip(
    attachments: List<NewsAttachment>,
    apiBaseUrl: String,
) {
    LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        items(attachments, key = { it.id }) { attachment ->
            val mediaUrl = remember(attachment.fileUrl, apiBaseUrl) {
                resolveMediaUrl(apiBaseUrl, attachment.fileUrl)
            }

            Box(
                modifier = Modifier
                    .size(width = 180.dp, height = 120.dp)
                    .clip(RoundedCornerShape(14.dp))
                    .background(MaterialTheme.colorScheme.surfaceVariant),
            ) {
                if (attachment.mediaType == "IMAGE") {
                    AsyncImage(
                        model = mediaUrl,
                        contentDescription = attachment.fileName,
                        modifier = Modifier.fillMaxSize(),
                        contentScale = ContentScale.Crop,
                    )
                } else {
                    Column(
                        modifier = Modifier
                            .fillMaxSize()
                            .padding(10.dp),
                        verticalArrangement = Arrangement.SpaceBetween,
                    ) {
                        Text("Видео", style = MaterialTheme.typography.labelLarge)
                        Text(
                            attachment.fileName,
                            maxLines = 2,
                            overflow = TextOverflow.Ellipsis,
                            style = MaterialTheme.typography.bodySmall,
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun ProfileScreen(
    session: SessionState,
    onLogout: () -> Unit,
    onOpenWebSection: (String) -> Unit,
) {
    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item {
            ElevatedCard {
                Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text(session.displayName(), style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
                    Text(session.user.phone, style = MaterialTheme.typography.bodyMedium)
                    Text(session.displayRole(), style = MaterialTheme.typography.labelLarge)
                }
            }
        }

        item {
            Text("Web fallback разделы", style = MaterialTheme.typography.titleMedium)
        }

        item {
            FallbackLinkRow(icon = Icons.Outlined.Payments, title = "Платежи", onClick = { onOpenWebSection("/payments") })
        }
        item {
            FallbackLinkRow(icon = Icons.Outlined.Map, title = "Карта", onClick = { onOpenWebSection("/map") })
        }
        item {
            FallbackLinkRow(icon = Icons.Outlined.Article, title = "Документы", onClick = { onOpenWebSection("/documents") })
        }

        item {
            Button(
                onClick = onLogout,
                modifier = Modifier
                    .fillMaxWidth()
                    .height(48.dp),
            ) {
                Text("Выйти")
            }
        }
    }
}

@Composable
private fun FallbackLinkRow(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    title: String,
    onClick: () -> Unit,
) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick),
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 14.dp, vertical = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            Icon(icon, contentDescription = null)
            Text(title, style = MaterialTheme.typography.bodyLarge)
        }
    }
}

@SuppressLint("SetJavaScriptEnabled")
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun WebFallbackScreen(
    title: String,
    initialUrl: String,
    onClose: () -> Unit,
    closeEnabled: Boolean,
) {
    val context = LocalContext.current
    var loading by remember { mutableStateOf(true) }

    Column(modifier = Modifier.fillMaxSize()) {
        TopAppBar(
            title = { Text(title) },
            navigationIcon = {
                if (closeEnabled) {
                    TextButton(onClick = onClose) {
                        Text("Назад")
                    }
                }
            },
        )

        Box(modifier = Modifier.fillMaxSize()) {
            AndroidView(
                factory = {
                    WebView(it).apply {
                        settings.javaScriptEnabled = true
                        settings.domStorageEnabled = true
                        settings.databaseEnabled = true
                        settings.cacheMode = WebSettings.LOAD_DEFAULT
                        settings.mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
                        settings.allowFileAccess = false
                        settings.allowContentAccess = false

                        webViewClient = object : WebViewClient() {
                            override fun shouldOverrideUrlLoading(
                                view: WebView,
                                request: WebResourceRequest,
                            ): Boolean {
                                val uri = request.url
                                val scheme = uri.scheme ?: return false
                                if (scheme == "http" || scheme == "https") return false
                                return try {
                                    context.startActivity(Intent(Intent.ACTION_VIEW, uri))
                                    true
                                } catch (_: ActivityNotFoundException) {
                                    false
                                }
                            }

                            override fun onPageFinished(view: WebView?, url: String?) {
                                loading = false
                            }
                        }

                        loadUrl(initialUrl)
                    }
                },
                update = {
                    if (it.url != initialUrl) {
                        loading = true
                        it.loadUrl(initialUrl)
                    }
                },
                modifier = Modifier.fillMaxSize(),
            )

            if (loading) {
                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .background(Color.Black.copy(alpha = 0.2f)),
                    contentAlignment = Alignment.Center,
                ) {
                    CircularProgressIndicator()
                }
            }
        }
    }
}

private fun resolveMediaUrl(apiBaseUrl: String, fileUrl: String): String {
    if (fileUrl.startsWith("http://") || fileUrl.startsWith("https://")) {
        return fileUrl
    }
    val base = apiBaseUrl.removeSuffix("/")
    val origin = if (base.endsWith("/api/v1")) base.removeSuffix("/api/v1") else base
    return "$origin${if (fileUrl.startsWith("/")) "" else "/"}$fileUrl"
}

private fun Context.resolvePickedMedia(uri: Uri): PickedMedia? {
    val mime = contentResolver.getType(uri) ?: guessMimeType(uri)
    val fileName = queryDisplayName(uri) ?: "media_${System.currentTimeMillis()}"
    if (!mime.startsWith("image/") && !mime.startsWith("video/")) {
        return null
    }
    return PickedMedia(uri = uri, fileName = fileName, mimeType = mime)
}

private fun Context.queryDisplayName(uri: Uri): String? {
    return runCatching {
        contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { cursor ->
            val index = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME)
            if (index >= 0 && cursor.moveToFirst()) cursor.getString(index) else null
        }
    }.getOrNull()
}

private fun Context.guessMimeType(uri: Uri): String {
    val extension = MimeTypeMap.getFileExtensionFromUrl(uri.toString())
    val fromExt = extension?.let { MimeTypeMap.getSingleton().getMimeTypeFromExtension(it.lowercase()) }
    return fromExt ?: "application/octet-stream"
}

private suspend fun buildMultipartParts(
    context: Context,
    media: List<PickedMedia>,
    fieldName: String,
): List<MultipartBody.Part> = withContext(Dispatchers.IO) {
    media.take(MAX_POST_MEDIA).mapNotNull { picked -> buildMultipartPart(context, picked, fieldName) }
}

private suspend fun buildMultipartPart(
    context: Context,
    media: PickedMedia,
    fieldName: String,
): MultipartBody.Part? = withContext(Dispatchers.IO) {
    val requestBody = context.createUriRequestBody(media.uri, media.mimeType) ?: return@withContext null
    MultipartBody.Part.createFormData(fieldName, media.fileName, requestBody)
}

private fun Context.createUriRequestBody(uri: Uri, mimeType: String): RequestBody? {
    val resolver = contentResolver
    val resolvedContentType = mimeType.toMediaTypeOrNull()
    val resolvedContentLength = querySize(uri)

    return object : RequestBody() {
        override fun contentType() = resolvedContentType

        override fun contentLength(): Long = resolvedContentLength

        override fun writeTo(sink: BufferedSink) {
            resolver.openInputStream(uri)?.use { input ->
                val buffer = ByteArray(DEFAULT_BUFFER_SIZE)
                while (true) {
                    val read = input.read(buffer)
                    if (read == -1) break
                    sink.write(buffer, 0, read)
                }
            } ?: throw IOException("Не удалось открыть файл для загрузки")
        }
    }
}

private fun Context.querySize(uri: Uri): Long {
    return runCatching {
        contentResolver.query(uri, arrayOf(OpenableColumns.SIZE), null, null, null)?.use { cursor ->
            val index = cursor.getColumnIndex(OpenableColumns.SIZE)
            if (index >= 0 && cursor.moveToFirst()) cursor.getLong(index) else -1L
        }
    }.getOrNull() ?: -1L
}
