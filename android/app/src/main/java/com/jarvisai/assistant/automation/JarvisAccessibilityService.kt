package com.jarvisai.assistant.automation

import android.accessibilityservice.AccessibilityService
import android.accessibilityservice.GestureDescription
import android.content.Context
import android.content.Intent
import android.graphics.Path
import android.media.AudioManager
import android.os.Build
import android.os.Bundle
import android.view.KeyEvent
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo

class JarvisAccessibilityService : AccessibilityService() {

    companion object {
        var instance: JarvisAccessibilityService? = null
            private set

        private val PROTECTED_PACKAGES = setOf(
            "com.google.android.apps.walletnfcrel",
            "com.phonepe.app",
            "net.one97.paytm"
        )
    }

    override fun onServiceConnected() {
        super.onServiceConnected()
        instance = this
    }

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {}

    override fun onInterrupt() {}

    override fun onDestroy() {
        super.onDestroy()
        if (instance == this) instance = null
    }

    fun isProtectedContext(): Boolean {
        val pkg = rootInActiveWindow?.packageName?.toString() ?: return false
        return PROTECTED_PACKAGES.contains(pkg)
    }

    fun launchAppByPackageOrName(packageName: String): Boolean {
        val intent = packageManager.getLaunchIntentForPackage(packageName) ?: return false
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        startActivity(intent)
        return true
    }

    fun clickNodeByText(text: String): Boolean {
        if (isProtectedContext()) return false
        val root = rootInActiveWindow ?: return false
        val matches = root.findAccessibilityNodeInfosByText(text)
        for (node in matches) {
            if (node.isClickable) {
                return node.performAction(AccessibilityNodeInfo.ACTION_CLICK)
            }
            var parent = node.parent
            while (parent != null) {
                if (parent.isClickable) {
                    return parent.performAction(AccessibilityNodeInfo.ACTION_CLICK)
                }
                parent = parent.parent
            }
        }
        val fallbackNode = findNodeByContentOrText(root, text)
        if (fallbackNode != null) {
            if (fallbackNode.isClickable) {
                return fallbackNode.performAction(AccessibilityNodeInfo.ACTION_CLICK)
            }
            var p = fallbackNode.parent
            while (p != null) {
                if (p.isClickable) return p.performAction(AccessibilityNodeInfo.ACTION_CLICK)
                p = p.parent
            }
        }
        return false
    }

    private fun findNodeByContentOrText(node: AccessibilityNodeInfo?, query: String): AccessibilityNodeInfo? {
        if (node == null) return null
        val txt = node.text?.toString().orEmpty()
        val desc = node.contentDescription?.toString().orEmpty()
        if (txt.contains(query, ignoreCase = true) || desc.contains(query, ignoreCase = true)) {
            return node
        }
        for (i in 0 until node.childCount) {
            val found = findNodeByContentOrText(node.getChild(i), query)
            if (found != null) return found
        }
        return null
    }

    private fun findEditableNode(node: AccessibilityNodeInfo?, preferFocused: Boolean): AccessibilityNodeInfo? {
        if (node == null) return null
        if (node.isEditable && (!preferFocused || node.isFocused)) {
            return node
        }
        for (i in 0 until node.childCount) {
            val found = findEditableNode(node.getChild(i), preferFocused)
            if (found != null) return found
        }
        return null
    }

