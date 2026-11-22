package com.jarvisai.assistant.service

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Intent
import android.os.Build
import android.os.Bundle
import android.os.IBinder
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import androidx.core.app.NotificationCompat

class WakeWordForegroundService : Service() {
    companion object {
        const val CHANNEL_ID = "jarvis_wakeword_channel"
        const val ACTION_WAKE_WORD_TRIGGERED = "com.jarvisai.assistant.WAKE_WORD_TRIGGERED"
        const val ACTION_ENTER_SLEEP = "com.jarvisai.assistant.ACTION_ENTER_SLEEP"
        const val ACTION_STOP_COMPLETELY = "com.jarvisai.assistant.ACTION_STOP_COMPLETELY"
        const val ACTION_RESUME_WAKEWORD = "com.jarvisai.assistant.ACTION_RESUME_WAKEWORD"
        const val ACTION_PAUSE_FOR_TTS = "com.jarvisai.assistant.ACTION_PAUSE_FOR_TTS"
        const val EXTRA_WAKE_WORDS = "extra_wake_words"
        const val EXTRA_PHRASE = "extra_phrase"
        const val EXTRA_SENSITIVITY = "extra_sensitivity"
    }

    private var recognizer: SpeechRecognizer? = null
    private var wakePhrases: List<String> = listOf(
        "hey jarvis",
        "hello jarvis",
        "wake up jarvis",
        "jarvis",
        "hey maya",
        "hello maya",
        "maya"
    )
    private var isPausedForTts = false
    private var isSleeping = false
    private var isShutDown = false
    private var sensitivity: Float = 0.72f
    private var lastTriggerAtMs: Long = 0L

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        intent?.getStringArrayListExtra(EXTRA_WAKE_WORDS)?.let { list ->
            if (list.isNotEmpty()) wakePhrases = list.map { it.lowercase().trim() }
        }
        if (intent?.hasExtra(EXTRA_SENSITIVITY) == true) {
            sensitivity = intent.getFloatExtra(EXTRA_SENSITIVITY, 0.72f).coerceIn(0.2f, 1.0f)
        }
        val prefs = getSharedPreferences("jarvis_prefs", MODE_PRIVATE)

        when (intent?.action) {
            ACTION_ENTER_SLEEP -> {
                isSleeping = true
                isShutDown = false
                isPausedForTts = false
                startForeground(102, buildNotification("Sleep mode: listening for Hey JARVIS / Maya"))
                startWakeWordLoop()
                return START_STICKY
            }
            ACTION_STOP_COMPLETELY -> {
                prefs.edit().putBoolean("wake_word_24x7", false).apply()
                isShutDown = true
                isSleeping = false
                recognizer?.stopListening()
                recognizer?.destroy()
                recognizer = null
                stopForeground(STOP_FOREGROUND_REMOVE)
                stopSelf()
                return START_NOT_STICKY
            }
            ACTION_PAUSE_FOR_TTS -> {
                isPausedForTts = true
                recognizer?.cancel()
                return START_STICKY
            }
            ACTION_RESUME_WAKEWORD -> {
                prefs.edit().putBoolean("wake_word_24x7", true).apply()
                isSleeping = false
                isShutDown = false
                isPausedForTts = false
                startForeground(102, buildNotification("24/7 Wake-word active (Hey JARVIS / Maya)"))
                startWakeWordLoop()
                return START_STICKY
            }
            else -> {
                prefs.edit().putBoolean("wake_word_24x7", true).apply()
                isShutDown = false
                startForeground(
                    102,
                    buildNotification(if (isSleeping) "Sleep mode: listening for wake word" else "24/7 Wake-word active (Hey JARVIS / Maya)")
                )
                if (!isPausedForTts) {
                    startWakeWordLoop()
                }
                return START_STICKY
            }
        }
    }

    private fun startWakeWordLoop() {
        if (isShutDown || isPausedForTts) return
        if (!SpeechRecognizer.isRecognitionAvailable(this)) return
        recognizer?.destroy()
        recognizer = SpeechRecognizer.createSpeechRecognizer(this).apply {
            setRecognitionListener(object : RecognitionListener {
                override fun onReadyForSpeech(params: Bundle?) {}
                override fun onBeginningOfSpeech() {}
                override fun onRmsChanged(rmsdB: Float) {}
                override fun onBufferReceived(buffer: ByteArray?) {}
                override fun onEndOfSpeech() {}
                override fun onError(error: Int) {
                    if (!isPausedForTts && !isShutDown) startWakeWordLoop()
                }
                override fun onResults(results: Bundle?) {
                    handleTranscriptBundle(results)
                    if (!isPausedForTts && !isShutDown) startWakeWordLoop()
                }
                override fun onPartialResults(partialResults: Bundle?) {
                    handleTranscriptBundle(partialResults)
                }
                override fun onEvent(eventType: Int, params: Bundle?) {}
            })
        }

        val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
            putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
            putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
        }
        recognizer?.startListening(intent)
    }

    private fun handleTranscriptBundle(bundle: Bundle?) {
        if (isShutDown || isPausedForTts) return
        val matches = bundle?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION) ?: return
        val scores = bundle.getFloatArray(SpeechRecognizer.CONFIDENCE_SCORES)
        val combined = matches.joinToString(" ").lowercase().trim()
        if (combined.isEmpty()) return

        val topScore = scores?.firstOrNull() ?: 1.0f
        val threshold = (1.0f - sensitivity) * 0.4f
        if (topScore >= 0f && topScore < threshold) return

        val matched = wakePhrases.firstOrNull { phrase ->
            if (phrase == "jarvis" && !isSleeping) {
                Regex("\\bjarvis\\b").containsMatchIn(combined)
            } else {
                combined.contains(phrase)
            }
        }
        if (matched != null) {
            val now = System.currentTimeMillis()
            if (now - lastTriggerAtMs < 2000L) return
            lastTriggerAtMs = now
            isSleeping = false
            sendBroadcast(Intent(ACTION_WAKE_WORD_TRIGGERED).apply {
                setPackage(packageName)
                putExtra(EXTRA_PHRASE, matched)
            })
        }
    }

    private fun buildNotification(text: String): Notification {
        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("JARVIS AI Wake-Word Service")
            .setContentText(text)
            .setSmallIcon(android.R.drawable.ic_btn_speak_now)
            .setOngoing(true)
            .build()
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "JARVIS Wake-Word & Background Voice",
                NotificationManager.IMPORTANCE_LOW
            )
            getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
        }
    }

    override fun onDestroy() {
        isShutDown = true
        recognizer?.destroy()
        recognizer = null
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null
}
