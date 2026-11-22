import type { EmotionType, PersonalityId, SttProviderId, VoiceSettings } from '../types/jarvis';

export interface ListeningCallbacks {
  onAudioFrame: (rmsLevel: number, bins: Uint8Array) => void;
  onSpeechDetected: () => void;
  onPartialText?: (partialText: string) => void;
  onTranscribing: () => void;
  onFinalText: (text: string) => void;
  onNoSpeech: () => void;
  onError: (message: string) => void;
}

export interface StreamSpeakCallbacks {
  onAmplitude: (level: number) => void;
  onSpeakStart?: () => void;
  onComplete: () => void;
  onError?: (message: string) => void;
}

interface SpeechRecognitionAlternativeLike {
  transcript: string;
  confidence?: number;
}

interface SpeechRecognitionResultLike {
  isFinal: boolean;
  [index: number]: SpeechRecognitionAlternativeLike;
}

interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: ArrayLike<SpeechRecognitionResultLike>;
}

interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((ev: SpeechRecognitionEventLike) => void) | null;
  onerror: ((ev?: { error?: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

interface QueuedTtsChunk {
  index: number;
  text: string;
  abortController: AbortController;
  promise: Promise<{ audioUrl?: string; text?: string; error?: string }>;
}

function pickRecorderMimeType(): string | undefined {
  if (typeof MediaRecorder === 'undefined') return undefined;
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4',
    'audio/ogg;codecs=opus',
  ];
  return candidates.find((m) => MediaRecorder.isTypeSupported(m));
}

function cleanSpeechText(raw: string): string {
  return raw
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/#+\s+/g, '')
    .replace(/[\p{Extended_Pictographic}\p{Emoji_Presentation}\u200D\uFE0F\u2600-\u27BF]/gu, '')
    .replace(/[:;][-~]?[)D(P]/g, '')
    .replace(/[_~<>|•▪►◆★☆✓✔✕✖]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function deduplicateTranscript(raw: string): string {
  const normalized = raw.replace(/\s+/g, ' ').trim();
  if (!normalized) return '';
  const words = normalized.split(' ');
  const cleaned: string[] = [];
  for (let i = 0; i < words.length; i++) {
    const prev = cleaned[cleaned.length - 1];
    if (prev && prev.toLowerCase() === words[i].toLowerCase()) {
      continue;
    }
    cleaned.push(words[i]);
  }
  return cleaned.join(' ');
}

function splitFirstSpeechSegment(
  buffer: string,
  isFirstSegment: boolean
): { segment: string | null; remainder: string } {
  const trimmedStart = buffer.replace(/^\s+/, '');
  if (!trimmedStart) return { segment: null, remainder: '' };

  // Strong sentence boundary: . ! ? । \n
  const sentenceMatch = trimmedStart.match(/^([\s\S]{8,}?[.!?।\n]+)(?:\s+|$)/);
  if (sentenceMatch) {
    const seg = sentenceMatch[1].trim();
    const rem = trimmedStart.slice(sentenceMatch[0].length);
    return { segment: seg, remainder: rem };
  }

  // Ultra-fast first audio start: split at natural clause >= 18 chars or word boundary >= 36 chars
  if (isFirstSegment) {
    const clauseMatch = trimmedStart.match(/^([\s\S]{18,}?[,;:—–-]+)(?:\s+|$)/);
    if (clauseMatch) {
      const seg = clauseMatch[1].trim();
      const rem = trimmedStart.slice(clauseMatch[0].length);
      return { segment: seg, remainder: rem };
    }
    if (trimmedStart.length >= 42) {
      const cutIdx = trimmedStart.lastIndexOf(' ', 40);
      if (cutIdx >= 18) {
        return {
          segment: trimmedStart.slice(0, cutIdx).trim(),
          remainder: trimmedStart.slice(cutIdx).trimStart(),
        };
      }
    }
  }

  // Hard chunk cap to keep TTS fast if model writes a very long run-on sentence
  if (trimmedStart.length > 140) {
    const cutIdx = trimmedStart.lastIndexOf(' ', 130);
    const splitAt = cutIdx > 48 ? cutIdx : 130;
    return {
      segment: trimmedStart.slice(0, splitAt).trim(),
      remainder: trimmedStart.slice(splitAt).trimStart(),
    };
  }

  return { segment: null, remainder: trimmedStart };
}

class VoiceClient {
  private audioCtx: AudioContext | null = null;
  private micStream: MediaStream | null = null;
  private rafId: number | null = null;
  private mediaRecorder: MediaRecorder | null = null;
  private audioChunks: Blob[] = [];
  private livePreviewRec: SpeechRecognitionLike | null = null;
  private latestPartialTranscript = '';
  private hasFinalPreview = false;

  private activeAudioEl: HTMLAudioElement | null = null;
  private sharedAudioEl: HTMLAudioElement | null = null;
  private activeObjectUrl: string | null = null;
  private speechTimerId: number | null = null;
  private isListening = false;
  private isSpeaking = false;
  private cancelCurrentRecording = false;
  private speechDetected = false;
  private activeSessionId = 0;
  private sttAbortController: AbortController | null = null;
  private wakeRecognition: SpeechRecognitionLike | null = null;
  private wakeWatchActive = false;

  // Streaming TTS Queue state
  private streamSessionId = 0;
  private streamDeltaBuffer = '';
  private streamChunkCounter = 0;
  private streamQueue: QueuedTtsChunk[] = [];
  private streamFinishedInput = false;
  private streamPlayingLoopActive = false;
  private streamParams: {
    personality: PersonalityId;
    voice: VoiceSettings;
    emotion: EmotionType;
    callbacks: StreamSpeakCallbacks;
  } | null = null;
  private spokenSegmentsDedupe = new Set<string>();

  primeAudio(): void {
    try {
      const ctx = this.ensureAudioContext();
      const buffer = ctx.createBuffer(1, 1, 22050);
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.connect(ctx.destination);
      src.start(0);
    } catch {
      // ignore if browser blocks AudioContext priming
    }

    // Also unlock a persistent HTMLAudioElement synchronously on user gesture for Android Chrome
    try {
      if (!this.sharedAudioEl) {
        this.sharedAudioEl = new Audio();
      }
      if (!this.isSpeaking) {
        // 1-sample silent WAV to unlock element autoplay policy
        this.sharedAudioEl.src =
          'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA';
        this.sharedAudioEl.volume = 0.01;
        void this.sharedAudioEl.play().catch(() => {});
      }
    } catch {
      // ignore
    }
  }

  getIsSpeaking(): boolean {
    return this.isSpeaking;
  }

  getIsListening(): boolean {
    return this.isListening;
  }

  private ensureAudioContext(): AudioContext {
    if (!this.audioCtx || this.audioCtx.state === 'closed') {
      const Ctx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.audioCtx = new Ctx();
    }
    if (this.audioCtx.state === 'suspended') {
      void this.audioCtx.resume();
    }
    return this.audioCtx;
  }

  startWakeWordWatch(
    wakeWords: string[],
    language: VoiceSettings['language'],
    sensitivity: number,
    onWakeWordDetected: (phrase: string) => void
  ): void {
    this.stopWakeWordWatch();
    if (this.isListening || this.isSpeaking) return;

    const win = window as unknown as {
      SpeechRecognition?: new () => SpeechRecognitionLike;
      webkitSpeechRecognition?: new () => SpeechRecognitionLike;
    };
    const SR = win.SpeechRecognition || win.webkitSpeechRecognition;
    if (!SR) return;

    const normalizedPhrases = wakeWords
      .map((w) => w.trim().toLowerCase())
      .filter(Boolean);
    if (normalizedPhrases.length === 0) return;

    const minConf = Math.max(0.1, Math.min(0.85, 1 - sensitivity * 0.7));

    try {
      const rec = new SR();
      rec.continuous = true;
      rec.interimResults = true;
      rec.lang = language === 'auto' ? 'en-IN' : language;
      this.wakeWatchActive = true;
      this.wakeRecognition = rec;

      rec.onresult = (ev) => {
        if (this.isSpeaking || this.isListening || !this.wakeWatchActive) return;
        for (let i = ev.resultIndex; i < ev.results.length; i++) {
          const alt = ev.results[i]?.[0];
          const text = (alt?.transcript || '').toLowerCase().trim();
          const conf = alt?.confidence ?? 0.9;
          if (conf > 0 && conf < minConf && !ev.results[i]?.isFinal) continue;
          const matched = normalizedPhrases.find((phrase) => text.includes(phrase));
          if (matched) {
            this.stopWakeWordWatch();
            onWakeWordDetected(matched);
            return;
          }
        }
      };

      rec.onerror = () => {
        this.wakeWatchActive = false;
      };

      rec.onend = () => {
        if (this.wakeWatchActive && !this.isSpeaking && !this.isListening) {
          window.setTimeout(() => {
            if (this.wakeWatchActive && !this.isSpeaking && !this.isListening) {
              try {
                rec.start();
              } catch {
                this.wakeWatchActive = false;
              }
            }
          }, 450);
        }
      };

      rec.start();
    } catch {
      this.wakeWatchActive = false;
      this.wakeRecognition = null;
    }
  }

  stopWakeWordWatch(): void {
    this.wakeWatchActive = false;
    if (this.wakeRecognition) {
      try {
        this.wakeRecognition.onresult = null;
        this.wakeRecognition.onerror = null;
        this.wakeRecognition.onend = null;
        this.wakeRecognition.stop();
      } catch {
        // ignore
      }
      this.wakeRecognition = null;
    }
  }

  private stopLivePreviewRecognition(): void {
    if (this.livePreviewRec) {
      try {
        this.livePreviewRec.onresult = null;
        this.livePreviewRec.onerror = null;
        this.livePreviewRec.onend = null;
        this.livePreviewRec.stop();
      } catch {
        // ignore
      }
      this.livePreviewRec = null;
    }
  }

  async startListening(
    voice: VoiceSettings,
    sttProvider: SttProviderId,
    callbacks: ListeningCallbacks
  ): Promise<void> {
    if (this.isSpeaking) {
      this.interruptSpeech();
    }
    this.stopWakeWordWatch();
    this.stopListening(true);
    this.primeAudio();

    const sessionId = ++this.activeSessionId;
    this.isListening = true;
    this.cancelCurrentRecording = false;
    this.speechDetected = false;
    this.audioChunks = [];
    this.latestPartialTranscript = '';
    this.hasFinalPreview = false;

    // Start non-blocking live SpeechRecognition preview for immediate word streaming
    const win = window as unknown as {
      SpeechRecognition?: new () => SpeechRecognitionLike;
      webkitSpeechRecognition?: new () => SpeechRecognitionLike;
    };
    const SR = win.SpeechRecognition || win.webkitSpeechRecognition;
    if (SR) {
      try {
        const previewRec = new SR();
        previewRec.continuous = true;
        previewRec.interimResults = true;
        previewRec.lang = voice.language === 'auto' ? 'en-IN' : voice.language;
        this.livePreviewRec = previewRec;

        const finalizedParts: string[] = [];
        let lastSentPreview = '';

        previewRec.onresult = (ev) => {
          if (!this.isListening || sessionId !== this.activeSessionId) return;
          let interim = '';
          for (let i = ev.resultIndex; i < ev.results.length; i++) {
            const res = ev.results[i];
            const piece = (res?.[0]?.transcript || '').trim();
            if (!piece) continue;
            if (res.isFinal) {
              this.hasFinalPreview = true;
              const lastFinal = finalizedParts[finalizedParts.length - 1];
              if (!lastFinal || lastFinal.toLowerCase() !== piece.toLowerCase()) {
                finalizedParts.push(piece);
              }
            } else {
              interim += (interim ? ' ' : '') + piece;
            }
          }
          const combined = deduplicateTranscript([...finalizedParts, interim].filter(Boolean).join(' '));
          if (combined && combined !== lastSentPreview) {
            lastSentPreview = combined;
            this.latestPartialTranscript = combined;
            this.speechDetected = true;
            callbacks.onSpeechDetected();
            callbacks.onPartialText?.(combined);
          }
        };

        previewRec.onerror = () => {
          // Hardware MediaRecorder stream remains active cleanly
        };

        previewRec.start();
      } catch {
        this.livePreviewRec = null;
      }
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      if (sessionId !== this.activeSessionId || !this.isListening) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      this.micStream = stream;

      const ctx = this.ensureAudioContext();
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 128;
      analyser.smoothingTimeConstant = 0.72;
      source.connect(analyser);

      const freqBins = new Uint8Array(analyser.frequencyBinCount);
      const timeData = new Uint8Array(analyser.fftSize);

      const mimeType = pickRecorderMimeType();
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);
      this.mediaRecorder = recorder;

      recorder.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0 && sessionId === this.activeSessionId) {
          this.audioChunks.push(ev.data);
        }
      };

      recorder.onstop = async () => {
        this.stopLivePreviewRecognition();
        const shouldCancel = this.cancelCurrentRecording || sessionId !== this.activeSessionId;
        const hadSpeech = this.speechDetected;
        const previewCaptured = this.latestPartialTranscript.trim();
        const chunks = [...this.audioChunks];
        this.audioChunks = [];
        this.releaseMicStream();

        if (shouldCancel) return;
        if (!hadSpeech && !previewCaptured) {
          callbacks.onNoSpeech();
          return;
        }

        // Use instant on-device transcript when finalized cleanly or when browser STT mode is locked
        if (
          (sttProvider === 'browser' && previewCaptured.length >= 2) ||
          (sttProvider === 'auto' && this.hasFinalPreview && previewCaptured.length >= 3)
        ) {
          callbacks.onFinalText(deduplicateTranscript(previewCaptured));
          return;
        }

        if (chunks.length === 0) {
          if (previewCaptured) {
            callbacks.onFinalText(deduplicateTranscript(previewCaptured));
          } else {
            callbacks.onNoSpeech();
          }
          return;
        }

        callbacks.onTranscribing();
        const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });

        try {
          const base64DataUrl = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(String(reader.result || ''));
            reader.onerror = () => reject(new Error('Failed to read recorded audio'));
            reader.readAsDataURL(blob);
          });

          if (sessionId !== this.activeSessionId || this.cancelCurrentRecording) return;

          const abortCtrl = new AbortController();
          this.sttAbortController = abortCtrl;

          const resp = await fetch('/api/voice/transcribe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            signal: abortCtrl.signal,
            body: JSON.stringify({
              audioBase64: base64DataUrl,
              mimeType: blob.type,
              language: voice.language,
              sttProvider,
            }),
          });

          if (sessionId !== this.activeSessionId || this.cancelCurrentRecording) return;

          const json = (await resp.json()) as { transcript?: string; error?: string };
          if (!resp.ok) {
            if (previewCaptured && sttProvider === 'auto') {
              callbacks.onFinalText(deduplicateTranscript(previewCaptured));
              return;
            }
            callbacks.onError(json.error || `Transcription HTTP ${resp.status}`);
            return;
          }
          const clean = deduplicateTranscript((json.transcript || previewCaptured || '').trim());
          if (!clean) {
            callbacks.onNoSpeech();
          } else {
            callbacks.onFinalText(clean);
          }
        } catch (err) {
          if ((err as Error).name === 'AbortError' || sessionId !== this.activeSessionId) return;
          if (previewCaptured && sttProvider === 'auto') {
            callbacks.onFinalText(deduplicateTranscript(previewCaptured));
            return;
          }
          callbacks.onError(err instanceof Error ? err.message : 'Speech transcription failed.');
        } finally {
          this.sttAbortController = null;
        }
      };

      recorder.start(80);

      // Fast Adaptive Voice Activity Detection (VAD)
      const startedAt = performance.now();
      let noiseSamples = 0;
      let noiseSum = 0;
      let noiseFloor = 0.014;
      let firstVoiceAt = 0;
      let lastVoiceAt = startedAt;
      let notifiedSpeech = false;

      const pumpAudio = () => {
        if (!this.isListening || sessionId !== this.activeSessionId) return;
        analyser.getByteFrequencyData(freqBins);
        analyser.getByteTimeDomainData(timeData);

        let sumSq = 0;
        for (let i = 0; i < timeData.length; i++) {
          const norm = (timeData[i] - 128) / 128;
          sumSq += norm * norm;
        }
        const rms = Math.min(1, Math.sqrt(sumSq / timeData.length) * 3.5);
        callbacks.onAudioFrame(rms, freqBins);

        const now = performance.now();
        const elapsed = now - startedAt;

        if (elapsed < 110) {
          noiseSum += rms;
          noiseSamples += 1;
          noiseFloor = Math.min(0.08, noiseSum / Math.max(1, noiseSamples));
        } else {
          const threshold = Math.max(0.03, noiseFloor * 1.75);
          if (rms > threshold) {
            if (!this.speechDetected) {
              firstVoiceAt = now;
            }
            this.speechDetected = true;
            lastVoiceAt = now;
            if (!notifiedSpeech) {
              notifiedSpeech = true;
              callbacks.onSpeechDetected();
            }
          } else if (
            this.speechDetected &&
            now - firstVoiceAt > 160 &&
            now - lastVoiceAt > 400
          ) {
            // Instant 400ms end-of-speech trigger
            this.finishListeningAndProcess();
            return;
          } else if (!this.speechDetected && elapsed > 5000) {
            this.finishListeningAndProcess();
            return;
          } else if (elapsed > 18000) {
            this.finishListeningAndProcess();
            return;
          }
        }

        this.rafId = requestAnimationFrame(pumpAudio);
      };
      this.rafId = requestAnimationFrame(pumpAudio);
    } catch (err) {
      this.isListening = false;
      this.stopLivePreviewRecognition();
      this.releaseMicStream();
      if (sessionId === this.activeSessionId) {
        callbacks.onError(
          err instanceof Error ? err.message : 'Microphone permission denied or unavailable.'
        );
      }
    }
  }

  finishListeningAndProcess(): void {
    this.isListening = false;
    this.cancelCurrentRecording = false;
    this.stopLivePreviewRecognition();
    if (this.audioChunks.length > 0 && !this.speechDetected) {
      this.speechDetected = true;
    }
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      try {
        this.mediaRecorder.stop();
      } catch {
        this.releaseMicStream();
      }
    } else {
      this.releaseMicStream();
    }
  }

  stopListening(silentCancel = true): void {
    this.isListening = false;
    this.cancelCurrentRecording = silentCancel;
    this.stopLivePreviewRecognition();
    if (silentCancel) {
      this.activeSessionId += 1;
      if (this.sttAbortController) {
        this.sttAbortController.abort();
        this.sttAbortController = null;
      }
    }
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      try {
        this.mediaRecorder.stop();
      } catch {
        this.releaseMicStream();
      }
    } else {
      this.releaseMicStream();
    }
  }

  private releaseMicStream(): void {
    if (this.micStream) {
      this.micStream.getTracks().forEach((t) => t.stop());
      this.micStream = null;
    }
  }

  interruptSpeech(): void {
    this.streamSessionId += 1;
    this.isSpeaking = false;
    this.streamPlayingLoopActive = false;
    this.streamDeltaBuffer = '';
    this.streamFinishedInput = true;
    for (const chunk of this.streamQueue) {
      try {
        chunk.abortController.abort();
      } catch {
        // ignore
      }
    }
    this.streamQueue = [];
    this.streamParams = null;

    if (this.activeAudioEl) {
      try {
        this.activeAudioEl.pause();
        this.activeAudioEl.src = '';
      } catch {
        // ignore
      }
      this.activeAudioEl = null;
    }
    if (this.activeObjectUrl) {
      URL.revokeObjectURL(this.activeObjectUrl);
      this.activeObjectUrl = null;
    }
    if (this.speechTimerId !== null) {
      cancelAnimationFrame(this.speechTimerId);
      this.speechTimerId = null;
    }
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
  }

  // ==================== STREAMING TTS PIPELINE ====================

  startStreamSession(
    personality: PersonalityId,
    voice: VoiceSettings,
    emotion: EmotionType,
    callbacks: StreamSpeakCallbacks
  ): void {
    this.interruptSpeech();
    this.stopWakeWordWatch();
    this.stopListening(true);

    this.streamSessionId += 1;
    this.streamDeltaBuffer = '';
    this.streamChunkCounter = 0;
    this.streamQueue = [];
    this.streamFinishedInput = false;
    this.streamPlayingLoopActive = false;
    this.spokenSegmentsDedupe.clear();
    this.streamParams = { personality, voice, emotion, callbacks };
  }

  setStreamEmotion(emotion: EmotionType): void {
    if (this.streamParams) {
      this.streamParams.emotion = emotion;
    }
  }

  pushStreamDelta(deltaText: string): void {
    if (!this.streamParams || !deltaText) return;
    this.streamDeltaBuffer += deltaText;
    this.drainStreamBuffer(false);
  }

  finishStreamSession(): void {
    if (!this.streamParams) return;
    this.streamFinishedInput = true;
    this.drainStreamBuffer(true);

    // If nothing was queued at all, complete cleanly
    if (!this.streamPlayingLoopActive && this.streamQueue.length === 0) {
      const cb = this.streamParams.callbacks;
      this.isSpeaking = false;
      this.streamParams = null;
      cb.onAmplitude(0);
      cb.onComplete();
    }
  }

  private drainStreamBuffer(flushAll: boolean): void {
    if (!this.streamParams) return;

    while (true) {
      const isFirst = this.streamChunkCounter === 0;
      const { segment, remainder } = splitFirstSpeechSegment(this.streamDeltaBuffer, isFirst);
      if (segment) {
        this.streamDeltaBuffer = remainder;
        this.enqueueSegment(segment);
      } else {
        break;
      }
    }

    if (flushAll && this.streamDeltaBuffer.trim()) {
      const finalSeg = this.streamDeltaBuffer.trim();
      this.streamDeltaBuffer = '';
      this.enqueueSegment(finalSeg);
    }
  }

  private enqueueSegment(rawSegment: string): void {
    if (!this.streamParams) return;
    const speakable = cleanSpeechText(rawSegment);
    if (!speakable) return;
    const cleanKey = speakable.toLowerCase();
    if (this.spokenSegmentsDedupe.has(cleanKey)) return;
    this.spokenSegmentsDedupe.add(cleanKey);

    const sessionId = this.streamSessionId;
    const index = ++this.streamChunkCounter;
    const abortController = new AbortController();
    const { personality, voice, emotion } = this.streamParams;

    const promise = this.synthesizeChunk(
      speakable,
      personality,
      voice,
      emotion,
      abortController.signal,
      sessionId
    );

    this.streamQueue.push({
      index,
      text: speakable,
      abortController,
      promise,
    });

    if (!this.streamPlayingLoopActive) {
      void this.runPlaybackLoop(sessionId);
    }
  }

  private async synthesizeChunk(
    text: string,
    personality: PersonalityId,
    voice: VoiceSettings,
    emotion: EmotionType,
    signal: AbortSignal,
    sessionId: number
  ): Promise<{ audioUrl?: string; text?: string; error?: string }> {
    if (sessionId !== this.streamSessionId) return {};

    // Respect Browser TTS ONLY if explicitly selected
    if (voice.ttsEngine === 'browser') {
      return { text };
    }

    try {
      const resp = await fetch('/api/voice/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal,
        body: JSON.stringify({
          text,
          personality,
          emotion,
          voiceOverride: {
            ttsEngine: voice.ttsEngine,
            voiceName: voice.voiceName,
            voiceModel: voice.voiceModel,
            speed: voice.speed,
            pitch: voice.pitch,
            volume: voice.volume,
            voiceStability: voice.voiceStability,
            language: voice.language,
            emotionIntensity: voice.emotionIntensity,
            emotionalStyle: voice.emotionalStyle,
          },
        }),
      });

      if (sessionId !== this.streamSessionId) return {};

      const data = (await resp.json()) as { audioBase64?: string; mimeType?: string; error?: string };
      if (!resp.ok || !data.audioBase64) {
        const msg = data.error || `Neural voice provider (${voice.ttsEngine}) failed (HTTP ${resp.status}).`;
        if (voice.manualFallbackToBrowserTts) {
          return { text };
        }
        return { error: msg };
      }

      const binary = atob(data.audioBase64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      const audioBlob = new Blob([bytes], { type: data.mimeType || 'audio/wav' });
      return { audioUrl: URL.createObjectURL(audioBlob) };
    } catch (err) {
      if ((err as Error).name === 'AbortError' || sessionId !== this.streamSessionId) return {};
      if (voice.manualFallbackToBrowserTts) {
        return { text };
      }
      return {
        error:
          err instanceof Error
            ? `Locked Neural Voice (${voice.ttsEngine}/${voice.voiceName}) failed: ${err.message}`
            : `Locked Neural Voice (${voice.ttsEngine}/${voice.voiceName}) failed.`,
      };
    }
  }

  private async runPlaybackLoop(sessionId: number): Promise<void> {
    if (this.streamPlayingLoopActive || !this.streamParams) return;
    this.streamPlayingLoopActive = true;
    this.isSpeaking = true;
    this.streamParams.callbacks.onSpeakStart?.();

    while (sessionId === this.streamSessionId && this.isSpeaking) {
      const nextItem = this.streamQueue.shift();
      if (!nextItem) {
        if (this.streamFinishedInput) break;
        await new Promise((r) => setTimeout(r, 35));
        continue;
      }

      const resolved = await nextItem.promise;
      if (sessionId !== this.streamSessionId || !this.isSpeaking) {
        if (resolved.audioUrl) URL.revokeObjectURL(resolved.audioUrl);
        break;
      }

      if (resolved.error) {
        if (this.streamParams?.voice.manualFallbackToBrowserTts && this.streamParams) {
          await this.playBrowserUtterance(
            nextItem.text,
            this.streamParams.voice,
            this.streamParams.callbacks.onAmplitude,
            sessionId
          );
          continue;
        }
        this.streamParams?.callbacks.onError?.(resolved.error);
        this.interruptSpeech();
        return;
      }

      if (resolved.audioUrl && this.streamParams) {
        const played = await this.playAudioUrl(
          resolved.audioUrl,
          this.streamParams.voice,
          this.streamParams.callbacks.onAmplitude,
          sessionId
        );
        if (!played && sessionId === this.streamSessionId && this.isSpeaking && this.streamParams) {
          await this.playBrowserUtterance(
            nextItem.text,
            this.streamParams.voice,
            this.streamParams.callbacks.onAmplitude,
            sessionId
          );
        }
      } else if (resolved.text && this.streamParams) {
        await this.playBrowserUtterance(
          resolved.text,
          this.streamParams.voice,
          this.streamParams.callbacks.onAmplitude,
          sessionId
        );
      }
    }

    if (sessionId === this.streamSessionId) {
      const cb = this.streamParams?.callbacks;
      this.isSpeaking = false;
      this.streamPlayingLoopActive = false;
      this.streamParams = null;
      cb?.onAmplitude(0);
      cb?.onComplete();
    }
  }

  private playAudioUrl(
    url: string,
    voice: VoiceSettings,
    onAmplitude: (level: number) => void,
    sessionId: number
  ): Promise<boolean> {
    return new Promise((resolve) => {
      if (sessionId !== this.streamSessionId || !this.isSpeaking) {
        URL.revokeObjectURL(url);
        resolve(true);
        return;
      }

      const audioEl = this.sharedAudioEl || new Audio();
      this.sharedAudioEl = audioEl;
      audioEl.pause();
      audioEl.src = url;
      audioEl.volume = Math.max(0, Math.min(1, voice.volume ?? 1));
      audioEl.playbackRate = Math.max(0.75, Math.min(1.4, voice.speed || 1));

      this.activeAudioEl = audioEl;
      this.activeObjectUrl = url;

      let fallbackPhase = 0;
      const tick = () => {
        if (!this.isSpeaking || sessionId !== this.streamSessionId) return;
        fallbackPhase += 0.24;
        const env = !audioEl.paused && !audioEl.ended
          ? 0.34 + Math.abs(Math.sin(fallbackPhase)) * 0.42 + Math.abs(Math.cos(fallbackPhase * 0.63)) * 0.2
          : 0.08;
        onAmplitude(Math.min(1, env));
        this.speechTimerId = requestAnimationFrame(tick);
      };

      const cleanup = (didPlay: boolean) => {
        audioEl.onplay = null;
        audioEl.onended = null;
        audioEl.onerror = null;
        if (this.speechTimerId !== null) {
          cancelAnimationFrame(this.speechTimerId);
          this.speechTimerId = null;
        }
        URL.revokeObjectURL(url);
        if (this.activeObjectUrl === url) {
          this.activeObjectUrl = null;
        }
        if (this.activeAudioEl === audioEl) {
          this.activeAudioEl = null;
        }
        resolve(didPlay);
      };

      audioEl.onplay = () => {
        this.speechTimerId = requestAnimationFrame(tick);
      };
      audioEl.onended = () => cleanup(true);
      audioEl.onerror = () => cleanup(false);

      void audioEl.play().catch(() => {
        cleanup(false);
      });
    });
  }

  private playBrowserUtterance(
    text: string,
    voice: VoiceSettings,
    onAmplitude: (level: number) => void,
    sessionId: number
  ): Promise<void> {
    return new Promise((resolve) => {
      if (!('speechSynthesis' in window) || !this.isSpeaking || sessionId !== this.streamSessionId) {
        resolve();
        return;
      }
      const cleanText = cleanSpeechText(text);
      if (!cleanText) {
        resolve();
        return;
      }
      const utter = new SpeechSynthesisUtterance(cleanText);
      const hasHindiScript = /[\u0900-\u097F]/.test(cleanText);
      const targetLang =
        voice.language && voice.language !== 'auto'
          ? voice.language
          : hasHindiScript
            ? 'hi-IN'
            : 'en-IN';
      utter.lang = targetLang;
      utter.rate = Math.max(0.78, Math.min(1.35, voice.speed || 1));
      utter.pitch = Math.max(
        0.7,
        Math.min(1.25, voice.pitch || (voice.gender === 'male' ? 0.92 : 1.06))
      );
      utter.volume = Math.max(0, Math.min(1, voice.volume ?? 1));

      const voices = window.speechSynthesis.getVoices();
      const langPrefix = targetLang.split('-')[0].toLowerCase();
      const matchingLangVoices = voices.filter((v) =>
        v.lang.toLowerCase().startsWith(langPrefix)
      );
      const pool = matchingLangVoices.length > 0 ? matchingLangVoices : voices;
      const targetVoice =
        pool.find((v) =>
          voice.gender === 'female'
            ? /natural|neural|google|microsoft.*(swara|heera|zira|aria|jenny)|samantha|lekha|karen/i.test(v.name)
            : /natural|neural|google|microsoft.*(madhur|prabhat|rishi|guy|daniel|ryan)|rishi|daniel/i.test(v.name)
        ) ||
        pool.find((v) =>
          voice.gender === 'female'
            ? /female|woman|heera|lekha|swara|samantha|karen|victoria/i.test(v.name)
            : /male|man|rishi|prabhat|madhur|daniel|alex/i.test(v.name)
        ) ||
        pool[0];
      if (targetVoice) utter.voice = targetVoice;

      let phase = 0;
      const animateFallback = () => {
        if (!this.isSpeaking || sessionId !== this.streamSessionId) return;
        phase += 0.18;
        onAmplitude(0.35 + Math.abs(Math.sin(phase)) * 0.45);
        this.speechTimerId = requestAnimationFrame(animateFallback);
      };

      const finish = () => {
        if (this.speechTimerId !== null) {
          cancelAnimationFrame(this.speechTimerId);
          this.speechTimerId = null;
        }
        resolve();
      };

      utter.onstart = () => {
        this.speechTimerId = requestAnimationFrame(animateFallback);
      };
      utter.onend = finish;
      utter.onerror = finish;
      window.speechSynthesis.speak(utter);
    });
  }

  async speak(
    text: string,
    personality: PersonalityId,
    voice: VoiceSettings,
    emotion: EmotionType | undefined,
    onAmplitude: (level: number) => void,
    onComplete: () => void,
    onError?: (message: string) => void
  ): Promise<void> {
    if (!text.trim()) {
      onComplete();
      return;
    }
    this.startStreamSession(personality, voice, emotion || 'Normal', {
      onAmplitude,
      onComplete,
      onError,
    });
    this.pushStreamDelta(text);
    this.finishStreamSession();
  }
}

export const voiceClient = new VoiceClient();
