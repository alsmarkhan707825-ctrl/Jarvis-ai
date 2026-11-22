package com.jarvisai.assistant.orb

import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.unit.dp
import com.jarvisai.assistant.emotion.JarvisEmotion
import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.sin

enum class OrbState { IDLE, LISTENING, THINKING, SPEAKING, ERROR, TOUCH }

@Composable
fun HolographicOrbCanvas(
    state: OrbState,
    audioLevel: Float,
    personality: String = "jarvis",
    emotion: JarvisEmotion = JarvisEmotion.NORMAL,
    onTap: () -> Unit,
    modifier: Modifier = Modifier
) {
    var touchOffset by remember { mutableStateOf(Offset.Zero) }
    var isTouching by remember { mutableStateOf(false) }

    val transition = rememberInfiniteTransition(label = "orb_rotation")
    val phase by transition.animateFloat(
        initialValue = 0f,
        targetValue = (2f * PI).toFloat(),
        animationSpec = infiniteRepeatable(
            animation = tween(
                durationMillis = when (state) {
                    OrbState.THINKING -> 2200
                    OrbState.SPEAKING -> 3400
                    OrbState.LISTENING -> 3900
                    else -> 7500
                },
                easing = LinearEasing
            ),
            repeatMode = RepeatMode.Restart
        ),
        label = "phase"
    )

    val (primaryColor, accentColor, coreColor) = when {
        state == OrbState.ERROR -> Triple(Color(0xFFEF4444), Color(0xFFF59E0B), Color(0xFF450A0A))
        emotion == JarvisEmotion.ANGRY -> Triple(Color(0xFFDC2626), Color(0xFFFB923C), Color(0xFF450A0A))
        emotion == JarvisEmotion.ROMANTIC -> Triple(Color(0xFFEC4899), Color(0xFFF43F5E), Color(0xFF500724))
        emotion == JarvisEmotion.HAPPY || emotion == JarvisEmotion.LAUGHING ->
            Triple(Color(0xFF10B981), Color(0xFFFACC15), Color(0xFF064E3B))
        emotion == JarvisEmotion.SAD -> Triple(Color(0xFF3B82F6), Color(0xFF93C5FD), Color(0xFF172554))
        emotion == JarvisEmotion.CURIOUS || emotion == JarvisEmotion.SURPRISED ->
            Triple(Color(0xFF8B5CF6), Color(0xFF38BDF8), Color(0xFF2E1065))
        emotion == JarvisEmotion.EXCITED -> Triple(Color(0xFFF59E0B), Color(0xFFEC4899), Color(0xFF451A03))
        personality == "girl" -> Triple(Color(0xFFE11D48), Color(0xFFA855F7), Color(0xFF4C0519))
        else -> Triple(Color(0xFF2563EB), Color(0xFFD4AF37), Color(0xFF0A1842))
    }

    Canvas(
        modifier = modifier
            .size(230.dp)
            .pointerInput(Unit) {
                detectTapGestures(
                    onPress = {
                        isTouching = true
                        tryAwaitRelease()
                        isTouching = false
                        touchOffset = Offset.Zero
                    },
                    onTap = { onTap() }
                )
            }
            .pointerInput(Unit) {
                detectDragGestures(
                    onDragEnd = {
                        isTouching = false
                        touchOffset = Offset.Zero
                    }
                ) { change, dragAmount ->
                    change.consume()
                    isTouching = true
                    touchOffset = Offset(
                        x = (touchOffset.x + dragAmount.x).coerceIn(-24f, 24f),
                        y = (touchOffset.y + dragAmount.y).coerceIn(-24f, 24f)
                    )
                }
            }
    ) {
        val center = Offset(size.width / 2f + touchOffset.x, size.height / 2f + touchOffset.y)
        val baseR = size.minDimension * 0.31f
        val dynamicR = baseR + (audioLevel.coerceIn(0f, 1f) * baseR * 0.24f) + if (isTouching) 10f else 0f

        drawCircle(
            brush = Brush.radialGradient(
                colors = listOf(primaryColor.copy(alpha = 0.42f), Color.Transparent),
                center = center,
                radius = dynamicR * 1.75f
            ),
            center = center,
            radius = dynamicR * 1.75f
        )

        drawCircle(
            color = accentColor.copy(alpha = 0.7f),
            radius = dynamicR * 1.24f,
            center = center,
            style = Stroke(width = 2.8f)
        )

        drawCircle(
            brush = Brush.radialGradient(
                colors = listOf(Color(0xFFFFF8E1), accentColor, primaryColor, coreColor),
                center = center - Offset(dynamicR * 0.2f, dynamicR * 0.2f),
                radius = dynamicR
            ),
            radius = dynamicR,
            center = center
        )

        val arcX = center.x + cos(phase.toDouble()).toFloat() * (dynamicR * 0.50f)
        val arcY = center.y + sin(phase.toDouble()).toFloat() * (dynamicR * 0.50f)
        drawCircle(
            color = accentColor.copy(alpha = 0.9f),
            radius = 5.5f,
            center = Offset(arcX, arcY)
        )
    }
}
