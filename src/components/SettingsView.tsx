import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Code2,
  Copy,
  Cpu,
  KeyRound,
  Lock,
  Mic,
  Play,
  Plus,
  RefreshCw,
  Save,
  ShieldCheck,
  Smartphone,
  Trash2,
  Volume2,
} from 'lucide-react';
import type {
  AdaptiveTrait,
  AppSettingsPayload,
  AutomationRoutine,
  DiagnosticLogEntry,
  EmotionType,
  PermissionRecord,
  PersonalityId,
  PersonalityModelConfig,
  ProviderId,
  ProviderInfo,
  SttProviderId,
  ThinkingSpeed,
  TtsEngineId,
  VirtualScreenState,
  VoicePersonaName,
  VoiceSettings,
} from '../types/jarvis';
import { requestBrowserPermission } from '../services/permissionClient';
import { voiceClient } from '../services/voiceClient';

interface SettingsViewProps {
  settings: AppSettingsPayload;
  permissions: PermissionRecord[];
  onUpdateSettings: (patch: Partial<AppSettingsPayload>) => Promise<boolean>;
  onRefreshPermissions: () => Promise<void>;
}

type SettingsTab = 'providers' | 'permissions' | 'voice' | 'automation';
type SaveStatus = 'idle' | 'dirty' | 'saving' | 'saved' | 'error';

const PERSONALITY_OPTIONS: Array<{ id: PersonalityId; label: string }> = [
  { id: 'jarvis', label: 'JARVIS' },
  { id: 'normal', label: 'Normal' },
  { id: 'jadavis', label: 'JADAVIS' },
  { id: 'girl', label: 'AI Girl' },
];

const EMOTIONS: EmotionType[] = [
  'Normal',
  'Happy',
  'Sad',
  'Angry',
  'Laughing',
  'Curious',
  'Surprised',
  'Excited',
  'Serious',
  'Calm',
];

