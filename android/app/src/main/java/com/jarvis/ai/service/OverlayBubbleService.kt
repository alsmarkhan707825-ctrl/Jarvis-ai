package com.jarvis.ai.service

import android.app.Service
import android.content.Intent
import android.graphics.Color
import android.graphics.PixelFormat
import android.graphics.drawable.GradientDrawable
import android.os.Build
import android.os.IBinder
import android.view.GestureDetector
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.view.WindowManager
import android.widget.ImageView

/**
 * Circular Floating JARVIS Overlay Logo (requires SYSTEM_ALERT_WINDOW / Display Over Other Apps).
 * - Double-Tap: Activates JARVIS voice listening immediately.
 * - Single-Tap: Turns JARVIS off / idle.
 * - Drag: Moves floating circular logo anywhere over third-party apps.
 */
class OverlayBubbleService : Service() {

    private lateinit var windowManager: WindowManager
    private var bubbleView: View? = null
    private var isJarvisActive = false

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        windowManager = getSystemService(WINDOW_SERVICE) as WindowManager
        attachCircularOverlay()
    }

    private fun attachCircularOverlay() {
        val sizePx = (64 * resources.displayMetrics.density).toInt()
        val bubble = ImageView(this).apply {
            background = buildOrbDrawable(active = false)
            elevation = 14f
        }

        val overlayType = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
        } else {
            @Suppress("DEPRECATION")
            WindowManager.LayoutParams.TYPE_PHONE
        }

        val params = WindowManager.LayoutParams(
            sizePx,
            sizePx,
            overlayType,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS,
            PixelFormat.TRANSLUCENT
        ).apply {
            gravity = Gravity.TOP or Gravity.START
            x = 40
            y = 320
        }

        val gestureDetector = GestureDetector(this, object : GestureDetector.SimpleOnGestureListener() {
            override fun onSingleTapConfirmed(e: MotionEvent): Boolean {
                // Single-tap: Turn JARVIS off / standby
                isJarvisActive = false
                bubble.background = buildOrbDrawable(active = false)
                sendBroadcast(Intent(ACTION_JARVIS_DEACTIVATE).setPackage(packageName))
                return true
            }

            override fun onDoubleTap(e: MotionEvent): Boolean {
                // Double-tap: Activate JARVIS listening loop
                isJarvisActive = true
                bubble.background = buildOrbDrawable(active = true)
                sendBroadcast(Intent(ACTION_JARVIS_ACTIVATE).setPackage(packageName))
                return true
            }
        })

        var initialX = 0
        var initialY = 0
        var touchX = 0f
        var touchY = 0f

        bubble.setOnTouchListener { _, event ->
            gestureDetector.onTouchEvent(event)
            when (event.actionMasked) {
                MotionEvent.ACTION_DOWN -> {
                    initialX = params.x
                    initialY = params.y
                    touchX = event.rawX
                    touchY = event.rawY
                    true
                }
                MotionEvent.ACTION_MOVE -> {
                    params.x = initialX + (event.rawX - touchX).toInt()
                    params.y = initialY + (event.rawY - touchY).toInt()
                    windowManager.updateViewLayout(bubble, params)
                    true
                }
                else -> false
            }
        }

        bubbleView = bubble
        windowManager.addView(bubble, params)
    }

    private fun buildOrbDrawable(active: Boolean): GradientDrawable {
        val colors = if (active) {
            intArrayOf(Color.parseColor("#38BDF8"), Color.parseColor("#6366F1"), Color.parseColor("#EC4899"))
        } else {
            intArrayOf(Color.parseColor("#E2E8F0"), Color.parseColor("#2563EB"), Color.parseColor("#0F172A"))
        }
        return GradientDrawable(GradientDrawable.Orientation.TL_BR, colors).apply {
            shape = GradientDrawable.OVAL
            setStroke(4, if (active) Color.WHITE else Color.parseColor("#93C5FD"))
        }
    }

    override fun onDestroy() {
        bubbleView?.let { windowManager.removeView(it) }
        bubbleView = null
        super.onDestroy()
    }

    companion object {
        const val ACTION_JARVIS_ACTIVATE = "com.jarvis.ai.ACTION_ACTIVATE"
        const val ACTION_JARVIS_DEACTIVATE = "com.jarvis.ai.ACTION_DEACTIVATE"
    }
}
