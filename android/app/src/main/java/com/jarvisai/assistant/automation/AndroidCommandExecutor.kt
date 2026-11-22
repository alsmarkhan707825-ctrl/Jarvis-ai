package com.jarvisai.assistant.automation

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.hardware.camera2.CameraCharacteristics
import android.hardware.camera2.CameraManager
import android.media.AudioManager
import android.net.Uri
import android.os.BatteryManager
import android.os.Build
import android.provider.AlarmClock
import android.provider.CalendarContract
import android.provider.ContactsContract
import android.provider.Settings
import android.view.KeyEvent
import androidx.core.content.ContextCompat

data class AndroidCommandStep(
    val action: String,
    val targetApp: String = "",
    val nodeText: String = "",
    val inputText: String = "",
    val numericValue: Double? = null
)

class AndroidCommandExecutor(private val context: Context) {

    companion object {
        private var torchEnabled = false

        private val WELL_KNOWN_PACKAGES = mapOf(
            "whatsapp" to "com.whatsapp",
            "youtube" to "com.google.android.youtube",
            "instagram" to "com.instagram.android",
            "facebook" to "com.facebook.katana",
            "chrome" to "com.android.chrome",
            "gmail" to "com.google.android.gm",
            "maps" to "com.google.android.apps.maps",
            "google maps" to "com.google.android.apps.maps",
            "spotify" to "com.spotify.music",
            "telegram" to "org.telegram.messenger",
            "snapchat" to "com.snapchat.android",
            "twitter" to "com.twitter.android",
            "x" to "com.twitter.android",
            "play store" to "com.android.vending",
            "settings" to "com.android.settings",
            "camera" to "com.android.camera",
            "calculator" to "com.google.android.calculator",
            "clock" to "com.google.android.deskclock",
            "ghadi" to "com.google.android.deskclock",
            "alarm" to "com.google.android.deskclock",
            "calendar" to "com.google.android.calendar",
            "messages" to "com.google.android.apps.messaging",
            "sms" to "com.google.android.apps.messaging",
            "phone" to "com.google.android.dialer",
            "dialer" to "com.google.android.dialer",
            "kamera" to "com.android.camera",
            "seting" to "com.android.settings",
            "gaana" to "com.spotify.music"
        )
    }

    fun executeSteps(steps: List<AndroidCommandStep>): String {
        if (steps.isEmpty()) return ""
        val notes = mutableListOf<String>()
        for (step in steps) {
            notes.add(executeSingle(step))
        }
        return notes.filter { it.isNotBlank() }.joinToString(" · ")
    }

