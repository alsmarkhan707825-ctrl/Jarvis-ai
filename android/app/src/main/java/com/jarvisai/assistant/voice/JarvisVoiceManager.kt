package com.jarvisai.assistant.voice

import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import android.speech.tts.TextToSpeech
import java.util.Locale

class JarvisVoiceManager(
    private val context: Context,
    private val onPartialResult: (String) -> Unit,
    private val onFinalResult: (String) -> Unit,
    private val onRmsChangedDb: (Float) -> Unit,
    private val onError: (String) -> Unit,
    private val onNeuralTtsRequested: ((text: String, onFailure: (String) -> Unit) -> Unit)? = null
) : TextToSpeech.OnInitListener {

    private var recognizer: SpeechRecognizer? = null
    private var tts: TextToSpeech = TextToSpeech(context, this)
    private var ttsReady = false
    private var lastPartialText: String = ""

    var neuralVoiceLocked: Boolean = true
    var allowManualLocalTtsFallback: Boolean = false

    override fun onInit(status: Int) {
        ttsReady = status == TextToSpeech.SUCCESS
        if (ttsReady) {
            tts.language = Locale("en", "IN")
        }
    }

    fun startListening(languageTag: String = "en-IN") {
        if (!SpeechRecognizer.isRecognitionAvailable(context)) {
            onError("Speech recognition unavailable on this device.")
            return
        }
        stopListening()
        lastPartialText = ""
        recognizer = SpeechRecognizer.createSpeechRecognizer(context).apply {
            setRecognitionListener(object : RecognitionListener {
                override fun onReadyForSpeech(params: Bundle?) {}
                override fun onBeginningOfSpeech() {}
                override fun onRmsChanged(rmsdB: Float) {
                    val normalized = ((rmsdB + 2f) / 12f).coerceIn(0f, 1f)
                    onRmsChangedDb(normalized)
                }
                override fun onBufferReceived(buffer: ByteArray?) {}
                override fun onEndOfSpeech() {}
                override fun onError(error: Int) {
                    onError("SpeechRecognizer error code: $error")
                }
                override fun onResults(results: Bundle?) {
                    val matches = results?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
                    val finalClean = deduplicateTokens(matches?.firstOrNull().orEmpty())
                    lastPartialText = ""
                    onFinalResult(finalClean)
                }
                override fun onPartialResults(partialResults: Bundle?) {
                    val matches = partialResults?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
                    val clean = deduplicateTokens(matches?.firstOrNull().orEmpty())
                    if (clean.isNotEmpty() && clean != lastPartialText) {
                        lastPartialText = clean
                        onPartialResult(clean)
                    }
                }
                override fun onEvent(eventType: Int, params: Bundle?) {}
            })
        }
        val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
            putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
            putExtra(RecognizerIntent.EXTRA_LANGUAGE, languageTag)
            putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
            putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS, 560L)
            putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_POSSIBLY_COMPLETE_SILENCE_LENGTH_MILLIS, 560L)
        }
        recognizer?.startListening(intent)
    }

    fun stopListening() {
        recognizer?.stopListening()
        recognizer?.destroy()
        recognizer = null
        lastPartialText = ""
    }

    fun speak(text: String, pitch: Float = 0.92f, rate: Float = 1.0f) {
        if (text.isBlank()) return
        if (neuralVoiceLocked && onNeuralTtsRequested != null) {
            onNeuralTtsRequested.invoke(text) { err ->
                if (allowManualLocalTtsFallback && ttsReady) {
                    speakLocal(text, pitch, rate)
                } else {
                    onError("Locked Human Voice failed (no silent fallback): $err")
                }
            }
            return
        }
        if (neuralVoiceLocked && !allowManualLocalTtsFallback) {
            onError("Neural voice is locked; local device TTS fallback is disabled.")
            return
        }
        speakLocal(text, pitch, rate)
    }

    private fun speakLocal(text: String, pitch: Float, rate: Float) {
        if (!ttsReady) {
            onError("Local device TTS engine is not ready.")
            return
        }
        tts.setPitch(pitch)
        tts.setSpeechRate(rate)
        tts.speak(text, TextToSpeech.QUEUE_FLUSH, null, "jarvis-utterance")
    }

    fun interruptSpeech() {
        if (ttsReady) tts.stop()
    }

    fun release() {
        stopListening()
        tts.shutdown()
    }

    private fun deduplicateTokens(raw: String): String {
        val tokens = raw.trim().split(Regex("\\s+")).filter { it.isNotEmpty() }
        if (tokens.isEmpty()) return ""
        val out = mutableListOf<String>()
        for (tok in tokens) {
            if (out.isEmpty() || !out.last().equals(tok, ignoreCase = true)) {
                out.add(tok)
            }
        }
        return out.joinToString(" ")
    }
}
