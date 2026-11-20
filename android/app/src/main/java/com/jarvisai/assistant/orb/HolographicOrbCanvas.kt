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
import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.sin

enum class OrbState { IDLE, LISTENING, THINKING, SPEAKING, ERROR, TOUCH }

@Composable
fun HolographicOrbCanvas(
    state: OrbState,
    audioLevel: Float,
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
                    OrbState.THINKING -> 2400
                    OrbState.SPEAKING -> 3800
                    OrbState.LISTENING -> 4200
                    else -> 8000
                },
                easing = LinearEasing
            ),
            repeatMode = RepeatMode.Restart
        ),
        label = "phase"
    )

    val royalBlue = if (state == OrbState.ERROR) Color(0xFFEF4444) else Color(0xFF2563EB)
    val goldAccent = if (state == OrbState.ERROR) Color(0xFFF59E0B) else Color(0xFFD4AF37)

    Canvas(
        modifier = modifier
            .size(280.dp)
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
        val baseR = size.minDimension * 0.30f
        val dynamicR = baseR + (audioLevel.coerceIn(0f, 1f) * baseR * 0.22f) + if (isTouching) 10f else 0f

        drawCircle(
            brush = Brush.radialGradient(
                colors = listOf(royalBlue.copy(alpha = 0.35f), Color.Transparent),
                center = center,
                radius = dynamicR * 1.75f
            ),
            center = center,
            radius = dynamicR * 1.75f
        )

        drawCircle(
            color = goldAccent.copy(alpha = 0.65f),
            radius = dynamicR * 1.24f,
            center = center,
            style = Stroke(width = 2.5f)
        )

        drawCircle(
            brush = Brush.radialGradient(
                colors = listOf(Color(0xFFFFF8E1), goldAccent, royalBlue, Color(0xFF0A1842)),
                center = center - Offset(dynamicR * 0.2f, dynamicR * 0.2f),
                radius = dynamicR
            ),
            radius = dynamicR,
            center = center
        )

        val arcX = center.x + cos(phase.toDouble()).toFloat() * (dynamicR * 0.48f)
        val arcY = center.y + sin(phase.toDouble()).toFloat() * (dynamicR * 0.48f)
        drawCircle(
            color = goldAccent.copy(alpha = 0.85f),
            radius = 5f,
            center = Offset(arcX, arcY)
        )
    }
}