    private fun executeSingle(step: AndroidCommandStep): String {
        val acc = JarvisAccessibilityService.instance
        val metrics = context.resources.displayMetrics
        val w = metrics.widthPixels.toFloat()
        val h = metrics.heightPixels.toFloat()

        return when (step.action) {
            "open_app", "switch_app" -> {
                val appName = step.targetApp.ifBlank { step.nodeText }
                if (openAppByName(appName)) "Opened $appName" else "App not found: $appName"
            }
            "call_phone" -> {
                val target = step.nodeText.ifBlank { step.inputText }.ifBlank { step.targetApp }
                placeCall(target)
            }
            "send_sms" -> {
                val target = step.nodeText.ifBlank { step.targetApp }
                composeSms(target, step.inputText)
            }
            "set_volume" -> applyVolume(step.numericValue ?: 65.0)
            "set_brightness" -> applyBrightness(step.numericValue ?: 70.0)
            "toggle_flashlight" -> toggleTorch(step.nodeText.ifBlank { step.inputText })
            "open_wifi_settings" -> openSettingsScreen(
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) Settings.Panel.ACTION_INTERNET_CONNECTIVITY
                else Settings.ACTION_WIFI_SETTINGS,
                "Wi-Fi settings"
            )
            "open_bluetooth_settings" -> openSettingsScreen(Settings.ACTION_BLUETOOTH_SETTINGS, "Bluetooth settings")
            "open_sound_settings" -> openSettingsScreen(Settings.ACTION_SOUND_SETTINGS, "Sound settings")
            "open_dnd_settings" -> openSettingsScreen(Settings.ACTION_NOTIFICATION_POLICY_ACCESS_SETTINGS, "DND settings")
            "open_airplane_settings" -> openSettingsScreen(Settings.ACTION_AIRPLANE_MODE_SETTINGS, "Airplane settings")
            "open_location_settings" -> openSettingsScreen(Settings.ACTION_LOCATION_SOURCE_SETTINGS, "Location settings")
            "open_hotspot_settings" -> openSettingsScreen(Settings.ACTION_WIRELESS_SETTINGS, "Hotspot settings")
            "web_search" -> openWebSearch(step.inputText.ifBlank { step.nodeText })
            "play_media" -> {
                dispatchMedia(KeyEvent.KEYCODE_MEDIA_PLAY)
                "Media play"
            }
            "pause_media" -> {
                dispatchMedia(KeyEvent.KEYCODE_MEDIA_PAUSE)
                "Media pause"
            }
            "stop_media" -> {
                dispatchMedia(KeyEvent.KEYCODE_MEDIA_STOP)
                "Media stopped"
            }
            "next_track" -> {
                dispatchMedia(KeyEvent.KEYCODE_MEDIA_NEXT)
                "Next track"
            }
            "previous_track" -> {
                dispatchMedia(KeyEvent.KEYCODE_MEDIA_PREVIOUS)
                "Previous track"
            }
            "skip_ad" -> {
                if (acc?.skipVisibleAd() == true) "Ad skipped" else "Enable Accessibility to skip ads"
            }
            "tap" -> {
                if (acc != null) {
                    acc.dispatchTapGesture(w * 0.5f, h * 0.5f)
                    "Screen tapped"
                } else "Enable Accessibility for touch control"
            }
            "double_tap" -> {
                if (acc != null) {
                    acc.dispatchDoubleTap(w * 0.5f, h * 0.5f)
                    "Double tapped"
                } else "Enable Accessibility for touch control"
            }
            "long_press" -> {
                if (acc != null) {
                    acc.dispatchLongPress(w * 0.5f, h * 0.5f)
                    "Long pressed"
                } else "Enable Accessibility for touch control"
            }
            "swipe_up", "scroll" -> {
                if (acc != null) {
                    acc.dispatchSwipe(w * 0.5f, h * 0.72f, w * 0.5f, h * 0.25f)
                    "Scrolled down"
                } else "Enable Accessibility for scroll"
            }
            "swipe_down" -> {
                if (acc != null) {
                    acc.dispatchSwipe(w * 0.5f, h * 0.28f, w * 0.5f, h * 0.75f)
                    "Scrolled up"
                } else "Enable Accessibility for scroll"
            }
            "swipe_left" -> {
                if (acc != null) {
                    acc.dispatchSwipe(w * 0.82f, h * 0.5f, w * 0.18f, h * 0.5f)
                    "Swiped left"
                } else "Enable Accessibility for swipe"
            }
            "swipe_right" -> {
                if (acc != null) {
                    acc.dispatchSwipe(w * 0.18f, h * 0.5f, w * 0.82f, h * 0.5f)
                    "Swiped right"
                } else "Enable Accessibility for swipe"
            }
            "micro_scroll_down" -> {
                if (acc != null) {
                    acc.microScroll(true, w, h)
                    "Micro scrolled down"
                } else "Enable Accessibility"
            }
            "micro_scroll_up" -> {
                if (acc != null) {
                    acc.microScroll(false, w, h)
                    "Micro scrolled up"
                } else "Enable Accessibility"
            }
            "scroll_hold" -> {
                if (acc != null) {
                    acc.scrollAndHold(w, h)
                    "Scroll & hold"
                } else "Enable Accessibility"
            }
            "back" -> if (acc?.navigateBack() == true) "Back" else "Enable Accessibility"
            "home" -> if (acc?.navigateHome() == true) "Home screen" else "Enable Accessibility"
            "recent_apps" -> if (acc?.openRecents() == true) "Recent apps" else "Enable Accessibility"
            "read_notifications" -> {
                acc?.showNotifications()
                "Notifications"
            }
            "lock_device" -> if (acc?.lockDevice() == true) "Screen locked" else "Enable Accessibility to lock screen"
            "take_screenshot" -> if (acc?.takeScreenshotAction() == true) "Screenshot captured" else "Enable Accessibility to take screenshot"
            "click_button" -> {
                val target = step.nodeText.ifBlank { step.inputText }
                if (acc != null && target.isNotBlank() && acc.clickNodeByText(target)) {
                    "Tapped $target"
                } else {
                    "Enable Accessibility or button not visible: $target"
                }
            }
            "enter_text" -> {
                val txt = step.inputText.ifBlank { step.nodeText }
                if (acc != null && txt.isNotBlank() && acc.enterTextFocused(txt, pressDone = true)) {
                    "Typed $txt"
                } else {
                    "Enable Accessibility or focus text field first"
                }
            }
            "submit_done", "send_action" -> {
                if (acc != null && (acc.clickNodeByText("Send") || acc.clickNodeByText("Done") || acc.clickNodeByText("Search"))) {
                    "Submitted"
                } else "Submit action sent"
            }
            "set_alarm" -> {
                val alarmIntent = Intent(AlarmClock.ACTION_SET_ALARM).apply {
                    val minutesTotal = (step.numericValue ?: 0.0).toInt()
                    if (minutesTotal > 0) {
                        putExtra(AlarmClock.EXTRA_HOUR, (minutesTotal / 60) % 24)
                        putExtra(AlarmClock.EXTRA_MINUTES, minutesTotal % 60)
                    }
                    putExtra(AlarmClock.EXTRA_MESSAGE, step.inputText.ifBlank { "JARVIS Alarm" })
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                }
                try {
                    context.startActivity(alarmIntent)
                    "Opened Alarm setup"
                } catch (_: Exception) {
                    "Alarm app unavailable"
                }
            }
            "open_calendar" -> {
                val calIntent = Intent(Intent.ACTION_VIEW).apply {
                    data = CalendarContract.CONTENT_URI.buildUpon().appendPath("time").build()
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                }
                try {
                    context.startActivity(calIntent)
                    "Opened Calendar"
                } catch (_: Exception) {
                    "Calendar unavailable"
                }
            }
            "phone_intelligence", "battery_status" -> {
                val bm = context.getSystemService(Context.BATTERY_SERVICE) as BatteryManager
                val pct = bm.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY)
                "Battery $pct%"
            }
            else -> ""
        }
    }

    private fun openAppByName(rawName: String): Boolean {
        val clean = rawName.trim().lowercase()
        if (clean.isEmpty()) return false
        val pm = context.packageManager

        val mappedPkg = WELL_KNOWN_PACKAGES[clean]
        if (mappedPkg != null) {
            val mappedIntent = pm.getLaunchIntentForPackage(mappedPkg)
            if (mappedIntent != null) {
                mappedIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                context.startActivity(mappedIntent)
                return true
            }
        }

        val mainIntent = Intent(Intent.ACTION_MAIN).apply {
            addCategory(Intent.CATEGORY_LAUNCHER)
        }
        val apps = pm.queryIntentActivities(mainIntent, 0)
        val exact = apps.firstOrNull {
            it.loadLabel(pm).toString().trim().equals(clean, ignoreCase = true)
        }
        val partial = exact ?: apps.firstOrNull {
            val label = it.loadLabel(pm).toString().trim().lowercase()
            label.contains(clean) || clean.contains(label)
        } ?: apps.firstOrNull {
            it.activityInfo.packageName.lowercase().contains(clean.replace(" ", ""))
        }

        if (partial != null) {
            val launch = pm.getLaunchIntentForPackage(partial.activityInfo.packageName)
            if (launch != null) {
                launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                context.startActivity(launch)
                return true
            }
        }
        return false
    }

    private fun resolvePhoneNumber(target: String): String? {
        val cleanedDigits = target.replace(Regex("[^+0-9]"), "")
        if (cleanedDigits.length >= 3 && target.any { it.isDigit() }) {
            return cleanedDigits
        }
        if (ContextCompat.checkSelfPermission(context, Manifest.permission.READ_CONTACTS) != PackageManager.PERMISSION_GRANTED) {
            return null
        }
        val cursor = context.contentResolver.query(
            ContactsContract.CommonDataKinds.Phone.CONTENT_URI,
            arrayOf(
                ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME,
                ContactsContract.CommonDataKinds.Phone.NUMBER
            ),
            "${ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME} LIKE ?",
            arrayOf("%${target.trim()}%"),
            null
        )
        cursor?.use {
            if (it.moveToFirst()) {
                return it.getString(1)
            }
        }
        return null
    }

    private fun placeCall(target: String): String {
        val phone = resolvePhoneNumber(target)
        if (phone.isNullOrBlank()) {
            val dialIntent = Intent(Intent.ACTION_DIAL).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            context.startActivity(dialIntent)
            return "Opened Dialer (number/contact permission needed for $target)"
        }
        val hasCallPermission = ContextCompat.checkSelfPermission(
            context,
            Manifest.permission.CALL_PHONE
        ) == PackageManager.PERMISSION_GRANTED
        val action = if (hasCallPermission) Intent.ACTION_CALL else Intent.ACTION_DIAL
        val intent = Intent(action, Uri.parse("tel:${Uri.encode(phone)}")).apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        context.startActivity(intent)
        return if (hasCallPermission) "Calling $target" else "Dialing $target"
    }

    private fun composeSms(target: String, message: String): String {
        val phone = resolvePhoneNumber(target).orEmpty()
        val intent = Intent(Intent.ACTION_SENDTO, Uri.parse("smsto:${Uri.encode(phone)}")).apply {
            if (message.isNotBlank()) putExtra("sms_body", message)
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        return try {
            context.startActivity(intent)
            "Opened SMS for ${target.ifBlank { "recipient" }}"
        } catch (_: Exception) {
            "SMS app unavailable"
        }
    }

    private fun applyVolume(percent: Double): String {
        val am = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager
        val max = am.getStreamMaxVolume(AudioManager.STREAM_MUSIC)
        val clamped = percent.coerceIn(0.0, 100.0)
        val level = ((clamped / 100.0) * max).toInt().coerceIn(0, max)
        am.setStreamVolume(AudioManager.STREAM_MUSIC, level, AudioManager.FLAG_SHOW_UI)
        return "Volume ${clamped.toInt()}%"
    }

    private fun applyBrightness(percent: Double): String {
        if (!Settings.System.canWrite(context)) {
            val intent = Intent(Settings.ACTION_MANAGE_WRITE_SETTINGS).apply {
                data = Uri.parse("package:${context.packageName}")
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            context.startActivity(intent)
            return "Allow Modify System Settings to control brightness"
        }
        val clamped = percent.coerceIn(5.0, 100.0)
        val value = ((clamped / 100.0) * 255).toInt().coerceIn(10, 255)
        Settings.System.putInt(
            context.contentResolver,
            Settings.System.SCREEN_BRIGHTNESS_MODE,
            Settings.System.SCREEN_BRIGHTNESS_MODE_MANUAL
        )
        Settings.System.putInt(context.contentResolver, Settings.System.SCREEN_BRIGHTNESS, value)
        return "Brightness ${clamped.toInt()}%"
    }

    private fun toggleTorch(hint: String): String {
        return try {
            val cm = context.getSystemService(Context.CAMERA_SERVICE) as CameraManager
            val cameraId = cm.cameraIdList.firstOrNull { id ->
                cm.getCameraCharacteristics(id).get(CameraCharacteristics.FLASH_INFO_AVAILABLE) == true
            } ?: return "No camera flash found"
            val lower = hint.lowercase()
            val desired = when {
                lower.contains("off") || lower.contains("band") -> false
                lower.contains("on") || lower.contains("chalu") || lower.contains("jala") -> true
                else -> !torchEnabled
            }
            cm.setTorchMode(cameraId, desired)
            torchEnabled = desired
            if (desired) "Flashlight ON" else "Flashlight OFF"
        } catch (e: Exception) {
            "Flashlight error: ${e.message ?: "unavailable"}"
        }
    }

    private fun openSettingsScreen(action: String, label: String): String {
        return try {
            val intent = Intent(action).apply { addFlags(Intent.FLAG_ACTIVITY_NEW_TASK) }
            context.startActivity(intent)
            "Opened $label"
        } catch (_: Exception) {
            val fallback = Intent(Settings.ACTION_SETTINGS).apply { addFlags(Intent.FLAG_ACTIVITY_NEW_TASK) }
            context.startActivity(fallback)
            "Opened Settings"
        }
    }

    private fun openWebSearch(query: String): String {
        val q = query.trim().ifBlank { "Google" }
        val intent = Intent(Intent.ACTION_VIEW, Uri.parse("https://www.google.com/search?q=${Uri.encode(q)}")).apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        context.startActivity(intent)
        return "Searching $q"
    }

    private fun dispatchMedia(keyCode: Int) {
        val acc = JarvisAccessibilityService.instance
        if (acc != null) {
            acc.dispatchMediaKey(keyCode)
        } else {
            val am = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager
            am.dispatchMediaKeyEvent(KeyEvent(KeyEvent.ACTION_DOWN, keyCode))
            am.dispatchMediaKeyEvent(KeyEvent(KeyEvent.ACTION_UP, keyCode))
        }
    }
}
