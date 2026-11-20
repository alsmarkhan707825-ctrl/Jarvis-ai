package com.jarvisai.assistant

import android.Manifest
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CameraAlt
import androidx.compose.material.icons.filled.History
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.Mic
import androidx.compose.material.icons.filled.PowerSettingsNew
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.ContextCompat
import com.jarvisai.assistant.automation.JarvisAccessibilityService
import com.jarvisai.assistant.emotion.EmotionEngine
import com.jarvisai.assistant.emotion.JarvisEmotion
import com.jarvisai.assistant.network.JarvisBackendClient
import com.jarvisai.assistant.orb.HolographicOrbCanvas
import com.jarvisai.assistant.orb.OrbState
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

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun JarvisHomeScreen(activity: ComponentActivity) {
    val scope = rememberCoroutineScope()
    val backend = remember { JarvisBackendClient() }

    var selectedTab by remember { mutableStateOf("home") }
    var orbState by remember { mutableStateOf(OrbState.IDLE) }
    var powerState by remember { mutableStateOf(AssistantPowerState.AWAKE) }
    var audioLevel by remember { mutableFloatStateOf(0f) }
    var personality by remember { mutableStateOf("jarvis") }
    var currentEmotion by remember { mutableStateOf(JarvisEmotion.NORMAL) }
    var statusText by remember { mutableStateOf("JARVIS Ready") }
    var totalTasks by remember { mutableIntStateOf(0) }
    var completedTasks by remember { mutableIntStateOf(0) }

    val voiceManager = remember {
        JarvisVoiceManager(
            context = activity,
            onPartialResult = { statusText = it },
            onFinalResult = { transcript ->
                val lower = transcript.lowercase().trim()
                when {
                    lower.contains("shutdown") || lower.contains("band ho jao") || lower.contains("system band kar do") -> {
                        powerState = AssistantPowerState.SHUTDOWN
                        orbState = OrbState.IDLE
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
                        statusText = if (locked) "Screen locked." else "Enable Accessibility Service to lock screen."
                    }
                    transcript.isNotBlank() && powerState != AssistantPowerState.SHUTDOWN -> {
                        powerState = AssistantPowerState.AWAKE
                        currentEmotion = EmotionEngine.detectFromContext(transcript, currentEmotion)
                        orbState = OrbState.THINKING
                        scope.launch {
                            backend.streamAssistant(
                                personality = personality,
                                message = transcript,
                                onDelta = { },
                                onDone = { fullReply ->
                                    orbState = OrbState.SPEAKING
                                    statusText = fullReply
                                },
                                onError = { err ->
                                    orbState = OrbState.ERROR
                                    statusText = err
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
                orbState = OrbState.ERROR
                statusText = it
            }
        )
    }

    DisposableEffect(Unit) {
        val receiver = object : BroadcastReceiver() {
            override fun onReceive(context: Context?, intent: Intent?) {
                if (intent?.action == WakeWordForegroundService.ACTION_WAKE_WORD_TRIGGERED &&
                    powerState != AssistantPowerState.SHUTDOWN
                ) {
                    powerState = AssistantPowerState.AWAKE
                    statusText = "Yes, I'm listening."
                    orbState = OrbState.LISTENING
                    voiceManager.startListening()
                }
            }
        }
        val filter = IntentFilter(WakeWordForegroundService.ACTION_WAKE_WORD_TRIGGERED)
        ContextCompat.registerReceiver(activity, receiver, filter, ContextCompat.RECEIVER_NOT_EXPORTED)
        onDispose {
            activity.unregisterReceiver(receiver)
            voiceManager.release()
        }
    }

    val micPermissionLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { granted ->
        if (granted && powerState != AssistantPowerState.SHUTDOWN) {
            powerState = AssistantPowerState.AWAKE
            orbState = OrbState.LISTENING
            voiceManager.startListening()
        }
    }

    Scaffold(
        containerColor = Color(0xFF040918),
        topBar = {
            TopAppBar(
                title = { Text("JARVIS AI", color = Color.White) },
                actions = {
                    IconButton(onClick = {
                        val locked = JarvisAccessibilityService.instance?.lockDevice() == true
                        statusText = if (locked) "Device locked" else "Accessibility Service required for lock"
                    }) {
                        Icon(Icons.Default.Lock, contentDescription = "Lock Device", tint = Color(0xFFD4AF37))
                    }
                    IconButton(onClick = {
                        powerState = AssistantPowerState.SHUTDOWN
                        voiceManager.stopListening()
                        voiceManager.interruptSpeech()
                        activity.startService(Intent(activity, WakeWordForegroundService::class.java).apply {
                            action = WakeWordForegroundService.ACTION_STOP_COMPLETELY
                        })
                        statusText = "System Shutdown"
                    }) {
                        Icon(Icons.Default.PowerSettingsNew, contentDescription = "Shutdown", tint = Color(0xFFEF4444))
                    }
                    IconButton(onClick = { /* Open History Screen */ }) {
                        Icon(Icons.Default.History, contentDescription = "Chat History", tint = Color.White)
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
                    onClick = { selectedTab = "settings" },
                    icon = { Icon(Icons.Default.Settings, contentDescription = "Settings") },
                    label = { Text("Settings") }
                )
            }
        }
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .background(Color(0xFF040918))
                .padding(padding)
                .padding(horizontal = 20.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.SpaceEvenly
        ) {
            // 4-Mode Switcher: JARVIS, Normal, JADAVIS, AI Girl
            Row(
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                modifier = Modifier.horizontalScroll(rememberScrollState())
            ) {
                listOf(
                    "jarvis" to "JARVIS",
                    "normal" to "Normal",
                    "jadavis" to "JADAVIS",
                    "girl" to "AI Girl"
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
                    } else {
                        micPermissionLauncher.launch(Manifest.permission.RECORD_AUDIO)
                    }
                }
            )

            // Unboxed Live Status Strip
            Text(
                text = "${personality.uppercase()} · ${currentEmotion.label} · ${powerState.name} · Voice Locked · $statusText",
                color = Color(0xFFF5C451),
                fontSize = 12.sp
            )

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
                Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
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
                }
            }

            if (totalTasks > 0) {
                Card(
                    colors = CardDefaults.cardColors(containerColor = Color(0xFF09132D)),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Text(
                        text = "Task Manager: $completedTasks/$totalTasks completed",
                        color = Color(0xFFE2E8F0),
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
