package com.jarvisai.assistant

import android.Manifest
import android.content.BroadcastReceiver
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.PowerManager
import android.provider.Settings
import androidx.activity.ComponentActivity
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material.icons.filled.CameraAlt
import androidx.compose.material.icons.filled.ChatBubbleOutline
import androidx.compose.material.icons.filled.DeleteOutline
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.Mic
import androidx.compose.material.icons.filled.MicOff
import androidx.compose.material.icons.filled.PowerSettingsNew
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.VolumeOff
import androidx.compose.material.icons.filled.VolumeUp
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.ContextCompat
import com.jarvisai.assistant.automation.AndroidCommandExecutor
import com.jarvisai.assistant.automation.JarvisAccessibilityService
import com.jarvisai.assistant.data.ConversationRecord
import com.jarvisai.assistant.data.JarvisDatabase
import com.jarvisai.assistant.emotion.EmotionEngine
import com.jarvisai.assistant.emotion.JarvisEmotion
import com.jarvisai.assistant.network.JarvisBackendClient
import com.jarvisai.assistant.network.WeatherSnapshot
import com.jarvisai.assistant.notifications.JarvisNotificationListener
import com.jarvisai.assistant.orb.HolographicOrbCanvas
import com.jarvisai.assistant.orb.OrbState
import com.jarvisai.assistant.service.OverlayBubbleService
import com.jarvisai.assistant.service.WakeWordForegroundService
import com.jarvisai.assistant.vision.CameraVisionActivity
import com.jarvisai.assistant.voice.JarvisVoiceManager
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch
import kotlinx.coroutines.suspendCancellableCoroutine
import java.util.UUID
import kotlin.coroutines.resume

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            MaterialTheme(
                colorScheme = darkColorScheme(
                    background = Color(0xFF040918),
                    surface = Color(0xFF09132D),
                    primary = Color(0xFF2563EB),
                    secondary = Color(0xFFD4AF37)
                )
            ) {
                JarvisHomeScreen(this)
            }
        }
    }
}

enum class AssistantPowerState { AWAKE, SLEEPING, SHUTDOWN }

private data class SpeechSegment(val text: String, val emotion: String)

private fun buildAllRuntimePermissions(): Array<String> {
    val list = mutableListOf(
        Manifest.permission.RECORD_AUDIO,
        Manifest.permission.CAMERA,
        Manifest.permission.READ_CONTACTS,
        Manifest.permission.CALL_PHONE,
        Manifest.permission.READ_CALL_LOG,
        Manifest.permission.SEND_SMS,
        Manifest.permission.READ_CALENDAR,
        Manifest.permission.ACCESS_FINE_LOCATION,
        Manifest.permission.ACCESS_COARSE_LOCATION
    )
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        list.add(Manifest.permission.BLUETOOTH_CONNECT)
    }
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
        list.add(Manifest.permission.POST_NOTIFICATIONS)
        list.add(Manifest.permission.READ_MEDIA_IMAGES)
        list.add(Manifest.permission.READ_MEDIA_AUDIO)
    }
    return list.toTypedArray()
}

private fun isNotificationListenerEnabled(context: Context): Boolean {
    val flat = Settings.Secure.getString(context.contentResolver, "enabled_notification_listeners") ?: return false
    val cn = ComponentName(context, JarvisNotificationListener::class.java).flattenToString()
    return flat.split(":").any { it.equals(cn, ignoreCase = true) }
}

private fun isBatteryOptimizationIgnored(context: Context): Boolean {
    val pm = context.getSystemService(Context.POWER_SERVICE) as PowerManager
    return pm.isIgnoringBatteryOptimizations(context.packageName)
}

