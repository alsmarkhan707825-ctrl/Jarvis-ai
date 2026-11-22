import type { ProviderId, ThinkingSpeed } from '../../src/types/jarvis.ts';
import {
  aiProviderManager,
  formatFriendlyProviderError,
  type ProviderGenerateRequest,
} from './aiProviderManager.ts';
import { loggingDiagnostics } from './loggingDiagnostics.ts';
import { storageStore } from './storageStore.ts';

export interface FallbackResult {
  providerUsed: ProviderId;
  modelUsed: string;
  usedFallback: boolean;
}

const COOLDOWN_MS = 5 * 60 * 1000;

class ErrorRecoveryEngine {
  private cooldownUntil = new Map<string, number>();

  private getKey(provider: ProviderId, model: string): string {
    return `${provider}:${model}`;
  }

  private isCoolingDown(provider: ProviderId, model: string): boolean {
    const until = this.cooldownUntil.get(this.getKey(provider, model));
    if (!until) return false;
    if (Date.now() >= until) {
      this.cooldownUntil.delete(this.getKey(provider, model));
      return false;
    }
    return true;
  }

  private isQuotaOrPermanentError(err: unknown): boolean {
    const raw = err instanceof Error ? err.message : String(err || '');
    return /429|RESOURCE_EXHAUSTED|quota|404|NOT_FOUND|403|PERMISSION_DENIED|API_KEY_INVALID/i.test(raw);
  }

  clearCooldowns(): void {
    this.cooldownUntil.clear();
  }

  private buildCandidateChain(
    primary: { provider: ProviderId; model: string },
    fallback: { provider: ProviderId; model: string },
    preferReasoning = false
  ): Array<{ provider: ProviderId; model: string; speed: ThinkingSpeed; isFallback: boolean }> {
    const settings = storageStore.getState().settings;
    const isAuto = settings.autoModelSelection || primary.model === 'auto';

    const autoCandidates: Array<{ provider: ProviderId; model: string; speed: ThinkingSpeed; isFallback: boolean }> = [];
    if (isAuto) {
      if (preferReasoning) {
        autoCandidates.push({
          provider: 'gemini',
          model: settings.reasoningModel || 'gemini-4-neon',
          speed: 'MEDIUM',
          isFallback: false,
        });
        if (aiProviderManager.isProviderConfigured('groq')) {
          autoCandidates.push({
            provider: 'groq',
            model: 'openai/gpt-oss-120b',
            speed: 'MEDIUM',
            isFallback: false,
          });
        }
      }
      autoCandidates.push(
        { provider: 'gemini', model: settings.fastResponseModel || 'gemini-3.1-flash-lite', speed: 'LOW', isFallback: false },
        { provider: 'gemini', model: 'gemini-4-hydrogen', speed: 'LOW', isFallback: false }
      );
      if (aiProviderManager.isProviderConfigured('groq')) {
        autoCandidates.push(
          { provider: 'groq', model: 'openai/gpt-oss-120b', speed: 'LOW', isFallback: false },
          { provider: 'groq', model: 'qwen/qwen3.8-27b', speed: 'LOW', isFallback: false },
          {
            provider: 'groq',
            model: aiProviderManager.getDefaultModelFor('groq') || 'openai/gpt-oss-20b',
            speed: 'LOW',
            isFallback: true,
          }
        );
      }
      autoCandidates.push({
        provider: 'gemini',
        model: 'gemini-3-flash-preview',
        speed: 'LOW',
        isFallback: true,
      });
    }

    const raw: Array<{ provider: ProviderId; model: string; speed: ThinkingSpeed; isFallback: boolean }> = [
      ...autoCandidates,
      ...(primary.model !== 'auto'
        ? [{ provider: primary.provider, model: primary.model, speed: 'LOW' as ThinkingSpeed, isFallback: false }]
        : []),
      ...(fallback.model !== 'auto'
        ? [{ provider: fallback.provider, model: fallback.model, speed: 'LOW' as ThinkingSpeed, isFallback: true }]
        : []),
      {
        provider: settings.primaryProvider || 'gemini',
        model:
          aiProviderManager.getDefaultModelFor(settings.primaryProvider || 'gemini') ||
          'gemini-3.1-flash-lite',
        speed: 'LOW',
        isFallback: true,
      },
      {
        provider: settings.secondaryProvider || 'groq',
        model:
          aiProviderManager.getDefaultModelFor(settings.secondaryProvider || 'groq') ||
          'openai/gpt-oss-120b',
        speed: 'LOW',
        isFallback: true,
      },
      { provider: 'groq', model: 'openai/gpt-oss-120b', speed: 'LOW', isFallback: true },
      { provider: 'groq', model: 'qwen/qwen3.8-27b', speed: 'LOW', isFallback: true },
      { provider: 'groq', model: 'openai/gpt-oss-20b', speed: 'LOW', isFallback: true },
      { provider: 'gemini', model: 'gemini-3.1-flash-lite', speed: 'LOW', isFallback: true },
      { provider: 'gemini', model: 'gemini-4-hydrogen', speed: 'LOW', isFallback: true },
      { provider: 'gemini', model: 'gemini-3-flash-preview', speed: 'LOW', isFallback: true },
    ];

    const seen = new Set<string>();
    const healthy: typeof raw = [];
    const cooling: typeof raw = [];

    for (const item of raw) {
      if (!aiProviderManager.isProviderConfigured(item.provider)) continue;
      const key = this.getKey(item.provider, item.model);
      if (seen.has(key)) continue;
      seen.add(key);
      if (this.isCoolingDown(item.provider, item.model)) {
        cooling.push({ ...item, isFallback: true });
      } else {
        healthy.push(item);
      }
    }

    return [...healthy, ...cooling];
  }

