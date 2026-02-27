package ru.snt.portal.ui

import android.Manifest
import android.annotation.SuppressLint
import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import android.os.Build
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
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.ExperimentalFoundationApi
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
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Add
import androidx.compose.material.icons.outlined.Bedtime
import androidx.compose.material.icons.outlined.BlurOn
import androidx.compose.material.icons.outlined.Bolt
import androidx.compose.material.icons.outlined.Article
import androidx.compose.material.icons.outlined.Cloud
import androidx.compose.material.icons.outlined.CameraAlt
import androidx.compose.material.icons.outlined.ChatBubbleOutline
import androidx.compose.material.icons.outlined.Delete
import androidx.compose.material.icons.outlined.Home
import androidx.compose.material.icons.outlined.Map
import androidx.compose.material.icons.outlined.AttachFile
import androidx.compose.material.icons.outlined.Notifications
import androidx.compose.material.icons.outlined.NotificationsOff
import androidx.compose.material.icons.outlined.Payments
import androidx.compose.material.icons.outlined.Person
import androidx.compose.material.icons.outlined.WbSunny
import androidx.compose.material3.AssistChip
import androidx.compose.material3.AssistChipDefaults
import androidx.compose.material3.Badge
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
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
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
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
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
import okhttp3.RequestBody.Companion.toRequestBody
import okio.BufferedSink
import java.io.ByteArrayOutputStream
import java.io.IOException
import java.text.NumberFormat
import java.time.ZoneId
import java.time.ZonedDateTime
import java.util.Locale
import kotlin.math.roundToInt
import ru.snt.portal.core.model.NewsAttachment
import ru.snt.portal.core.model.NewsPost
import ru.snt.portal.core.model.NewsStoryGroup
import ru.snt.portal.core.model.SessionState
import ru.snt.portal.core.model.ChatRoomDto
import ru.snt.portal.core.session.displayName
import ru.snt.portal.core.session.displayRole
import ru.snt.portal.ui.components.PhoneField

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
private const val CHAT_IMAGE_MAX_DIMENSION_PX = 1920
private const val CHAT_IMAGE_TARGET_MAX_BYTES = 2_500_000

@Composable
fun NativePortalApp(
    nativeEnabled: Boolean,
    portalBaseUrl: String,
    apiBaseUrl: String,
    launchChatRoomId: String? = null,
    launchRequestId: Long = 0L,
    modifier: Modifier = Modifier,
    mainViewModel: MainViewModel = hiltViewModel(),
    loginViewModel: LoginViewModel = hiltViewModel(),
) {
    val session by mainViewModel.session.collectAsStateWithLifecycle()
    val notificationsPermissionLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission(),
    ) { }

    LaunchedEffect(session?.user?.id) {
        if (session != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            notificationsPermissionLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
        }
        mainViewModel.syncPushToken(session)
    }

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
            launchChatRoomId = launchChatRoomId,
            launchRequestId = launchRequestId,
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
        PhoneField(
            value = state.phone,
            onValueChange = viewModel::onPhoneChange,
            modifier = Modifier.fillMaxWidth(),
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

@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
private fun PortalScaffold(
    session: SessionState,
    portalBaseUrl: String,
    apiBaseUrl: String,
    launchChatRoomId: String?,
    launchRequestId: Long,
    onLogout: () -> Unit,
    dashboardViewModel: DashboardViewModel = hiltViewModel(),
    chatViewModel: ChatViewModel = hiltViewModel(),
    newsViewModel: NewsViewModel = hiltViewModel(),
    profileViewModel: ProfileViewModel = hiltViewModel(),
) {
    var tab by rememberSaveable { mutableStateOf(NativeTab.Dashboard) }
    var webPath by rememberSaveable { mutableStateOf<String?>(null) }
    var showSntBalanceDetails by rememberSaveable { mutableStateOf(false) }
    var pendingChatDeepLinkRoomId by rememberSaveable(launchRequestId) {
        mutableStateOf(launchChatRoomId)
    }

    LaunchedEffect(launchRequestId, launchChatRoomId) {
        if (!launchChatRoomId.isNullOrBlank()) {
            tab = NativeTab.Chat
            pendingChatDeepLinkRoomId = launchChatRoomId
        }
    }

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
                    userName = session.user.name,
                    onOpenChat = { tab = NativeTab.Chat },
                    onOpenSntBalanceDetails = { showSntBalanceDetails = true },
                )

                NativeTab.News -> NewsScreen(viewModel = newsViewModel, apiBaseUrl = apiBaseUrl)
                NativeTab.Chat -> ChatScreen(
                    viewModel = chatViewModel,
                    currentUserId = session.user.id,
                    apiBaseUrl = apiBaseUrl,
                    deepLinkRoomId = pendingChatDeepLinkRoomId,
                    deepLinkRequestId = launchRequestId,
                    onDeepLinkConsumed = {
                        pendingChatDeepLinkRoomId = null
                    },
                )
                NativeTab.Profile -> ProfileScreen(
                    session = session,
                    apiBaseUrl = apiBaseUrl,
                    viewModel = profileViewModel,
                    onLogout = onLogout,
                    onOpenWebSection = { path -> webPath = path },
                )
            }
        }
    }

    if (showSntBalanceDetails) {
        SntBalanceDetailsDialog(
            isChairman = session.user.role == "CHAIRMAN",
            apiBaseUrl = apiBaseUrl,
            onDismiss = { showSntBalanceDetails = false },
        )
    }
}