private fun splitSentencesWithEmotion(fullText: String, fallbackEmotion: String): List<SpeechSegment> {
    val cleaned = fullText.replace(Regex("\\[MOOD:[A-Za-z]+\\]\\s*"), "").trim()
    if (cleaned.isEmpty()) return emptyList()
    val rawParts = cleaned.split(Regex("(?<=[.!?।\n])\\s+"))
        .map { it.trim() }
        .filter { it.isNotEmpty() }
    if (rawParts.isEmpty()) return listOf(SpeechSegment(cleaned, fallbackEmotion))
    return rawParts.map { sentence ->
        val detected = EmotionEngine.detectFromContext(sentence, EmotionEngine.fromLabel(fallbackEmotion) ?: JarvisEmotion.NORMAL)
        SpeechSegment(sentence, detected.label)
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun JarvisHomeScreen(activity: ComponentActivity) {
    val scope = rememberCoroutineScope()
    val prefs = remember { activity.getSharedPreferences("jarvis_prefs", Context.MODE_PRIVATE) }
    val db = remember { JarvisDatabase(activity) }
    val backend = remember { JarvisBackendClient(activity) }
    val executor = remember { AndroidCommandExecutor(activity) }

    var selectedTab by remember { mutableStateOf("home") }
    var orbState by remember { mutableStateOf(OrbState.IDLE) }
    var powerState by remember { mutableStateOf(AssistantPowerState.AWAKE) }
    var audioLevel by remember { mutableFloatStateOf(0f) }
    var personality by remember { mutableStateOf("jarvis") }
    var currentEmotion by remember { mutableStateOf(JarvisEmotion.NORMAL) }
    var statusText by remember { mutableStateOf("JARVIS Ready") }
    var actionReportText by remember { mutableStateOf("") }
    var totalTasks by remember { mutableIntStateOf(0) }
    var completedTasks by remember { mutableIntStateOf(0) }

    var autoContinueListening by remember { mutableStateOf(true) }
    var autoSpeakChatReplies by remember { mutableStateOf(true) }
    var selectedLanguage by remember { mutableStateOf("en-IN") }
    var wakeWordServiceRunning by remember { mutableStateOf(prefs.getBoolean("wake_word_24x7", false)) }
    var overlayBubbleRunning by remember { mutableStateOf(false) }
    var permissionRefreshTick by remember { mutableIntStateOf(0) }

    var backendOnline by remember { mutableStateOf(true) }
    var weather by remember { mutableStateOf<WeatherSnapshot?>(null) }
    var customServerUrl by remember { mutableStateOf(backend.getBaseUrl()) }
    var serverSaveNote by remember { mutableStateOf("") }

    var chatMessages by remember { mutableStateOf(db.getMessagesForPersonality("jarvis")) }
    var streamingAssistantReply by remember { mutableStateOf("") }
    var chatInput by remember { mutableStateOf("") }

    val voiceManagerRef = remember { arrayOfNulls<JarvisVoiceManager>(1) }
    val activeSpeechJobRef = remember { arrayOfNulls<Job>(1) }

    LaunchedEffect(Unit) {
        backendOnline = backend.checkHealth()
        weather = backend.fetchWeather()
        if (wakeWordServiceRunning) {
            ContextCompat.startForegroundService(
                activity,
                Intent(activity, WakeWordForegroundService::class.java).apply {
                    action = WakeWordForegroundService.ACTION_RESUME_WAKEWORD
                }
            )
        }
    }

    LaunchedEffect(personality) {
        chatMessages = db.getMessagesForPersonality(personality)
    }

    val triggerListen = {
        if (powerState != AssistantPowerState.SHUTDOWN) {
            activeSpeechJobRef[0]?.cancel()
            voiceManagerRef[0]?.interruptSpeech()
            orbState = OrbState.LISTENING
            statusText = "Listening..."
            voiceManagerRef[0]?.startListening(selectedLanguage)
        }
    }

    val speakSegmentedNeural: (
        segments: List<SpeechSegment>,
        activePers: String,
        pitch: Float,
        fromVoice: Boolean
    ) -> Unit = { segments, activePers, pitch, fromVoice ->
        activeSpeechJobRef[0]?.cancel()
        activeSpeechJobRef[0] = scope.launch {
            if (segments.isEmpty()) {
                activity.runOnUiThread { orbState = OrbState.IDLE }
                return@launch
            }
            activity.runOnUiThread {
                orbState = OrbState.SPEAKING
                if (wakeWordServiceRunning) {
                    activity.startService(Intent(activity, WakeWordForegroundService::class.java).apply {
                        action = WakeWordForegroundService.ACTION_PAUSE_FOR_TTS
                    })
                }
            }

            for (seg in segments) {
                EmotionEngine.fromLabel(seg.emotion)?.let { emo ->
                    activity.runOnUiThread { currentEmotion = emo }
                }
                val audioPair = backend.synthesizeSpeech(
                    text = seg.text,
                    personality = activePers,
                    emotion = seg.emotion
                )
                if (audioPair != null) {
                    suspendCancellableCoroutine<Unit> { cont ->
                        voiceManagerRef[0]?.playNeuralAudio(
                            audioBytes = audioPair.first,
                            mimeType = audioPair.second,
                            onFinished = { if (cont.isActive) cont.resume(Unit) },
                            onPlaybackError = {
                                voiceManagerRef[0]?.speak(
                                    text = seg.text,
                                    pitch = pitch,
                                    onFinished = { if (cont.isActive) cont.resume(Unit) }
                                )
                            }
                        )
                    }
                } else {
                    suspendCancellableCoroutine<Unit> { cont ->
                        voiceManagerRef[0]?.speak(
                            text = seg.text,
                            pitch = pitch,
                            onFinished = { if (cont.isActive) cont.resume(Unit) }
                        )
                    }
                }
            }

            activity.runOnUiThread {
                if (wakeWordServiceRunning && powerState == AssistantPowerState.AWAKE) {
                    activity.startService(Intent(activity, WakeWordForegroundService::class.java).apply {
                        action = WakeWordForegroundService.ACTION_RESUME_WAKEWORD
                    })
                }
                if (fromVoice && autoContinueListening && powerState == AssistantPowerState.AWAKE) {
                    orbState = OrbState.LISTENING
                    statusText = "Listening..."
                    voiceManagerRef[0]?.startListening(selectedLanguage)
                } else {
                    orbState = OrbState.IDLE
                }
            }
        }
    }

    val sendAssistantMessage: (String, Boolean) -> Unit = { rawText, fromVoice ->
        val cleanText = rawText.trim()
        val lower = cleanText.lowercase()
        when {
            cleanText.isEmpty() -> {
                orbState = OrbState.IDLE
                statusText = "Tap Mic to speak"
            }
            lower.contains("shutdown") || lower.contains("band ho jao") || lower.contains("system band kar do") -> {
                powerState = AssistantPowerState.SHUTDOWN
                orbState = OrbState.IDLE
                wakeWordServiceRunning = false
                statusText = "System Shutdown · Tap Restart JARVIS"
                activity.startService(Intent(activity, WakeWordForegroundService::class.java).apply {
                    action = WakeWordForegroundService.ACTION_STOP_COMPLETELY
                })
            }
            lower.contains("sleep") || lower.contains("so jao") || lower.contains("rest mode") || lower.contains("chup ho jao") -> {
                powerState = AssistantPowerState.SLEEPING
                orbState = OrbState.IDLE
                statusText = "Sleeping · Say 'Hey JARVIS' or 'Hey Maya'"
                activity.startService(Intent(activity, WakeWordForegroundService::class.java).apply {
                    action = WakeWordForegroundService.ACTION_ENTER_SLEEP
                })
            }
            lower.contains("lock phone") || lower.contains("lock device") || lower.contains("phone lock") -> {
                val locked = JarvisAccessibilityService.instance?.lockDevice() == true
                orbState = if (locked) OrbState.IDLE else OrbState.ERROR
                statusText = if (locked) "Screen locked." else "Enable Accessibility Service in Settings."
            }
            powerState != AssistantPowerState.SHUTDOWN -> {
                powerState = AssistantPowerState.AWAKE
                val activePers = personality
                val detectedMood = EmotionEngine.detectFromContext(cleanText, currentEmotion)
                currentEmotion = detectedMood
                orbState = OrbState.THINKING
                statusText = "Thinking..."
                streamingAssistantReply = ""
                actionReportText = ""

                val userRecord = ConversationRecord(
                    id = UUID.randomUUID().toString(),
                    personality = activePers,
                    role = "user",
                    content = cleanText,
                    emotion = detectedMood.label,
                    createdAt = System.currentTimeMillis()
                )
                db.appendMessage(userRecord)
                chatMessages = db.getMessagesForPersonality(activePers)

                scope.launch {
                    val segmentQueue = mutableListOf<SpeechSegment>()
                    var lastDeltaEmotion = detectedMood.label
                    var resolvedPers = activePers

                    backend.streamAssistant(
                        personality = activePers,
                        message = cleanText,
                        moodOverride = detectedMood.label,
                        onDelta = { chunk, emo ->
                            if (!emo.isNullOrBlank()) {
                                lastDeltaEmotion = emo
                                EmotionEngine.fromLabel(emo)?.let { parsed ->
                                    activity.runOnUiThread { currentEmotion = parsed }
                                }
                            }
                            activity.runOnUiThread {
                                streamingAssistantReply += chunk
                            }
                        },
                        onCommandSteps = { steps ->
                            activity.runOnUiThread {
                                totalTasks = steps.size
                                val note = executor.executeSteps(steps)
                                completedTasks = steps.size
                                if (note.isNotBlank()) actionReportText = note
                            }
                        },
                        onEmotion = { emoLabel ->
                            lastDeltaEmotion = emoLabel
                            EmotionEngine.fromLabel(emoLabel)?.let { matched ->
                                activity.runOnUiThread { currentEmotion = matched }
                            }
                        },
                        onAppControl = { ctrl ->
                            activity.runOnUiThread {
                                if (ctrl.switchPersonality != null) {
                                    resolvedPers = ctrl.switchPersonality
                                    personality = ctrl.switchPersonality
                                }
                                ctrl.setMood?.let { m ->
                                    EmotionEngine.fromLabel(m)?.let { currentEmotion = it }
                                }
                                if (ctrl.navigateView == "settings") selectedTab = "settings"
                                else if (ctrl.navigateView == "chat") selectedTab = "chat"
                                else if (ctrl.navigateView == "home") selectedTab = "home"
                                else if (ctrl.navigateView == "vision") {
                                    activity.startActivity(Intent(activity, CameraVisionActivity::class.java))
                                }
                                if (ctrl.clearChat) {
                                    db.clearAll()
                                    chatMessages = emptyList()
                                }
                            }
                        },
                        onSleepState = { nextSleep ->
                            activity.runOnUiThread {
                                when (nextSleep) {
                                    "SHUTDOWN" -> powerState = AssistantPowerState.SHUTDOWN
                                    "SLEEPING" -> powerState = AssistantPowerState.SLEEPING
                                    else -> powerState = AssistantPowerState.AWAKE
                                }
                            }
                        },
                        onDone = { fullReply ->
                            val cleanReply = fullReply.trim()
                            activity.runOnUiThread {
                                streamingAssistantReply = ""
                                if (cleanReply.isNotBlank()) {
                                    val aiRec = ConversationRecord(
                                        id = UUID.randomUUID().toString(),
                                        personality = resolvedPers,
                                        role = "assistant",
                                        content = cleanReply,
                                        emotion = lastDeltaEmotion,
                                        createdAt = System.currentTimeMillis()
                                    )
                                    db.appendMessage(aiRec)
                                    chatMessages = db.getMessagesForPersonality(resolvedPers)
                                    statusText = cleanReply
                                }
                            }

                            if (cleanReply.isBlank()) {
                                activity.runOnUiThread { orbState = OrbState.IDLE }
                                return@streamAssistant
                            }

                            if (fromVoice || autoSpeakChatReplies) {
                                segmentQueue.addAll(splitSentencesWithEmotion(cleanReply, lastDeltaEmotion))
                                speakSegmentedNeural(
                                    segmentQueue,
                                    resolvedPers,
                                    if (resolvedPers == "girl") 1.05f else 0.94f,
                                    fromVoice
                                )
                            } else {
                                activity.runOnUiThread { orbState = OrbState.IDLE }
                            }
                        },
                        onError = { err ->
                            activity.runOnUiThread {
                                streamingAssistantReply = ""
                                orbState = OrbState.ERROR
                                statusText = err
                                backendOnline = false
                            }
                        }
                    )
                }
            }
            else -> {
                orbState = OrbState.IDLE
            }
        }
    }

    val voiceManager = remember {
        JarvisVoiceManager(
            context = activity,
            onPartialResult = { statusText = it },
            onFinalResult = { transcript -> sendAssistantMessage(transcript, true) },
            onRmsChangedDb = { audioLevel = it },
            onError = {
                orbState = OrbState.IDLE
                statusText = it
            }
        )
    }
    voiceManagerRef[0] = voiceManager

    DisposableEffect(Unit) {
        val receiver = object : BroadcastReceiver() {
            override fun onReceive(context: Context?, intent: Intent?) {
                when (intent?.action) {
                    WakeWordForegroundService.ACTION_WAKE_WORD_TRIGGERED,
                    OverlayBubbleService.ACTION_JARVIS_ACTIVATE -> {
                        if (powerState != AssistantPowerState.SHUTDOWN) {
                            powerState = AssistantPowerState.AWAKE
                            triggerListen()
                        }
                    }
                    OverlayBubbleService.ACTION_JARVIS_DEACTIVATE -> {
                        activeSpeechJobRef[0]?.cancel()
                        voiceManager.stopListening()
                        voiceManager.interruptSpeech()
                        orbState = OrbState.IDLE
                        statusText = "JARVIS Paused"
                    }
                }
            }
        }
        val filter = IntentFilter().apply {
            addAction(WakeWordForegroundService.ACTION_WAKE_WORD_TRIGGERED)
            addAction(OverlayBubbleService.ACTION_JARVIS_ACTIVATE)
            addAction(OverlayBubbleService.ACTION_JARVIS_DEACTIVATE)
        }
        ContextCompat.registerReceiver(activity, receiver, filter, ContextCompat.RECEIVER_NOT_EXPORTED)
        onDispose {
            activeSpeechJobRef[0]?.cancel()
            activity.unregisterReceiver(receiver)
            voiceManager.release()
        }
    }

    val micPermissionLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { granted ->
        permissionRefreshTick++
        if (granted && powerState != AssistantPowerState.SHUTDOWN) {
            powerState = AssistantPowerState.AWAKE
            triggerListen()
        } else if (!granted) {
            statusText = "Microphone permission needed to listen."
        }
    }

    val allRuntimeLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) { results ->
        permissionRefreshTick++
        val grantedCount = results.values.count { it }
        statusText = "Runtime Permissions: $grantedCount/${results.size} granted"
    }

    Scaffold(
        containerColor = Color(0xFF040918),
        topBar = {
            TopAppBar(
                title = {
                    Column {
                        Text("JARVIS AI · ALSMAR BOSS", color = Color.White, fontSize = 16.sp, fontWeight = FontWeight.Bold)
                        Text(
                            text = if (backendOnline) "Neural HD Voice · Online" else "Offline / Check Server",
                            color = if (backendOnline) Color(0xFF34D399) else Color(0xFFF87171),
                            fontSize = 10.sp
                        )
                    }
                },
                actions = {
                    IconButton(onClick = {
                        val locked = JarvisAccessibilityService.instance?.lockDevice() == true
                        statusText = if (locked) "Device locked" else "Enable Accessibility in Settings"
                    }) {
                        Icon(Icons.Default.Lock, contentDescription = "Lock Device", tint = Color(0xFFD4AF37))
                    }
                    IconButton(onClick = {
                        powerState = AssistantPowerState.SHUTDOWN
                        wakeWordServiceRunning = false
                        activeSpeechJobRef[0]?.cancel()
                        voiceManager.stopListening()
                        voiceManager.interruptSpeech()
                        activity.startService(Intent(activity, WakeWordForegroundService::class.java).apply {
                            action = WakeWordForegroundService.ACTION_STOP_COMPLETELY
                        })
                        statusText = "System Shutdown"
                    }) {
                        Icon(Icons.Default.PowerSettingsNew, contentDescription = "Shutdown", tint = Color(0xFFEF4444))
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = Color(0xFF040918))
            )
        },
        bottomBar = {
            NavigationBar(containerColor = Color(0xFF040918)) {
                NavigationBarItem(
                    selected = selectedTab == "home",
                    onClick = { selectedTab = "home" },
                    icon = { Icon(Icons.Default.Home, contentDescription = "Home") },
                    label = { Text("Home") }
                )
                NavigationBarItem(
                    selected = selectedTab == "chat",
                    onClick = { selectedTab = "chat" },
                    icon = { Icon(Icons.Default.ChatBubbleOutline, contentDescription = "Chat") },
                    label = { Text("Chat") }
                )
                NavigationBarItem(
                    selected = selectedTab == "vision",
                    onClick = {
                        selectedTab = "vision"
                        activity.startActivity(Intent(activity, CameraVisionActivity::class.java))
                    },
                    icon = { Icon(Icons.Default.CameraAlt, contentDescription = "Scan / Vision") },
                    label = { Text("Vision") }
                )
                NavigationBarItem(
                    selected = selectedTab == "settings",
                    onClick = {
                        permissionRefreshTick++
                        selectedTab = "settings"
                    },
                    icon = { Icon(Icons.Default.Settings, contentDescription = "Settings") },
                    label = { Text("Control") }
                )
            }
        }
    ) { padding ->
        when (selectedTab) {
            "chat" -> {
                val listState = rememberLazyListState()
                LaunchedEffect(chatMessages.size, streamingAssistantReply) {
                    if (chatMessages.isNotEmpty()) {
                        listState.animateScrollToItem(chatMessages.lastIndex)
                    }
                }
                Column(
                    modifier = Modifier
                        .fillMaxSize()
                        .background(Color(0xFF040918))
                        .padding(padding)
                        .padding(12.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            listOf("jarvis" to "JARVIS", "girl" to "Maya · AI Girl").forEach { (id, label) ->
                                FilterChip(
                                    selected = personality == id,
                                    onClick = { personality = id },
                                    label = { Text(label, fontSize = 12.sp) }
                                )
                            }
                        }
                        IconButton(onClick = { autoSpeakChatReplies = !autoSpeakChatReplies }) {
                            Icon(
                                if (autoSpeakChatReplies) Icons.Default.VolumeUp else Icons.Default.VolumeOff,
                                contentDescription = "Auto Speak",
                                tint = if (autoSpeakChatReplies) Color(0xFF38BDF8) else Color(0xFF64748B)
                            )
                        }
                    }

                    Row(
                        modifier = Modifier.horizontalScroll(rememberScrollState()),
                        horizontalArrangement = Arrangement.spacedBy(6.dp)
                    ) {
                        JarvisEmotion.entries.forEach { emo ->
                            FilterChip(
                                selected = currentEmotion == emo,
                                onClick = { currentEmotion = emo },
                                label = { Text(emo.label, fontSize = 11.sp) }
                            )
                        }
                    }

                    LazyColumn(
                        state = listState,
                        modifier = Modifier
                            .weight(1f)
                            .fillMaxWidth(),
                        verticalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        items(chatMessages, key = { it.id }) { msg ->
                            val isUser = msg.role == "user"
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = if (isUser) Arrangement.End else Arrangement.Start
                            ) {
                                Surface(
                                    color = if (isUser) Color(0xFF2563EB) else Color(0xFF09132D),
                                    shape = RoundedCornerShape(16.dp),
                                    modifier = Modifier.widthIn(max = 310.dp)
                                ) {
                                    Column(modifier = Modifier.padding(12.dp)) {
                                        Text(
                                            text = msg.content,
                                            color = Color.White,
                                            fontSize = 13.sp
                                        )
                                        if (!isUser) {
                                            Spacer(Modifier.height(4.dp))
                                            Row(
                                                horizontalArrangement = Arrangement.spacedBy(10.dp),
                                                verticalAlignment = Alignment.CenterVertically
                                            ) {
                                                Text(
                                                    text = msg.emotion,
                                                    color = Color(0xFFF5C451),
                                                    fontSize = 10.sp
                                                )
                                                TextButton(
                                                    onClick = {
                                                        val segs = splitSentencesWithEmotion(msg.content, msg.emotion)
                                                        speakSegmentedNeural(
                                                            segs,
                                                            msg.personality,
                                                            if (msg.personality == "girl") 1.05f else 0.94f,
                                                            false
                                                        )
                                                    },
                                                    contentPadding = PaddingValues(horizontal = 6.dp, vertical = 0.dp)
                                                ) {
                                                    Text("Speak", fontSize = 11.sp, color = Color(0xFF38BDF8))
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                        if (streamingAssistantReply.isNotBlank()) {
                            item {
                                Surface(
                                    color = Color(0xFF09132D),
                                    shape = RoundedCornerShape(16.dp),
                                    modifier = Modifier.widthIn(max = 310.dp)
                                ) {
                                    Text(
                                        text = streamingAssistantReply,
                                        color = Color(0xFF93C5FD),
                                        fontSize = 13.sp,
                                        modifier = Modifier.padding(12.dp)
                                    )
                                }
                            }
                        }
                    }

                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        OutlinedTextField(
                            value = chatInput,
                            onValueChange = { chatInput = it },
                            placeholder = {
                                Text(
                                    if (personality == "girl") "Message Maya (Hindi/Hinglish/English)..."
                                    else "Message JARVIS...",
                                    fontSize = 12.sp
                                )
                            },
                            singleLine = true,
                            modifier = Modifier.weight(1f)
                        )
                        IconButton(
                            onClick = {
                                if (orbState == OrbState.LISTENING) {
                                    voiceManager.stopListening()
                                    orbState = OrbState.IDLE
                                } else {
                                    micPermissionLauncher.launch(Manifest.permission.RECORD_AUDIO)
                                }
                            },
                            modifier = Modifier.background(
                                if (orbState == OrbState.LISTENING) Color(0xFFEF4444) else Color(0xFF09132D),
                                CircleShape
                            )
                        ) {
                            Icon(
                                if (orbState == OrbState.LISTENING) Icons.Default.MicOff else Icons.Default.Mic,
                                contentDescription = "Voice",
                                tint = Color.White
                            )
                        }
                        IconButton(
                            onClick = {
                                val text = chatInput.trim()
                                if (text.isNotEmpty()) {
                                    chatInput = ""
                                    sendAssistantMessage(text, false)
                                }
                            },
                            modifier = Modifier.background(Color(0xFF2563EB), CircleShape)
                        ) {
                            Icon(Icons.AutoMirrored.Filled.Send, contentDescription = "Send", tint = Color.White)
                        }
                    }
                }
            }

            "settings" -> {
                key(permissionRefreshTick) {
                    val accActive = JarvisAccessibilityService.instance != null
                    val overlayActive = Settings.canDrawOverlays(activity)
                    val writeSettingsActive = Settings.System.canWrite(activity)
                    val batteryExempt = isBatteryOptimizationIgnored(activity)
                    val notifAccess = isNotificationListenerEnabled(activity)
                    val micGranted = ContextCompat.checkSelfPermission(
                        activity,
                        Manifest.permission.RECORD_AUDIO
                    ) == PackageManager.PERMISSION_GRANTED

                    Column(
                        modifier = Modifier
                            .fillMaxSize()
                            .background(Color(0xFF040918))
                            .padding(padding)
                            .verticalScroll(rememberScrollState())
                            .padding(18.dp),
                        verticalArrangement = Arrangement.spacedBy(12.dp)
                    ) {
                        Text(
                            text = "Real Phone Control & Permissions",
                            color = Color.White,
                            fontSize = 18.sp,
                            fontWeight = FontWeight.Bold
                        )
                        Text(
                            text = "Puri phone control (Calls, SMS, Apps, Alarm, Brightness, Flashlight, Screen Touch/Scroll/Lock) aur 24/7 background voice ke liye sab permissions allow karein. Created by ALSMAR BOSS.",
                            color = Color(0xFF94A3B8),
                            fontSize = 12.sp
                        )

                        Button(
                            onClick = { allRuntimeLauncher.launch(buildAllRuntimePermissions()) },
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Text("Grant All Phone & Mic Permissions (1-Tap)")
                        }

                        SpecialPermissionCard(
                            title = "Microphone, Contacts, Calls, SMS, Camera",
                            status = if (micGranted) "ALLOWED" else "TAP GRANT ABOVE",
                            granted = micGranted,
                            actionLabel = "Grant Runtime",
                            onClick = { allRuntimeLauncher.launch(buildAllRuntimePermissions()) }
                        )

                        SpecialPermissionCard(
                            title = "Accessibility Service (Full Screen Tap / Scroll / Lock / Back / Text)",
                            status = if (accActive) "ACTIVE" else "REQUIRED FOR TOUCH CONTROL",
                            granted = accActive,
                            actionLabel = "Open Accessibility",
                            onClick = {
                                activity.startActivity(Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS))
                            }
                        )

                        SpecialPermissionCard(
                            title = "Display Over Other Apps (Floating Circular Logo)",
                            status = if (overlayActive) "ALLOWED" else "NOT ALLOWED",
                            granted = overlayActive,
                            actionLabel = if (overlayActive) (if (overlayBubbleRunning) "Turn Off Logo" else "Show Logo") else "Allow Overlay",
                            onClick = {
                                if (!overlayActive) {
                                    activity.startActivity(
                                        Intent(
                                            Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                                            Uri.parse("package:${activity.packageName}")
                                        )
                                    )
                                } else {
                                    val svc = Intent(activity, OverlayBubbleService::class.java)
                                    if (overlayBubbleRunning) {
                                        activity.stopService(svc)
                                        overlayBubbleRunning = false
                                    } else {
                                        activity.startService(svc)
                                        overlayBubbleRunning = true
                                    }
                                }
                            }
                        )

                        SpecialPermissionCard(
                            title = "Modify System Settings (Screen Brightness)",
                            status = if (writeSettingsActive) "ALLOWED" else "NOT ALLOWED",
                            granted = writeSettingsActive,
                            actionLabel = "Allow Write Settings",
                            onClick = {
                                activity.startActivity(
                                    Intent(
                                        Settings.ACTION_MANAGE_WRITE_SETTINGS,
                                        Uri.parse("package:${activity.packageName}")
                                    )
                                )
                            }
                        )

                        SpecialPermissionCard(
                            title = "24/7 Background Wake-Word (Battery Exemption)",
                            status = if (batteryExempt) "UNRESTRICTED" else "OPTIMIZED",
                            granted = batteryExempt,
                            actionLabel = "Allow 24/7 Run",
                            onClick = {
                                activity.startActivity(
                                    Intent(
                                        Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS,
                                        Uri.parse("package:${activity.packageName}")
                                    )
                                )
                            }
                        )

                        SpecialPermissionCard(
                            title = "Notification Listener (Read Incoming Messages)",
                            status = if (notifAccess) "ALLOWED" else "NOT ALLOWED",
                            granted = notifAccess,
                            actionLabel = "Allow Notifications",
                            onClick = {
                                activity.startActivity(Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS))
                            }
                        )

                        Card(
                            colors = CardDefaults.cardColors(containerColor = Color(0xFF09132D)),
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                                Text("Voice, Language & Background Controls", color = Color.White, fontWeight = FontWeight.SemiBold)
                                Row(
                                    modifier = Modifier.horizontalScroll(rememberScrollState()),
                                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                                ) {
                                    listOf(
                                        "en-IN" to "Hinglish / India",
                                        "hi-IN" to "Hindi",
                                        "en-US" to "English US"
                                    ).forEach { (code, label) ->
                                        FilterChip(
                                            selected = selectedLanguage == code,
                                            onClick = { selectedLanguage = code },
                                            label = { Text(label, fontSize = 11.sp) }
                                        )
                                    }
                                }
                                Row(
                                    modifier = Modifier.fillMaxWidth(),
                                    horizontalArrangement = Arrangement.SpaceBetween,
                                    verticalAlignment = Alignment.CenterVertically
                                ) {
                                    Text("Auto-Listen After Reply", color = Color(0xFFE2E8F0), fontSize = 13.sp)
                                    Switch(checked = autoContinueListening, onCheckedChange = { autoContinueListening = it })
                                }
                                Row(
                                    modifier = Modifier.fillMaxWidth(),
                                    horizontalArrangement = Arrangement.SpaceBetween,
                                    verticalAlignment = Alignment.CenterVertically
                                ) {
                                    Text("24/7 Hey JARVIS / Hey Maya Service", color = Color(0xFFE2E8F0), fontSize = 13.sp)
                                    Switch(
                                        checked = wakeWordServiceRunning,
                                        onCheckedChange = { enable ->
                                            val svc = Intent(activity, WakeWordForegroundService::class.java)
                                            if (enable) {
                                                svc.action = WakeWordForegroundService.ACTION_RESUME_WAKEWORD
                                                ContextCompat.startForegroundService(activity, svc)
                                                wakeWordServiceRunning = true
                                            } else {
                                                svc.action = WakeWordForegroundService.ACTION_STOP_COMPLETELY
                                                activity.startService(svc)
                                                wakeWordServiceRunning = false
                                            }
                                        }
                                    )
                                }

                                OutlinedTextField(
                                    value = customServerUrl,
                                    onValueChange = { customServerUrl = it },
                                    label = { Text("Backend Server URL", fontSize = 11.sp) },
                                    singleLine = true,
                                    modifier = Modifier.fillMaxWidth()
                                )
                                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                    Button(onClick = {
                                        backend.setCustomBaseUrl(customServerUrl)
                                        scope.launch {
                                            val ok = backend.checkHealth()
                                            backendOnline = ok
                                            serverSaveNote = if (ok) "Server connected!" else "Unable to reach server."
                                        }
                                    }) {
                                        Text("Save & Test Server", fontSize = 12.sp)
                                    }
                                    OutlinedButton(onClick = {
                                        db.clearAll()
                                        chatMessages = emptyList()
                                        scope.launch {
                                            val ok = backend.resetMemory()
                                            serverSaveNote = if (ok) "Chats & memory reset!" else "Local chat cleared."
                                        }
                                    }) {
                                        Icon(Icons.Default.DeleteOutline, contentDescription = null, modifier = Modifier.size(16.dp))
                                        Spacer(Modifier.width(4.dp))
                                        Text("Reset Memory", fontSize = 12.sp)
                                    }
                                }
                                if (serverSaveNote.isNotBlank()) {
                                    Text(serverSaveNote, color = Color(0xFF67E8F9), fontSize = 11.sp)
                                }
                                Text(
                                    text = "Gemini, Groq, ElevenLabs & Neural HD Voice backend (.env / AI Studio Secrets) se connected hain.",
                                    color = Color(0xFF94A3B8),
                                    fontSize = 11.sp
                                )
                            }
                        }
                    }
                }
            }

            else -> {
                Column(
                    modifier = Modifier
                        .fillMaxSize()
                        .background(Color(0xFF040918))
                        .padding(padding)
                        .padding(horizontal = 20.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.SpaceEvenly
                ) {
                    weather?.let { w ->
                        Card(
                            colors = CardDefaults.cardColors(containerColor = Color(0xFF09132D)),
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(horizontal = 14.dp, vertical = 10.dp),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Column {
                                    Text(w.city, color = Color.White, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
                                    Text("${w.condition} · ${w.humidity}% Humidity", color = Color(0xFF94A3B8), fontSize = 11.sp)
                                }
                                Text("${w.temperatureC}°C", color = Color(0xFF38BDF8), fontSize = 20.sp, fontWeight = FontWeight.Bold)
                            }
                        }
                    }

                    Row(
                        horizontalArrangement = Arrangement.spacedBy(10.dp),
                        modifier = Modifier.horizontalScroll(rememberScrollState())
                    ) {
                        listOf(
                            "jarvis" to "JARVIS",
                            "girl" to "Maya · AI Girl"
                        ).forEach { (id, label) ->
                            FilterChip(
                                selected = personality == id,
                                onClick = {
                                    personality = id
                                    statusText = "$label · ${currentEmotion.label}"
                                },
                                label = { Text(label) }
                            )
                        }
                    }

                    HolographicOrbCanvas(
                        state = orbState,
                        audioLevel = audioLevel,
                        personality = personality,
                        emotion = currentEmotion,
                        onTap = {
                            if (powerState == AssistantPowerState.SHUTDOWN) {
                                powerState = AssistantPowerState.AWAKE
                                activity.startService(Intent(activity, WakeWordForegroundService::class.java).apply {
                                    action = WakeWordForegroundService.ACTION_RESUME_WAKEWORD
                                })
                                statusText = "JARVIS Restarted"
                            } else if (orbState == OrbState.SPEAKING) {
                                activeSpeechJobRef[0]?.cancel()
                                voiceManager.interruptSpeech()
                                orbState = OrbState.IDLE
                                statusText = "Speech stopped"
                            } else {
                                micPermissionLauncher.launch(Manifest.permission.RECORD_AUDIO)
                            }
                        }
                    )

                    Text(
                        text = "${if (personality == "girl") "MAYA" else "JARVIS"} · ${currentEmotion.label} · ${powerState.name} · $statusText",
                        color = Color(0xFFF5C451),
                        fontSize = 12.sp
                    )

                    if (actionReportText.isNotBlank()) {
                        Card(
                            colors = CardDefaults.cardColors(containerColor = Color(0xFF0B1A38)),
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Text(
                                text = "Executed: $actionReportText",
                                color = Color(0xFF67E8F9),
                                fontSize = 12.sp,
                                modifier = Modifier.padding(10.dp)
                            )
                        }
                    }

                    if (powerState == AssistantPowerState.SHUTDOWN) {
                        Button(onClick = {
                            powerState = AssistantPowerState.AWAKE
                            activity.startService(Intent(activity, WakeWordForegroundService::class.java).apply {
                                action = WakeWordForegroundService.ACTION_RESUME_WAKEWORD
                            })
                            statusText = "JARVIS Ready"
                        }) {
                            Text("Restart JARVIS")
                        }
                    } else {
                        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                            OutlinedButton(onClick = {
                                if (powerState == AssistantPowerState.SLEEPING) {
                                    powerState = AssistantPowerState.AWAKE
                                    activity.startService(Intent(activity, WakeWordForegroundService::class.java).apply {
                                        action = WakeWordForegroundService.ACTION_RESUME_WAKEWORD
                                    })
                                    statusText = "Yes, I'm listening."
                                } else {
                                    powerState = AssistantPowerState.SLEEPING
                                    voiceManager.stopListening()
                                    activity.startService(Intent(activity, WakeWordForegroundService::class.java).apply {
                                        action = WakeWordForegroundService.ACTION_ENTER_SLEEP
                                    })
                                    statusText = "Sleeping · Say 'Hey JARVIS' or 'Hey Maya'"
                                }
                            }) {
                                Text(if (powerState == AssistantPowerState.SLEEPING) "Wake Up" else "Sleep")
                            }
                            OutlinedButton(onClick = {
                                activeSpeechJobRef[0]?.cancel()
                                voiceManager.interruptSpeech()
                                orbState = OrbState.IDLE
                                statusText = "Voice Ready"
                            }) {
                                Icon(Icons.Default.VolumeUp, contentDescription = null, modifier = Modifier.size(16.dp))
                                Spacer(Modifier.width(6.dp))
                                Text("Stop Voice")
                            }
                        }
                    }

                    if (totalTasks > 0) {
                        Card(
                            colors = CardDefaults.cardColors(containerColor = Color(0xFF09132D)),
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Text(
                                text = "Task Manager: $completedTasks/$totalTasks executed",
                                color = Color(0xFFE2E8F0),
                                fontSize = 12.sp,
                                modifier = Modifier.padding(12.dp)
                            )
                        }
                    }

                    IconButton(
                        onClick = {
                            if (powerState == AssistantPowerState.SHUTDOWN) return@IconButton
                            if (orbState == OrbState.LISTENING) {
                                voiceManager.stopListening()
                                orbState = OrbState.IDLE
                                statusText = "Paused"
                            } else {
                                micPermissionLauncher.launch(Manifest.permission.RECORD_AUDIO)
                            }
                        },
                        modifier = Modifier
                            .size(68.dp)
                            .background(
                                if (powerState == AssistantPowerState.SHUTDOWN) Color(0xFF334155) else Color(0xFF2563EB),
                                CircleShape
                            )
                    ) {
                        Icon(Icons.Default.Mic, contentDescription = "Microphone", tint = Color.White)
                    }
                }
            }
        }
    }
}

@Composable
private fun SpecialPermissionCard(
    title: String,
    status: String,
    granted: Boolean,
    actionLabel: String,
    onClick: () -> Unit
) {
    Card(
        colors = CardDefaults.cardColors(containerColor = Color(0xFF09132D)),
        modifier = Modifier.fillMaxWidth()
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(14.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Column(modifier = Modifier.weight(1f).padding(end = 10.dp)) {
                Text(title, color = Color.White, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
                Text(
                    status,
                    color = if (granted) Color(0xFF34D399) else Color(0xFFFBBF24),
                    fontSize = 11.sp
                )
            }
            Button(onClick = onClick) {
                Text(actionLabel, fontSize = 11.sp)
            }
        }
    }
}