  async *executeWithFallback(
    primary: ProviderGenerateRequest,
    fallback: { provider: ProviderId; model: string },
    onMeta: (meta: FallbackResult) => void
  ): AsyncGenerator<string> {
    const lastUserText = primary.messages[primary.messages.length - 1]?.content || '';
    const preferReasoning =
      primary.thinkingSpeed === 'HIGH' ||
      /\b(code|debug|algorithm|architecture|theorem|proof|solve equation|complex plan|step by step analysis)\b/i.test(
        lastUserText
      );
    const candidates = this.buildCandidateChain(
      { provider: primary.provider, model: primary.model },
      fallback,
      preferReasoning
    );

    if (candidates.length === 0) {
      throw new Error('No AI provider API key is configured. Please connect Gemini or Groq in Settings.');
    }

    let lastError: unknown;

    for (let i = 0; i < candidates.length; i++) {
      const candidate = candidates[i];
      let emittedAny = false;
      try {
        onMeta({
          providerUsed: candidate.provider,
          modelUsed: candidate.model,
          usedFallback: candidate.isFallback,
        });

        const req: ProviderGenerateRequest = {
          ...primary,
          provider: candidate.provider,
          model: candidate.model,
          thinkingSpeed: i === 0 ? primary.thinkingSpeed : candidate.speed,
        };

        for await (const chunk of aiProviderManager.streamGenerate(req)) {
          if (chunk.text) {
            emittedAny = true;
            yield chunk.text;
          }
        }
        return;
      } catch (error) {
        lastError = error;
        if (this.isQuotaOrPermanentError(error)) {
          this.cooldownUntil.set(this.getKey(candidate.provider, candidate.model), Date.now() + COOLDOWN_MS);
        }
        loggingDiagnostics.record(
          'ErrorRecoveryEngine',
          'WARN',
          `Attempt failed (${candidate.provider}/${candidate.model})`,
          error instanceof Error ? error.message : String(error)
        );
        if (emittedAny) {
          throw new Error(formatFriendlyProviderError(error));
        }
      }
    }

    throw new Error(
      lastError
        ? formatFriendlyProviderError(lastError)
        : 'All active AI models are temporarily busy. Please try again in a moment.'
    );
  }
}

export const errorRecoveryEngine = new ErrorRecoveryEngine();
