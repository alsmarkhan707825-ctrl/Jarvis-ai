package com.jarvisai.assistant.vision

import android.Manifest
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.os.Bundle
import android.util.Base64
import androidx.activity.ComponentActivity
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import com.jarvisai.assistant.BuildConfig
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import java.io.ByteArrayOutputStream

class CameraVisionActivity : ComponentActivity() {
    private val httpClient = OkHttpClient()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            MaterialTheme(
                colorScheme = darkColorScheme(
                    background = Color(0xFF040918),
                    surface = Color(0xFF09132D),
                    primary = Color(0xFF2563EB),
                    secondary = Color(0xFFD4AF37)
                )
            ) {
                CameraVisionScreen()
            }
        }
    }

    @Composable
    private fun CameraVisionScreen() {
        val scope = rememberCoroutineScope()
        var hasCameraPermission by remember {
            mutableStateOf(
                ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA) ==
                    PackageManager.PERMISSION_GRANTED
            )
        }
        var visionMode by remember { mutableStateOf("scene") }
        var question by remember { mutableStateOf("") }
        var analysisResult by remember { mutableStateOf("Activate camera capture to identify objects, read OCR text, or ask visual questions.") }
        var isAnalyzing by remember { mutableStateOf(false) }

        val permissionLauncher = rememberLauncherForActivityResult(
            ActivityResultContracts.RequestPermission()
        ) { granted ->
            hasCameraPermission = granted
        }

        val captureLauncher = rememberLauncherForActivityResult(
            ActivityResultContracts.TakePicturePreview()
        ) { bitmap: Bitmap? ->
            if (bitmap == null) return@rememberLauncherForActivityResult
            isAnalyzing = true
            scope.launch {
                analysisResult = analyzeBitmap(bitmap, visionMode, question)
                isAnalyzing = false
            }
        }

        Column(
            modifier = Modifier
                .fillMaxSize()
                .background(Color(0xFF040918))
                .padding(20.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Text(
                text = "JARVIS Camera Vision",
                style = MaterialTheme.typography.headlineSmall,
                color = Color.White
            )

            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                listOf("object" to "Object", "ocr" to "Read Text", "scene" to "Scene", "qa" to "Visual Q&A").forEach { (id, label) ->
                    FilterChip(
                        selected = visionMode == id,
                        onClick = { visionMode = id },
                        label = { Text(label) }
                    )
                }
            }

            if (visionMode == "qa") {
                OutlinedTextField(
                    value = question,
                    onValueChange = { question = it },
                    label = { Text("Ask about what the camera sees") },
                    modifier = Modifier.fillMaxWidth()
                )
            }

            Button(
                onClick = {
                    if (!hasCameraPermission) {
                        permissionLauncher.launch(Manifest.permission.CAMERA)
                    } else {
                        captureLauncher.launch(null)
                    }
                },
                enabled = !isAnalyzing
            ) {
                Text(if (!hasCameraPermission) "Grant Camera Permission" else if (isAnalyzing) "Analyzing..." else "Capture & Analyze")
            }

            Card(
                colors = CardDefaults.cardColors(containerColor = Color(0xFF09132D)),
                modifier = Modifier.fillMaxWidth()
            ) {
                Text(
                    text = analysisResult,
                    color = Color(0xFFE2E8F0),
                    modifier = Modifier.padding(16.dp)
                )
            }
        }
    }

    private suspend fun analyzeBitmap(bitmap: Bitmap, mode: String, question: String): String =
        withContext(Dispatchers.IO) {
            try {
                val out = ByteArrayOutputStream()
                bitmap.compress(Bitmap.CompressFormat.JPEG, 85, out)
                val b64 = "data:image/jpeg;base64," + Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP)

                val body = JSONObject().apply {
                    put("imageBase64", b64)
                    put("mimeType", "image/jpeg")
                    put("mode", mode)
                    if (question.isNotBlank()) put("question", question)
                }
                val req = Request.Builder()
                    .url("${BuildConfig.BACKEND_BASE_URL}/api/vision/analyze")
                    .post(body.toString().toRequestBody("application/json".toMediaType()))
                    .build()

                httpClient.newCall(req).execute().use { resp ->
                    val raw = resp.body?.string() ?: return@withContext "Empty response"
                    if (!resp.isSuccessful) return@withContext "Vision error HTTP ${resp.code}"
                    val json = JSONObject(raw)
                    val summary = json.optString("summary", "")
                    val ocr = json.optString("extractedText", "")
                    if (ocr.isNotBlank()) "$summary\n\nOCR:\n$ocr" else summary
                }
            } catch (e: Exception) {
                e.message ?: "Vision request failed"
            }
        }
}
