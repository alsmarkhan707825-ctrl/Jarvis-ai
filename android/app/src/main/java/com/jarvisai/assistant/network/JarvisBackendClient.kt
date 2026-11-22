package com.jarvisai.assistant.network

import android.content.Context
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

data class WeatherSnapshot(
    val city: String,
    val temperatureC: Int,
    val condition: String,
    val humidity: Int
)

data class AppControlUpdate(
    val switchPersonality: String? = null,
    val setMood: String? = null,
    val navigateView: String? = null,
    val clearChat: Boolean = false
)

class JarvisBackendClient(private val context: Context? = null) {
    private val client = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(60, TimeUnit.SECONDS)
        .build()

    fun getBaseUrl(): String {
        val saved = context
            ?.getSharedPreferences("jarvis_prefs", Context.MODE_PRIVATE)
            ?.getString("backend_url", "")
            ?.trim()
            ?.trimEnd('/')
        return if (!saved.isNullOrBlank()) saved else BuildConfig.BACKEND_BASE_URL.trimEnd('/')
    }

    fun setCustomBaseUrl(url: String) {
        val clean = url.trim().trimEnd('/')
        context?.getSharedPreferences("jarvis_prefs", Context.MODE_PRIVATE)
            ?.edit()
            ?.putString("backend_url", clean)
            ?.apply()
    }

    suspend fun streamAssistant(
        personality: String,
        message: String,
        moodOverride: String? = null,
        onDelta: (String, String?) -> Unit,
        onCommandSteps: (List<AndroidCommandStep>) -> Unit = {},
        onEmotion: (String) -> Unit = {},
        onAppControl: (AppControlUpdate) -> Unit = {},
        onSleepState: (String) -> Unit = {},
        onDone: (String) -> Unit,
        onError: (String) -> Unit
    ) = withContext(Dispatchers.IO) {
        val payload = JSONObject().apply {
            put("personality", personality)
            put("message", message)
            if (!moodOverride.isNullOrBlank()) put("moodOverride", moodOverride)
        }
        val request = Request.Builder()
            .url("${getBaseUrl()}/api/assistant/stream")
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
                                val emo = data.optString("emotion", "").ifBlank { null }
                                fullText.append(chunk)
                                onDelta(chunk, emo)
                            }
                            "emotion" -> {
                                val emo = data.optString("emotion", "")
                                if (emo.isNotBlank()) onEmotion(emo)
                            }
                            "appControl" -> {
                                val dir = data.optJSONObject("directive")
                                if (dir != null) {
                                    onAppControl(
                                        AppControlUpdate(
                                            switchPersonality = dir.optString("switchPersonality", "").ifBlank { null },
                                            setMood = dir.optString("setMood", "").ifBlank { null },
                                            navigateView = dir.optString("navigateView", "").ifBlank { null },
                                            clearChat = dir.optBoolean("clearChat", false)
                                        )
                                    )
                                }
                            }
                            "sleepState" -> {
                                val s = data.optString("sleepState", "")
                                if (s.isNotBlank()) onSleepState(s)
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
            .url("${getBaseUrl()}/api/voice/tts")
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

    suspend fun fetchWeather(): WeatherSnapshot? = withContext(Dispatchers.IO) {
        val request = Request.Builder()
            .url("${getBaseUrl()}/api/weather")
            .get()
            .build()
        return@withContext try {
            client.newCall(request).execute().use { resp ->
                if (!resp.isSuccessful || resp.body == null) return@withContext null
                val json = JSONObject(resp.body!!.string())
                WeatherSnapshot(
                    city = json.optString("city", "Weather"),
                    temperatureC = json.optInt("temperatureC", 26),
                    condition = json.optString("condition", "Clear"),
                    humidity = json.optInt("humidity", 50)
                )
            }
        } catch (_: Exception) {
            null
        }
    }

    suspend fun resetMemory(): Boolean = withContext(Dispatchers.IO) {
        val request = Request.Builder()
            .url("${getBaseUrl()}/api/system/reset-memory")
            .post("{}".toRequestBody("application/json".toMediaType()))
            .build()
        return@withContext try {
            client.newCall(request).execute().use { it.isSuccessful }
        } catch (_: Exception) {
            false
        }
    }

    suspend fun checkHealth(): Boolean = withContext(Dispatchers.IO) {
        val request = Request.Builder()
            .url("${getBaseUrl()}/api/health")
            .get()
            .build()
        return@withContext try {
            client.newCall(request).execute().use { it.isSuccessful }
        } catch (_: Exception) {
            false
        }
    }
}
