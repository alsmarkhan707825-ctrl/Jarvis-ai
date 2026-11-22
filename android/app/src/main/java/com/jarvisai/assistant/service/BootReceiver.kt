package com.jarvisai.assistant.service

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import androidx.core.content.ContextCompat

class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent?) {
        val action = intent?.action ?: return
        if (action == Intent.ACTION_BOOT_COMPLETED || action == Intent.ACTION_MY_PACKAGE_REPLACED) {
            val prefs = context.getSharedPreferences("jarvis_prefs", Context.MODE_PRIVATE)
            val wakeEnabled = prefs.getBoolean("wake_word_24x7", false)
            if (wakeEnabled) {
                val svc = Intent(context, WakeWordForegroundService::class.java).apply {
                    this.action = WakeWordForegroundService.ACTION_RESUME_WAKEWORD
                }
                ContextCompat.startForegroundService(context, svc)
            }
        }
    }
}