    fun enterTextAndSubmit(hintOrId: String, text: String, pressDone: Boolean = true): Boolean {
        if (isProtectedContext()) return false
        val root = rootInActiveWindow ?: return false
        val targets = if (hintOrId.isNotBlank()) {
            root.findAccessibilityNodeInfosByViewId(hintOrId)
                .ifEmpty { root.findAccessibilityNodeInfosByText(hintOrId) }
        } else {
            emptyList()
        }
        val node = targets.firstOrNull { it.isEditable }
            ?: findEditableNode(root, true)
            ?: findEditableNode(root, false)
            ?: return false
        val args = Bundle().apply {
            putCharSequence(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, text)
        }
        val setOk = node.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, args)
        if (setOk && pressDone && Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            node.performAction(AccessibilityNodeInfo.AccessibilityAction.ACTION_IME_ENTER.id)
        }
        return setOk
    }

    fun enterTextFocused(text: String, pressDone: Boolean = true): Boolean {
        return enterTextAndSubmit("", text, pressDone)
    }

    fun skipVisibleAd(): Boolean {
        return clickNodeByText("Skip Ad") || clickNodeByText("Skip Ads") || clickNodeByText("Skip")
    }

    fun dispatchMediaKey(keyCode: Int) {
        val audioManager = getSystemService(Context.AUDIO_SERVICE) as AudioManager
        audioManager.dispatchMediaKeyEvent(KeyEvent(KeyEvent.ACTION_DOWN, keyCode))
        audioManager.dispatchMediaKeyEvent(KeyEvent(KeyEvent.ACTION_UP, keyCode))
    }

    fun dispatchTapGesture(x: Float, y: Float) {
        if (isProtectedContext()) return
        val path = Path().apply { moveTo(x, y) }
        val stroke = GestureDescription.StrokeDescription(path, 0L, 60L)
        dispatchGesture(GestureDescription.Builder().addStroke(stroke).build(), null, null)
    }

    fun dispatchDoubleTap(x: Float, y: Float) {
        if (isProtectedContext()) return
        val path1 = Path().apply { moveTo(x, y) }
        val s1 = GestureDescription.StrokeDescription(path1, 0L, 45L)
        val s2 = GestureDescription.StrokeDescription(path1, 110L, 45L)
        dispatchGesture(GestureDescription.Builder().addStroke(s1).addStroke(s2).build(), null, null)
    }

    fun dispatchLongPress(x: Float, y: Float, holdMs: Long = 650L) {
        if (isProtectedContext()) return
        val path = Path().apply { moveTo(x, y) }
        val stroke = GestureDescription.StrokeDescription(path, 0L, holdMs)
        dispatchGesture(GestureDescription.Builder().addStroke(stroke).build(), null, null)
    }

    fun dispatchSwipe(startX: Float, startY: Float, endX: Float, endY: Float, durationMs: Long = 260L) {
        if (isProtectedContext()) return
        val path = Path().apply {
            moveTo(startX, startY)
            lineTo(endX, endY)
        }
        val stroke = GestureDescription.StrokeDescription(path, 0L, durationMs)
        dispatchGesture(GestureDescription.Builder().addStroke(stroke).build(), null, null)
    }

    fun microScroll(down: Boolean, screenWidth: Float, screenHeight: Float) {
        val cx = screenWidth * 0.5f
        val startY = screenHeight * 0.55f
        val endY = if (down) screenHeight * 0.42f else screenHeight * 0.68f
        dispatchSwipe(cx, startY, cx, endY, 220L)
    }

    fun scrollAndHold(screenWidth: Float, screenHeight: Float) {
        if (isProtectedContext()) return
        val cx = screenWidth * 0.5f
        val path = Path().apply {
            moveTo(cx, screenHeight * 0.65f)
            lineTo(cx, screenHeight * 0.40f)
        }
        val stroke = GestureDescription.StrokeDescription(path, 0L, 900L, true)
        dispatchGesture(GestureDescription.Builder().addStroke(stroke).build(), null, null)
    }

    fun navigateBack(): Boolean = performGlobalAction(GLOBAL_ACTION_BACK)
    fun navigateHome(): Boolean = performGlobalAction(GLOBAL_ACTION_HOME)
    fun openRecents(): Boolean = performGlobalAction(GLOBAL_ACTION_RECENTS)
    fun showNotifications(): Boolean = performGlobalAction(GLOBAL_ACTION_NOTIFICATIONS)

    fun takeScreenshotAction(): Boolean {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            performGlobalAction(GLOBAL_ACTION_TAKE_SCREENSHOT)
        } else {
            false
        }
    }

    fun lockDevice(): Boolean {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            performGlobalAction(GLOBAL_ACTION_LOCK_SCREEN)
        } else {
            false
        }
    }
}
