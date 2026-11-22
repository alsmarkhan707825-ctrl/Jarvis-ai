package com.jarvis.ai

import android.Manifest
import android.annotation.SuppressLint
import android.app.Activity
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.webkit.JavascriptInterface
import android.webkit.PermissionRequest
import android.webkit.WebChromeClient
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import com.jarvis.ai.service.OverlayBubbleService
import com.jarvis.ai.service.WakeWordForegroundService

/**
 * MainActivity hosting JARVIS AI (Created by alsmar Boos).
 * Exposes native Android bridge `window.JarvisAndroid` for Overlay Bubble,
 * 24/7 WakeWordForegroundService, Microphone/Camera, and Accessibility permissions.
 */
class MainActivity : Activity() {

    private var webView: WebView? = null
    private val appUrl = "https://ais-pre-yb53jwjapowiiegq66g3yf-298905448014.asia-east1.run.app"

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        webView = WebView(this).apply {
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            settings.mediaPlaybackRequiresUserGesture = false
            settings.cacheMode = WebSettings.LOAD_DEFAULT
            webViewClient = WebViewClient()
            webChromeClient = object : WebChromeClient() {
                override fun onPermissionRequest(request: PermissionRequest) {
                    runOnUiThread {
                        request.grant(request.resources)
                    }
                }
            }
            addJavascriptInterface(AndroidBridge(), "JarvisAndroid")
            loadUrl(appUrl)
        }
        setContentView(webView)
    }

    override fun onStart() {
        super.onStart()
        stopService(Intent(this, OverlayBubbleService::class.java))
    }

    override fun onStop() {
        super.onStop()
        if (Settings.canDrawOverlays(this)) {
            startService(Intent(this, OverlayBubbleService::class.java))
        }
    }

    inner class AndroidBridge {
        @JavascriptInterface
        fun hasOverlayPermission(): Boolean = Settings.canDrawOverlays(this@MainActivity)

        @JavascriptInterface
        fun requestOverlayPermission(): Boolean {
            if (!Settings.canDrawOverlays(this@MainActivity)) {
                val intent = Intent(
                    Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                    Uri.parse("package:$packageName")
                )
                startActivity(intent)
                return false
            }
            return true
        }

        @JavascriptInterface
        fun hasPermission(id: String): Boolean {
            val perm = mapPermissionId(id) ?: return id == "display_over_apps" && hasOverlayPermission()
            return checkSelfPermission(perm) == PackageManager.PERMISSION_GRANTED
        }

        @JavascriptInterface
        fun requestPermission(id: String): Boolean {
            if (id == "display_over_apps") return requestOverlayPermission()
            val perm = mapPermissionId(id) ?: return false
            if (checkSelfPermission(perm) == PackageManager.PERMISSION_GRANTED) return true
            requestPermissions(arrayOf(perm), 101)
            return false
        }

        @JavascriptInterface
        fun toggle24x7WakeWord(enable: Boolean) {
            val intent = Intent(this@MainActivity, WakeWordForegroundService::class.java)
            if (enable) {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    startForegroundService(intent)
                } else {
                    startService(intent)
                }
            } else {
                intent.action = WakeWordForegroundService.ACTION_STOP_24X7
                startService(intent)
            }
        }
    }

    private fun mapPermissionId(id: String): String? = when (id) {
        "microphone", "speech_recognition" -> Manifest.permission.RECORD_AUDIO
        "camera" -> Manifest.permission.CAMERA
        "location" -> Manifest.permission.ACCESS_FINE_LOCATION
        "contacts" -> Manifest.permission.READ_CONTACTS
        "phone_calls" -> Manifest.permission.CALL_PHONE
        "call_logs" -> Manifest.permission.READ_CALL_LOG
        "sms_messages" -> Manifest.permission.SEND_SMS
        "calendar" -> Manifest.permission.READ_CALENDAR
        "bluetooth" -> if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) Manifest.permission.BLUETOOTH_CONNECT else null
        "notifications" -> if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) Manifest.permission.POST_NOTIFICATIONS else null
        else -> null
    }
}
