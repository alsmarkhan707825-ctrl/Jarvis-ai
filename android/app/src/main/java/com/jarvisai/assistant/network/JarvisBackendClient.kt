package com.jarvisai.assistant.network

import com.jarvisai.assistant.BuildConfig
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
                        val data = JSONObject(line.removePrefix("data: "))
                        if (currentEvent == "delta") {
                            val chunk = data.optString("text", "")
                            fullText.append(chunk)
                            onDelta(chunk)
                        } else if (currentEvent == "error") {
                            onError(data.optString("error", "Stream error"))
                        }
                    }
                }
                onDone(fullText.toString())
            }
        } catch (e: Exception) {
            onError(e.message ?: "Network failure")
        }
    }
}
