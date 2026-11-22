package com.jarvisai.assistant.voice

import android.content.Context
import android.content.Intent
import android.media.AudioAttributes
import android.media.MediaPlayer
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import java.io.File
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
    private var mediaPlayer: MediaPlayer? = null
    private var ttsReady = false
    private var lastPartialText: String = ""
    private val mainHandler = Handler(Looper.getMainLooper())
    private var activeSpeechDoneCallback: (() -> Unit)? = null

    var neuralVoiceLocked: Boolean = false
    var allowManualLocalTtsFallback: Boolean = true

    override fun onInit(status: Int) {
        ttsReady = status == TextToSpeech.SUCCESS
        if (ttsReady) {
            tts.language = Locale("en", "IN")
            tts.setOnUtteranceProgressListener(object : UtteranceProgressListener() {
                override fun onStart(utteranceId: String?) {}
                override fun onDone(utteranceId: String?) {
                    mainHandler.post {
                        val cb = activeSpeechDoneCallback
                        activeSpeechDoneCallback = null
                        cb?.invoke()
                    }
                }
                @Deprecated("Deprecated in Java")
                override fun onError(utteranceId: String?) {
                    mainHandler.post {
                        val cb = activeSpeechDoneCallback
                        activeSpeechDoneCallback = null
                        cb?.invoke()
                    }
                }
            })
        }
    }

    fun startListening(languageTag: String = "en-IN") {
        mainHandler.post {
            if (!SpeechRecognizer.isRecognitionAvailable(context)) {
                onError("Speech recognition service unavailable on this phone.")
                return@post
            }
            interruptSpeech()
            stopListeningInternal()
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
                        val msg = when (error) {
                            SpeechRecognizer.ERROR_NO_MATCH,
                            SpeechRecognizer.ERROR_SPEECH_TIMEOUT -> "No speech heard — tap mic or say Hey JARVIS."
                            SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS -> "Microphone permission required."
                            SpeechRecognizer.ERROR_AUDIO -> "Audio capture busy — retrying."
                            SpeechRecognizer.ERROR_NETWORK,
                            SpeechRecognizer.ERROR_NETWORK_TIMEOUT -> "Network speech error."
                            else -> "SpeechRecognizer code: $error"
                        }
                        onError(msg)
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
                putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS, 950L)
                putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_POSSIBLY_COMPLETE_SILENCE_LENGTH_MILLIS, 950L)
            }
            recognizer?.startListening(intent)
        }
    }

    private fun stopListeningInternal() {
        try {
            recognizer?.stopListening()
            recognizer?.destroy()
        } catch (_: Exception) {
        }
        recognizer = null
        lastPartialText = ""
    }

    fun stopListening() {
        mainHandler.post { stopListeningInternal() }
    }

    fun playNeuralAudio(
        audioBytes: ByteArray,
        mimeType: String,
        onFinished: () -> Unit,
        onPlaybackError: (String) -> Unit
    ) {
        mainHandler.post {
            try {
                releaseMediaPlayer()
                val ext = if (mimeType.contains("wav")) "wav" else "mp3"
                val outFile = File(context.cacheDir, "jarvis_tts_reply.$ext")
                outFile.writeBytes(audioBytes)
                val player = MediaPlayer().apply {
                    setAudioAttributes(
                        AudioAttributes.Builder()
                            .setUsage(AudioAttributes.USAGE_ASSISTANT)
                            .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                            .build()
                    )
                    setDataSource(outFile.absolutePath)
                    setOnCompletionListener {
                        releaseMediaPlayer()
                        onFinished()
                    }
                    setOnErrorListener { _, what, _ ->
                        releaseMediaPlayer()
                        onPlaybackError("Audio error ($what)")
                        true
                    }
                    prepare()
                    start()
                }
                mediaPlayer = player
            } catch (e: Exception) {
                releaseMediaPlayer()
                onPlaybackError(e.message ?: "Neural playback failed")
            }
        }
    }

    fun speak(
        text: String,
        pitch: Float = 0.94f,
        rate: Float = 1.0f,
        onFinished: (() -> Unit)? = null
    ) {
        if (text.isBlank()) {
            onFinished?.invoke()
            return
        }
        if (neuralVoiceLocked && onNeuralTtsRequested != null) {
            onNeuralTtsRequested.invoke(text) { err ->
                if (allowManualLocalTtsFallback && ttsReady) {
                    speakLocal(text, pitch, rate, onFinished)
                } else {
                    onError("Voice synthesis failed: $err")
                    onFinished?.invoke()
                }
            }
            return
        }
        speakLocal(text, pitch, rate, onFinished)
    }

    private fun speakLocal(
        text: String,
        pitch: Float,
        rate: Float,
        onFinished: (() -> Unit)? = null
    ) {
        mainHandler.post {
            if (!ttsReady) {
                onError("Device TTS engine initializing.")
                onFinished?.invoke()
                return@post
            }
            activeSpeechDoneCallback = onFinished
            tts.setPitch(pitch)
            tts.setSpeechRate(rate)
            tts.speak(text, TextToSpeech.QUEUE_FLUSH, null, "jarvis-utterance")
        }
    }

    private fun releaseMediaPlayer() {
        try {
            mediaPlayer?.stop()
        } catch (_: Exception) {
        }
        try {
            mediaPlayer?.release()
        } catch (_: Exception) {
        }
        mediaPlayer = null
    }

    fun interruptSpeech() {
        activeSpeechDoneCallback = null
        releaseMediaPlayer()
        if (ttsReady) {
            try {
                tts.stop()
            } catch (_: Exception) {
            }
        }
    }

    fun release() {
        stopListeningInternal()
        interruptSpeech()
        try {
            tts.shutdown()
        } catch (_: Exception) {
        }
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