export const SettingsView: React.FC<SettingsViewProps> = ({
  settings,
  permissions,
  onUpdateSettings,
  onRefreshPermissions,
}) => {
  const [tab, setTab] = useState<SettingsTab>('providers');
  const [draft, setDraft] = useState<AppSettingsPayload>(settings);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [saveError, setSaveError] = useState<string | null>(null);

  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [testingProvider, setTestingProvider] = useState<ProviderId | null>(null);
  const [fetchingModelsFor, setFetchingModelsFor] = useState<ProviderId | null>(null);
  const [voiceProfileTarget, setVoiceProfileTarget] = useState<PersonalityId>(settings.activePersonality);
  const [modelProfileTarget, setModelProfileTarget] = useState<PersonalityId>(settings.activePersonality);
  const [screenState, setScreenState] = useState<VirtualScreenState | null>(null);
  const [cmdHistory, setCmdHistory] = useState<
    Array<{ id: string; timestamp: string; command: string; category: string; status: string; summary: string }>
  >([]);
  const [logs, setLogs] = useState<DiagnosticLogEntry[]>([]);
  const [routines, setRoutines] = useState<AutomationRoutine[]>([]);
  const [newRoutineName, setNewRoutineName] = useState('');
  const [newRoutineTrigger, setNewRoutineTrigger] = useState('');
  const [newRoutineCommands, setNewRoutineCommands] = useState('');
  const [routineFeedback, setRoutineFeedback] = useState<string | null>(null);
  const [androidFiles, setAndroidFiles] = useState<Array<{ path: string; content: string }>>([]);
  const [selectedAndroidFile, setSelectedAndroidFile] = useState<string>('');
  const [voiceTestStatus, setVoiceTestStatus] = useState<string | null>(null);
  const [voiceTestError, setVoiceTestError] = useState<string | null>(null);
  const [customModelInputs, setCustomModelInputs] = useState<Partial<Record<ProviderId, string>>>({});
  const [copiedSecretKey, setCopiedSecretKey] = useState<string | null>(null);
  const [adaptiveTraits, setAdaptiveTraits] = useState<AdaptiveTrait[]>([]);
  const [newTraitInput, setNewTraitInput] = useState('');

  // Sync incoming external updates only when user does not have unsaved edits
  useEffect(() => {
    if (saveStatus !== 'dirty' && saveStatus !== 'saving') {
      setDraft(settings);
    }
  }, [settings, saveStatus]);

  const loadProviders = async () => {
    const resp = await fetch('/api/providers');
    if (resp.ok) setProviders(await resp.json());
  };

  const loadAutomationData = async () => {
    const [scrResp, histResp, diagResp, routineResp, androidResp] = await Promise.all([
      fetch('/api/automation/screen'),
      fetch('/api/automation/history'),
      fetch('/api/diagnostics'),
      fetch('/api/routines'),
      fetch('/api/android-project'),
    ]);
    if (scrResp.ok) setScreenState(await scrResp.json());
    if (histResp.ok) setCmdHistory(await histResp.json());
    if (diagResp.ok) setLogs(await diagResp.json());
    if (routineResp.ok) setRoutines(await routineResp.json());
    if (androidResp.ok) {
      const data = (await androidResp.json()) as { files: Array<{ path: string; content: string }> };
      setAndroidFiles(data.files || []);
      if (data.files?.length > 0 && !selectedAndroidFile) {
        setSelectedAndroidFile(data.files[0].path);
      }
    }
  };

  const loadEvolutionTraits = async () => {
    const resp = await fetch('/api/evolution');
    if (resp.ok) setAdaptiveTraits(await resp.json());
  };

  useEffect(() => {
    void loadProviders();
    void loadEvolutionTraits();
  }, []);

  useEffect(() => {
    if (tab === 'automation') {
      void loadAutomationData();
    }
    if (tab === 'voice') {
      void loadEvolutionTraits();
    }
  }, [tab]);

  const patchDraft = (updater: (prev: AppSettingsPayload) => AppSettingsPayload) => {
    setDraft((prev) => updater(prev));
    setSaveStatus('dirty');
    setSaveError(null);
  };

  const handleSaveSettings = async (overrideDraft?: AppSettingsPayload) => {
    const payload = overrideDraft || draft;
    setSaveStatus('saving');
    setSaveError(null);
    try {
      const ok = await onUpdateSettings(payload);
      if (ok) {
        setSaveStatus('saved');
        await loadProviders();
        window.setTimeout(() => {
          setSaveStatus((cur) => (cur === 'saved' ? 'idle' : cur));
        }, 2500);
      } else {
        setSaveStatus('error');
        setSaveError('Server rejected settings update. Please check connection and retry.');
      }
    } catch (err) {
      setSaveStatus('error');
      setSaveError(err instanceof Error ? err.message : 'Save Failed.');
    }
  };

  const handleTestProvider = async (id: ProviderId) => {
    setTestingProvider(id);
    try {
      const resp = await fetch(`/api/providers/${id}/test`, { method: 'POST' });
      if (resp.ok) {
        const updated = (await resp.json()) as ProviderInfo;
        setProviders((prev) => prev.map((p) => (p.id === id ? updated : p)));
      }
    } finally {
      setTestingProvider(null);
    }
  };

  const handleConnectToggle = async (id: ProviderId, connect: boolean) => {
    setTestingProvider(id);
    try {
      const resp = await fetch(`/api/providers/${id}/${connect ? 'connect' : 'disconnect'}`, {
        method: 'POST',
      });
      if (resp.ok) {
        const updated = (await resp.json()) as ProviderInfo;
        setProviders((prev) => prev.map((p) => (p.id === id ? updated : p)));
        setDraft((prev) => ({
          ...prev,
          enabledProviders: { ...prev.enabledProviders, [id]: connect },
        }));
      }
    } finally {
      setTestingProvider(null);
    }
  };

  const handleFetchModels = async (id: ProviderId) => {
    setFetchingModelsFor(id);
    try {
      const resp = await fetch(`/api/providers/${id}/models`);
      if (resp.ok) {
        const data = (await resp.json()) as { models: ProviderInfo['models'] };
        setProviders((prev) =>
          prev.map((p) => (p.id === id ? { ...p, models: data.models } : p))
        );
      }
    } finally {
      setFetchingModelsFor(null);
    }
  };

  const getModelConfig = (target: PersonalityId): PersonalityModelConfig => {
    if (target === 'normal') return draft.normalModel;
    if (target === 'jadavis') return draft.jadavisModel;
    if (target === 'girl') return draft.girlModel;
    return draft.jarvisModel;
  };

  const getVoiceConfig = (target: PersonalityId): VoiceSettings => {
    if (target === 'normal') return draft.normalVoice;
    if (target === 'jadavis') return draft.jadavisVoice;
    if (target === 'girl') return draft.girlVoice;
    return draft.jarvisVoice;
  };

  const activeModelConfig = getModelConfig(modelProfileTarget);
  const activeVoiceConfig = getVoiceConfig(voiceProfileTarget);

  const updateModelConfig = (patch: Partial<PersonalityModelConfig>) => {
    patchDraft((prev) => {
      if (modelProfileTarget === 'normal') {
        return { ...prev, normalModel: { ...prev.normalModel, ...patch } };
      }
      if (modelProfileTarget === 'jadavis') {
        return { ...prev, jadavisModel: { ...prev.jadavisModel, ...patch } };
      }
      if (modelProfileTarget === 'girl') {
        return { ...prev, girlModel: { ...prev.girlModel, ...patch } };
      }
      return { ...prev, jarvisModel: { ...prev.jarvisModel, ...patch } };
    });
  };

  const updateVoiceConfig = (patch: Partial<VoiceSettings>) => {
    patchDraft((prev) => {
      if (voiceProfileTarget === 'normal') {
        return { ...prev, normalVoice: { ...prev.normalVoice, ...patch } };
      }
      if (voiceProfileTarget === 'jadavis') {
        return { ...prev, jadavisVoice: { ...prev.jadavisVoice, ...patch } };
      }
      if (voiceProfileTarget === 'girl') {
        return { ...prev, girlVoice: { ...prev.girlVoice, ...patch } };
      }
      return { ...prev, jarvisVoice: { ...prev.jarvisVoice, ...patch } };
    });
  };

  const handleTestVoice = async () => {
    setVoiceTestError(null);
    setVoiceTestStatus(`Synthesizing locked ${activeVoiceConfig.ttsEngine} (${activeVoiceConfig.voiceName})...`);
    const sampleText =
      voiceProfileTarget === 'jarvis'
        ? 'All primary systems are online and ready for your command.'
        : voiceProfileTarget === 'normal'
          ? 'Hello! Normal conversational mode is active and ready to help.'
          : voiceProfileTarget === 'jadavis'
            ? 'Yo! Jadavis is awake, sharp, and ready to cause a little productive trouble.'
            : 'Hey! I am Aria, your AI character. Tell me what is on your mind today!';
    await voiceClient.speak(
      sampleText,
      voiceProfileTarget,
      activeVoiceConfig,
      draft.characterMoods[voiceProfileTarget] || 'Normal',
      () => {},
      () => setVoiceTestStatus(null),
      (err) => {
        setVoiceTestStatus(null);
        setVoiceTestError(err);
      }
    );
  };

  const handleCreateRoutine = async (e: React.FormEvent) => {
    e.preventDefault();
    setRoutineFeedback(null);
    if (!newRoutineName.trim() || !newRoutineTrigger.trim() || !newRoutineCommands.trim()) {
      setRoutineFeedback('Please fill in routine name, trigger phrase, and steps.');
      return;
    }
    const resp = await fetch('/api/routines', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: newRoutineName,
        triggerPhrase: newRoutineTrigger,
        commandsText: newRoutineCommands,
      }),
    });
    if (resp.ok) {
      setNewRoutineName('');
      setNewRoutineTrigger('');
      setNewRoutineCommands('');
      setRoutineFeedback('Routine saved.');
      await loadAutomationData();
    }
  };

  const handleRunRoutine = async (routine: AutomationRoutine) => {
    setRoutineFeedback(`Running "${routine.name}"...`);
    const resp = await fetch(`/api/routines/${routine.id}/run`, { method: 'POST' });
    if (resp.ok) {
      const data = (await resp.json()) as {
        taskSummary?: { completed: number; total: number };
      };
      setRoutineFeedback(
        `Routine "${routine.name}" completed ${data.taskSummary?.completed ?? 0}/${data.taskSummary?.total ?? 0} actions.`
      );
      await loadAutomationData();
    }
  };

  const selectedProviderObj = providers.find((p) => p.id === activeModelConfig.provider);
  const fallbackProviderObj = providers.find((p) => p.id === activeModelConfig.fallbackProvider);
  const primaryProviderObj = providers.find((p) => p.id === draft.primaryProvider);

  return (
    <div className="w-full max-w-5xl mx-auto px-4 sm:px-6 pb-28 pt-2">
      {/* Sticky Header + Explicit Save Settings Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="font-display text-2xl font-semibold text-white tracking-tight">
            Control Center
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Configure AI providers, locked neural voices, {permissions.length} permissions, wake-word sensitivity, and Android routines.
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          {saveStatus === 'dirty' && (
            <span className="text-xs text-amber-300 font-medium">Unsaved changes</span>
          )}
          {saveStatus === 'saved' && (
            <span className="inline-flex items-center gap-1 text-xs text-emerald-400 font-medium">
              <Check className="w-3.5 h-3.5" />
              Saved
            </span>
          )}
          {saveStatus === 'error' && (
            <span className="text-xs text-red-400 font-medium">Save Failed</span>
          )}
          <button
            type="button"
            disabled={saveStatus === 'saving'}
            onClick={() => void handleSaveSettings()}
            className={`inline-flex items-center gap-2 min-h-[44px] px-5 py-2 rounded-xl text-xs font-semibold transition-all whitespace-nowrap border ${
              saveStatus === 'dirty'
                ? 'bg-amber-500 hover:bg-amber-400 text-slate-950 border-amber-300 shadow-[0_0_20px_rgba(245,158,11,0.35)]'
                : 'bg-blue-600 hover:bg-blue-500 text-white border-amber-400/25'
            }`}
          >
            <Save className="w-4 h-4" />
            {saveStatus === 'saving' ? 'Saving...' : 'Save Settings'}
          </button>
        </div>
      </div>

      {saveError && (
        <div className="mb-4 p-3 rounded-xl bg-red-950/50 border border-red-500/40 text-xs text-red-300">
          {saveError}
        </div>
      )}

      {/* Section Tabs */}
      <div className="flex flex-wrap gap-2 mb-6 p-1.5 rounded-2xl bg-[#09132d] border border-blue-900/60">
        {(
          [
            { id: 'providers', label: 'AI Providers', icon: Cpu },
            { id: 'permissions', label: 'Permissions', icon: ShieldCheck },
            { id: 'voice', label: 'Voice & Emotions', icon: Mic },
            { id: 'automation', label: 'Routines & Android', icon: Smartphone },
          ] as const
        ).map((item) => {
          const Icon = item.icon;
          const active = tab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              className={`inline-flex items-center gap-2 min-h-[42px] px-4 py-2 rounded-xl text-xs font-medium transition-colors whitespace-nowrap ${
                active
                  ? 'bg-blue-600 text-white border border-amber-400/25'
                  : 'text-slate-300 hover:text-white hover:bg-blue-950/60'
              }`}
            >
              <Icon className="w-4 h-4" />
              {item.label}
            </button>
          );
        })}
      </div>

      {/* SECTION A: AI PROVIDERS & MODELS */}
      {tab === 'providers' && (
        <div className="space-y-6">
          {/* Global Primary / Secondary / Fast / Reasoning / STT / TTS Routing */}
          <div className="rounded-2xl bg-[#09132d]/75 border border-blue-900/50 p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-white">Global Intelligence & Speech Routing</h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Enable Automatic Model Selection to route fast chat vs deep reasoning automatically, or pick manual providers below.
                </p>
              </div>
              <label className="inline-flex items-center gap-2.5 px-3.5 py-2 rounded-xl bg-[#040918] border border-amber-400/35 text-xs font-medium text-amber-200 cursor-pointer shrink-0">
                <input
                  type="checkbox"
                  checked={draft.autoModelSelection !== false}
                  onChange={(e) =>
                    patchDraft((prev) => ({ ...prev, autoModelSelection: e.target.checked }))
                  }
                  className="w-4 h-4 accent-amber-400"
                />
                Auto Model Selection
              </label>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs text-slate-400 mb-1.5">Primary AI Provider</label>
                <select
                  value={draft.primaryProvider}
                  onChange={(e) => {
                    const nextProv = e.target.value as ProviderId;
                    patchDraft((prev) => ({ ...prev, primaryProvider: nextProv }));
                  }}
                  className="w-full h-11 px-3 rounded-xl bg-[#040918] border border-blue-900/60 text-sm text-white focus:outline-none focus:border-blue-500"
                >
                  {providers.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1.5">Secondary / Backup AI Provider</label>
                <select
                  value={draft.secondaryProvider}
                  onChange={(e) =>
                    patchDraft((prev) => ({
                      ...prev,
                      secondaryProvider: e.target.value as ProviderId,
                    }))
                  }
                  className="w-full h-11 px-3 rounded-xl bg-[#040918] border border-blue-900/60 text-sm text-white focus:outline-none focus:border-blue-500"
                >
                  {providers.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1.5">Fast Response Model</label>
                <select
                  value={draft.fastResponseModel}
                  onChange={(e) =>
                    patchDraft((prev) => ({ ...prev, fastResponseModel: e.target.value }))
                  }
                  className="w-full h-11 px-3 rounded-xl bg-[#040918] border border-blue-900/60 text-sm text-white focus:outline-none focus:border-blue-500"
                >
                  {(primaryProviderObj?.models || []).map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label}
                    </option>
                  ))}
                  <option value="gemini-3.1-flash-lite">gemini-3.1-flash-lite</option>
                  <option value="gemini-4-hydrogen">gemini-4-hydrogen</option>
                </select>
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1.5">Advanced Reasoning Model</label>
                <select
                  value={draft.reasoningModel}
                  onChange={(e) =>
                    patchDraft((prev) => ({ ...prev, reasoningModel: e.target.value }))
                  }
                  className="w-full h-11 px-3 rounded-xl bg-[#040918] border border-blue-900/60 text-sm text-white focus:outline-none focus:border-blue-500"
                >
                  <option value="gemini-4-neon">Gemini 4 Neon (Advanced Reasoning)</option>
                  <option value="gemini-4-carbon">Gemini 4 Carbon (Deep Architecture)</option>
                  <option value="gemini-4-hydrogen">Gemini 4 Hydrogen</option>
                  {(primaryProviderObj?.models || []).map((m) => (
                    <option key={`r-${m.id}`} value={m.id}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1.5">Speech-to-Text (STT) Provider</label>
                <select
                  value={draft.sttProvider}
                  onChange={(e) =>
                    patchDraft((prev) => ({ ...prev, sttProvider: e.target.value as SttProviderId }))
                  }
                  className="w-full h-11 px-3 rounded-xl bg-[#040918] border border-blue-900/60 text-sm text-white focus:outline-none focus:border-blue-500"
                >
                  <option value="auto">Auto Ultra-Fast (Live + Groq/Gemini)</option>
                  <option value="browser">On-Device / Browser Instant Stream</option>
                  <option value="gemini">Gemini 3.5 Transcribe / Flash Lite</option>
                  <option value="groq">Groq Whisper Turbo (Requires GROQ_API_KEY)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1.5">Global Voice TTS Provider</label>
                <select
                  value={draft.ttsProvider}
                  onChange={(e) => {
                    const eng = e.target.value as TtsEngineId;
                    const defaultModel =
                      eng === 'openai'
                        ? 'tts-1'
                        : eng === 'browser'
                          ? 'device-local'
                          : 'gemini-3.8-flash-lite-tts';
                    patchDraft((prev) => ({
                      ...prev,
                      ttsProvider: eng,
                      jarvisVoice: { ...prev.jarvisVoice, ttsEngine: eng, voiceModel: defaultModel },
                      normalVoice: { ...prev.normalVoice, ttsEngine: eng, voiceModel: defaultModel },
                      jadavisVoice: { ...prev.jadavisVoice, ttsEngine: eng, voiceModel: defaultModel },
                      girlVoice: { ...prev.girlVoice, ttsEngine: eng, voiceModel: defaultModel },
                    }));
                  }}
                  className="w-full h-11 px-3 rounded-xl bg-[#040918] border border-blue-900/60 text-sm text-white focus:outline-none focus:border-blue-500"
                >
                  <option value="gemini">Gemini 3.8 Neural Human Voice</option>
                  <option value="openai">OpenAI Neural Voice (OPENAI_API_KEY)</option>
                  <option value="browser">Device Local SpeechSynthesis</option>
                </select>
              </div>
            </div>
          </div>

          {/* Per-Character Routing */}
          <div className="rounded-2xl bg-[#09132d]/75 border border-blue-900/50 p-5 space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-white">Model Routing per Mode & Character</h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Configure models, fallbacks, thinking speed, and personality instructions independently for JARVIS, Normal, JADAVIS, and AI Girl.
                </p>
              </div>
              <div className="inline-flex p-1 rounded-xl bg-[#040918] border border-blue-900/60">
                {PERSONALITY_OPTIONS.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setModelProfileTarget(opt.id)}
                    className={`min-h-[36px] px-3.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
                      modelProfileTarget === opt.id
                        ? 'bg-blue-600 text-white'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-slate-400 mb-1.5">Primary Provider</label>
                <select
                  value={activeModelConfig.provider}
                  onChange={(e) => {
                    const nextProv = e.target.value as ProviderId;
                    const provObj = providers.find((p) => p.id === nextProv);
                    updateModelConfig({
                      provider: nextProv,
                      model: provObj?.models[0]?.id || activeModelConfig.model,
                    });
                  }}
                  className="w-full h-11 px-3 rounded-xl bg-[#040918] border border-blue-900/60 text-sm text-white focus:outline-none focus:border-blue-500"
                >
                  {providers.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1.5">Active Model</label>
                <select
                  value={activeModelConfig.model}
                  onChange={(e) => updateModelConfig({ model: e.target.value })}
                  className="w-full h-11 px-3 rounded-xl bg-[#040918] border border-blue-900/60 text-sm text-white focus:outline-none focus:border-blue-500"
                >
                  <option value="auto">Auto (Smart Fastest Healthy Model)</option>
                  {(selectedProviderObj?.models || []).map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1.5">Fallback Provider</label>
                <select
                  value={activeModelConfig.fallbackProvider}
                  onChange={(e) => {
                    const nextProv = e.target.value as ProviderId;
                    const provObj = providers.find((p) => p.id === nextProv);
                    updateModelConfig({
                      fallbackProvider: nextProv,
                      fallbackModel: provObj?.models[0]?.id || activeModelConfig.fallbackModel,
                    });
                  }}
                  className="w-full h-11 px-3 rounded-xl bg-[#040918] border border-blue-900/60 text-sm text-white focus:outline-none focus:border-blue-500"
                >
                  {providers.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1.5">Fallback Model</label>
                <select
                  value={activeModelConfig.fallbackModel}
                  onChange={(e) => updateModelConfig({ fallbackModel: e.target.value })}
                  className="w-full h-11 px-3 rounded-xl bg-[#040918] border border-blue-900/60 text-sm text-white focus:outline-none focus:border-blue-500"
                >
                  {(fallbackProviderObj?.models || []).map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1.5">Response Speed / Thinking Depth</label>
                <select
                  value={activeModelConfig.thinkingSpeed}
                  onChange={(e) => updateModelConfig({ thinkingSpeed: e.target.value as ThinkingSpeed })}
                  className="w-full h-11 px-3 rounded-xl bg-[#040918] border border-blue-900/60 text-sm text-white focus:outline-none focus:border-blue-500"
                >
                  <option value="LOW">Ultra-Fast (Low Latency)</option>
                  <option value="MEDIUM">Balanced Reasoning</option>
                  <option value="HIGH">Deep Analysis</option>
                </select>
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1.5">Max Output Limit (Tokens)</label>
                <input
                  type="number"
                  min={256}
                  max={8192}
                  step={256}
                  value={activeModelConfig.maxOutputTokens}
                  onChange={(e) => updateModelConfig({ maxOutputTokens: Number(e.target.value) || 1536 })}
                  className="w-full h-11 px-3 rounded-xl bg-[#040918] border border-blue-900/60 text-sm text-white tabular-nums focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs text-slate-400 mb-1.5">
                {PERSONALITY_OPTIONS.find((p) => p.id === modelProfileTarget)?.label} Personality Instructions
              </label>
              <textarea
                rows={3}
                value={activeModelConfig.systemPrompt}
                onChange={(e) => updateModelConfig({ systemPrompt: e.target.value })}
                className="w-full p-3 rounded-xl bg-[#040918] border border-blue-900/60 text-sm text-slate-100 focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>

          {/* Individual AI Provider Cards (All 7 Providers) */}
          <div className="rounded-2xl bg-[#09132d]/75 border border-blue-900/50 overflow-hidden">
            <div className="p-5 border-b border-blue-900/40">
              <h2 className="text-base font-semibold text-white">Individual AI Provider Configurations (All 7 Providers)</h2>
              <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                Configure each provider independently—Enable/Disable toggle, Default Model, Connection Test, Live Status, and Error Diagnostics. Server secrets are read securely from{' '}
                <span className="text-amber-300 font-medium">AI Studio Secrets</span> / <span className="font-mono text-amber-300">.env</span> and never exposed in the browser.
              </p>
            </div>
            <div className="divide-y divide-blue-900/40">
              {providers.map((provider) => {
                const pid = provider.id as ProviderId;
                const isEnabled = draft.enabledProviders?.[pid] !== false;
                const customIds = draft.providerCustomModels?.[pid] || [];
                const mergedModels = [...provider.models];
                for (const cid of customIds) {
                  if (cid && !mergedModels.some((m) => m.id === cid)) {
                    mergedModels.push({
                      id: cid,
                      label: `${cid} (Custom)`,
                      provider: pid,
                      supportsStreaming: true,
                    });
                  }
                }
                const defaultModel = draft.providerDefaultModels?.[pid] || mergedModels[0]?.id || '';
                const customDraft = customModelInputs[pid] || '';
                return (
                  <div key={provider.id} className="p-4 space-y-3">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2 text-sm font-semibold text-white">
                          <span>{provider.name}</span>
                          <span aria-hidden="true" className="text-slate-600">·</span>
                          <span
                            className={`text-xs font-normal ${
                              !isEnabled
                                ? 'text-slate-500'
                                : provider.status === 'CONNECTED'
                                  ? 'text-amber-300'
                                  : provider.status === 'ERROR'
                                    ? 'text-red-400'
                                    : 'text-slate-400'
                            }`}
                          >
                            {!isEnabled ? 'DISABLED' : provider.status.replace(/_/g, ' ')}
                          </span>
                          {provider.lastLatencyMs !== undefined && (
                            <>
                              <span aria-hidden="true" className="text-slate-600">·</span>
                              <span className="text-xs text-slate-400 tabular-nums">{provider.lastLatencyMs}ms</span>
                            </>
                          )}
                        </div>
                        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400 mt-1.5">
                          {provider.envKeyName && (
                            <span
                              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border font-mono text-[11px] ${
                                provider.configured
                                  ? 'bg-emerald-950/35 border-emerald-500/35 text-emerald-300'
                                  : 'bg-amber-950/35 border-amber-500/35 text-amber-300'
                              }`}
                            >
                              <KeyRound className="w-3 h-3" />
                              {provider.envKeyName} ({provider.configured ? 'Configured' : 'Set in AI Studio Secrets'})
                              <button
                                type="button"
                                onClick={() => {
                                  void navigator.clipboard?.writeText(provider.envKeyName || '');
                                  setCopiedSecretKey(provider.envKeyName || null);
                                  window.setTimeout(() => setCopiedSecretKey(null), 1800);
                                }}
                                title={`Copy ${provider.envKeyName}`}
                                className="ml-1 text-slate-300 hover:text-white"
                              >
                                {copiedSecretKey === provider.envKeyName ? (
                                  <Check className="w-3 h-3 text-emerald-300" />
                                ) : (
                                  <Copy className="w-3 h-3" />
                                )}
                              </button>
                            </span>
                          )}
                          <span>· {mergedModels.length} models</span>
                          {provider.errorMessage ? (
                            <span className="text-red-400"> — {provider.errorMessage}</span>
                          ) : null}
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 shrink-0">
                        {isEnabled ? (
                          <button
                            type="button"
                            disabled={testingProvider === pid}
                            onClick={() => void handleConnectToggle(pid, false)}
                            className="min-h-[40px] px-3.5 py-2 rounded-xl bg-red-950/50 hover:bg-red-900/60 border border-red-500/40 text-xs font-medium text-red-200 transition-colors whitespace-nowrap"
                          >
                            Disconnect
                          </button>
                        ) : (
                          <button
                            type="button"
                            disabled={testingProvider === pid}
                            onClick={() => void handleConnectToggle(pid, true)}
                            className="min-h-[40px] px-3.5 py-2 rounded-xl bg-emerald-600/80 hover:bg-emerald-500 text-xs font-medium text-white transition-colors whitespace-nowrap"
                          >
                            Connect
                          </button>
                        )}
                        {provider.supportsLiveModelFetch && (
                          <button
                            type="button"
                            disabled={fetchingModelsFor === pid}
                            onClick={() => void handleFetchModels(pid)}
                            className="inline-flex items-center gap-1.5 min-h-[40px] px-3 py-2 rounded-xl bg-[#040918] hover:bg-blue-950/70 border border-blue-800/60 text-xs font-medium text-slate-200 transition-colors whitespace-nowrap"
                          >
                            <RefreshCw className={`w-3.5 h-3.5 ${fetchingModelsFor === pid ? 'animate-spin' : ''}`} />
                            Models
                          </button>
                        )}
                        <button
                          type="button"
                          disabled={testingProvider === pid}
                          onClick={() => void handleTestProvider(pid)}
                          className="min-h-[40px] px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-xs font-medium text-white transition-colors whitespace-nowrap"
                        >
                          {testingProvider === pid ? 'Checking...' : 'Test Connection'}
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
                      <div>
                        <label className="block text-[11px] text-slate-400 mb-1">
                          Default Model for {provider.name}
                        </label>
                        <select
                          value={defaultModel}
                          onChange={(e) => {
                            const nextModel = e.target.value;
                            patchDraft((prev) => ({
                              ...prev,
                              providerDefaultModels: {
                                ...prev.providerDefaultModels,
                                [pid]: nextModel,
                              },
                            }));
                          }}
                          className="w-full h-10 px-3 rounded-xl bg-[#040918] border border-blue-900/60 text-xs text-white focus:outline-none focus:border-blue-500"
                        >
                          {mergedModels.map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.label}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-[11px] text-slate-400 mb-1">
                          Add Custom Model ID ({provider.name})
                        </label>
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            value={customDraft}
                            onChange={(e) =>
                              setCustomModelInputs((prev) => ({ ...prev, [pid]: e.target.value }))
                            }
                            placeholder="e.g. gpt-4.1-mini or llama-3.3-70b"
                            className="flex-1 h-10 px-3 rounded-xl bg-[#040918] border border-blue-900/60 text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-blue-500"
                          />
                          <button
                            type="button"
                            onClick={() => {
                              const trimmed = customDraft.trim();
                              if (!trimmed) return;
                              patchDraft((prev) => {
                                const existing = prev.providerCustomModels?.[pid] || [];
                                const nextList = existing.includes(trimmed)
                                  ? existing
                                  : [...existing, trimmed];
                                return {
                                  ...prev,
                                  providerCustomModels: {
                                    ...(prev.providerCustomModels || {}),
                                    [pid]: nextList,
                                  },
                                  providerDefaultModels: {
                                    ...prev.providerDefaultModels,
                                    [pid]: trimmed,
                                  },
                                };
                              });
                              setCustomModelInputs((prev) => ({ ...prev, [pid]: '' }));
                            }}
                            className="h-10 px-3 rounded-xl bg-[#040918] hover:bg-blue-950/70 border border-blue-800/60 text-xs font-medium text-amber-300 inline-flex items-center gap-1 whitespace-nowrap"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            Add Model
                          </button>
                        </div>
                      </div>

                      <div className="flex items-center justify-end">
                        <button
                          type="button"
                          onClick={() =>
                            patchDraft((prev) => ({
                              ...prev,
                              primaryProvider: pid,
                              fastResponseModel: defaultModel || prev.fastResponseModel,
                              jarvisModel: { ...prev.jarvisModel, provider: pid, model: defaultModel },
                              normalModel: { ...prev.normalModel, provider: pid, model: defaultModel },
                              jadavisModel: { ...prev.jadavisModel, provider: pid, model: defaultModel },
                              girlModel: { ...prev.girlModel, provider: pid, model: defaultModel },
                            }))
                          }
                          className={`h-10 px-4 rounded-xl text-xs font-medium border transition-colors whitespace-nowrap ${
                            draft.primaryProvider === pid
                              ? 'bg-amber-500/20 border-amber-400/50 text-amber-300'
                              : 'bg-[#040918] hover:bg-blue-950/70 border-blue-800/60 text-slate-200'
                          }`}
                        >
                          {draft.primaryProvider === pid ? 'Active Primary AI' : 'Use as Primary AI'}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="p-5 bg-[#040918]/60 border-t border-blue-900/40 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-slate-400 mb-1.5">Custom Endpoint Base URL</label>
                <input
                  type="url"
                  value={draft.customProviderBaseUrl}
                  onChange={(e) =>
                    patchDraft((prev) => ({ ...prev, customProviderBaseUrl: e.target.value }))
                  }
                  placeholder="https://api.example.com/v1"
                  className="w-full h-10 px-3 rounded-xl bg-[#09132d] border border-blue-900/60 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1.5">Custom Model Identifier</label>
                <input
                  type="text"
                  value={draft.customProviderModel}
                  onChange={(e) =>
                    patchDraft((prev) => ({ ...prev, customProviderModel: e.target.value }))
                  }
                  placeholder="e.g. llama-3-70b-instruct"
                  className="w-full h-10 px-3 rounded-xl bg-[#09132d] border border-blue-900/60 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SECTION B: 14-PERMISSION MANAGEMENT */}
      {tab === 'permissions' && (
        <div className="rounded-2xl bg-[#09132d]/75 border border-blue-900/50 overflow-hidden">
          <div className="p-5 border-b border-blue-900/40 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-white">Device & Android Permissions ({permissions.length})</h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Live browser checks plus Android native permissions with honest capability & Android Settings disclosures.
              </p>
            </div>
            <button
              type="button"
              onClick={() => void onRefreshPermissions()}
              className="inline-flex items-center gap-1.5 min-h-[40px] px-4 py-2 rounded-xl bg-[#040918] hover:bg-blue-950/70 border border-blue-800/60 text-xs font-medium text-slate-200 transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Re-check Status
            </button>
          </div>

          <div className="divide-y divide-blue-900/40">
            {permissions.map((perm) => (
              <div key={perm.id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2 text-sm font-semibold text-white">
                    <span>{perm.name}</span>
                    <span aria-hidden="true" className="text-slate-600">·</span>
                    <span
                      className={`text-xs font-medium ${
                        perm.status === 'ALLOWED'
                          ? 'text-amber-300'
                          : perm.status === 'RESTRICTED'
                            ? 'text-red-400'
                            : 'text-slate-400'
                      }`}
                    >
                      {perm.status.replace(/_/g, ' ')}
                    </span>
                  </div>
                  <p className="text-xs text-slate-300 mt-1">{perm.purpose}</p>
                  <p className="text-xs text-amber-200/75 mt-0.5">If missing: {perm.missingImpact}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{perm.instructions}</p>
                </div>

                <div className="shrink-0">
                  {perm.canRequestInBrowser ? (
                    <button
                      type="button"
                      disabled={perm.status === 'ALLOWED'}
                      onClick={async () => {
                        await requestBrowserPermission(perm.id);
                        await onRefreshPermissions();
                      }}
                      className={`min-h-[40px] px-4 py-2 rounded-xl text-xs font-medium transition-colors whitespace-nowrap ${
                        perm.status === 'ALLOWED'
                          ? 'bg-blue-950/50 text-amber-300 border border-amber-400/25 cursor-default'
                          : 'bg-blue-600 hover:bg-blue-500 text-white'
                      }`}
                    >
                      {perm.status === 'ALLOWED' ? (
                        <span className="inline-flex items-center gap-1.5">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Allowed
                        </span>
                      ) : (
                        'Allow Access'
                      )}
                    </button>
                  ) : (
                    <span className="text-xs text-slate-500 whitespace-nowrap">
                      {perm.scope === 'android_native' ? 'Android Native Setting' : 'On-Demand Picker'}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* SECTION C: VOICE MANAGER, VOICE LOCK, WAKE-WORDS & 10-EMOTION ENGINE */}
      {tab === 'voice' && (
        <div className="space-y-6">
          <div className="rounded-2xl bg-[#09132d]/75 border border-blue-900/50 p-5 space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-semibold text-white">Dedicated Voice Manager & Voice Lock</h2>
                  <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-300">
                    <Lock className="w-3 h-3" />
                    Locked per character
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-0.5">
                  Neural voice settings remain locked across restarts, model changes, and character switches. Never falls back silently to robotic speech.
                </p>
              </div>
              <div className="inline-flex p-1 rounded-xl bg-[#040918] border border-blue-900/60">
                {PERSONALITY_OPTIONS.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setVoiceProfileTarget(opt.id)}
                    className={`min-h-[36px] px-3.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
                      voiceProfileTarget === opt.id
                        ? 'bg-blue-600 text-white'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs text-slate-400 mb-1.5">Voice Provider (Locked)</label>
                <select
                  value={activeVoiceConfig.ttsEngine}
                  onChange={(e) => {
                    const eng = e.target.value as TtsEngineId;
                    const defaultModel =
                      eng === 'openai'
                        ? 'tts-1'
                        : eng === 'browser'
                          ? 'device-local'
                          : 'gemini-3.8-flash-lite-tts';
                    updateVoiceConfig({ ttsEngine: eng, voiceModel: defaultModel });
                  }}
                  className="w-full h-11 px-3 rounded-xl bg-[#040918] border border-blue-900/60 text-sm text-white focus:outline-none focus:border-blue-500"
                >
                  <option value="gemini">Gemini 3.8 Neural Human Voice</option>
                  <option value="openai">OpenAI Neural Voice</option>
                  <option value="browser">Device Local SpeechSynthesis</option>
                </select>
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1.5">Voice Persona / Voice ID</label>
                <select
                  value={activeVoiceConfig.voiceName}
                  onChange={(e) => {
                    const v = e.target.value as VoicePersonaName;
                    const gender =
                      v === 'Kore' || v === 'Zephyr' || v === 'nova' || v === 'shimmer'
                        ? 'female'
                        : 'male';
                    updateVoiceConfig({ voiceName: v, gender });
                  }}
                  className="w-full h-11 px-3 rounded-xl bg-[#040918] border border-blue-900/60 text-sm text-white focus:outline-none focus:border-blue-500"
                >
                  <option value="Charon">Charon (Deep Male · Gemini)</option>
                  <option value="Fenrir">Fenrir (Crisp Male · Gemini)</option>
                  <option value="Puck">Puck (Expressive Male · Gemini)</option>
                  <option value="Kore">Kore (Natural Female · Gemini)</option>
                  <option value="Zephyr">Zephyr (Bright Female · Gemini)</option>
                  <option value="onyx">Onyx (Deep Male · OpenAI)</option>
                  <option value="echo">Echo (Warm Male · OpenAI)</option>
                  <option value="alloy">Alloy (Balanced · OpenAI)</option>
                  <option value="nova">Nova (Warm Female · OpenAI)</option>
                  <option value="shimmer">Shimmer (Soft Female · OpenAI)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1.5">Voice Model</label>
                <select
                  value={activeVoiceConfig.voiceModel || 'gemini-3.8-flash-lite-tts'}
                  onChange={(e) => updateVoiceConfig({ voiceModel: e.target.value })}
                  className="w-full h-11 px-3 rounded-xl bg-[#040918] border border-blue-900/60 text-sm text-white focus:outline-none focus:border-blue-500"
                >
                  <option value="gemini-3.8-flash-lite-tts">gemini-3.8-flash-lite-tts (Ultra-Fast)</option>
                  <option value="gemini-3.8-flash-tts">gemini-3.8-flash-tts (Expressive Emotions)</option>
                  <option value="tts-1">OpenAI tts-1 (Low Latency)</option>
                  <option value="tts-1-hd">OpenAI tts-1-hd (Studio Quality)</option>
                  <option value="device-local">Device Local</option>
                </select>
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1.5">Recognition Language</label>
                <select
                  value={activeVoiceConfig.language}
                  onChange={(e) => {
                    const lang = e.target.value as VoiceSettings['language'];
                    updateVoiceConfig({ language: lang });
                    patchDraft((prev) => ({ ...prev, preferredLanguage: lang }));
                  }}
                  className="w-full h-11 px-3 rounded-xl bg-[#040918] border border-blue-900/60 text-sm text-white focus:outline-none focus:border-blue-500"
                >
                  <option value="auto">Auto (English · Hindi · Hinglish)</option>
                  <option value="en-IN">English (India)</option>
                  <option value="hi-IN">Hindi (हिन्दी)</option>
                  <option value="en-US">English (US)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1.5">Character Mood (10 Emotions)</label>
                <select
                  value={draft.characterMoods[voiceProfileTarget] || 'Normal'}
                  onChange={(e) =>
                    patchDraft((prev) => ({
                      ...prev,
                      characterMoods: {
                        ...prev.characterMoods,
                        [voiceProfileTarget]: e.target.value as EmotionType,
                      },
                    }))
                  }
                  className="w-full h-11 px-3 rounded-xl bg-[#040918] border border-blue-900/60 text-sm text-white focus:outline-none focus:border-blue-500"
                >
                  {EMOTIONS.map((em) => (
                    <option key={em} value={em}>
                      {em}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1.5">Voice Style Directive</label>
                <input
                  type="text"
                  value={activeVoiceConfig.emotionalStyle}
                  onChange={(e) => updateVoiceConfig({ emotionalStyle: e.target.value })}
                  className="w-full h-11 px-3 rounded-xl bg-[#040918] border border-blue-900/60 text-sm text-white focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-5">
              <div>
                <div className="flex justify-between text-xs text-slate-300 mb-1.5">
                  <span>Voice Speed</span>
                  <span className="tabular-nums text-amber-300">{activeVoiceConfig.speed.toFixed(2)}x</span>
                </div>
                <input
                  type="range"
                  min={0.75}
                  max={1.35}
                  step={0.05}
                  value={activeVoiceConfig.speed}
                  onChange={(e) => updateVoiceConfig({ speed: Number(e.target.value) })}
                  className="w-full accent-blue-500"
                />
              </div>

              <div>
                <div className="flex justify-between text-xs text-slate-300 mb-1.5">
                  <span>Pitch (Local TTS)</span>
                  <span className="tabular-nums text-amber-300">{activeVoiceConfig.pitch.toFixed(2)}</span>
                </div>
                <input
                  type="range"
                  min={0.7}
                  max={1.3}
                  step={0.05}
                  value={activeVoiceConfig.pitch}
                  onChange={(e) => updateVoiceConfig({ pitch: Number(e.target.value) })}
                  className="w-full accent-blue-500"
                />
              </div>

              <div>
                <div className="flex justify-between text-xs text-slate-300 mb-1.5">
                  <span>Stability</span>
                  <span className="tabular-nums text-amber-300">
                    {Math.round((activeVoiceConfig.voiceStability ?? 0.85) * 100)}%
                  </span>
                </div>
                <input
                  type="range"
                  min={0.2}
                  max={1}
                  step={0.05}
                  value={activeVoiceConfig.voiceStability ?? 0.85}
                  onChange={(e) => updateVoiceConfig({ voiceStability: Number(e.target.value) })}
                  className="w-full accent-blue-500"
                />
              </div>

              <div>
                <div className="flex justify-between text-xs text-slate-300 mb-1.5">
                  <span>Volume</span>
                  <span className="tabular-nums text-amber-300">{Math.round(activeVoiceConfig.volume * 100)}%</span>
                </div>
                <input
                  type="range"
                  min={0.1}
                  max={1}
                  step={0.05}
                  value={activeVoiceConfig.volume}
                  onChange={(e) => updateVoiceConfig({ volume: Number(e.target.value) })}
                  className="w-full accent-blue-500"
                />
              </div>

              <div>
                <div className="flex justify-between text-xs text-slate-300 mb-1.5">
                  <span>Emotion Intensity</span>
                  <span className="tabular-nums text-amber-300">
                    {Math.round((activeVoiceConfig.emotionIntensity ?? 0.8) * 100)}%
                  </span>
                </div>
                <input
                  type="range"
                  min={0.2}
                  max={1}
                  step={0.05}
                  value={activeVoiceConfig.emotionIntensity ?? 0.8}
                  onChange={(e) => updateVoiceConfig({ emotionIntensity: Number(e.target.value) })}
                  className="w-full accent-blue-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-slate-400 mb-1.5">
                  Wake-Word Phrases (comma separated)
                </label>
                <input
                  type="text"
                  value={(draft.wakeWords || []).join(', ')}
                  onChange={(e) =>
                    patchDraft((prev) => ({
                      ...prev,
                      wakeWords: e.target.value
                        .split(',')
                        .map((s) => s.trim())
                        .filter(Boolean),
                    }))
                  }
                  placeholder="Hey JARVIS, Hello JARVIS, Wake up JARVIS, JARVIS"
                  className="w-full h-11 px-3 rounded-xl bg-[#040918] border border-blue-900/60 text-sm text-white focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <div className="flex justify-between text-xs text-slate-400 mb-2">
                  <span>Wake-Word Sensitivity</span>
                  <span className="tabular-nums text-amber-300">
                    {Math.round((draft.wakeWordSensitivity ?? 0.72) * 100)}%
                  </span>
                </div>
                <input
                  type="range"
                  min={0.3}
                  max={1}
                  step={0.05}
                  value={draft.wakeWordSensitivity ?? 0.72}
                  onChange={(e) =>
                    patchDraft((prev) => ({ ...prev, wakeWordSensitivity: Number(e.target.value) }))
                  }
                  className="w-full accent-blue-500 mt-2"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-blue-900/40">
              {(
                [
                  { key: 'allowInterruption', label: 'Allow Speech Interruption' },
                  { key: 'autoListenAfterReply', label: 'Automatic Listening After Reply' },
                  { key: 'continuousMode', label: 'Continuous Conversation Mode' },
                  { key: 'backgroundListening', label: 'Background Listening (Explicit Opt-In)' },
                  { key: 'wakeWordEnabled', label: 'Enable Wake-Word Trigger' },
                  {
                    key: 'manualFallbackToBrowserTts',
                    label: 'Allow Manual Browser TTS Fallback (Off = Strictly Locked Neural Voice)',
                  },
                ] as const
              ).map((toggle) => (
                <label
                  key={toggle.key}
                  className="flex items-center justify-between gap-3 p-3 rounded-xl bg-[#040918]/70 border border-blue-900/40 cursor-pointer"
                >
                  <span className="text-xs text-slate-200">{toggle.label}</span>
                  <input
                    type="checkbox"
                    checked={Boolean(activeVoiceConfig[toggle.key])}
                    onChange={(e) => updateVoiceConfig({ [toggle.key]: e.target.checked })}
                    className="w-4 h-4 accent-blue-500 shrink-0"
                  />
                </label>
              ))}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
              <div className="min-w-0">
                {voiceTestStatus && <span className="text-xs text-amber-300">{voiceTestStatus}</span>}
                {voiceTestError && <span className="text-xs text-red-400">{voiceTestError}</span>}
              </div>
              <button
                type="button"
                onClick={() => void handleTestVoice()}
                className="inline-flex items-center gap-2 min-h-[42px] px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-xs font-medium text-white transition-colors"
              >
                <Volume2 className="w-4 h-4" />
                Test Locked Voice
              </button>
            </div>
          </div>

          {/* Autonomous Self-Talk, Self-Learning Evolution & Playful Banter */}
          <div className="rounded-2xl bg-[#09132d]/75 border border-blue-900/50 p-5 space-y-5">
            <div>
              <h2 className="text-base font-semibold text-white">Autonomous Talk, Self-Learning & Playful Banter</h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Let your assistant start spontaneous chats on its own, continuously learn & adapt on your command, and joke/tease playfully (shararat).
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <label className="flex items-center justify-between gap-3 p-3 rounded-xl bg-[#040918]/70 border border-blue-900/40 cursor-pointer">
                <span className="text-xs text-slate-200">Auto-Initiate Talk (Khud Baat Kare)</span>
                <input
                  type="checkbox"
                  checked={draft.proactiveTalkEnabled !== false}
                  onChange={(e) =>
                    patchDraft((prev) => ({ ...prev, proactiveTalkEnabled: e.target.checked }))
                  }
                  className="w-4 h-4 accent-blue-500"
                />
              </label>
              <label className="flex items-center justify-between gap-3 p-3 rounded-xl bg-[#040918]/70 border border-blue-900/40 cursor-pointer">
                <span className="text-xs text-slate-200">Playful Banter & Mischief (Shararat)</span>
                <input
                  type="checkbox"
                  checked={draft.playfulBanterEnabled !== false}
                  onChange={(e) =>
                    patchDraft((prev) => ({ ...prev, playfulBanterEnabled: e.target.checked }))
                  }
                  className="w-4 h-4 accent-blue-500"
                />
              </label>
              <label className="flex items-center justify-between gap-3 p-3 rounded-xl bg-[#040918]/70 border border-blue-900/40 cursor-pointer">
                <span className="text-xs text-slate-200">Continuous Self-Learning & Evolution</span>
                <input
                  type="checkbox"
                  checked={draft.selfLearningEnabled !== false}
                  onChange={(e) =>
                    patchDraft((prev) => ({ ...prev, selfLearningEnabled: e.target.checked }))
                  }
                  className="w-4 h-4 accent-blue-500"
                />
              </label>
            </div>

            <div>
              <div className="flex justify-between text-xs text-slate-300 mb-1.5">
                <span>Auto-Talk Idle Interval</span>
                <span className="tabular-nums text-amber-300">{draft.proactiveIntervalSec ?? 35}s</span>
              </div>
              <input
                type="range"
                min={15}
                max={120}
                step={5}
                value={draft.proactiveIntervalSec ?? 35}
                onChange={(e) =>
                  patchDraft((prev) => ({ ...prev, proactiveIntervalSec: Number(e.target.value) }))
                }
                className="w-full accent-blue-500"
              />
            </div>

            <div className="space-y-3 pt-2 border-t border-blue-900/40">
              <div className="text-xs font-medium text-slate-300">
                Self-Learned Adaptations for {PERSONALITY_OPTIONS.find((p) => p.id === voiceProfileTarget)?.label}
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={newTraitInput}
                  onChange={(e) => setNewTraitInput(e.target.value)}
                  placeholder="Tell AI a behavior change (e.g. Tease me in Hinglish, call me Boss)"
                  className="flex-1 h-10 px-3 rounded-xl bg-[#040918] border border-blue-900/60 text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-blue-500"
                />
                <button
                  type="button"
                  onClick={async () => {
                    if (!newTraitInput.trim()) return;
                    const resp = await fetch(`/api/evolution/${voiceProfileTarget}`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ trait: newTraitInput.trim() }),
                    });
                    if (resp.ok) {
                      setNewTraitInput('');
                      await loadEvolutionTraits();
                    }
                  }}
                  className="h-10 px-4 rounded-xl bg-blue-600 hover:bg-blue-500 text-xs font-medium text-white whitespace-nowrap"
                >
                  Apply Change
                </button>
              </div>
              <div className="space-y-1.5 max-h-44 overflow-y-auto">
                {adaptiveTraits
                  .filter((t) => t.personality === voiceProfileTarget)
                  .map((t) => (
                    <div
                      key={t.id}
                      className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-[#040918]/70 border border-blue-900/40 text-xs text-slate-200"
                    >
                      <span className="truncate">
                        <span className="text-amber-300 mr-1.5">
                          [{t.source === 'user_command' ? 'Custom Change' : 'Learned'}]
                        </span>
                        {t.trait}
                      </span>
                      <button
                        type="button"
                        onClick={async () => {
                          await fetch(`/api/evolution/${t.id}`, { method: 'DELETE' });
                          await loadEvolutionTraits();
                        }}
                        className="text-slate-400 hover:text-red-400 shrink-0"
                        aria-label="Remove trait"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SECTION D: AUTOMATION, ROUTINES, LOGS & ANDROID PROJECT */}
      {tab === 'automation' && (
        <div className="space-y-6">
          <div className="rounded-2xl bg-[#09132d]/75 border border-blue-900/50 p-5 space-y-4">
            <h2 className="text-base font-semibold text-white">Phone Automation Engine</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {(
                [
                  { key: 'enabled', label: 'Enable Phone Automation Engine' },
                  { key: 'gestureControlEnabled', label: 'Gesture & Scroll Control' },
                  { key: 'confirmSensitiveActions', label: 'Confirm Sensitive Actions Before Execution' },
                  { key: 'preferAccessibilityNodes', label: 'Prefer Accessibility Nodes Over Coordinates' },
                ] as const
              ).map((item) => (
                <label
                  key={item.key}
                  className="flex items-center justify-between p-3 rounded-xl bg-[#040918]/70 border border-blue-900/40 cursor-pointer"
                >
                  <span className="text-xs text-slate-200">{item.label}</span>
                  <input
                    type="checkbox"
                    checked={Boolean(draft.automation[item.key])}
                    onChange={(e) =>
                      patchDraft((prev) => ({
                        ...prev,
                        automation: { ...prev.automation, [item.key]: e.target.checked },
                      }))
                    }
                    className="w-4 h-4 accent-blue-500"
                  />
                </label>
              ))}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
              <div>
                <label className="block text-xs text-slate-400 mb-1.5">Automation Timeout (ms)</label>
                <input
                  type="number"
                  min={2000}
                  max={60000}
                  step={1000}
                  value={draft.automation.timeoutMs}
                  onChange={(e) =>
                    patchDraft((prev) => ({
                      ...prev,
                      automation: { ...prev.automation, timeoutMs: Number(e.target.value) || 12000 },
                    }))
                  }
                  className="w-full h-10 px-3 rounded-xl bg-[#040918] border border-blue-900/60 text-sm text-white tabular-nums"
                />
              </div>
              {screenState && (
                <div className="p-3 rounded-xl bg-[#040918]/80 border border-blue-900/50">
                  <div className="text-xs text-slate-400">Active Device & Accessibility Context</div>
                  <div className="text-sm font-semibold text-amber-300 mt-0.5">
                    {screenState.currentApp} · Brightness {screenState.brightnessPercent}% · Vol {screenState.volumePercent}%
                  </div>
                  <div className="text-xs text-slate-500 truncate mt-0.5">
                    {screenState.packageName} · Battery {screenState.batteryPercent}% · {screenState.networkStatus}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Automation Routines Manager */}
          <div className="rounded-2xl bg-[#09132d]/75 border border-blue-900/50 p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-base font-semibold text-white">Automation Routines</h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Create multi-step voice routines (supports up to 20 sequential actions per routine).
                </p>
              </div>
              {routineFeedback && <span className="text-xs text-amber-300">{routineFeedback}</span>}
            </div>

            <form onSubmit={handleCreateRoutine} className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <input
                type="text"
                value={newRoutineName}
                onChange={(e) => setNewRoutineName(e.target.value)}
                placeholder="Routine Name (e.g. Night Mode)"
                className="h-10 px-3 rounded-xl bg-[#040918] border border-blue-900/60 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-blue-500"
              />
              <input
                type="text"
                value={newRoutineTrigger}
                onChange={(e) => setNewRoutineTrigger(e.target.value)}
                placeholder="Voice Trigger (e.g. start night mode)"
                className="h-10 px-3 rounded-xl bg-[#040918] border border-blue-900/60 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-blue-500"
              />
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={newRoutineCommands}
                  onChange={(e) => setNewRoutineCommands(e.target.value)}
                  placeholder="Commands (e.g. set brightness to 20% and open dnd)"
                  className="flex-1 h-10 px-3 rounded-xl bg-[#040918] border border-blue-900/60 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-blue-500"
                />
                <button
                  type="submit"
                  className="min-h-[40px] px-3.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium inline-flex items-center gap-1 whitespace-nowrap"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add
                </button>
              </div>
            </form>

            <div className="divide-y divide-blue-900/40 rounded-xl bg-[#040918]/70 border border-blue-900/40 overflow-hidden">
              {routines.map((rt) => (
                <div key={rt.id} className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2 text-sm font-semibold text-white">
                      <span>{rt.name}</span>
                      <span aria-hidden="true" className="text-slate-600">·</span>
                      <span className="text-xs font-normal text-amber-300">"{rt.triggerPhrase}"</span>
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5 truncate">{rt.commandsText}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => void handleRunRoutine(rt)}
                      className="inline-flex items-center gap-1.5 min-h-[36px] px-3 rounded-lg bg-blue-600 hover:bg-blue-500 text-xs text-white font-medium"
                    >
                      <Play className="w-3 h-3" />
                      Run
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        await fetch(`/api/routines/${rt.id}`, { method: 'DELETE' });
                        await loadAutomationData();
                      }}
                      className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg text-slate-400 hover:text-red-400 hover:bg-red-950/30"
                      aria-label={`Delete ${rt.name}`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Command Execution History & Error Logs */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="rounded-2xl bg-[#09132d]/75 border border-blue-900/50 p-5">
              <h3 className="text-sm font-semibold text-white mb-3">Command Execution History</h3>
              {cmdHistory.length === 0 ? (
                <p className="text-xs text-slate-500">No automation commands executed yet.</p>
              ) : (
                <div className="space-y-2.5 max-h-60 overflow-y-auto pr-1">
                  {cmdHistory.map((item) => (
                    <div key={item.id} className="p-3 rounded-xl bg-[#040918]/70 border border-blue-900/40">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-medium text-amber-300">{item.category}</span>
                        <span className="text-slate-400">{item.status}</span>
                      </div>
                      <div className="text-xs text-slate-200 mt-1">{item.summary}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-2xl bg-[#09132d]/75 border border-blue-900/50 p-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-white">Diagnostics & Error Logs</h3>
                <button
                  type="button"
                  onClick={async () => {
                    await fetch('/api/diagnostics', { method: 'DELETE' });
                    setLogs([]);
                  }}
                  className="text-xs text-slate-400 hover:text-white"
                >
                  Clear
                </button>
              </div>
              {logs.length === 0 ? (
                <p className="text-xs text-slate-500">No diagnostic events recorded.</p>
              ) : (
                <div className="space-y-2 max-h-60 overflow-y-auto pr-1 font-mono">
                  {logs.slice(0, 25).map((entry) => (
                    <div key={entry.id} className="p-2.5 rounded-xl bg-[#040918]/70 border border-blue-900/40 text-[11px]">
                      <div className="flex items-center gap-2">
                        {entry.level === 'ERROR' && <AlertTriangle className="w-3 h-3 text-red-400" />}
                        <span className={entry.level === 'ERROR' ? 'text-red-400' : 'text-blue-300'}>
                          {entry.module}
                        </span>
                        <span className="text-slate-500 tabular-nums">
                          {new Date(entry.timestamp).toLocaleTimeString()}
                        </span>
                      </div>
                      <div className="text-slate-300 mt-0.5 break-words">{entry.message}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Complete Android Kotlin / Jetpack Compose Project Explorer */}
          <div className="rounded-2xl bg-[#09132d]/75 border border-blue-900/50 p-5 space-y-4">
            <div className="flex items-center gap-2">
              <Code2 className="w-5 h-5 text-amber-400" />
              <div>
                <h3 className="text-base font-semibold text-white">
                  Android Kotlin & Jetpack Compose Project (`/android`)
                </h3>
                <p className="text-xs text-slate-400">
                  Native Android client source, Camera Vision Activity, Emotion Engine, Room Database, WakeWord ForegroundService, AccessibilityService (with Screen Lock), and Gradle setup.
                </p>
              </div>
            </div>

            {androidFiles.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="md:col-span-1 space-y-1 max-h-72 overflow-y-auto pr-1">
                  {androidFiles.map((f) => (
                    <button
                      key={f.path}
                      type="button"
                      onClick={() => setSelectedAndroidFile(f.path)}
                      className={`w-full text-left px-3 py-2 rounded-xl text-xs font-mono truncate transition-colors ${
                        selectedAndroidFile === f.path
                          ? 'bg-blue-600 text-white'
                          : 'bg-[#040918]/70 text-slate-300 hover:bg-blue-950/60'
                      }`}
                    >
                      {f.path}
                    </button>
                  ))}
                </div>
                <div className="md:col-span-2 rounded-xl bg-[#040918] border border-blue-900/60 p-3 max-h-72 overflow-auto">
                  <pre className="text-[11px] font-mono text-slate-200 whitespace-pre-wrap break-words">
                    {androidFiles.find((f) => f.path === selectedAndroidFile)?.content || ''}
                  </pre>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
