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
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CameraAlt
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.Mic
import androidx.compose.material.icons.filled.PowerSettingsNew
import androidx.compose.material.icons.filled.Settings
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
import com.jarvisai.assistant.emotion.EmotionEngine
import com.jarvisai.assistant.emotion.JarvisEmotion
import com.jarvisai.assistant.network.JarvisBackendClient
import com.jarvisai.assistant.notifications.JarvisNotificationListener
import com.jarvisai.assistant.orb.HolographicOrbCanvas
import com.jarvisai.assistant.orb.OrbState
import com.jarvisai.assistant.service.OverlayBubbleService
import com.jarvisai.assistant.service.WakeWordForegroundService
import com.jarvisai.assistant.vision.CameraVisionActivity
import com.jarvisai.assistant.voice.JarvisVoiceManager
import kotlinx.coroutines.launch

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

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun JarvisHomeScreen(activity: ComponentActivity) {
    val scope = rememberCoroutineScope()
    val backend = remember { JarvisBackendClient() }
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
    var wakeWordServiceRunning by remember { mutableStateOf(false) }
    var overlayBubbleRunning by remember { mutableStateOf(false) }
    var permissionRefreshTick by remember { mutableIntStateOf(0) }

    val voiceManagerRef = remember { arrayOfNulls<JarvisVoiceManager>(1) }

    val triggerListen = {
        if (powerState != AssistantPowerState.SHUTDOWN) {
            orbState = OrbState.LISTENING
            statusText = "Listening..."
            voiceManagerRef[0]?.startListening("en-IN")
        }
    }

    val voiceManager = remember {
        JarvisVoiceManager(
            context = activity,
            onPartialResult = { statusText = it },
            onFinalResult = { transcript ->
                val lower = transcript.lowercase().trim()
                when {
                    lower.isEmpty() -> {
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
                        statusText = "Sleeping · Say 'Hey JARVIS' to wake"
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
                        currentEmotion = EmotionEngine.detectFromContext(transcript, currentEmotion)
                        orbState = OrbState.THINKING
                        statusText = "Thinking..."
                        actionReportText = ""
                        scope.launch {
                            backend.streamAssistant(
                                personality = personality,
                                message = transcript,
                                onDelta = { },
                                onCommandSteps = { steps ->
                                    activity.runOnUiThread {
                                        totalTasks = steps.size
                                        val note = executor.executeSteps(steps)
                                        completedTasks = steps.size
                                        if (note.isNotBlank()) actionReportText = note
                                    }
                                },
                                onEmotion = { emoLabel ->
                                    val matched = JarvisEmotion.entries.firstOrNull {
                                        it.label.equals(emoLabel, ignoreCase = true)
                                    }
                                    if (matched != null) {
                                        activity.runOnUiThread {
                                            currentEmotion = matched
                                        }
                                    }
                                },
                                onDone = { fullReply ->
                                    val cleanReply = fullReply.trim()
                                    if (cleanReply.isBlank()) {
                                        orbState = OrbState.IDLE
                                        return@streamAssistant
                                    }
                                    activity.runOnUiThread {
                                        orbState = OrbState.SPEAKING
                                        statusText = cleanReply
                                    }
                                    if (wakeWordServiceRunning) {
                                        activity.startService(Intent(activity, WakeWordForegroundService::class.java).apply {
                                            action = WakeWordForegroundService.ACTION_PAUSE_FOR_TTS
                                        })
                                    }
                                    val onSpeechComplete = {
                                        if (wakeWordServiceRunning && powerState == AssistantPowerState.AWAKE) {
                                            activity.startService(Intent(activity, WakeWordForegroundService::class.java).apply {
                                                action = WakeWordForegroundService.ACTION_RESUME_WAKEWORD
                                            })
                                        }
                                        if (autoContinueListening && powerState == AssistantPowerState.AWAKE) {
                                            orbState = OrbState.LISTENING
                                            voiceManagerRef[0]?.startListening("en-IN")
                                        } else {
                                            orbState = OrbState.IDLE
                                        }
                                    }
                                    scope.launch {
                                        val ttsResult = backend.synthesizeSpeech(
                                            text = cleanReply,
                                            personality = personality,
                                            emotion = currentEmotion.label
                                        )
                                        if (ttsResult != null) {
                                            voiceManagerRef[0]?.playNeuralAudio(
                                                audioBytes = ttsResult.first,
                                                mimeType = ttsResult.second,
                                                onFinished = onSpeechComplete,
                                                onPlaybackError = {
                                                    voiceManagerRef[0]?.speak(
                                                        text = cleanReply,
                                                        pitch = if (personality == "girl") 1.05f else 0.94f,
                                                        onFinished = onSpeechComplete
                                                    )
                                                }
                                            )
                                        } else {
                                            voiceManagerRef[0]?.speak(
                                                text = cleanReply,
                                                pitch = if (personality == "girl") 1.05f else 0.94f,
                                                onFinished = onSpeechComplete
                                            )
                                        }
                                    }
                                },
                                onError = { err ->
                                    activity.runOnUiThread {
                                        orbState = OrbState.ERROR
                                        statusText = err
                                    }
                                }
                            )
                        }
                    }
                    else -> {
                        orbState = OrbState.IDLE
                    }
                }
            },
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
                title = { Text("JARVIS AI · ALSMAR BOSS", color = Color.White, fontSize = 17.sp) },
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
                    label = { Text("Control & Perms") }
                )
            }
        }
    ) { padding ->
        if (selectedTab == "settings") {
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
                        text = "Puri phone control (Calls, SMS, Apps, Brightness, Flashlight, Screen Touch/Scroll/Lock) aur smooth voice ke liye sab permissions allow karein.",
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
                        Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            Text("Voice & Wake-Word Controls", color = Color.White, fontWeight = FontWeight.SemiBold)
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
                                Text("24/7 Hey JARVIS Service", color = Color(0xFFE2E8F0), fontSize = 13.sp)
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
                            Text(
                                text = "ElevenLabs, Groq aur Gemini API keys backend server (.env / AI Studio Secrets) se securely connected hain.",
                                color = Color(0xFF94A3B8),
                                fontSize = 11.sp
                            )
                        }
                    }
                }
            }
        } else {
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .background(Color(0xFF040918))
                    .padding(padding)
                    .padding(horizontal = 20.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.SpaceEvenly
            ) {
                // 2 Core Modes: JARVIS & Maya
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
                    onTap = {
                        if (powerState == AssistantPowerState.SHUTDOWN) {
                            powerState = AssistantPowerState.AWAKE
                            activity.startService(Intent(activity, WakeWordForegroundService::class.java).apply {
                                action = WakeWordForegroundService.ACTION_RESUME_WAKEWORD
                            })
                            statusText = "JARVIS Restarted"
                        } else if (orbState == OrbState.SPEAKING) {
                            voiceManager.interruptSpeech()
                            orbState = OrbState.IDLE
                            statusText = "Speech stopped"
                        } else {
                            micPermissionLauncher.launch(Manifest.permission.RECORD_AUDIO)
                        }
                    }
                )

                Text(
                    text = "${personality.uppercase()} · ${currentEmotion.label} · ${powerState.name} · $statusText",
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
                                statusText = "Sleeping · Say 'Hey JARVIS'"
                            }
                        }) {
                            Text(if (powerState == AssistantPowerState.SLEEPING) "Wake Up" else "Sleep")
                        }
                        OutlinedButton(onClick = {
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
