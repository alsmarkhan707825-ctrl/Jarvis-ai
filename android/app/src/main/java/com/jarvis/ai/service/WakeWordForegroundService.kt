package com.jarvis.ai.service

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Intent
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import android.os.Bundle

/**
 * 24/7 Background Wake-Word Foreground Service with WakeLock.
 * Can be toggled ON/OFF by voice command ("wake word on/off") or UI switch.
 */
class WakeWordForegroundService : Service() {

    private var wakeLock: PowerManager.WakeLock? = null
    private var speechRecognizer: SpeechRecognizer? = null
    private var isRunning24x7 = false
    private val wakePhrases = listOf("hey jarvis", "hello jarvis", "wake up jarvis", "jarvis")

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == ACTION_STOP_24X7) {
            stopSelf()
            return START_NOT_STICKY
        }

        ensureNotificationChannel()
        val notification = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            Notification.Builder(this, CHANNEL_ID)
                .setContentTitle("JARVIS AI · 24/7 Voice Active")
                .setContentText("Say 'Hey JARVIS' anytime · Created by alsmar Boos")
                .setSmallIcon(android.R.drawable.ic_btn_speak_now)
                .build()
        } else {
            @Suppress("DEPRECATION")
            Notification.Builder(this)
                .setContentTitle("JARVIS AI · 24/7 Voice Active")
                .setSmallIcon(android.R.drawable.ic_btn_speak_now)
                .build()
        }
        startForeground(1002, notification)

        val pm = getSystemService(POWER_SERVICE) as PowerManager
        if (wakeLock == null) {
            wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "JarvisAI::WakeWord24x7")
            wakeLock?.acquire(24 * 60 * 60 * 1000L)
        }

        if (!isRunning24x7) {
            isRunning24x7 = true
            startWakeListener()
        }
        return START_STICKY
    }

    private fun startWakeListener() {
        if (!isRunning24x7 || !SpeechRecognizer.isRecognitionAvailable(this)) return
        speechRecognizer?.destroy()
        speechRecognizer = SpeechRecognizer.createSpeechRecognizer(this).apply {
            setRecognitionListener(object : RecognitionListener {
                override fun onReadyForSpeech(params: Bundle?) {}
                override fun onBeginningOfSpeech() {}
                override fun onRmsChanged(rmsdB: Float) {}
                override fun onBufferReceived(buffer: ByteArray?) {}
                override fun onEndOfSpeech() {}
                override fun onError(error: Int) {
                    if (isRunning24x7) startWakeListener()
                }
                override fun onPartialResults(partialResults: Bundle?) {
                    checkResults(partialResults)
                }
                override fun onResults(results: Bundle?) {
                    checkResults(results)
                    if (isRunning24x7) startWakeListener()
                }
                override fun onEvent(eventType: Int, params: Bundle?) {}
            })
        }
        val recIntent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
            putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
            putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
            putExtra(RecognizerIntent.EXTRA_LANGUAGE, "en-IN")
        }
        speechRecognizer?.startListening(recIntent)
    }

    private fun checkResults(bundle: Bundle?) {
        val matches = bundle?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION) ?: return
        val combined = matches.joinToString(" ").lowercase()
        if (wakePhrases.any { combined.contains(it) }) {
            sendBroadcast(Intent(OverlayBubbleService.ACTION_JARVIS_ACTIVATE).setPackage(packageName))
        }
    }

    private fun ensureNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val mgr = getSystemService(NotificationManager::class.java)
            mgr.createNotificationChannel(
                NotificationChannel(CHANNEL_ID, "JARVIS 24/7 Wake Word", NotificationManager.IMPORTANCE_LOW)
            )
        }
    }

    override fun onDestroy() {
        isRunning24x7 = false
        speechRecognizer?.destroy()
        speechRecognizer = null
        wakeLock?.let { if (it.isHeld) it.release() }
        wakeLock = null
        super.onDestroy()
    }

    companion object {
        const val CHANNEL_ID = "jarvis_wakeword_24x7"
        const val ACTION_STOP_24X7 = "com.jarvis.ai.STOP_WAKEWORD_24X7"
    }
}
