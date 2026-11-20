package com.jarvisai.assistant.notifications

import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification

class JarvisNotificationListener : NotificationListenerService() {
    companion object {
        private val recentNotifications = mutableListOf<Map<String, String>>()
        fun snapshot(): List<Map<String, String>> = synchronized(recentNotifications) {
            recentNotifications.toList()
        }
    }

    override fun onNotificationPosted(sbn: StatusBarNotification?) {
        val extras = sbn?.notification?.extras ?: return
        val title = extras.getString("android.title") ?: return
        val text = extras.getCharSequence("android.text")?.toString() ?: ""
        synchronized(recentNotifications) {
            recentNotifications.add(
                0,
                mapOf(
                    "package" to sbn.packageName,
                    "title" to title,
                    "body" to text
                )
            )
            if (recentNotifications.size > 25) {
                recentNotifications.removeAt(recentNotifications.lastIndex)
            }
        }
    }
}
