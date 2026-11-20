import { GoogleGenAI, ThinkingLevel } from '@google/genai';
import type {
  ModelOption,
  ProviderId,
  ProviderInfo,
  ThinkingSpeed,
} from '../../src/types/jarvis.ts';
import { ApiSecurityManager } from './apiSecurityManager.ts';
import { loggingDiagnostics } from './loggingDiagnostics.ts';
import { storageStore } from './storageStore.ts';

export interface ProviderGenerateRequest {
  provider: ProviderId;
  model: string;
  systemPrompt: string;
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  thinkingSpeed: ThinkingSpeed;
  maxOutputTokens?: number;
}

export interface ProviderStreamChunk {
  text: string;
  done?: boolean;
}

export const PROVIDER_ENV_KEY_NAMES: Record<ProviderId, string> = {
  gemini: 'GEMINI_API_KEY',
  groq: 'GROQ_API_KEY',
  openrouter: 'OPENROUTER_API_KEY',
};

const DEFAULT_PROVIDER_MODELS: Record<ProviderId, ModelOption[]> = {
  gemini: [
    {
      id: 'gemini-4-hydrogen',
      label: 'Gemini 4 Hydrogen (Fast & Balanced)',
      provider: 'gemini',
      supportsStreaming: true,
      supportsThinking: true,
      contextWindow: '1M',
    },
    {
      id: 'gemini-3.1-flash-lite',
      label: 'Gemini 3.1 Flash Lite (Ultra-Low Latency)',
      provider: 'gemini',
      supportsStreaming: true,
      supportsThinking: true,
      contextWindow: '1M',
    },
    {
      id: 'gemini-3-flash-preview',
      label: 'Gemini 3 Flash Preview (Resilient Fallback)',
      provider: 'gemini',
      supportsStreaming: true,
      supportsThinking: true,
      contextWindow: '1M',
    },
    {
      id: 'gemini-4-neon',
      label: 'Gemini 4 Neon (Advanced Reasoning)',
      provider: 'gemini',
      supportsStreaming: true,
      supportsThinking: true,
      contextWindow: '1M',
    },
  ],
  groq: [
    { id: 'openai/gpt-oss-20b', label: 'Groq · GPT-OSS 20B (Ultra-Fast)', provider: 'groq', supportsStreaming: true },
    { id: 'qwen/qwen3.8-27b', label: 'Groq · Qwen 3.8 27B (Instant)', provider: 'groq', supportsStreaming: true },
    { id: 'openai/gpt-oss-120b', label: 'Groq · GPT-OSS 120B (High Intelligence)', provider: 'groq', supportsStreaming: true },
    { id: 'allam-2-7b', label: 'Groq · Allam 2 7B', provider: 'groq', supportsStreaming: true },
  ],
  openrouter: [
    { id: 'google/gemini-2.5-flash', label: 'OpenRouter · Gemini Flash', provider: 'openrouter', supportsStreaming: true },
    { id: 'meta-llama/llama-3.3-70b-instruct', label: 'OpenRouter · Llama 3.3 70B', provider: 'openrouter', supportsStreaming: true },
    { id: 'qwen/qwen-2.5-72b-instruct', label: 'OpenRouter · Qwen 2.5 72B', provider: 'openrouter', supportsStreaming: true },
  ],
};

function getEnvKeyForProvider(provider: ProviderId): string | undefined {
  switch (provider) {
    case 'gemini':
      return process.env.GEMINI_API_KEY;
    case 'groq':
      return process.env.GROQ_API_KEY;
    case 'openrouter':
      return process.env.OPENROUTER_API_KEY;
  }
}

function getBaseUrlForProvider(provider: ProviderId): string {
  switch (provider) {
    case 'groq':
      return 'https://api.groq.com/openai/v1';
    case 'openrouter':
      return 'https://openrouter.ai/api/v1';
    default:
      return '';
  }
}

export function formatFriendlyProviderError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err || 'AI service error');
  if (/503|UNAVAILABLE|high demand|overloaded/i.test(raw)) {
    return 'AI model is temporarily busy (503 high demand). Retrying via fallback model.';
  }
  if (/429|RESOURCE_EXHAUSTED|rate limit|quota/i.test(raw)) {
    return 'Rate limit reached (429). Switching to fallback model or please retry shortly.';
  }
  return ApiSecurityManager.redactSecrets(raw);
}

