import type { SttProviderId } from '../../src/types/jarvis.ts';
import { aiProviderManager, createGeminiClient } from './aiProviderManager.ts';
import { AudioProcessingEngine } from './audioProcessingEngine.ts';
import { loggingDiagnostics } from './loggingDiagnostics.ts';

export interface TranscriptionResult {
  transcript: string;
  detectedLanguage: 'English' | 'Hindi' | 'Hinglish';
  providerUsed?: string;
}

export function detectLanguageHeuristic(text: string): 'English' | 'Hindi' | 'Hinglish' {
  const hasDevanagari = /[\u0900-\u097F]/.test(text);
  const hasLatin = /[A-Za-z]/.test(text);
  if (hasDevanagari && hasLatin) return 'Hinglish';
  if (hasDevanagari) return 'Hindi';
  const hinglishMarkers = /\b(kya|kaise|karo|kardo|batao|mera|meri|bhai|yaar|chalo|dekho|sunao|kholo|bhejo|haan|nahi|theek|accha|tum|aap|mere|karna|chahiye|jao|band|shuru)\b/i;
  if (hinglishMarkers.test(text)) return 'Hinglish';
  return 'English';
}

class VoiceRecognitionEngine {
  private transcribeModelUnavailable = false;

  private async transcribeWithGroq(
    cleanBase64: string,
    normalizedMime: string,
    preferredLanguage: 'auto' | 'en-US' | 'en-IN' | 'hi-IN'
  ): Promise<string> {
    const key = process.env.GROQ_API_KEY;
    if (!key || key.startsWith('MY_')) {
      throw new Error('GROQ_API_KEY is not configured in server secrets.');
    }
    const audioBuffer = Buffer.from(cleanBase64, 'base64');
    const ext = normalizedMime.includes('mp4') ? 'm4a' : normalizedMime.includes('ogg') ? 'ogg' : 'webm';
    const form = new FormData();
    form.append('file', new Blob([audioBuffer], { type: normalizedMime }), `voice.${ext}`);
    form.append('model', 'whisper-large-v3-turbo');
    form.append('response_format', 'json');
    if (preferredLanguage === 'hi-IN') {
      form.append('language', 'hi');
    } else if (preferredLanguage === 'en-US' || preferredLanguage === 'en-IN') {
      form.append('language', 'en');
    }
    const resp = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
      },
      body: form,
    });
    if (!resp.ok) {
      throw new Error(`Groq Whisper HTTP ${resp.status}`);
    }
    const json = (await resp.json()) as { text?: string };
    return (json.text || '').trim();
  }

  async transcribeAudio(
    base64Audio: string,
    mimeType?: string,
    preferredLanguage: 'auto' | 'en-US' | 'en-IN' | 'hi-IN' = 'auto',
    sttProvider: SttProviderId = 'auto'
  ): Promise<TranscriptionResult> {
    const cleanBase64 = AudioProcessingEngine.stripBase64Prefix(base64Audio);
    const normalizedMime = AudioProcessingEngine.normalizeMimeType(mimeType);

    if (
      (sttProvider === 'groq' || (sttProvider === 'auto' && aiProviderManager.isProviderConfigured('groq'))) &&
      aiProviderManager.hasProviderKey('groq')
    ) {
      try {
        const groqText = await this.transcribeWithGroq(cleanBase64, normalizedMime, preferredLanguage);
        const detectedLanguage = detectLanguageHeuristic(groqText);
        loggingDiagnostics.record(
          'VoiceRecognitionEngine',
          'INFO',
          `Groq Whisper transcribed (${detectedLanguage}): ${groqText.slice(0, 80) || '[silence]'}`
        );
        return { transcript: groqText, detectedLanguage, providerUsed: 'groq:whisper-large-v3-turbo' };
      } catch (groqErr) {
        if (sttProvider === 'groq') {
          throw groqErr;
        }
        loggingDiagnostics.record(
          'VoiceRecognitionEngine',
          'WARN',
          'Groq Whisper fallback to Gemini STT',
          groqErr instanceof Error ? groqErr.message : String(groqErr)
        );
      }
    }

    const aiBeta = createGeminiClient('v1beta');
    const aiDefault = createGeminiClient();

    const languageHint =
      preferredLanguage === 'hi-IN'
        ? 'The speaker is likely speaking Hindi or Hinglish.'
        : preferredLanguage === 'en-IN'
          ? 'The speaker is likely speaking Indian English or Hinglish.'
          : 'The speaker may speak English, Hindi, or Hinglish (code-mixed Hindi + English).';

    const promptText =
      `Transcribe the exact spoken words from this audio accurately. ${languageHint} ` +
      `If the audio is silent or contains only background noise with no clear speech, return an empty string "". ` +
      `Return ONLY the verbatim spoken transcript without quotes or commentary.`;

    const contents = {
      parts: [
        {
          inlineData: {
            mimeType: normalizedMime,
            data: cleanBase64,
          },
        },
        { text: promptText },
      ],
    };

    let transcript = '';
    let providerUsed = 'gemini-3.5-transcribe';
    let succeeded = false;

    if (!this.transcribeModelUnavailable) {
      try {
        const response = await aiBeta.models.generateContent({
          model: 'gemini-3.5-transcribe',
          contents,
        });
        transcript = (response.text || '').trim();
        succeeded = true;
      } catch (primaryErr) {
        const errMsg = primaryErr instanceof Error ? primaryErr.message : String(primaryErr);
        if (/404|NOT_FOUND/i.test(errMsg)) {
          this.transcribeModelUnavailable = true;
        }
        loggingDiagnostics.record(
          'VoiceRecognitionEngine',
          'WARN',
          'gemini-3.5-transcribe fallback to fast multimodal audio transcription',
          errMsg
        );
      }
    }

    if (!succeeded) {
      const sttFallbackModels = ['gemini-3.1-flash-lite', 'gemini-4-hydrogen', 'gemini-3-flash-preview'];
      let lastErr: unknown;
      for (const modelId of sttFallbackModels) {
        try {
          const client = modelId.includes('preview') ? aiBeta : aiDefault;
          const resp = await client.models.generateContent({
            model: modelId,
            contents,
          });
          transcript = (resp.text || '').trim();
          providerUsed = modelId;
          succeeded = true;
          break;
        } catch (err) {
          lastErr = err;
          loggingDiagnostics.record(
            'VoiceRecognitionEngine',
            'WARN',
            `STT attempt failed on ${modelId}`,
            err instanceof Error ? err.message : String(err)
          );
        }
      }
      if (!succeeded) {
        throw lastErr instanceof Error ? lastErr : new Error('Speech transcription temporarily busy.');
      }
    }

    if (transcript === '""' || transcript === "''") {
      transcript = '';
    }

    const detectedLanguage = detectLanguageHeuristic(transcript);
    loggingDiagnostics.record(
      'VoiceRecognitionEngine',
      'INFO',
      `Transcribed audio (${detectedLanguage}) via ${providerUsed}: ${transcript.slice(0, 80) || '[silence]'}`
    );
    return { transcript, detectedLanguage, providerUsed };
  }
}

export const voiceRecognitionEngine = new VoiceRecognitionEngine();
