package com.jarvisai.assistant.network

import android.util.Base64
import com.jarvisai.assistant.BuildConfig
import com.jarvisai.assistant.automation.AndroidCommandStep
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import java.io.BufferedReader
import java.io.InputStreamReader
import java.util.concurrent.TimeUnit

class JarvisBackendClient {
    private val client = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(60, TimeUnit.SECONDS)
        .build()

    suspend fun streamAssistant(
        personality: String,
        message: String,
        onDelta: (String) -> Unit,
        onCommandSteps: (List<AndroidCommandStep>) -> Unit = {},
        onEmotion: (String) -> Unit = {},
        onDone: (String) -> Unit,
        onError: (String) -> Unit
    ) = withContext(Dispatchers.IO) {
        val payload = JSONObject().apply {
            put("personality", personality)
            put("message", message)
        }
        val request = Request.Builder()
            .url("${BuildConfig.BACKEND_BASE_URL}/api/assistant/stream")
            .post(payload.toString().toRequestBody("application/json".toMediaType()))
            .build()

        try {
            client.newCall(request).execute().use { response ->
                if (!response.isSuccessful || response.body == null) {
                    onError("HTTP ${response.code}")
                    return@withContext
                }
                val reader = BufferedReader(InputStreamReader(response.body!!.byteStream()))
                var currentEvent = ""
                val fullText = StringBuilder()
                while (true) {
                    val line = reader.readLine() ?: break
                    if (line.startsWith("event: ")) {
                        currentEvent = line.removePrefix("event: ").trim()
                    } else if (line.startsWith("data: ")) {
                        val rawJson = line.removePrefix("data: ").trim()
                        if (rawJson.isEmpty()) continue
                        val data = JSONObject(rawJson)
                        when (currentEvent) {
                            "delta" -> {
                                val chunk = data.optString("text", "")
                                fullText.append(chunk)
                                onDelta(chunk)
                            }
                            "emotion" -> {
                                val emo = data.optString("emotion", "")
                                if (emo.isNotBlank()) onEmotion(emo)
                            }
                            "command" -> {
                                val plan = data.optJSONObject("commandPlan")
                                val arr = plan?.optJSONArray("steps")
                                if (arr != null && arr.length() > 0) {
                                    val list = mutableListOf<AndroidCommandStep>()
                                    for (i in 0 until arr.length()) {
                                        val s = arr.optJSONObject(i) ?: continue
                                        list.add(
                                            AndroidCommandStep(
                                                action = s.optString("action", ""),
                                                targetApp = s.optString("targetApp", ""),
                                                nodeText = s.optString("nodeText", ""),
                                                inputText = s.optString("inputText", ""),
                                                numericValue = if (s.has("numericValue") && !s.isNull("numericValue")) {
                                                    s.optDouble("numericValue")
                                                } else {
                                                    null
                                                }
                                            )
                                        )
                                    }
                                    if (list.isNotEmpty()) {
                                        onCommandSteps(list)
                                    }
                                }
                            }
                            "done" -> {
                                val emo = data.optString("emotion", "")
                                if (emo.isNotBlank()) onEmotion(emo)
                            }
                            "error" -> {
                                onError(data.optString("error", "Stream error"))
                                return@withContext
                            }
                        }
                    }
                }
                onDone(fullText.toString())
            }
        } catch (e: Exception) {
            onError(e.message ?: "Network failure")
        }
    }

    suspend fun synthesizeSpeech(
        text: String,
        personality: String,
        emotion: String = "Normal"
    ): Pair<ByteArray, String>? = withContext(Dispatchers.IO) {
        if (text.isBlank()) return@withContext null
        val payload = JSONObject().apply {
            put("text", text)
            put("personality", personality)
            put("emotion", emotion)
        }
        val request = Request.Builder()
            .url("${BuildConfig.BACKEND_BASE_URL}/api/voice/tts")
            .post(payload.toString().toRequestBody("application/json".toMediaType()))
            .build()

        return@withContext try {
            client.newCall(request).execute().use { response ->
                if (!response.isSuccessful || response.body == null) return@withContext null
                val raw = response.body!!.string()
                val json = JSONObject(raw)
                val audioB64 = json.optString("audioBase64", "")
                val mimeType = json.optString("mimeType", "audio/mpeg")
                if (audioB64.isBlank()) return@withContext null
                val bytes = Base64.decode(audioB64, Base64.DEFAULT)
                Pair(bytes, mimeType)
            }
        } catch (_: Exception) {
            null
        }
    }
}
