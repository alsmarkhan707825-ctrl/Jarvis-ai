import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts';
import type { EmotionType, PersonalityId, VoiceSettings } from '../../src/types/jarvis.ts';
import { createGeminiClient } from './aiProviderManager.ts';
import { AudioProcessingEngine } from './audioProcessingEngine.ts';
import { emotionEngine } from './emotionEngine.ts';
import { loggingDiagnostics } from './loggingDiagnostics.ts';
import { storageStore } from './storageStore.ts';

export interface TtsSynthesisResult {
  audioBase64: string;
  mimeType: 'audio/wav' | 'audio/mpeg';
  voiceUsed: string;
  modelUsed: string;
  providerUsed: 'gemini' | 'groq' | 'elevenlabs' | 'edge';
}

const ELEVENLABS_VOICE_IDS: Record<string, string> = {
  // Active ElevenLabs Boys & Girls Voices
  Adam: 'CwhRBWXzGAHq8TQ4Fs17', // Roger - Casual, Resonant Boy Voice
  Antoni: 'IKne3meq5aSn9XLyUdCD', // Charlie - Deep, Confident Boy Voice
  Josh: 'TX3LPaxmHKxFdv7VOQHJ', // Liam - Lively Young Boy Voice
  George: 'JBFqnCBsd6RMkjVDRZzb', // George - Warm Natural Boy Voice
  Rachel: 'EXAVITQu4vr4xnSDxMaL', // Sarah - Natural Expressive Girl Voice
  Bella: 'FGY2WhTYpPnrIDTdsKH5', // Laura - Sweet Quirky Girl Voice
  Alice: 'Xb7hH8MSUJpSbSDYk0k2', // Alice - Clear Girl Voice
  // Cross-mapped Gemini & Groq voices when switching or falling back to ElevenLabs
  Charon: 'IKne3meq5aSn9XLyUdCD',
  Fenrir: 'JBFqnCBsd6RMkjVDRZzb',
  Puck: 'TX3LPaxmHKxFdv7VOQHJ',
  troy: 'CwhRBWXzGAHq8TQ4Fs17',
  daniel: 'IKne3meq5aSn9XLyUdCD',
  austin: 'TX3LPaxmHKxFdv7VOQHJ',
  Kore: 'EXAVITQu4vr4xnSDxMaL',
  Zephyr: 'FGY2WhTYpPnrIDTdsKH5',
  autumn: 'EXAVITQu4vr4xnSDxMaL',
  diana: 'FGY2WhTYpPnrIDTdsKH5',
  hannah: 'Xb7hH8MSUJpSbSDYk0k2',
};

const TO_GEMINI_VOICE: Record<string, string> = {
  Charon: 'Charon',
  Fenrir: 'Fenrir',
  Puck: 'Puck',
  Kore: 'Kore',
  Zephyr: 'Zephyr',
  Adam: 'Charon',
  Antoni: 'Fenrir',
  Josh: 'Puck',
  troy: 'Charon',
  daniel: 'Fenrir',
  austin: 'Puck',
  Rachel: 'Kore',
  Bella: 'Zephyr',
  autumn: 'Kore',
  diana: 'Zephyr',
  hannah: 'Kore',
};

const TO_GROQ_VOICE: Record<string, string> = {
  troy: 'troy',
  daniel: 'daniel',
  austin: 'austin',
  autumn: 'autumn',
  diana: 'diana',
  hannah: 'hannah',
  Charon: 'troy',
  Fenrir: 'daniel',
  Puck: 'austin',
  Adam: 'troy',
  Antoni: 'daniel',
  Josh: 'austin',
  Kore: 'autumn',
  Zephyr: 'diana',
  Rachel: 'autumn',
  Bella: 'hannah',
};