@Composable
private fun DashboardScreen(
    viewModel: DashboardViewModel,
    userName: String,
    onOpenChat: () -> Unit,
    onOpenSntBalanceDetails: () -> Unit,
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    val weather = state.weather
    val localHour = remember(weather?.tenant?.timeZone) { resolveLocalHour(weather?.tenant?.timeZone) }
    val greeting = remember(localHour) { resolveGreetingByHour(localHour) }
    val greetingIcon = remember(weather?.weather?.weatherCode, localHour) {
        resolveGreetingIconByWeather(weather?.weather?.weatherCode, localHour)
    }
    val weatherLabel = remember(weather?.weather?.weatherCode, localHour) {
        resolveWeatherLabel(weather?.weather?.weatherCode, localHour)
    }
    val locationLine = weather?.let {
        listOfNotNull(it.tenant.name, it.tenant.location ?: it.tenant.address).joinToString(", ")
    }
    val temperatureLine = weather?.weather?.temperatureC?.let { "${it.toInt()}°C" } ?: "—"
    val hasDebt = state.myOutstandingCents > 0
    val myPaymentsValue = if (hasDebt) "-${formatRub(state.myOutstandingCents)}" else "Задолженности отсутствуют"
    val myPaymentsHint = if (hasDebt) "Оплатите задолженность" else "Все хорошо"
    val debtContainerColor = if (hasDebt) Color(0xFFFFF4CC) else Color(0xFFDCFCE7)
    val debtContentColor = if (hasDebt) Color(0xFF725400) else Color(0xFF14532D)

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
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Icon(
                            imageVector = greetingIcon,
                            contentDescription = null,
                            tint = MaterialTheme.colorScheme.primary,
                        )
                        Text(
                            "$greeting, $userName!",
                            style = MaterialTheme.typography.headlineSmall,
                            fontWeight = FontWeight.Bold,
                        )
                    }

                    if (state.loading) {
                        CircularProgressIndicator(modifier = Modifier.size(22.dp), strokeWidth = 2.dp)
                    } else if (weather != null) {
                        Text(
                            locationLine.orEmpty(),
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                        ) {
                            Text(
                                temperatureLine,
                                style = MaterialTheme.typography.displaySmall,
                                fontWeight = FontWeight.Bold,
                            )
                            Text(
                                weatherLabel,
                                style = MaterialTheme.typography.bodyMedium,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                    }

                    state.error?.let { errorText ->
                        Text(errorText, color = MaterialTheme.colorScheme.error)
                    }

                    Button(onClick = onOpenChat) {
                        Icon(Icons.Outlined.ChatBubbleOutline, contentDescription = null)
                        Spacer(modifier = Modifier.size(6.dp))
                        Text("Открыть чат")
                    }
                }
            }
        }

        item {
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp), modifier = Modifier.fillMaxWidth()) {
                ElevatedCard(
                    modifier = Modifier
                        .weight(1f)
                        .clickable(onClick = onOpenSntBalanceDetails),
                    colors = CardDefaults.elevatedCardColors(
                        containerColor = MaterialTheme.colorScheme.secondaryContainer,
                        contentColor = MaterialTheme.colorScheme.onSecondaryContainer,
                    ),
                    shape = RoundedCornerShape(16.dp),
                ) {
                    Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        Text("Баланс СНТ", style = MaterialTheme.typography.labelLarge)
                        Text(
                            formatRub(state.sntBalanceCents),
                            style = MaterialTheme.typography.titleLarge,
                            fontWeight = FontWeight.Bold,
                        )
                        Text("Нажмите для расшифровки расходов", style = MaterialTheme.typography.bodySmall)
                    }
                }

                ElevatedCard(
                    modifier = Modifier.weight(1f),
                    colors = CardDefaults.elevatedCardColors(
                        containerColor = debtContainerColor,
                        contentColor = debtContentColor,
                    ),
                    shape = RoundedCornerShape(16.dp),
                ) {
                    Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        Text("Мои платежи", style = MaterialTheme.typography.labelLarge)
                        Text(
                            myPaymentsValue,
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.Bold,
                        )
                        Text(myPaymentsHint, style = MaterialTheme.typography.bodySmall)
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

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun SntBalanceDetailsDialog(
    isChairman: Boolean,
    apiBaseUrl: String,
    onDismiss: () -> Unit,
    viewModel: SntBalanceViewModel = hiltViewModel(),
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    val context = LocalContext.current
    val coroutineScope = rememberCoroutineScope()
    var amountInput by rememberSaveable { mutableStateOf("") }
    var purposeInput by rememberSaveable { mutableStateOf("") }
    var formError by rememberSaveable { mutableStateOf<String?>(null) }
    var pickedAttachment by remember { mutableStateOf<PickedMedia?>(null) }

    val attachmentPicker = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        if (uri == null) return@rememberLauncherForActivityResult
        val picked = context.resolvePickedAttachment(uri)
        if (picked == null) {
            formError = "Поддерживаются фото, PDF, DOC, XLS и TXT"
            return@rememberLauncherForActivityResult
        }
        pickedAttachment = picked
        formError = null
    }

    LaunchedEffect(state.notice) {
        if (!state.notice.isNullOrBlank()) {
            amountInput = ""
            purposeInput = ""
            pickedAttachment = null
        }
    }

    Dialog(onDismissRequest = onDismiss) {
        Surface(modifier = Modifier.fillMaxSize()) {
            Column(modifier = Modifier.fillMaxSize()) {
                TopAppBar(
                    title = { Text("Баланс СНТ") },
                    navigationIcon = {
                        IconButton(onClick = onDismiss) {
                            Icon(Icons.AutoMirrored.Outlined.ArrowBack, contentDescription = "Назад")
                        }
                    },
                    actions = {
                        TextButton(onClick = { viewModel.refresh(force = true) }) {
                            Text("Обновить")
                        }
                    },
                )

                LazyColumn(
                    modifier = Modifier.fillMaxSize(),
                    contentPadding = PaddingValues(16.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    item {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.spacedBy(10.dp),
                        ) {
                            ElevatedCard(
                                modifier = Modifier.weight(1f),
                                shape = RoundedCornerShape(16.dp),
                            ) {
                                Column(
                                    modifier = Modifier.padding(14.dp),
                                    verticalArrangement = Arrangement.spacedBy(4.dp),
                                ) {
                                    Text("Баланс СНТ", style = MaterialTheme.typography.labelLarge)
                                    Text(
                                        formatRub(state.summary.sntBalanceCents),
                                        style = MaterialTheme.typography.titleLarge,
                                        fontWeight = FontWeight.Bold,
                                    )
                                }
                            }
                            ElevatedCard(
                                modifier = Modifier.weight(1f),
                                shape = RoundedCornerShape(16.dp),
                            ) {
                                Column(
                                    modifier = Modifier.padding(14.dp),
                                    verticalArrangement = Arrangement.spacedBy(4.dp),
                                ) {
                                    Text("Расходы", style = MaterialTheme.typography.labelLarge)
                                    Text(
                                        formatRub(state.summary.expensesCents),
                                        style = MaterialTheme.typography.titleMedium,
                                        fontWeight = FontWeight.Bold,
                                    )
                                }
                            }
                        }
                    }

                    if (!state.error.isNullOrBlank()) {
                        item {
                            Text(
                                state.error.orEmpty(),
                                color = MaterialTheme.colorScheme.error,
                                style = MaterialTheme.typography.bodyMedium,
                            )
                        }
                    }
                    if (!state.notice.isNullOrBlank()) {
                        item {
                            Text(
                                state.notice.orEmpty(),
                                color = MaterialTheme.colorScheme.primary,
                                style = MaterialTheme.typography.bodyMedium,
                            )
                        }
                    }
                    if (!formError.isNullOrBlank()) {
                        item {
                            Text(
                                formError.orEmpty(),
                                color = MaterialTheme.colorScheme.error,
                                style = MaterialTheme.typography.bodyMedium,
                            )
                        }
                    }

                    if (isChairman) {
                        item {
                            ElevatedCard(shape = RoundedCornerShape(16.dp)) {
                                Column(
                                    modifier = Modifier.padding(14.dp),
                                    verticalArrangement = Arrangement.spacedBy(10.dp),
                                ) {
                                    Text("Зарегистрировать расход", style = MaterialTheme.typography.titleMedium)
                                    OutlinedTextField(
                                        value = amountInput,
                                        onValueChange = { amountInput = it },
                                        label = { Text("Сумма (₽)") },
                                        modifier = Modifier.fillMaxWidth(),
                                        singleLine = true,
                                    )
                                    OutlinedTextField(
                                        value = purposeInput,
                                        onValueChange = { purposeInput = it },
                                        label = { Text("Назначение платежа") },
                                        modifier = Modifier.fillMaxWidth(),
                                        singleLine = true,
                                    )
                                    OutlinedButton(
                                        onClick = {
                                            attachmentPicker.launch(
                                                arrayOf(
                                                    "image/*",
                                                    "application/pdf",
                                                    "application/msword",
                                                    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                                                    "application/vnd.ms-excel",
                                                    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                                                    "text/plain",
                                                ),
                                            )
                                        },
                                        modifier = Modifier.fillMaxWidth(),
                                    ) {
                                        Icon(Icons.Outlined.AttachFile, contentDescription = null)
                                        Spacer(modifier = Modifier.size(6.dp))
                                        Text(pickedAttachment?.fileName ?: "Прикрепить файл или фото")
                                    }
                                    Button(
                                        onClick = {
                                            val amountCents = parsePositiveRubToCents(amountInput)
                                            if (amountCents == null) {
                                                formError = "Введите корректную сумму больше 0"
                                                return@Button
                                            }
                                            val purpose = purposeInput.trim()
                                            if (purpose.length < 2) {
                                                formError = "Укажите назначение платежа"
                                                return@Button
                                            }
                                            formError = null
                                            coroutineScope.launch {
                                                val part = pickedAttachment?.let {
                                                    buildMultipartPart(context, it, "attachment")
                                                }
                                                viewModel.registerExpense(
                                                    amountCents = amountCents,
                                                    purpose = purpose,
                                                    attachment = part,
                                                )
                                            }
                                        },
                                        enabled = !state.saving,
                                        modifier = Modifier.fillMaxWidth(),
                                    ) {
                                        Text(if (state.saving) "Сохраняем..." else "Зарегистрировать расход")
                                    }
                                }
                            }
                        }
                    }

                    item {
                        Text("Расходы", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                    }

                    if (state.loading && state.expenses.isEmpty()) {
                        item {
                            Text("Загружаем расходы...", style = MaterialTheme.typography.bodyMedium)
                        }
                    } else if (state.expenses.isEmpty()) {
                        item {
                            Text("Расходов пока нет.", style = MaterialTheme.typography.bodyMedium)
                        }
                    } else {
                        items(items = state.expenses, key = { it.id }) { expense ->
                            ElevatedCard(shape = RoundedCornerShape(16.dp)) {
                                Column(
                                    modifier = Modifier.padding(14.dp),
                                    verticalArrangement = Arrangement.spacedBy(6.dp),
                                ) {
                                    Row(
                                        modifier = Modifier.fillMaxWidth(),
                                        horizontalArrangement = Arrangement.SpaceBetween,
                                    ) {
                                        Text(
                                            text = "-${formatRub(expense.amountCents)}",
                                            style = MaterialTheme.typography.titleMedium,
                                            fontWeight = FontWeight.Bold,
                                        )
                                        Text(
                                            text = formatDateTimeLabel(expense.spentAt),
                                            style = MaterialTheme.typography.bodySmall,
                                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                                        )
                                    }
                                    Text(expense.purpose, style = MaterialTheme.typography.bodyLarge)
                                    Text(
                                        "Добавил: ${expense.createdBy.name}",
                                        style = MaterialTheme.typography.bodySmall,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    )
                                    if (expense.attachments.isNotEmpty()) {
                                        LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                            items(expense.attachments, key = { it.id }) { attachment ->
                                                OutlinedButton(
                                                    onClick = {
                                                        openUrlInBrowser(
                                                            context,
                                                            resolveMediaUrl(apiBaseUrl, attachment.fileUrl),
                                                        )
                                                    },
                                                ) {
                                                    Text(
                                                        text = attachment.fileName,
                                                        maxLines = 1,
                                                        overflow = TextOverflow.Ellipsis,
                                                    )
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

private fun resolveLocalHour(timeZone: String?): Int {
    return if (!timeZone.isNullOrBlank()) {
        runCatching { ZonedDateTime.now(ZoneId.of(timeZone.trim())).hour }.getOrElse { ZonedDateTime.now().hour }
    } else {
        ZonedDateTime.now().hour
    }
}

private fun resolveGreetingByHour(hour: Int): String {
    return when {
        hour in 5..11 -> "Доброе утро"
        hour in 23..24 || hour in 0..4 -> "Доброй ночи"
        else -> "Добрый день"
    }
}

private fun resolveGreetingIconByWeather(weatherCode: Int?, hour: Int): ImageVector {
    val isNight = hour >= 23 || hour < 5
    return when {
        weatherCode == 0 && isNight -> Icons.Outlined.Bedtime
        weatherCode == 0 -> Icons.Outlined.WbSunny
        weatherCode == 45 || weatherCode == 48 -> Icons.Outlined.BlurOn
        weatherCode != null && weatherCode in 95..99 -> Icons.Outlined.Bolt
        else -> Icons.Outlined.Cloud
    }
}

private fun resolveWeatherLabel(weatherCode: Int?, hour: Int): String {
    val isNight = hour >= 23 || hour < 5
    return when {
        weatherCode == 0 && isNight -> "Ясная ночь"
        weatherCode == 0 -> "Ясно"
        weatherCode != null && weatherCode in 1..3 -> "Переменная облачность"
        weatherCode == 45 || weatherCode == 48 -> "Туман"
        weatherCode != null && ((weatherCode in 51..57) || (weatherCode in 61..67) || (weatherCode in 80..82)) -> "Дождь"
        weatherCode != null && ((weatherCode in 71..77) || weatherCode == 85 || weatherCode == 86) -> "Снег"
        weatherCode != null && weatherCode in 95..99 -> "Гроза"
        else -> "Погода"
    }
}

private fun formatRub(cents: Int): String {
    val formatter = NumberFormat.getNumberInstance(Locale("ru", "RU")).apply {
        maximumFractionDigits = 0
        minimumFractionDigits = 0
    }
    return "${formatter.format(cents / 100.0)} ₽"
}

private fun parsePositiveRubToCents(raw: String): Int? {
    val normalized = raw.trim().replace(" ", "").replace(",", ".")
    val amount = normalized.toDoubleOrNull() ?: return null
    if (amount <= 0.0) return null
    return (amount * 100.0).roundToInt()
}

private fun formatDateTimeLabel(value: String): String {
    val parsed = runCatching { java.time.Instant.parse(value) }.getOrNull()
    if (parsed != null) {
        return java.time.format.DateTimeFormatter.ofPattern("dd.MM.yyyy HH:mm")
            .withZone(java.time.ZoneId.systemDefault())
            .format(parsed)
    }
    return value
}

private enum class ChatRoomFilter(val label: String) {
    All("Все"),
    Direct("Личные"),
    Topic("Топики"),
    Contacts("Контакты СНТ"),
}

@Composable
private fun ChatScreen(
    viewModel: ChatViewModel,
    currentUserId: Int,
    apiBaseUrl: String,
    deepLinkRoomId: String?,
    deepLinkRequestId: Long,
    onDeepLinkConsumed: () -> Unit,
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    val context = LocalContext.current
    val coroutineScope = rememberCoroutineScope()
    val clipboardManager = androidx.compose.ui.platform.LocalClipboardManager.current
    var filter by rememberSaveable { mutableStateOf(ChatRoomFilter.All) }
    var search by rememberSaveable { mutableStateOf("") }
    var openedRoomId by rememberSaveable { mutableStateOf<String?>(null) }
    var pendingDeepLinkRoomId by rememberSaveable(deepLinkRequestId) { mutableStateOf(deepLinkRoomId) }
    var deepLinkLoadAttempted by rememberSaveable(deepLinkRequestId) { mutableStateOf(false) }
    var openDirectAfterCreate by rememberSaveable { mutableStateOf(false) }
    var actionMessageId by rememberSaveable { mutableStateOf<String?>(null) }
    val imagePickerLauncher = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        if (uri == null) return@rememberLauncherForActivityResult
        val picked = context.resolvePickedMedia(uri) ?: return@rememberLauncherForActivityResult
        if (!picked.mimeType.startsWith("image/")) return@rememberLauncherForActivityResult
        coroutineScope.launch {
            val part = buildChatImageMultipartPart(context, picked, "media") ?: return@launch
            viewModel.sendMediaMessage(
                kind = "image",
                durationSec = 0,
                mediaPart = part,
                retryLabel = "Фото",
            )
        }
    }

    val topicPhotoPicker = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        if (uri == null) return@rememberLauncherForActivityResult
        val picked = context.resolvePickedMedia(uri) ?: return@rememberLauncherForActivityResult
        if (!picked.mimeType.startsWith("image/")) return@rememberLauncherForActivityResult
        coroutineScope.launch {
            val part = buildMultipartPart(context, picked, "photo") ?: return@launch
            viewModel.uploadTopicPhoto(part)
        }
    }

    val filteredRooms = remember(state.rooms, filter, search, currentUserId) {
        val query = search.trim().lowercase()
        state.rooms.filter { room ->
            val roomIsDirect = room.kind.equals("DIRECT", ignoreCase = true) || room.isPrivate
            val matchesKind = when (filter) {
                ChatRoomFilter.All -> true
                ChatRoomFilter.Direct -> roomIsDirect
                ChatRoomFilter.Topic -> !roomIsDirect
                ChatRoomFilter.Contacts -> false
            }
            val roomTitle = resolveChatRoomTitle(room, currentUserId)
            val preview = room.lastMessage?.body.orEmpty()
            val matchesSearch = query.isBlank() ||
                roomTitle.lowercase().contains(query) ||
                preview.lowercase().contains(query)
            matchesKind && matchesSearch
        }
    }

    val filteredContacts = remember(state.contacts, search) {
        val query = search.trim().lowercase()
        state.contacts.filter { contact ->
            if (query.isBlank()) return@filter true
            val plots = contact.ownedPlots.joinToString(" ") { it.number }
            contact.name.lowercase().contains(query) ||
                contact.role.lowercase().contains(query) ||
                plots.lowercase().contains(query)
        }
    }

    val openedRoom = remember(state.rooms, openedRoomId) {
        val roomId = openedRoomId ?: return@remember null
        state.rooms.firstOrNull { it.id == roomId }
    }

    LaunchedEffect(state.selectedRoomId, openDirectAfterCreate) {
        if (openDirectAfterCreate && !state.selectedRoomId.isNullOrBlank()) {
            openedRoomId = state.selectedRoomId
            openDirectAfterCreate = false
        }
    }

    LaunchedEffect(filter) {
        if (filter == ChatRoomFilter.Contacts) {
            viewModel.loadContacts(force = false)
        }
    }

    LaunchedEffect(deepLinkRequestId, deepLinkRoomId) {
        pendingDeepLinkRoomId = deepLinkRoomId
        deepLinkLoadAttempted = false
    }

    LaunchedEffect(pendingDeepLinkRoomId, state.rooms, state.roomLoading, deepLinkLoadAttempted) {
        val roomId = pendingDeepLinkRoomId ?: return@LaunchedEffect
        val room = state.rooms.firstOrNull { it.id == roomId }
        if (room != null) {
            if (openedRoomId != roomId) {
                openedRoomId = roomId
                viewModel.selectRoom(roomId)
            }
            pendingDeepLinkRoomId = null
            onDeepLinkConsumed()
            return@LaunchedEffect
        }

        if (!state.roomLoading && !deepLinkLoadAttempted) {
            deepLinkLoadAttempted = true
            viewModel.loadRooms(force = true)
        }
    }

    if (openedRoomId == null || openedRoom == null) {
        Column(modifier = Modifier.fillMaxSize()) {
            OutlinedTextField(
                value = search,
                onValueChange = { search = it },
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 12.dp, vertical = 10.dp),
                label = { Text("Поиск чатов") },
                placeholder = { Text("Имя, сообщение, топик") },
                singleLine = true,
            )

            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 12.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                ChatRoomFilter.entries.forEach { roomFilter ->
                    FilterChip(
                        selected = filter == roomFilter,
                        onClick = { filter = roomFilter },
                        label = { Text(roomFilter.label) },
                    )
                }
            }

            Spacer(modifier = Modifier.height(10.dp))

            if ((filter == ChatRoomFilter.Contacts && state.contactsLoading && state.contacts.isEmpty()) ||
                (filter != ChatRoomFilter.Contacts && state.roomLoading && state.rooms.isEmpty())
            ) {
                Box(
                    modifier = Modifier.fillMaxSize(),
                    contentAlignment = Alignment.Center,
                ) {
                    CircularProgressIndicator(modifier = Modifier.size(24.dp), strokeWidth = 2.dp)
                }
            } else if (filter == ChatRoomFilter.Contacts && filteredContacts.isEmpty()) {
                Box(
                    modifier = Modifier.fillMaxSize(),
                    contentAlignment = Alignment.Center,
                ) {
                    Text(
                        text = if (state.contacts.isEmpty()) "Контактов пока нет." else "Ничего не найдено.",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            } else if (filter != ChatRoomFilter.Contacts && filteredRooms.isEmpty()) {
                Box(
                    modifier = Modifier.fillMaxSize(),
                    contentAlignment = Alignment.Center,
                ) {
                    Text(
                        text = if (state.rooms.isEmpty()) "Чатов пока нет." else "Ничего не найдено.",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            } else {
                LazyColumn(
                    modifier = Modifier
                    .fillMaxWidth()
                    .weight(1f),
                    contentPadding = PaddingValues(horizontal = 12.dp, vertical = 4.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    if (filter == ChatRoomFilter.Contacts) {
                        items(filteredContacts, key = { it.id }) { contact ->
                            ChatContactRow(
                                contact = contact,
                                apiBaseUrl = apiBaseUrl,
                                onClick = {
                                    openDirectAfterCreate = true
                                    viewModel.openDirectChat(contact.id)
                                },
                            )
                        }
                    } else {
                        items(filteredRooms, key = { it.id }) { room ->
                            ChatRoomRow(
                                room = room,
                                currentUserId = currentUserId,
                                apiBaseUrl = apiBaseUrl,
                                onClick = {
                                    openedRoomId = room.id
                                    viewModel.selectRoom(room.id)
                                },
                            )
                        }
                    }
                }
            }

            state.error?.let { errorText ->
                Text(
                    text = errorText,
                    color = MaterialTheme.colorScheme.error,
                    modifier = Modifier.padding(horizontal = 12.dp, vertical = 8.dp),
                )
            }
        }
        return
    }

    Column(modifier = Modifier.fillMaxSize()) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 12.dp, vertical = 10.dp),
            horizontalArrangement = Arrangement.spacedBy(10.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            IconButton(onClick = { openedRoomId = null }) {
                Icon(
                    imageVector = Icons.AutoMirrored.Outlined.ArrowBack,
                    contentDescription = "Назад к чатам",
                )
            }
            ChatAvatar(
                name = resolveChatRoomTitle(openedRoom, currentUserId),
                avatarUrl = openedRoom.photoUrl ?: openedRoom.peer?.avatarUrl,
                apiBaseUrl = apiBaseUrl,
                size = 40.dp,
            )
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = resolveChatRoomTitle(openedRoom, currentUserId),
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.SemiBold,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                Text(
                    text = if (openedRoom.kind.equals("DIRECT", ignoreCase = true) || openedRoom.isPrivate) {
                        "Личный чат"
                    } else {
                        "Топик"
                    },
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            IconButton(
                onClick = { viewModel.setMuted(!state.isMuted) },
            ) {
                Icon(
                    imageVector = if (state.isMuted) Icons.Outlined.NotificationsOff else Icons.Outlined.Notifications,
                    contentDescription = if (state.isMuted) "Включить уведомления" else "Отключить уведомления",
                )
            }
            if (!openedRoom.isPrivate) {
                IconButton(
                    onClick = { topicPhotoPicker.launch(arrayOf("image/*")) },
                    enabled = !state.uploadingTopicPhoto,
                ) {
                    Icon(
                        imageVector = Icons.Outlined.CameraAlt,
                        contentDescription = "Фото топика",
                    )
                }
                if (!openedRoom.photoUrl.isNullOrBlank()) {
                    IconButton(
                        onClick = viewModel::removeTopicPhoto,
                        enabled = !state.uploadingTopicPhoto,
                    ) {
                        Icon(
                            imageVector = Icons.Outlined.Delete,
                            contentDescription = "Удалить фото топика",
                        )
                    }
                }
            }
        }

        if (state.messagesLoading && state.messages.isEmpty()) {
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
        ) {
            items(state.messages, key = { it.id }) { message ->
                val mine = message.author.id == currentUserId
                MessageBubble(
                    message = message,
                    apiBaseUrl = apiBaseUrl,
                    mine = mine,
                    onLongPress = { actionMessageId = message.id },
                )
            }
        }

        val activeActionMessage = state.messages.firstOrNull { it.id == actionMessageId }
        if (activeActionMessage != null) {
            val isMine = activeActionMessage.author.id == currentUserId
            androidx.compose.material3.AlertDialog(
                onDismissRequest = { actionMessageId = null },
                confirmButton = {
                    TextButton(onClick = { actionMessageId = null }) {
                        Text("Закрыть")
                    }
                },
                title = { Text("Действия") },
                text = {
                    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        TextButton(onClick = {
                            viewModel.beginReply(activeActionMessage)
                            actionMessageId = null
                        }) {
                            Text("Ответить")
                        }
                        if (isMine) {
                            TextButton(onClick = {
                                viewModel.beginEdit(activeActionMessage)
                                actionMessageId = null
                            }) {
                                Text("Изменить")
                            }
                        }
                        TextButton(onClick = {
                            clipboardManager.setText(androidx.compose.ui.text.AnnotatedString(activeActionMessage.body))
                            actionMessageId = null
                        }) {
                            Text("Копировать")
                        }
                        if (isMine || !openedRoom.isPrivate) {
                            TextButton(onClick = {
                                viewModel.deleteMessage(activeActionMessage.id)
                                actionMessageId = null
                            }) {
                                Text("Удалить")
                            }
                        }
                    }
                },
            )
        }

        state.error?.let { errorText ->
            Text(
                text = errorText,
                color = MaterialTheme.colorScheme.error,
                modifier = Modifier.padding(horizontal = 12.dp, vertical = 4.dp),
            )
        }

        val replyTo = state.replyToMessage
        val editingMessageId = state.editingMessageId
        if (replyTo != null || editingMessageId != null) {
            ElevatedCard(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 12.dp),
            ) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 10.dp, vertical = 8.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Column(modifier = Modifier.weight(1f)) {
                        Text(
                            text = if (editingMessageId != null) "Редактирование" else "Ответ",
                            style = MaterialTheme.typography.labelMedium,
                            color = MaterialTheme.colorScheme.primary,
                        )
                        Text(
                            text = if (editingMessageId != null) state.draftMessage else "${replyTo?.author?.name}: ${replyTo?.body}",
                            style = MaterialTheme.typography.bodySmall,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                    }
                    TextButton(onClick = {
                        if (editingMessageId != null) viewModel.cancelEdit() else viewModel.cancelReply()
                    }) {
                        Text("Отмена")
                    }
                }
            }
            Spacer(modifier = Modifier.height(6.dp))
        }

        if (state.mediaRetryAvailable) {
            ElevatedCard(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 12.dp),
            ) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 10.dp, vertical = 8.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(
                        text = "Не удалось отправить ${state.mediaRetryLabel.lowercase()}",
                        style = MaterialTheme.typography.bodySmall,
                        modifier = Modifier.weight(1f),
                    )
                    TextButton(onClick = viewModel::retryPendingMedia) {
                        Text("Повторить")
                    }
                    TextButton(onClick = viewModel::clearPendingMediaRetry) {
                        Text("Убрать")
                    }
                }
            }
            Spacer(modifier = Modifier.height(6.dp))
        }

        Row(
            modifier = Modifier
                .fillMaxWidth()
                .imePadding()
                .padding(horizontal = 12.dp, vertical = 8.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            IconButton(
                onClick = { imagePickerLauncher.launch(arrayOf("image/*")) },
                modifier = Modifier.size(40.dp),
                enabled = !state.mediaSending,
            ) {
                if (state.mediaSending) {
                    CircularProgressIndicator(modifier = Modifier.size(16.dp), strokeWidth = 2.dp)
                } else {
                    Icon(
                        imageVector = Icons.Outlined.AttachFile,
                        contentDescription = "Прикрепить фото",
                    )
                }
            }
            OutlinedTextField(
                value = state.draftMessage,
                onValueChange = viewModel::onDraftChanged,
                modifier = Modifier.weight(1f),
                placeholder = { Text("Сообщение") },
                singleLine = true,
            )
            Button(
                onClick = viewModel::sendMessage,
                enabled = !state.sending && state.draftMessage.isNotBlank(),
                modifier = Modifier.height(56.dp),
            ) {
                if (state.sending) {
                    CircularProgressIndicator(modifier = Modifier.size(16.dp), strokeWidth = 2.dp)
                } else {
                    Text(if (state.editingMessageId != null) "Сохранить" else "Отпр.")
                }
            }
        }
    }
}

@Composable
private fun ChatContactRow(
    contact: ru.snt.portal.core.model.ChatContactDto,
    apiBaseUrl: String,
    onClick: () -> Unit,
) {
    val subtitle = buildString {
        append(formatRole(contact.role))
        if (contact.ownedPlots.isNotEmpty()) {
            append(" · Участки: ")
            append(contact.ownedPlots.joinToString(", ") { it.number })
        }
    }

    ElevatedCard(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick),
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 12.dp, vertical = 10.dp),
            horizontalArrangement = Arrangement.spacedBy(10.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            ChatAvatar(
                name = contact.name,
                avatarUrl = contact.avatarUrl,
                apiBaseUrl = apiBaseUrl,
            )
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = contact.name,
                    style = MaterialTheme.typography.titleSmall,
                    fontWeight = FontWeight.SemiBold,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                Text(
                    text = subtitle,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }
    }
}

private fun formatRole(raw: String): String = when (raw.uppercase()) {
    "CHAIRMAN" -> "Председатель"
    "ADMIN" -> "Админ"
    else -> "Житель"
}

@Composable
private fun ChatRoomRow(
    room: ChatRoomDto,
    currentUserId: Int,
    apiBaseUrl: String,
    onClick: () -> Unit,
) {
    val title = resolveChatRoomTitle(room, currentUserId)
    val lastMessage = room.lastMessage
    val preview = if (lastMessage == null) {
        "Нет сообщений"
    } else if (lastMessage.attachments.isNotEmpty()) {
        when (lastMessage.attachments.first().mediaType.uppercase()) {
            "IMAGE" -> "🖼 Фото"
            "VOICE" -> "🎤 Голосовое сообщение"
            "VIDEO_NOTE" -> "🎥 Видеосообщение"
            else -> "Медиа"
        }
    } else if (lastMessage.author.id == currentUserId) {
        "Вы: ${lastMessage.body}"
    } else {
        "${lastMessage.author.name}: ${lastMessage.body}"
    }.replace('\n', ' ')

    ElevatedCard(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick),
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 12.dp, vertical = 10.dp),
            horizontalArrangement = Arrangement.spacedBy(10.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            ChatAvatar(
                name = title,
                avatarUrl = room.photoUrl ?: room.peer?.avatarUrl,
                apiBaseUrl = apiBaseUrl,
            )

            Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                Text(
                    text = if (room.isMuted) "$title  🔕" else title,
                    style = MaterialTheme.typography.titleSmall,
                    fontWeight = FontWeight.SemiBold,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                Text(
                    text = preview,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }

            Column(
                horizontalAlignment = Alignment.End,
                verticalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                Text(
                    text = formatChatTime(lastMessage?.createdAt ?: room.updatedAt),
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                if (room.unreadCount > 0) {
                    Badge {
                        Text(if (room.unreadCount > 99) "99+" else room.unreadCount.toString())
                    }
                }
            }
        }
    }
}

@Composable
private fun ChatAvatar(
    name: String,
    avatarUrl: String?,
    apiBaseUrl: String,
    size: androidx.compose.ui.unit.Dp = 48.dp,
) {
    val resolvedAvatar = avatarUrl?.takeIf { it.isNotBlank() }?.let { resolveMediaUrl(apiBaseUrl, it) }
    if (resolvedAvatar != null) {
        AsyncImage(
            model = resolvedAvatar,
            contentDescription = name,
            modifier = Modifier
                .size(size)
                .clip(CircleShape),
            contentScale = ContentScale.Crop,
        )
        return
    }

    Box(
        modifier = Modifier
            .size(size)
            .clip(CircleShape)
            .background(MaterialTheme.colorScheme.primary.copy(alpha = 0.16f)),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text = buildAvatarInitials(name),
            style = MaterialTheme.typography.labelLarge,
            color = MaterialTheme.colorScheme.primary,
            fontWeight = FontWeight.SemiBold,
        )
    }
}

private fun buildAvatarInitials(name: String): String {
    val parts = name.trim().split(" ").filter { it.isNotBlank() }
    if (parts.isEmpty()) return "?"
    if (parts.size == 1) return parts.first().take(1).uppercase()
    return (parts.first().take(1) + parts.last().take(1)).uppercase()
}

private fun resolveChatRoomTitle(room: ChatRoomDto, currentUserId: Int): String {
    if (room.title.isNotBlank()) return room.title
    room.peer?.name?.takeIf { it.isNotBlank() }?.let { return it }
    if (room.isPrivate || room.kind.equals("DIRECT", ignoreCase = true)) {
        room.members.firstOrNull { member -> member.user.id != currentUserId }?.user?.name?.let { return it }
        if (room.name.startsWith("dm:", ignoreCase = true)) return "Личный чат"
    }
    return room.name
}

private fun formatChatTime(raw: String?): String {
    if (raw.isNullOrBlank()) return ""
    val normalized = raw.replace('T', ' ')
    if (normalized.length >= 16) {
        return normalized.substring(11, 16)
    }
    return normalized.takeLast(5)
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun MessageBubble(
    message: ru.snt.portal.core.model.ChatMessageDto,
    apiBaseUrl: String,
    mine: Boolean,
    onLongPress: () -> Unit,
) {
    val context = LocalContext.current
    val bg = if (mine) MaterialTheme.colorScheme.primary.copy(alpha = 0.26f) else MaterialTheme.colorScheme.surfaceVariant

    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = if (mine) Arrangement.End else Arrangement.Start,
    ) {
        Card(
            shape = RoundedCornerShape(18.dp),
            colors = CardDefaults.cardColors(containerColor = bg),
            modifier = Modifier
                .fillMaxWidth(0.76f)
                .combinedClickable(
                    onClick = {},
                    onLongClick = onLongPress,
                ),
        ) {
            Column(modifier = Modifier.padding(horizontal = 12.dp, vertical = 8.dp)) {
                if (!mine) {
                    Text(
                        message.author.name,
                        style = MaterialTheme.typography.labelMedium,
                        color = MaterialTheme.colorScheme.primary,
                    )
                    Spacer(modifier = Modifier.height(4.dp))
                }
                message.replyTo?.let { reply ->
                    ElevatedCard {
                        Text(
                            text = if (reply.isDeleted) "${reply.authorName}: (недоступно)" else "${reply.authorName}: ${reply.bodyPreview}",
                            modifier = Modifier.padding(horizontal = 8.dp, vertical = 6.dp),
                            style = MaterialTheme.typography.bodySmall,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                    }
                    Spacer(modifier = Modifier.height(6.dp))
                }

                if (message.attachments.isNotEmpty()) {
                    message.attachments.forEach { attachment ->
                        val mediaUrl = resolveMediaUrl(apiBaseUrl, attachment.fileUrl)
                        if (attachment.mediaType.equals("IMAGE", ignoreCase = true)) {
                            ElevatedCard(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .clickable { openUrlInBrowser(context, mediaUrl) },
                            ) {
                                AsyncImage(
                                    model = mediaUrl,
                                    contentDescription = "Фото",
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .height(180.dp),
                                    contentScale = ContentScale.Crop,
                                )
                            }
                        } else {
                            ElevatedCard(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .clickable { openUrlInBrowser(context, mediaUrl) },
                            ) {
                                val label = when (attachment.mediaType.uppercase()) {
                                    "VOICE" -> "🎤 Голосовое"
                                    "VIDEO_NOTE" -> "🎥 Кружочек"
                                    else -> "Медиа"
                                }
                                val durationLabel = if (attachment.durationSec > 0) " · ${attachment.durationSec}с" else ""
                                Text(
                                    text = "$label$durationLabel",
                                    modifier = Modifier.padding(horizontal = 10.dp, vertical = 8.dp),
                                    style = MaterialTheme.typography.bodyMedium,
                                )
                            }
                        }
                        Spacer(modifier = Modifier.height(6.dp))
                    }
                }

                if (message.body.isNotBlank()) {
                    Text(message.body, style = MaterialTheme.typography.bodyLarge)
                    Spacer(modifier = Modifier.height(4.dp))
                }
                Text(
                    text = message.createdAt.replace("T", " ").take(16),
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
    apiBaseUrl: String,
    viewModel: ProfileViewModel,
    onLogout: () -> Unit,
    onOpenWebSection: (String) -> Unit,
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    val context = LocalContext.current
    val coroutineScope = rememberCoroutineScope()

    val avatarPicker = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        if (uri == null) return@rememberLauncherForActivityResult

        runCatching {
            context.contentResolver.takePersistableUriPermission(
                uri,
                Intent.FLAG_GRANT_READ_URI_PERMISSION,
            )
        }

        val picked = context.resolvePickedMedia(uri)
        if (picked == null) {
            viewModel.setError("Не удалось прочитать выбранный файл")
            return@rememberLauncherForActivityResult
        }

        if (!picked.mimeType.startsWith("image/")) {
            viewModel.setError("Для аватара выберите изображение")
            return@rememberLauncherForActivityResult
        }

        coroutineScope.launch {
            val part = buildMultipartPart(context, picked, "avatar")
            if (part == null) {
                viewModel.setError("Не удалось подготовить изображение")
                return@launch
            }
            viewModel.uploadAvatar(part)
        }
    }

    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item {
            ElevatedCard {
                Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(12.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        ChatAvatar(
                            name = session.displayName(),
                            avatarUrl = session.user.avatarUrl,
                            apiBaseUrl = apiBaseUrl,
                            size = 72.dp,
                        )

                        Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                            Text(session.displayName(), style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
                            Text(session.user.phone, style = MaterialTheme.typography.bodyMedium)
                            Text(session.displayRole(), style = MaterialTheme.typography.labelLarge)
                        }
                    }

                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        OutlinedButton(
                            onClick = { avatarPicker.launch(arrayOf("image/*")) },
                            enabled = !state.uploadingAvatar && !state.removingAvatar,
                        ) {
                            Text(if (state.uploadingAvatar) "Загрузка…" else "Изменить фото")
                        }

                        if (!session.user.avatarUrl.isNullOrBlank()) {
                            TextButton(
                                onClick = viewModel::removeAvatar,
                                enabled = !state.uploadingAvatar && !state.removingAvatar,
                            ) {
                                Text(if (state.removingAvatar) "Удаление…" else "Удалить")
                            }
                        }
                    }

                    state.notice?.let { noticeText ->
                        Text(
                            text = noticeText,
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.primary,
                        )
                    }

                    state.error?.let { errorText ->
                        Text(
                            text = errorText,
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.error,
                        )
                    }
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

private fun openUrlInBrowser(context: Context, url: String) {
    runCatching {
        context.startActivity(
            Intent(Intent.ACTION_VIEW, Uri.parse(url)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
        )
    }
}

private fun Context.resolvePickedMedia(uri: Uri): PickedMedia? {
    val mime = contentResolver.getType(uri) ?: guessMimeType(uri)
    val fileName = queryDisplayName(uri) ?: "media_${System.currentTimeMillis()}"
    if (!mime.startsWith("image/") && !mime.startsWith("video/")) {
        return null
    }
    return PickedMedia(uri = uri, fileName = fileName, mimeType = mime)
}

private fun Context.resolvePickedAttachment(uri: Uri): PickedMedia? {
    val mime = contentResolver.getType(uri) ?: guessMimeType(uri)
    val fileName = queryDisplayName(uri) ?: "attachment_${System.currentTimeMillis()}"
    val isAllowedDocument = mime == "application/pdf" ||
        mime == "application/msword" ||
        mime == "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
        mime == "application/vnd.ms-excel" ||
        mime == "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
        mime == "text/plain"

    if (!mime.startsWith("image/") && !isAllowedDocument) {
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

private suspend fun buildChatImageMultipartPart(
    context: Context,
    media: PickedMedia,
    fieldName: String,
): MultipartBody.Part? = withContext(Dispatchers.IO) {
    if (!media.mimeType.startsWith("image/")) {
        return@withContext buildMultipartPart(context, media, fieldName)
    }

    val compressed = context.compressImageForChatUpload(media.uri)
    if (compressed == null) {
        return@withContext buildMultipartPart(context, media, fieldName)
    }

    val requestBody = compressed.bytes.toRequestBody("image/jpeg".toMediaTypeOrNull())
    MultipartBody.Part.createFormData(fieldName, compressed.fileName, requestBody)
}

private suspend fun buildMultipartPart(
    context: Context,
    media: PickedMedia,
    fieldName: String,
): MultipartBody.Part? = withContext(Dispatchers.IO) {
    val requestBody = context.createUriRequestBody(media.uri, media.mimeType) ?: return@withContext null
    MultipartBody.Part.createFormData(fieldName, media.fileName, requestBody)
}

private data class CompressedImagePayload(
    val fileName: String,
    val bytes: ByteArray,
)

private fun Context.compressImageForChatUpload(uri: Uri): CompressedImagePayload? {
    val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
    contentResolver.openInputStream(uri)?.use { input ->
        BitmapFactory.decodeStream(input, null, bounds)
    } ?: return null

    if (bounds.outWidth <= 0 || bounds.outHeight <= 0) return null

    val sampleSize = calculateImageSampleSize(
        width = bounds.outWidth,
        height = bounds.outHeight,
        reqWidth = CHAT_IMAGE_MAX_DIMENSION_PX,
        reqHeight = CHAT_IMAGE_MAX_DIMENSION_PX,
    )

    val decodeOptions = BitmapFactory.Options().apply {
        inSampleSize = sampleSize
        inPreferredConfig = Bitmap.Config.ARGB_8888
    }

    val decodedBitmap = contentResolver.openInputStream(uri)?.use { input ->
        BitmapFactory.decodeStream(input, null, decodeOptions)
    } ?: return null

    val scaledBitmap = decodedBitmap.scaleDownIfNeeded(CHAT_IMAGE_MAX_DIMENSION_PX)
    if (scaledBitmap !== decodedBitmap) {
        decodedBitmap.recycle()
    }

    val output = ByteArrayOutputStream()
    var quality = 88
    do {
        output.reset()
        scaledBitmap.compress(Bitmap.CompressFormat.JPEG, quality, output)
        quality -= 8
    } while (output.size() > CHAT_IMAGE_TARGET_MAX_BYTES && quality >= 60)

    scaledBitmap.recycle()

    val bytes = output.toByteArray()
    if (bytes.isEmpty()) return null

    return CompressedImagePayload(
        fileName = "chat_${System.currentTimeMillis()}.jpg",
        bytes = bytes,
    )
}

private fun Bitmap.scaleDownIfNeeded(maxDimension: Int): Bitmap {
    val sourceWidth = width
    val sourceHeight = height
    val maxSourceDimension = maxOf(sourceWidth, sourceHeight)
    if (maxSourceDimension <= maxDimension) return this

    val scale = maxDimension.toFloat() / maxSourceDimension.toFloat()
    val targetWidth = (sourceWidth * scale).toInt().coerceAtLeast(1)
    val targetHeight = (sourceHeight * scale).toInt().coerceAtLeast(1)
    return Bitmap.createScaledBitmap(this, targetWidth, targetHeight, true)
}

private fun calculateImageSampleSize(width: Int, height: Int, reqWidth: Int, reqHeight: Int): Int {
    var sampleSize = 1
    if (height > reqHeight || width > reqWidth) {
        var halfHeight = height / 2
        var halfWidth = width / 2
        while (halfHeight / sampleSize >= reqHeight && halfWidth / sampleSize >= reqWidth) {
            sampleSize *= 2
            halfHeight = height / 2
            halfWidth = width / 2
        }
    }
    return sampleSize.coerceAtLeast(1)
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
