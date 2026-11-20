import type { EmotionType, PersonalityId, VoiceSettings } from '../../src/types/jarvis.ts';
import { createGeminiClient } from './aiProviderManager.ts';
import { AudioProcessingEngine } from './audioProcessingEngine.ts';
import { emotionEngine } from './emotionEngine.ts';
import { loggingDiagnostics } from './loggingDiagnostics.ts';

export interface TtsSynthesisResult {
  audioBase64: string;
  mimeType: 'audio/wav' | 'audio/mpeg';
  voiceUsed: string;
  modelUsed: string;
  providerUsed: 'gemini' | 'elevenlabs';
}

const ELEVENLABS_VOICE_IDS: Record<string, string> = {
  Adam: 'pNInz6obpgDQGcFmaJgB',
  Antoni: 'ErXwobaYiN019PkySvjV',
  Josh: 'TxGEqnHWrfWFTfGW9XjX',
  Rachel: '21m00Tcm4TlvDq8ikWAM',
  Bella: 'EXAVITQu4vr4xnSDxMaL',
  // Clean cross-mapping when Gemini persona is selected while engine is ElevenLabs
  Charon: 'pNInz6obpgDQGcFmaJgB',
  Fenrir: 'ErXwobaYiN019PkySvjV',
  Puck: 'TxGEqnHWrfWFTfGW9XjX',
  Kore: '21m00Tcm4TlvDq8ikWAM',
  Zephyr: 'EXAVITQu4vr4xnSDxMaL',
};

const ELEVEN_TO_GEMINI_VOICE: Record<string, string> = {
  Adam: 'Charon',
  Antoni: 'Fenrir',
  Josh: 'Puck',
  Rachel: 'Kore',
  Bella: 'Zephyr',
  Charon: 'Charon',
  Fenrir: 'Fenrir',
  Puck: 'Puck',
  Kore: 'Kore',
  Zephyr: 'Zephyr',
};

class TextToSpeechEngine {
  private async synthesizeElevenLabs(
    cleanText: string,
    personality: PersonalityId,
    voice: VoiceSettings
  ): Promise<TtsSynthesisResult> {
    const key = process.env.ELEVENLABS_API_KEY;
    if (!key || key.startsWith('MY_')) {
      throw new Error(
        'ElevenLabs Voice selected, but ELEVENLABS_API_KEY is not configured in AI Studio Secrets.'
      );
    }

    const defaultPersona =
      personality === 'girl' ? 'Rachel' : personality === 'jadavis' ? 'Josh' : 'Adam';
    const selectedName = voice.voiceName || defaultPersona;
    const voiceId =
      ELEVENLABS_VOICE_IDS[selectedName] ||
      (/^[A-Za-z0-9]{15,32}$/.test(selectedName) ? selectedName : ELEVENLABS_VOICE_IDS[defaultPersona]);

    const modelId =
      voice.voiceModel && voice.voiceModel.startsWith('eleven_')
        ? voice.voiceModel
        : 'eleven_flash_v2_5';

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
            stability: Math.max(0.15, Math.min(1.0, voice.voiceStability ?? 0.65)),
            similarity_boost: 0.78,
            style: Math.max(0, Math.min(1.0, (voice.emotionIntensity ?? 0.7) * 0.65)),
            use_speaker_boost: true,
          },
        }),
        signal: AbortSignal.timeout(15000),
      }
    );

    if (!resp.ok) {
      const errBody = await resp.text().catch(() => '');
      throw new Error(`ElevenLabs TTS failed (HTTP ${resp.status})${errBody ? `: ${errBody.slice(0, 120)}` : ''}`);
    }

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

    if (voice.ttsEngine === 'elevenlabs') {
      return this.synthesizeElevenLabs(cleanText, personality, voice);
    }

    const ai = createGeminiClient('v1beta');
    const style = emotionEngine.buildVoiceStyle(
      emotion,
      personality,
      voice.emotionIntensity ?? 0.8
    );

    const expressiveEmotions: EmotionType[] = ['Happy', 'Sad', 'Angry', 'Laughing', 'Surprised', 'Excited'];
    const useExpressiveModel =
      voice.voiceModel === 'gemini-3.8-flash-tts' ||
      (!voice.voiceModel &&
        (personality === 'girl' ||
          personality === 'jadavis' ||
          expressiveEmotions.includes(emotion)));

    const primaryModel =
      voice.voiceModel === 'gemini-3.8-flash-tts' || voice.voiceModel === 'gemini-3.8-flash-lite-tts'
        ? voice.voiceModel
        : useExpressiveModel
          ? 'gemini-3.8-flash-tts'
          : 'gemini-3.8-flash-lite-tts';

    const defaultGemini =
      personality === 'girl'
        ? voice.gender === 'male'
          ? 'Puck'
          : 'Kore'
        : personality === 'jadavis'
          ? 'Puck'
          : personality === 'normal'
            ? 'Fenrir'
            : 'Charon';

    const voiceName = ELEVEN_TO_GEMINI_VOICE[voice.voiceName] || defaultGemini;

    const trySynthesize = async (modelId: string, withMetadata: boolean) => {
      const part: Record<string, unknown> = { text: cleanText };
      if (withMetadata) {
        part.speechMetadata = { style };
      }
      const response = await ai.models.generateContent({
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
      });
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
}

export const textToSpeechEngine = new TextToSpeechEngine();