class TextToSpeechEngine {
  private async synthesizeGroq(
    cleanText: string,
    personality: PersonalityId,
    voice: VoiceSettings
  ): Promise<TtsSynthesisResult> {
    const key = process.env.GROQ_API_KEY;
    if (!key || key.startsWith('MY_')) {
      throw new Error('Groq Voice selected, but GROQ_API_KEY is not configured in AI Studio Secrets.');
    }

    const defaultGroq = personality === 'girl' || voice.gender === 'female' ? 'autumn' : 'troy';
    const voiceName = TO_GROQ_VOICE[voice.voiceName] || defaultGroq;
    const modelId = 'canopylabs/orpheus-v1-english';

    const resp = await fetch('https://api.groq.com/openai/v1/audio/speech', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: modelId,
        input: cleanText,
        voice: voiceName,
        response_format: 'wav',
      }),
      signal: AbortSignal.timeout(15000),
    });

    if (!resp.ok) {
      const errText = await resp.text().catch(() => '');
      if (/terms/i.test(errText)) {
        throw new Error(
          'Groq Orpheus Voice requires one-time Terms Acceptance in your Groq Console for canopylabs/orpheus-v1-english, or select Gemini / ElevenLabs Voice.'
        );
      }
      throw new Error(`Groq TTS failed (HTTP ${resp.status})${errText ? `: ${errText.slice(0, 140)}` : ''}`);
    }

    const arrayBuf = await resp.arrayBuffer();
    const audioBase64 = Buffer.from(arrayBuf).toString('base64');
    loggingDiagnostics.record(
      'TextToSpeechEngine',
      'INFO',
      `Synthesized ${cleanText.length} chars via Groq ${modelId} (${voiceName})`
    );
    return {
      audioBase64,
      mimeType: 'audio/wav',
      voiceUsed: voiceName,
      modelUsed: modelId,
      providerUsed: 'groq',
    };
  }

  private async synthesizeElevenLabs(
    cleanText: string,
    personality: PersonalityId,
    voice: VoiceSettings,
    emotion: EmotionType = 'Normal'
  ): Promise<TtsSynthesisResult> {
    const key = process.env.ELEVENLABS_API_KEY;
    if (!key || key.startsWith('MY_')) {
      throw new Error(
        'ElevenLabs Voice selected, but ELEVENLABS_API_KEY is not configured in AI Studio Secrets.'
      );
    }

    const defaultPersona = personality === 'girl' || voice.gender === 'female' ? 'Bella' : 'Adam';
    const selectedName = voice.voiceName || defaultPersona;
    const voiceId =
      ELEVENLABS_VOICE_IDS[selectedName] ||
      (/^[A-Za-z0-9]{15,32}$/.test(selectedName) ? selectedName : ELEVENLABS_VOICE_IDS[defaultPersona]);

    // Use eleven_multilingual_v2 for rich Hindi/Hinglish girlfriend emotions, or flash if low-latency needed
    const hasDevanagariOrGirl =
      /[\u0900-\u097F]/.test(cleanText) ||
      personality === 'girl' ||
      voice.voiceModel === 'eleven_multilingual_v2';
    const candidateModels = hasDevanagariOrGirl
      ? ['eleven_multilingual_v2', 'eleven_flash_v2_5']
      : ['eleven_flash_v2_5', 'eleven_multilingual_v2'];

    const moodStabilityMap: Partial<Record<EmotionType, { stability: number; style: number }>> = {
      Laughing: { stability: 0.20, style: 0.96 },
      Angry: { stability: 0.26, style: 0.92 },
      Sad: { stability: 0.26, style: 0.88 },
      Romantic: { stability: 0.34, style: 0.84 },
      Excited: { stability: 0.28, style: 0.90 },
      Surprised: { stability: 0.30, style: 0.86 },
      Happy: { stability: 0.36, style: 0.78 },
      Curious: { stability: 0.42, style: 0.68 },
      Serious: { stability: 0.56, style: 0.48 },
      Calm: { stability: 0.54, style: 0.46 },
      Normal: { stability: 0.42, style: 0.66 },
    };
    const tuned = moodStabilityMap[emotion] || { stability: 0.42, style: 0.66 };
    const effectiveStability =
      personality === 'girl' ? tuned.stability : Math.min(0.68, tuned.stability + 0.14);

    let lastErr: Error | null = null;
    for (const modelId of candidateModels) {
      const resp = await fetch(
        `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`,
        {
          method: 'POST',
          headers: {
            'xi-api-key': key,
            'Content-Type': 'application/json',
            Accept: 'audio/mpeg',
          },
          body: JSON.stringify({
            text: cleanText,
            model_id: modelId,
            voice_settings: {
              stability: effectiveStability,
              similarity_boost: 0.8,
              style: tuned.style,
              use_speaker_boost: true,
            },
          }),
          signal: AbortSignal.timeout(15000),
        }
      );

      if (resp.ok) {
        const arrayBuf = await resp.arrayBuffer();
        const audioBase64 = Buffer.from(arrayBuf).toString('base64');
        loggingDiagnostics.record(
          'TextToSpeechEngine',
          'INFO',
          `Synthesized ${cleanText.length} chars via ElevenLabs ${modelId} (${selectedName})`
        );
        return {
          audioBase64,
          mimeType: 'audio/mpeg',
          voiceUsed: selectedName,
          modelUsed: modelId,
          providerUsed: 'elevenlabs',
        };
      }

      const errBody = await resp.text().catch(() => '');
      lastErr = new Error(
        `ElevenLabs TTS failed (HTTP ${resp.status})${errBody ? `: ${errBody.slice(0, 140)}` : ''}`
      );
      if (resp.status === 401 || resp.status === 403) {
        break;
      }
    }

    throw lastErr || new Error('ElevenLabs TTS failed.');
  }

  private async synthesizeGemini(
    cleanText: string,
    personality: PersonalityId,
    voice: VoiceSettings,
    emotion: EmotionType
  ): Promise<TtsSynthesisResult> {
    const ai = createGeminiClient('v1beta');
    const style = emotionEngine.buildVoiceStyle(
      emotion,
      personality,
      voice.emotionIntensity ?? 0.8
    );

    const primaryModel =
      voice.voiceModel === 'gemini-3.8-flash-tts'
        ? 'gemini-3.8-flash-tts'
        : 'gemini-3.8-flash-lite-tts';

    const defaultGemini =
      personality === 'girl' || voice.gender === 'female' ? 'Kore' : 'Charon';

    const voiceName = TO_GEMINI_VOICE[voice.voiceName] || defaultGemini;

    const trySynthesize = async (modelId: string, withMetadata: boolean) => {
      const part: Record<string, unknown> = { text: cleanText };
      if (withMetadata) {
        part.speechMetadata = { style };
      }
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`TTS timeout on ${modelId}`)), 7000)
      );
      const response = await Promise.race([
        ai.models.generateContent({
          model: modelId,
          contents: [
            {
              role: 'user',
              parts: [part as { text: string }],
            },
          ],
          config: {
            responseModalities: ['AUDIO'],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: { voiceName },
              },
            },
          },
        }),
        timeoutPromise,
      ]);
      return response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    };

    let audioBase64: string | undefined;
    let modelUsed = primaryModel;

    try {
      audioBase64 = await trySynthesize(primaryModel, true);
    } catch (firstErr) {
      const fallbackModel =
        primaryModel === 'gemini-3.8-flash-lite-tts'
          ? 'gemini-3.8-flash-tts'
          : 'gemini-3.8-flash-lite-tts';
      loggingDiagnostics.record(
        'TextToSpeechEngine',
        'WARN',
        `Primary TTS attempt failed on ${primaryModel}, retrying on ${fallbackModel} (${voiceName})`,
        firstErr instanceof Error ? firstErr.message : String(firstErr)
      );
      modelUsed = fallbackModel;
      audioBase64 = await trySynthesize(modelUsed, false);
    }

    if (!audioBase64) {
      throw new Error('Neural TTS model returned no audio data.');
    }

    loggingDiagnostics.record(
      'TextToSpeechEngine',
      'INFO',
      `Synthesized ${cleanText.length} chars (${personality}/${emotion}) via ${modelUsed} (${voiceName})`
    );

    return {
      audioBase64,
      mimeType: 'audio/wav',
      voiceUsed: voiceName,
      modelUsed,
      providerUsed: 'gemini',
    };
  }

  private async synthesizeEdgeNeural(
    cleanText: string,
    personality: PersonalityId,
    voice: VoiceSettings,
    emotion: EmotionType
  ): Promise<TtsSynthesisResult> {
    const isFemale = personality === 'girl' || voice.gender === 'female';
    const hasDevanagariOrHinglish =
      /[\u0900-\u097F]/.test(cleanText) ||
      /\b(hai|hain|haan|nahi|kya|kaise|kahan|tum|main|mera|meri|jaan|baby|boos|boss|karo|kholo|batao|accha|theek|thik|bhai|yaar)\b/i.test(
        cleanText
      );

    const edgeVoice = isFemale
      ? hasDevanagariOrHinglish
        ? 'hi-IN-SwaraNeural'
        : 'en-IN-NeerjaNeural'
      : hasDevanagariOrHinglish
        ? 'en-IN-PrabhatNeural'
        : 'en-GB-RyanNeural';

    const prosodyMap: Partial<Record<EmotionType, { rate: number; pitch: string }>> = {
      Laughing: { rate: 1.09, pitch: '+10Hz' },
      Excited: { rate: 1.08, pitch: '+8Hz' },
      Happy: { rate: 1.04, pitch: '+5Hz' },
      Romantic: { rate: 0.96, pitch: '+2Hz' },
      Sad: { rate: 0.91, pitch: '-5Hz' },
      Angry: { rate: 1.06, pitch: '+4Hz' },
      Curious: { rate: 1.02, pitch: '+4Hz' },
      Surprised: { rate: 1.07, pitch: '+8Hz' },
      Serious: { rate: 0.97, pitch: '-4Hz' },
      Calm: { rate: 0.95, pitch: '-2Hz' },
      Normal: { rate: 1.01, pitch: '+0Hz' },
    };

    const moodProsody = prosodyMap[emotion] || { rate: 1.0, pitch: '+0Hz' };
    const effectiveRate = Math.max(0.8, Math.min(1.28, (voice.speed || 1) * moodProsody.rate));

    const tts = new MsEdgeTTS();
    try {
      await tts.setMetadata(edgeVoice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
      const { audioStream } = tts.toStream(cleanText, {
        rate: effectiveRate,
        pitch: moodProsody.pitch,
      });
      const chunks: Buffer[] = [];
      for await (const chunk of audioStream) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
      const audioBuffer = Buffer.concat(chunks);
      if (audioBuffer.length < 128) {
        throw new Error('Neural HD stream returned empty audio');
      }
      loggingDiagnostics.record(
        'TextToSpeechEngine',
        'INFO',
        `Synthesized ${cleanText.length} chars via Neural HD (${edgeVoice}/${emotion})`
      );
      return {
        audioBase64: audioBuffer.toString('base64'),
        mimeType: 'audio/mpeg',
        voiceUsed: edgeVoice,
        modelUsed: 'neural-hd-edge',
        providerUsed: 'edge',
      };
    } finally {
      try {
        tts.close();
      } catch {
        // ignore close errors
      }
    }
  }

  async synthesize(
    rawText: string,
    personality: PersonalityId,
    voice: VoiceSettings,
    emotion: EmotionType = 'Normal'
  ): Promise<TtsSynthesisResult> {
    const cleanText = AudioProcessingEngine.sanitizeTextForSpeech(rawText);
    if (!cleanText) {
      throw new Error('No speakable text provided.');
    }

    const elevenEnabled = storageStore.getState().settings.elevenlabsEnabled !== false;
    const hasEleven = Boolean(process.env.ELEVENLABS_API_KEY && elevenEnabled);
    const hasGemini = Boolean(
      process.env.GEMINI_API_KEY && !process.env.GEMINI_API_KEY.startsWith('MY_')
    );
    const hasGroq = Boolean(process.env.GROQ_API_KEY && !process.env.GROQ_API_KEY.startsWith('MY_'));

    const orderedEngines: Array<'elevenlabs' | 'gemini' | 'groq' | 'edge'> = [];
    const pushUnique = (eng: 'elevenlabs' | 'gemini' | 'groq' | 'edge') => {
      if (!orderedEngines.includes(eng)) orderedEngines.push(eng);
    };

    if (voice.ttsEngine === 'elevenlabs' || voice.ttsEngine === 'gemini' || voice.ttsEngine === 'groq') {
      pushUnique(voice.ttsEngine);
    }
    if (hasEleven) pushUnique('elevenlabs');
    if (hasGemini) pushUnique('gemini');
    if (hasGroq) pushUnique('groq');
    pushUnique('edge');

    let lastError: unknown;
    for (const engine of orderedEngines) {
      try {
        if (engine === 'elevenlabs') {
          if (!elevenEnabled || !process.env.ELEVENLABS_API_KEY) continue;
          return await this.synthesizeElevenLabs(cleanText, personality, voice, emotion);
        }
        if (engine === 'groq') {
          if (!process.env.GROQ_API_KEY) continue;
          return await this.synthesizeGroq(cleanText, personality, voice);
        }
        if (engine === 'gemini') {
          if (!hasGemini) continue;
          return await this.synthesizeGemini(cleanText, personality, voice, emotion);
        }
        if (engine === 'edge') {
          return await this.synthesizeEdgeNeural(cleanText, personality, voice, emotion);
        }
      } catch (err) {
        lastError = err;
        loggingDiagnostics.record(
          'TextToSpeechEngine',
          'WARN',
          `Neural TTS fallback from ${engine}`,
          err instanceof Error ? err.message : String(err)
        );
      }
    }

    throw lastError instanceof Error
      ? lastError
      : new Error('No Neural Voice engine is currently configured.');
  }
}

export const textToSpeechEngine = new TextToSpeechEngine();