export function createGeminiClient(apiVersion?: string): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey.startsWith('MY_')) {
    throw new Error('GEMINI_API_KEY is not configured in the server environment.');
  }
  return new GoogleGenAI({
    apiKey,
    ...(apiVersion ? { apiVersion } : {}),
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function mapThinkingLevel(model: string, speed: ThinkingSpeed): ThinkingLevel | undefined {
  if (model.startsWith('gemini-4-')) {
    if (speed === 'LOW') return ThinkingLevel.LOW;
    if (speed === 'MEDIUM') return ThinkingLevel.MEDIUM;
    return ThinkingLevel.HIGH;
  }
  if (model.startsWith('gemini-3.1-')) {
    if (speed === 'LOW') return ThinkingLevel.MINIMAL;
    if (speed === 'MEDIUM') return ThinkingLevel.MEDIUM;
    return ThinkingLevel.HIGH;
  }
  return undefined;
}

class AiProviderManager {
  private providerMeta: Record<ProviderId, Partial<ProviderInfo>> = {
    gemini: { status: ApiSecurityManager.maskKeyStatus('GEMINI_API_KEY') ? 'CONNECTED' : 'ENV_KEY_MISSING' },
    groq: { status: ApiSecurityManager.maskKeyStatus('GROQ_API_KEY') ? 'CONNECTED' : 'ENV_KEY_MISSING' },
    openrouter: { status: ApiSecurityManager.maskKeyStatus('OPENROUTER_API_KEY') ? 'UNTESTED' : 'ENV_KEY_MISSING' },
  };

  private dynamicModels: Partial<Record<ProviderId, ModelOption[]>> = {};

  hasProviderKey(provider: ProviderId): boolean {
    const key = getEnvKeyForProvider(provider);
    return Boolean(key && key.trim() && !key.startsWith('MY_'));
  }

  isProviderConfigured(provider: ProviderId): boolean {
    const settings = storageStore.getState().settings;
    if (settings.enabledProviders && settings.enabledProviders[provider] === false) {
      return false;
    }
    return this.hasProviderKey(provider);
  }

  getDefaultModelFor(provider: ProviderId): string {
    const settings = storageStore.getState().settings;
    return settings.providerDefaultModels?.[provider] || DEFAULT_PROVIDER_MODELS[provider][0].id;
  }

  getVoiceKeyStatuses(): { gemini: boolean; elevenlabs: boolean } {
    return {
      gemini: ApiSecurityManager.maskKeyStatus('GEMINI_API_KEY'),
      elevenlabs: ApiSecurityManager.maskKeyStatus('ELEVENLABS_API_KEY'),
    };
  }

  listProviders(): ProviderInfo[] {
    const names: Record<ProviderId, string> = {
      gemini: 'Google Gemini',
      groq: 'Groq',
      openrouter: 'OpenRouter',
    };

    const settings = storageStore.getState().settings;

    return (Object.keys(names) as ProviderId[]).map((id) => {
      const enabled = settings.enabledProviders?.[id] !== false;
      const configured = this.hasProviderKey(id);
      const meta = this.providerMeta[id] || {};
      const baseModels = this.dynamicModels[id] || DEFAULT_PROVIDER_MODELS[id];
      const customIds = settings.providerCustomModels?.[id] || [];
      const models = [...baseModels];
      for (const cid of customIds) {
        const cleanCid = cid.trim();
        if (cleanCid && !models.some((m) => m.id === cleanCid)) {
          models.push({
            id: cleanCid,
            label: `${cleanCid} (Custom)`,
            provider: id,
            supportsStreaming: true,
          });
        }
      }

      const selectedModel = settings.providerDefaultModels?.[id] || models[0]?.id || this.getDefaultModelFor(id);

      return {
        id,
        name: names[id],
        envKeyName: PROVIDER_ENV_KEY_NAMES[id],
        configured,
        enabled,
        selectedModel,
        status: !enabled
          ? 'DISABLED'
          : configured
            ? meta.status === 'ENV_KEY_MISSING'
              ? 'UNTESTED'
              : meta.status || 'UNTESTED'
            : 'ENV_KEY_MISSING',
        lastTestedAt: meta.lastTestedAt,
        lastLatencyMs: meta.lastLatencyMs,
        errorMessage: meta.errorMessage,
        supportsLiveModelFetch: true,
        models,
      };
    });
  }

  async testConnection(provider: ProviderId): Promise<ProviderInfo> {
    const start = Date.now();
    try {
      const key = getEnvKeyForProvider(provider);
      if (!key || key.startsWith('MY_')) {
        this.providerMeta[provider] = {
          status: 'ENV_KEY_MISSING',
          lastTestedAt: new Date().toISOString(),
          errorMessage: `Set ${PROVIDER_ENV_KEY_NAMES[provider]} in AI Studio Secrets.`,
        };
        return this.listProviders().find((p) => p.id === provider)!;
      }

      if (provider === 'gemini') {
        const probeModels = [
          'gemini-4-hydrogen',
          'gemini-3.1-flash-lite',
          'gemini-3-flash-preview',
        ];
        let ok = false;
        let lastErr: unknown;
        for (const m of probeModels) {
          try {
            const ai = createGeminiClient(m.includes('preview') ? 'v1beta' : undefined);
            const thinkingLevel = mapThinkingLevel(m, 'LOW');
            const res = await ai.models.generateContent({
              model: m,
              contents: 'Respond with OK.',
              config: thinkingLevel ? { thinkingConfig: { thinkingLevel } } : undefined,
            });
            if (res.text) {
              ok = true;
              break;
            }
          } catch (err) {
            lastErr = err;
          }
        }
        if (!ok) throw lastErr || new Error('Gemini connection failed');
      } else {
        const baseUrl = getBaseUrlForProvider(provider);
        const resp = await fetch(`${baseUrl}/models`, {
          headers: { Authorization: `Bearer ${key}` },
          signal: AbortSignal.timeout(10000),
        });
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      }

      const latency = Date.now() - start;
      this.providerMeta[provider] = {
        status: 'CONNECTED',
        lastTestedAt: new Date().toISOString(),
        lastLatencyMs: latency,
        errorMessage: undefined,
      };
      loggingDiagnostics.record('AiProviderManager', 'INFO', `Tested ${provider} connection (${latency}ms)`);
    } catch (err) {
      const msg = formatFriendlyProviderError(err);
      this.providerMeta[provider] = {
        status: 'ERROR',
        lastTestedAt: new Date().toISOString(),
        lastLatencyMs: Date.now() - start,
        errorMessage: msg,
      };
      loggingDiagnostics.record('AiProviderManager', 'ERROR', `Provider ${provider} test failed`, msg);
    }
    return this.listProviders().find((p) => p.id === provider)!;
  }

  async connectProvider(provider: ProviderId): Promise<ProviderInfo> {
    storageStore.update((draft) => {
      draft.settings.enabledProviders = {
        ...draft.settings.enabledProviders,
        [provider]: true,
      };
    });
    return this.testConnection(provider);
  }

  disconnectProvider(provider: ProviderId): ProviderInfo {
    storageStore.update((draft) => {
      draft.settings.enabledProviders = {
        ...draft.settings.enabledProviders,
        [provider]: false,
      };
    });
    this.providerMeta[provider] = {
      status: 'DISABLED',
      lastTestedAt: new Date().toISOString(),
      errorMessage: 'Disconnected by user.',
    };
    loggingDiagnostics.record('AiProviderManager', 'INFO', `Disconnected provider: ${provider}`);
    return this.listProviders().find((p) => p.id === provider)!;
  }

  async fetchModels(provider: ProviderId): Promise<ModelOption[]> {
    const key = getEnvKeyForProvider(provider);
    if (!key || key.startsWith('MY_')) {
      return DEFAULT_PROVIDER_MODELS[provider];
    }

    try {
      if (provider === 'gemini') {
        const ai = createGeminiClient();
        const pager = await ai.models.list();
        const fetched: ModelOption[] = [];
        for await (const m of pager) {
          const cleanId = (m.name || '').replace(/^models\//, '');
          if (
            cleanId &&
            (cleanId.startsWith('gemini-4') || cleanId.startsWith('gemini-3')) &&
            !cleanId.includes('image') &&
            !cleanId.includes('tts') &&
            !cleanId.includes('embedding') &&
            !cleanId.includes('transcribe')
          ) {
            fetched.push({
              id: cleanId,
              label: m.displayName || cleanId,
              provider: 'gemini',
              supportsStreaming: true,
              supportsThinking: true,
            });
          }
          if (fetched.length >= 12) break;
        }
        if (fetched.length > 0) {
          const merged = [...DEFAULT_PROVIDER_MODELS.gemini];
          for (const item of fetched) {
            if (!merged.some((d) => d.id === item.id)) merged.push(item);
          }
          this.dynamicModels.gemini = merged;
          return merged;
        }
        return DEFAULT_PROVIDER_MODELS.gemini;
      }

      const baseUrl = getBaseUrlForProvider(provider);
      const resp = await fetch(`${baseUrl}/models`, {
        headers: { Authorization: `Bearer ${key}` },
        signal: AbortSignal.timeout(10000),
      });
      if (!resp.ok) return DEFAULT_PROVIDER_MODELS[provider];
      const json = (await resp.json()) as { data?: Array<{ id: string }> };
      if (Array.isArray(json.data) && json.data.length > 0) {
        const filtered =
          provider === 'groq'
            ? json.data.filter((m) => !/whisper|orpheus|prompt-guard|safeguard/i.test(m.id))
            : json.data;
        const list = (filtered.length > 0 ? filtered : json.data).slice(0, 25).map((m) => ({
          id: m.id,
          label: m.id,
          provider,
          supportsStreaming: true,
        }));
        this.dynamicModels[provider] = list;
        return list;
      }
    } catch (error) {
      loggingDiagnostics.record(
        'AiProviderManager',
        'WARN',
        `Live model discovery fallback for ${provider}`,
        error instanceof Error ? error.message : String(error)
      );
    }
    return DEFAULT_PROVIDER_MODELS[provider];
  }

  async *streamGenerate(req: ProviderGenerateRequest): AsyncGenerator<ProviderStreamChunk> {
    if (req.provider === 'gemini') {
      const ai = createGeminiClient(req.model.includes('preview') ? 'v1beta' : undefined);
      const contents = req.messages.map((m) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      }));
      const thinkingLevel = mapThinkingLevel(req.model, req.thinkingSpeed);

      const stream = await ai.models.generateContentStream({
        model: req.model,
        contents,
        config: {
          systemInstruction: req.systemPrompt,
          ...(thinkingLevel ? { thinkingConfig: { thinkingLevel } } : {}),
        },
      });

      for await (const chunk of stream) {
        if (chunk.text) {
          yield { text: chunk.text };
        }
      }
      yield { text: '', done: true };
      return;
    }

    const key = getEnvKeyForProvider(req.provider);
    if (!key || key.startsWith('MY_')) {
      throw new Error(
        `API key for ${req.provider} (${PROVIDER_ENV_KEY_NAMES[req.provider]}) is not configured in server secrets.`
      );
    }

    const baseUrl = getBaseUrlForProvider(req.provider);
    const resp = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        ...(req.provider === 'openrouter' ? { 'X-Title': 'JARVIS AI' } : {}),
      },
      body: JSON.stringify({
        model: req.model,
        stream: true,
        max_tokens: req.maxOutputTokens || 1536,
        messages: [
          { role: 'system', content: req.systemPrompt },
          ...req.messages,
        ],
      }),
      signal: AbortSignal.timeout(15000),
    });
    if (!resp.ok || !resp.body) {
      throw new Error(`${req.provider} API error: HTTP ${resp.status}`);
    }

    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const payload = line.slice(6).trim();
        if (payload === '[DONE]') continue;
        try {
          const parsed = JSON.parse(payload) as {
            choices?: Array<{ delta?: { content?: string } }>;
          };
          const delta = parsed.choices?.[0]?.delta?.content;
          if (delta) yield { text: delta };
        } catch {
          // ignore partial chunk
        }
      }
    }
    yield { text: '', done: true };
  }
}

export const aiProviderManager = new AiProviderManager();
