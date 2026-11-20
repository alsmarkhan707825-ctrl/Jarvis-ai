import { Type } from '@google/genai';
import type { VisionAnalysisResult } from '../../src/types/jarvis.ts';
import { createGeminiClient, formatFriendlyProviderError } from './aiProviderManager.ts';
import { AudioProcessingEngine } from './audioProcessingEngine.ts';
import { loggingDiagnostics } from './loggingDiagnostics.ts';

class VisionEngine {
  async analyzeImage(params: {
    imageBase64: string;
    mimeType?: string;
    mode: 'object' | 'ocr' | 'scene' | 'qa';
    question?: string;
  }): Promise<VisionAnalysisResult> {
    const start = Date.now();
    const cleanData = AudioProcessingEngine.stripBase64Prefix(params.imageBase64);
    const mimeType = params.mimeType || 'image/jpeg';

    const aiDefault = createGeminiClient();
    const aiBeta = createGeminiClient('v1beta');
    const promptByMode: Record<typeof params.mode, string> = {
      object: 'Identify the primary objects visible in this image concisely.',
      ocr: 'Extract all visible printed or handwritten text accurately (OCR) and summarize what the text says.',
      scene: 'Describe the overall scene, environment, and notable details clearly.',
      qa: params.question?.trim() || 'Describe what is visible in this image and answer clearly.',
    };

    const models = ['gemini-4-hydrogen', 'gemini-3.1-flash-lite', 'gemini-3-flash-preview'];
    let responseText = '';
    let lastErr: unknown;

    for (const modelId of models) {
      try {
        const ai = modelId.includes('preview') ? aiBeta : aiDefault;
        const response = await ai.models.generateContent({
          model: modelId,
          contents: {
            parts: [
              {
                inlineData: {
                  mimeType,
                  data: cleanData,
                },
              },
              {
                text: `${promptByMode[params.mode]} Respond with structured JSON.`,
              },
            ],
          },
          config: {
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                summary: { type: Type.STRING },
                detectedObjects: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                },
                extractedText: { type: Type.STRING },
              },
            },
          },
        });
        responseText = (response.text || '{}').trim();
        break;
      } catch (err) {
        lastErr = err;
        loggingDiagnostics.record(
          'VisionEngine',
          'WARN',
          `Vision attempt failed on ${modelId}, trying fallback`,
          err instanceof Error ? err.message : String(err)
        );
      }
    }

    if (!responseText) {
      throw new Error(formatFriendlyProviderError(lastErr));
    }

    const parsed = JSON.parse(responseText) as {
      summary?: string;
      detectedObjects?: string[];
      extractedText?: string;
    };

    const latencyMs = Date.now() - start;
    loggingDiagnostics.record(
      'VisionEngine',
      'INFO',
      `Analyzed image (${params.mode}) in ${latencyMs}ms`
    );

    return {
      mode: params.mode,
      summary: parsed.summary || 'Image analyzed.',
      detectedObjects: Array.isArray(parsed.detectedObjects) ? parsed.detectedObjects : [],
      extractedText: parsed.extractedText || '',
      latencyMs,
    };
  }
}

export const visionEngine = new VisionEngine();
