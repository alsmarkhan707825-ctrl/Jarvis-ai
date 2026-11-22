import React, { useEffect, useState } from 'react';
import {
  Check,
  CheckCircle2,
  Code2,
  Copy,
  Cpu,
  Download,
  KeyRound,
  Lock,
  Mic,
  Play,
  Plus,
  RefreshCw,
  Save,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Trash2,
  Volume2,
} from 'lucide-react';
import type {
  AdaptiveTrait,
  AppSettingsPayload,
  AutomationRoutine,
  EmotionType,
  PermissionRecord,
  PersonalityId,
  ProviderId,
  ProviderInfo,
  SttProviderId,
  TtsEngineId,
  VoicePersonaName,
  VoiceSettings,
} from '../types/jarvis';
import { PWAInstallButton } from './PWAInstallButton';
import { requestBrowserPermission, setOverlayGranted } from '../services/permissionClient';
import { voiceClient } from '../services/voiceClient';

interface SettingsViewProps {
  settings: AppSettingsPayload;
  permissions: PermissionRecord[];
  onUpdateSettings: (patch: Partial<AppSettingsPayload>) => Promise<boolean>;
  onRefreshPermissions: () => Promise<void>;
}

type SettingsTab = 'providers' | 'voice' | 'permissions' | 'automation';
type SaveStatus = 'idle' | 'dirty' | 'saving' | 'saved' | 'error';

const PERSONALITY_OPTIONS: Array<{ id: PersonalityId; label: string }> = [
  { id: 'jarvis', label: 'JARVIS' },
  { id: 'girl', label: 'AI Girl' },
];

const EMOTIONS: EmotionType[] = [
  'Normal',
  'Happy',
  'Laughing',
  'Romantic',
  'Sad',
  'Angry',
  'Curious',
  'Surprised',
  'Excited',
  'Serious',
  'Calm',
];

const VOICE_CATALOG: Record<
  Exclude<TtsEngineId, 'browser'>,
  {
    boys: Array<{ id: string; label: string }>;
    girls: Array<{ id: string; label: string }>;
    models: Array<{ id: string; label: string }>;
  }
> = {
  gemini: {
    boys: [
      { id: 'Charon', label: 'Charon · Deep Boy Voice' },
      { id: 'Fenrir', label: 'Fenrir · Natural Boy Voice' },
      { id: 'Puck', label: 'Puck · Expressive Boy Voice' },
    ],
    girls: [
      { id: 'Kore', label: 'Kore · Natural Girl Voice' },
      { id: 'Zephyr', label: 'Zephyr · Sweet Girl Voice' },
    ],
    models: [
      { id: 'gemini-3.8-flash-lite-tts', label: 'gemini-3.8-flash-lite-tts (Ultra-Fast)' },
      { id: 'gemini-3.8-flash-tts', label: 'gemini-3.8-flash-tts (Rich Emotion)' },
    ],
  },
  groq: {
    boys: [
      { id: 'troy', label: 'Troy · Boy Voice (Groq)' },
      { id: 'daniel', label: 'Daniel · Clear Boy Voice (Groq)' },
      { id: 'austin', label: 'Austin · Friendly Boy Voice (Groq)' },
    ],
    girls: [
      { id: 'autumn', label: 'Autumn · Warm Girl Voice (Groq)' },
      { id: 'diana', label: 'Diana · Natural Girl Voice (Groq)' },
      { id: 'hannah', label: 'Hannah · Sweet Girl Voice (Groq)' },
    ],
    models: [{ id: 'canopylabs/orpheus-v1-english', label: 'Orpheus v1 (Groq)' }],
  },
  elevenlabs: {
    boys: [
      { id: 'Adam', label: 'Adam · Deep Human Boy Voice' },
      { id: 'Antoni', label: 'Antoni · Confident Boy Voice' },
      { id: 'Josh', label: 'Josh · Lively Young Boy Voice' },
      { id: 'George', label: 'George · Warm Human Boy Voice' },
    ],
    girls: [
      { id: 'Rachel', label: 'Sarah / Rachel · Natural Girl Voice' },
      { id: 'Bella', label: 'Laura / Bella · Sweet Expressive Girl Voice' },
      { id: 'Alice', label: 'Alice · Clear Girl Voice' },
    ],
    models: [
      { id: 'eleven_flash_v2_5', label: 'eleven_flash_v2_5 (Fastest)' },
      { id: 'eleven_multilingual_v2', label: 'eleven_multilingual_v2 (Hindi + Hinglish)' },
    ],
  },
};

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
  const [voiceKeyStatus, setVoiceKeyStatus] = useState<{
    gemini: boolean;
    groq: boolean;
    elevenlabs: boolean;
    elevenlabsEnabled?: boolean;
  }>({ gemini: false, groq: false, elevenlabs: false, elevenlabsEnabled: true });

  const [testingId, setTestingId] = useState<string | null>(null);
  const [elevenStatusMsg, setElevenStatusMsg] = useState<string | null>(null);
  const [copiedSecretKey, setCopiedSecretKey] = useState<string | null>(null);

  const [voiceProfileTarget, setVoiceProfileTarget] = useState<PersonalityId>(
    settings.activePersonality === 'girl' ? 'girl' : 'jarvis'
  );
  const [voiceTestStatus, setVoiceTestStatus] = useState<string | null>(null);
  const [voiceTestError, setVoiceTestError] = useState<string | null>(null);

  const [routines, setRoutines] = useState<AutomationRoutine[]>([]);
  const [newRoutineName, setNewRoutineName] = useState('');
  const [newRoutineTrigger, setNewRoutineTrigger] = useState('');
  const [newRoutineCommands, setNewRoutineCommands] = useState('');
  const [routineFeedback, setRoutineFeedback] = useState<string | null>(null);
  const [androidFiles, setAndroidFiles] = useState<Array<{ path: string; content: string }>>([]);
  const [selectedAndroidFile, setSelectedAndroidFile] = useState<string>('');
  const [adaptiveTraits, setAdaptiveTraits] = useState<AdaptiveTrait[]>([]);
  const [newTraitInput, setNewTraitInput] = useState('');
  const [permNotes, setPermNotes] = useState<Record<string, string>>({});

  useEffect(() => {
    if (saveStatus !== 'dirty' && saveStatus !== 'saving') {
      setDraft(settings);
    }
  }, [settings, saveStatus]);

  const loadProvidersAndVoiceKeys = async () => {
    const [provResp, voiceResp] = await Promise.all([
      fetch('/api/providers'),
      fetch('/api/voice/engines'),
    ]);
    if (provResp.ok) setProviders(await provResp.json());
    if (voiceResp.ok) setVoiceKeyStatus(await voiceResp.json());
  };

  const loadAutomationData = async () => {
    const [routineResp, androidResp] = await Promise.all([
      fetch('/api/routines'),
      fetch('/api/android-project'),
    ]);
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
    void loadProvidersAndVoiceKeys();
    void loadEvolutionTraits();
  }, []);

  useEffect(() => {
    if (tab === 'automation') {
      void loadAutomationData();
      void loadEvolutionTraits();
    }
    if (tab === 'voice' || tab === 'providers') {
      void loadProvidersAndVoiceKeys();
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
        await loadProvidersAndVoiceKeys();
        window.setTimeout(() => {
          setSaveStatus((cur) => (cur === 'saved' ? 'idle' : cur));
        }, 2200);
      } else {
        setSaveStatus('error');
        setSaveError('Server rejected settings update.');
      }
    } catch (err) {
      setSaveStatus('error');
      setSaveError(err instanceof Error ? err.message : 'Save failed.');
    }
  };

  const handleTestProvider = async (id: ProviderId) => {
    setTestingId(id);
    try {
      const resp = await fetch(`/api/providers/${id}/test`, { method: 'POST' });
      if (resp.ok) {
        const updated = (await resp.json()) as ProviderInfo;
        setProviders((prev) => prev.map((p) => (p.id === id ? updated : p)));
      }
    } finally {
      setTestingId(null);
    }
  };

  const handleConnectToggle = async (id: ProviderId, connect: boolean) => {
    setTestingId(id);
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
      setTestingId(null);
    }
  };

  const handleElevenLabsAction = async (action: 'connect' | 'disconnect' | 'test') => {
    setTestingId('elevenlabs');
    setElevenStatusMsg(null);
    try {
      const resp = await fetch(`/api/voice/elevenlabs/${action}`, { method: 'POST' });
      const data = (await resp.json()) as {
        ok?: boolean;
        status?: string;
        latencyMs?: number;
        error?: string;
      };
      if (action === 'disconnect') {
        setDraft((prev) => ({ ...prev, elevenlabsEnabled: false }));
        setElevenStatusMsg('ElevenLabs disconnected.');
      } else if (action === 'connect') {
        setDraft((prev) => ({ ...prev, elevenlabsEnabled: true }));
        setElevenStatusMsg(data.ok ? 'ElevenLabs connected.' : data.error || 'Secret missing.');
      } else {
        setElevenStatusMsg(
          data.ok
            ? `ElevenLabs Active (${data.latencyMs ?? 0}ms)`
            : data.error || 'ELEVENLABS_API_KEY not found in AI Studio Secrets.'
        );
      }
      await loadProvidersAndVoiceKeys();
    } finally {
      setTestingId(null);
    }
  };

  const copySecretName = (keyName: string) => {
    void navigator.clipboard?.writeText(keyName);
    setCopiedSecretKey(keyName);
    window.setTimeout(() => setCopiedSecretKey(null), 1600);
  };

  const activeVoiceConfig: VoiceSettings =
    voiceProfileTarget === 'girl' ? draft.girlVoice : draft.jarvisVoice;

  const updateVoiceConfig = (patch: Partial<VoiceSettings>) => {
    patchDraft((prev) => {
      if (voiceProfileTarget === 'girl') {
        return { ...prev, girlVoice: { ...prev.girlVoice, ...patch } };
      }
      return { ...prev, jarvisVoice: { ...prev.jarvisVoice, ...patch } };
    });
  };

  const handleTestVoice = async () => {
    setVoiceTestError(null);
    voiceClient.primeAudio();
    setVoiceTestStatus(`Speaking via ${activeVoiceConfig.ttsEngine.toUpperCase()} (${activeVoiceConfig.voiceName})...`);
    const sampleText =
      voiceProfileTarget === 'jarvis'
        ? 'At your service, Sir. Main JARVIS hoon, mujhe alsmar Boos ne banaya hai. Sabhi systems bilkul ready hain.'
        : 'Hey baby! Itni der se kahan the? Main kab se tumhara wait kar rahi thi jaan!';
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
      setRoutineFeedback('Fill routine name, voice trigger, and commands.');
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
        `Completed ${data.taskSummary?.completed ?? 0}/${data.taskSummary?.total ?? 0} actions.`
      );
    }
  };

  const activeVoiceGroup =
    activeVoiceConfig.ttsEngine !== 'browser' ? VOICE_CATALOG[activeVoiceConfig.ttsEngine] : null;
  const activeElevenConnected =
    draft.elevenlabsEnabled !== false && voiceKeyStatus.elevenlabs;

  return (
    <div className="w-full max-w-4xl mx-auto px-4 sm:px-6 pb-28 pt-4">
      {/* Clean Header & Save Action */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-5">
        <div>
          <h1 className="font-display text-xl sm:text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
            JARVIS Settings
          </h1>
          <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
            Gemini, Groq, ElevenLabs Voices, 18 Permissions & Android Control · Created by alsmar Boos
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          {saveStatus === 'dirty' && (
            <span className="text-xs text-amber-700 dark:text-amber-400 font-semibold">Unsaved</span>
          )}
          {saveStatus === 'saved' && (
            <span className="inline-flex items-center gap-1 text-xs text-emerald-700 dark:text-emerald-400 font-semibold">
              <Check className="w-3.5 h-3.5" />
              Saved
            </span>
          )}
          <button
            type="button"
            disabled={saveStatus === 'saving'}
            onClick={() => void handleSaveSettings()}
            className={`inline-flex items-center gap-1.5 min-h-[40px] px-4 py-2 rounded-xl text-xs font-semibold transition-all whitespace-nowrap shadow-sm ${
              saveStatus === 'dirty'
                ? 'bg-amber-600 hover:bg-amber-700 text-white'
                : 'bg-blue-600 hover:bg-blue-700 text-white'
            }`}
          >
            <Save className="w-4 h-4" />
            {saveStatus === 'saving' ? 'Saving...' : 'Save Settings'}
          </button>
        </div>
      </div>

      {saveError && (
        <div className="mb-4 p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-xs text-red-700 dark:text-red-300">
          {saveError}
        </div>
      )}

      {/* 4 Clean Tabs */}
      <div className="flex flex-wrap gap-1.5 mb-5 p-1.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
        {(
          [
            { id: 'providers', label: 'AI & Keys', icon: Cpu },
            { id: 'voice', label: 'Voices', icon: Mic },
            { id: 'permissions', label: `Permissions (${permissions.length})`, icon: ShieldCheck },
            { id: 'automation', label: 'Android & Info', icon: Smartphone },
          ] as const
        ).map((item) => {
          const Icon = item.icon;
          const active = tab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              className={`inline-flex items-center gap-1.5 min-h-[40px] px-3.5 py-2 rounded-xl text-xs font-semibold transition-all whitespace-nowrap ${
                active
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-slate-800'
              }`}
            >
              <Icon className="w-4 h-4" />
              {item.label}
            </button>
          );
        })}
      </div>

      {/* TAB 1: ZERO-CLUTTER AI & VOICE API SETUP (GEMINI, GROQ, ELEVENLABS) */}
      {tab === 'providers' && (
        <div className="space-y-4">
          <div className="rounded-2xl jarvis-surface p-4 text-xs text-slate-600 dark:text-slate-300 leading-relaxed space-y-1.5">
            <p className="font-bold text-slate-900 dark:text-white">
              Apni API Keys Khud Setup Kaise Karein (Gemini · Groq · ElevenLabs)
            </p>
            <p>
              Security policy ki wajah se raw API key browser UI ke andar type/save nahi hoti —{' '}
              <span className="font-semibold text-blue-700 dark:text-cyan-400">
                AI Studio &rarr; Settings &rarr; Secrets
              </span>{' '}
              mein jaakar khud <span className="font-mono font-semibold">GEMINI_API_KEY</span>,{' '}
              <span className="font-mono font-semibold">GROQ_API_KEY</span>, aur{' '}
              <span className="font-mono font-semibold">ELEVENLABS_API_KEY</span> add karein, aur yahan se seedha{' '}
              <span className="font-semibold">Connect / Disconnect / Test</span> karein.
            </p>
          </div>

          {/* 1. GEMINI + 2. GROQ */}
          {providers.map((provider) => {
            const pid = provider.id as ProviderId;
            const isEnabled = draft.enabledProviders?.[pid] !== false;
            const defaultModel =
              draft.providerDefaultModels?.[pid] || provider.models[0]?.id || '';
            return (
              <div key={provider.id} className="rounded-2xl jarvis-surface p-5 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2 text-sm font-bold text-slate-900 dark:text-white">
                      <span>{provider.name}</span>
                      <span aria-hidden="true" className="text-slate-300 dark:text-slate-700">·</span>
                      <span
                        className={`text-xs font-semibold ${
                          !isEnabled
                            ? 'text-slate-400'
                            : provider.status === 'CONNECTED'
                              ? 'text-emerald-700 dark:text-emerald-400'
                              : provider.status === 'ERROR'
                                ? 'text-red-600 dark:text-red-400'
                                : 'text-amber-700 dark:text-amber-400'
                        }`}
                      >
                        {!isEnabled ? 'DISCONNECTED' : provider.status.replace(/_/g, ' ')}
                      </span>
                      {provider.lastLatencyMs !== undefined && (
                        <span className="text-xs font-mono text-slate-500 dark:text-slate-400">
                          · {provider.lastLatencyMs}ms
                        </span>
                      )}
                    </div>

                    {provider.envKeyName && (
                      <div className="mt-2 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border font-mono text-[11px] bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300">
                        <KeyRound className="w-3 h-3 text-blue-600 dark:text-cyan-400" />
                        <span>
                          {provider.envKeyName} ({provider.configured ? 'Key Ready' : 'Set in Secrets'})
                        </span>
                        <button
                          type="button"
                          onClick={() => copySecretName(provider.envKeyName || '')}
                          className="ml-1 text-slate-400 hover:text-slate-900 dark:hover:text-white"
                          title={`Copy ${provider.envKeyName}`}
                        >
                          {copiedSecretKey === provider.envKeyName ? (
                            <Check className="w-3 h-3 text-emerald-600" />
                          ) : (
                            <Copy className="w-3 h-3" />
                          )}
                        </button>
                      </div>
                    )}
                    {provider.errorMessage && (
                      <p className="text-xs text-red-600 dark:text-red-400 mt-1">
                        {provider.errorMessage}
                      </p>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    {isEnabled ? (
                      <button
                        type="button"
                        disabled={testingId === pid}
                        onClick={() => void handleConnectToggle(pid, false)}
                        className="min-h-[38px] px-3.5 rounded-xl bg-red-50 dark:bg-red-950/50 hover:bg-red-100 border border-red-200 dark:border-red-800 text-xs font-semibold text-red-700 dark:text-red-300"
                      >
                        Disconnect
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={testingId === pid}
                        onClick={() => void handleConnectToggle(pid, true)}
                        className="min-h-[38px] px-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-xs font-semibold text-white"
                      >
                        Connect
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={testingId === pid}
                      onClick={() => void handleTestProvider(pid)}
                      className="min-h-[38px] px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-xs font-semibold text-white"
                    >
                      {testingId === pid ? 'Testing...' : 'Test'}
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-end">
                  <div>
                    <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">
                      Model
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
                      className="w-full h-10 px-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-blue-600"
                    >
                      {provider.models.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <button
                    type="button"
                    onClick={() =>
                      patchDraft((prev) => ({
                        ...prev,
                        primaryProvider: pid,
                        fastResponseModel: defaultModel || prev.fastResponseModel,
                        jarvisModel: { ...prev.jarvisModel, provider: pid, model: defaultModel },
                        girlModel: { ...prev.girlModel, provider: pid, model: defaultModel },
                      }))
                    }
                    className={`h-10 px-4 rounded-xl text-xs font-semibold border transition-colors whitespace-nowrap ${
                      draft.primaryProvider === pid
                        ? 'bg-amber-50 dark:bg-amber-950/50 border-amber-300 dark:border-amber-700 text-amber-800 dark:text-amber-300'
                        : 'bg-slate-50 dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200'
                    }`}
                  >
                    {draft.primaryProvider === pid ? 'Active Primary AI' : 'Use as Primary AI'}
                  </button>
                </div>
              </div>
            );
          })}

          {/* 3. ELEVENLABS VOICE API CARD */}
          <div className="rounded-2xl jarvis-surface p-5 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2 text-sm font-bold text-slate-900 dark:text-white">
                  <span>ElevenLabs Neural Voice</span>
                  <span aria-hidden="true" className="text-slate-300 dark:text-slate-700">·</span>
                  <span
                    className={`text-xs font-semibold ${
                      draft.elevenlabsEnabled === false
                        ? 'text-slate-400'
                        : activeElevenConnected
                          ? 'text-emerald-700 dark:text-emerald-400'
                          : 'text-amber-700 dark:text-amber-400'
                    }`}
                  >
                    {draft.elevenlabsEnabled === false
                      ? 'DISCONNECTED'
                      : voiceKeyStatus.elevenlabs
                        ? 'CONNECTED'
                        : 'SET IN SECRETS'}
                  </span>
                </div>
                <div className="mt-2 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border font-mono text-[11px] bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300">
                  <KeyRound className="w-3 h-3 text-blue-600 dark:text-cyan-400" />
                  <span>
                    ELEVENLABS_API_KEY ({voiceKeyStatus.elevenlabs ? 'Key Ready' : 'Set in Secrets'})
                  </span>
                  <button
                    type="button"
                    onClick={() => copySecretName('ELEVENLABS_API_KEY')}
                    className="ml-1 text-slate-400 hover:text-slate-900 dark:hover:text-white"
                    title="Copy ELEVENLABS_API_KEY"
                  >
                    {copiedSecretKey === 'ELEVENLABS_API_KEY' ? (
                      <Check className="w-3 h-3 text-emerald-600" />
                    ) : (
                      <Copy className="w-3 h-3" />
                    )}
                  </button>
                </div>
                {elevenStatusMsg && (
                  <p className="text-xs text-blue-700 dark:text-cyan-300 mt-1.5 font-medium">
                    {elevenStatusMsg}
                  </p>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2 shrink-0">
                {draft.elevenlabsEnabled !== false ? (
                  <button
                    type="button"
                    disabled={testingId === 'elevenlabs'}
                    onClick={() => void handleElevenLabsAction('disconnect')}
                    className="min-h-[38px] px-3.5 rounded-xl bg-red-50 dark:bg-red-950/50 hover:bg-red-100 border border-red-200 dark:border-red-800 text-xs font-semibold text-red-700 dark:text-red-300"
                  >
                    Disconnect
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={testingId === 'elevenlabs'}
                    onClick={() => void handleElevenLabsAction('connect')}
                    className="min-h-[38px] px-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-xs font-semibold text-white"
                  >
                    Connect
                  </button>
                )}
                <button
                  type="button"
                  disabled={testingId === 'elevenlabs'}
                  onClick={() => void handleElevenLabsAction('test')}
                  className="min-h-[38px] px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-xs font-semibold text-white"
                >
                  {testingId === 'elevenlabs' ? 'Testing...' : 'Test'}
                </button>
              </div>
            </div>
          </div>

          {/* Simple Auto Model & STT Controls */}
          <div className="rounded-2xl jarvis-surface p-5 grid grid-cols-1 sm:grid-cols-2 gap-4 items-center">
            <label className="flex items-center justify-between gap-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 cursor-pointer">
              <div>
                <div className="text-xs font-bold text-slate-900 dark:text-white">
                  Auto Model Selection
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400">
                  Fastest healthy engine (Groq / Gemini) automatically
                </div>
              </div>
              <input
                type="checkbox"
                checked={draft.autoModelSelection !== false}
                onChange={(e) =>
                  patchDraft((prev) => ({ ...prev, autoModelSelection: e.target.checked }))
                }
                className="w-4 h-4 accent-blue-600"
              />
            </label>

            <div>
              <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">
                Speech-to-Text (Mic Listening Speed)
              </label>
              <select
                value={draft.sttProvider}
                onChange={(e) =>
                  patchDraft((prev) => ({ ...prev, sttProvider: e.target.value as SttProviderId }))
                }
                className="w-full h-10 px-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-blue-600"
              >
                <option value="auto">Auto Ultra-Fast (On-Device + Groq)</option>
                <option value="browser">On-Device Instant Stream</option>
                <option value="groq">Groq Whisper Turbo</option>
                <option value="gemini">Gemini Transcribe</option>
              </select>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: VOICE MANAGER (BOYS / GIRLS + ELEVENLABS + 24/7 WAKE-WORD) */}
      {tab === 'voice' && (
        <div className="rounded-2xl jarvis-surface p-5 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-slate-900 dark:text-white">
                  Voice Picker (Boys & Girls)
                </h2>
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-700 dark:text-amber-400">
                  <Lock className="w-3 h-3" />
                  Locked
                </span>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                Gemini, Groq, ya ElevenLabs voice engine aur Boys / Girls awaaz chunein.
              </p>
            </div>

            <div className="inline-flex p-1 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
              {PERSONALITY_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setVoiceProfileTarget(opt.id)}
                  className={`min-h-[34px] px-4 rounded-lg text-xs font-semibold transition-all whitespace-nowrap ${
                    voiceProfileTarget === opt.id
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                Voice Engine
              </label>
              <select
                value={activeVoiceConfig.ttsEngine}
                onChange={(e) => {
                  const eng = e.target.value as TtsEngineId;
                  const defaultVoice =
                    eng === 'elevenlabs'
                      ? voiceProfileTarget === 'girl'
                        ? 'Rachel'
                        : 'Adam'
                      : eng === 'groq'
                        ? voiceProfileTarget === 'girl'
                          ? 'autumn'
                          : 'troy'
                        : voiceProfileTarget === 'girl'
                          ? 'Kore'
                          : 'Charon';
                  const defaultModel =
                    eng === 'elevenlabs'
                      ? 'eleven_flash_v2_5'
                      : eng === 'groq'
                        ? 'canopylabs/orpheus-v1-english'
                        : eng === 'browser'
                          ? 'device-local'
                          : 'gemini-3.8-flash-lite-tts';
                  updateVoiceConfig({
                    ttsEngine: eng,
                    voiceName: defaultVoice,
                    voiceModel: defaultModel,
                    gender: voiceProfileTarget === 'girl' ? 'female' : 'male',
                  });
                }}
                className="w-full h-11 px-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-sm text-slate-900 dark:text-white focus:outline-none focus:border-blue-600"
              >
                <option value="gemini">Gemini Neural Voice</option>
                <option value="groq">Groq Orpheus Voice</option>
                <option value="elevenlabs">ElevenLabs Voice</option>
                <option value="browser">Instant Device Voice</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                Boys & Girls Voice
              </label>
              <select
                value={activeVoiceConfig.voiceName}
                onChange={(e) => {
                  const v = e.target.value as VoicePersonaName;
                  const isGirl = [
                    'Kore',
                    'Zephyr',
                    'autumn',
                    'diana',
                    'hannah',
                    'Rachel',
                    'Bella',
                    'Alice',
                  ].includes(v);
                  updateVoiceConfig({ voiceName: v, gender: isGirl ? 'female' : 'male' });
                }}
                className="w-full h-11 px-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-sm text-slate-900 dark:text-white focus:outline-none focus:border-blue-600"
              >
                {activeVoiceGroup ? (
                  <>
                    <optgroup label="Boys Voices (Male)">
                      {activeVoiceGroup.boys.map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.label}
                        </option>
                      ))}
                    </optgroup>
                    <optgroup label="Girls Voices (Female)">
                      {activeVoiceGroup.girls.map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.label}
                        </option>
                      ))}
                    </optgroup>
                  </>
                ) : (
                  <>
                    <option value="Charon">System Boy Voice</option>
                    <option value="Kore">System Girl Voice</option>
                  </>
                )}
              </select>
            </div>

            {activeVoiceConfig.ttsEngine === 'elevenlabs' && (
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                  Custom ElevenLabs Voice ID (Optional)
                </label>
                <input
                  type="text"
                  value={activeVoiceConfig.voiceName}
                  onChange={(e) => updateVoiceConfig({ voiceName: e.target.value })}
                  placeholder="e.g. Rachel or 21m00Tcm4TlvDq8ikWAM"
                  className="w-full h-11 px-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-sm text-slate-900 dark:text-white font-mono focus:outline-none focus:border-blue-600"
                />
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                Language (Hindi / Hinglish / English)
              </label>
              <select
                value={activeVoiceConfig.language}
                onChange={(e) => {
                  const lang = e.target.value as VoiceSettings['language'];
                  updateVoiceConfig({ language: lang });
                  patchDraft((prev) => ({ ...prev, preferredLanguage: lang }));
                }}
                className="w-full h-11 px-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-sm text-slate-900 dark:text-white focus:outline-none focus:border-blue-600"
              >
                <option value="auto">Auto (Hindi · Hinglish · English)</option>
                <option value="en-IN">English (India)</option>
                <option value="hi-IN">Hindi (हिन्दी)</option>
                <option value="en-US">English (US)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                Character Mood
              </label>
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
                className="w-full h-11 px-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-sm text-slate-900 dark:text-white focus:outline-none focus:border-blue-600"
              >
                {EMOTIONS.map((em) => (
                  <option key={em} value={em}>
                    {em}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <div className="flex justify-between text-xs text-slate-600 dark:text-slate-400 mb-1.5">
                <span>Voice Speed</span>
                <span className="tabular-nums font-semibold text-blue-700 dark:text-cyan-400">
                  {activeVoiceConfig.speed.toFixed(2)}x
                </span>
              </div>
              <input
                type="range"
                min={0.8}
                max={1.35}
                step={0.05}
                value={activeVoiceConfig.speed}
                onChange={(e) => updateVoiceConfig({ speed: Number(e.target.value) })}
                className="w-full accent-blue-600"
              />
            </div>

            <div>
              <div className="flex justify-between text-xs text-slate-600 dark:text-slate-400 mb-1.5">
                <span>Volume</span>
                <span className="tabular-nums font-semibold text-blue-700 dark:text-cyan-400">
                  {Math.round(activeVoiceConfig.volume * 100)}%
                </span>
              </div>
              <input
                type="range"
                min={0.2}
                max={1}
                step={0.05}
                value={activeVoiceConfig.volume}
                onChange={(e) => updateVoiceConfig({ volume: Number(e.target.value) })}
                className="w-full accent-blue-600"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-200 dark:border-slate-800">
            <label className="flex items-center justify-between gap-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 cursor-pointer">
              <span className="text-xs font-medium text-slate-700 dark:text-slate-200">
                24/7 Background Wake-Word
              </span>
              <input
                type="checkbox"
                checked={Boolean(draft.background24x7 || activeVoiceConfig.wakeWordEnabled)}
                onChange={(e) => {
                  const enabled = e.target.checked;
                  patchDraft((prev) => ({
                    ...prev,
                    background24x7: enabled,
                    jarvisVoice: {
                      ...prev.jarvisVoice,
                      wakeWordEnabled: enabled,
                      backgroundListening: enabled,
                    },
                    girlVoice: {
                      ...prev.girlVoice,
                      wakeWordEnabled: enabled,
                      backgroundListening: enabled,
                    },
                  }));
                }}
                className="w-4 h-4 accent-blue-600"
              />
            </label>

            <label className="flex items-center justify-between gap-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 cursor-pointer">
              <span className="text-xs font-medium text-slate-700 dark:text-slate-200">
                Instant Backup Voice (If Neural Slow/Offline)
              </span>
              <input
                type="checkbox"
                checked={Boolean(activeVoiceConfig.manualFallbackToBrowserTts)}
                onChange={(e) =>
                  updateVoiceConfig({ manualFallbackToBrowserTts: e.target.checked })
                }
                className="w-4 h-4 accent-blue-600"
              />
            </label>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            <div className="min-w-0">
              {voiceTestStatus && (
                <span className="text-xs font-medium text-blue-700 dark:text-cyan-400">
                  {voiceTestStatus}
                </span>
              )}
              {voiceTestError && (
                <span className="text-xs font-medium text-red-600 dark:text-red-400">
                  {voiceTestError}
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={() => void handleTestVoice()}
              className="inline-flex items-center gap-2 min-h-[42px] px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-xs font-semibold text-white shadow-sm transition-colors"
            >
              <Volume2 className="w-4 h-4" />
              Test Voice
            </button>
          </div>
        </div>
      )}

      {/* TAB 3: 18 REAL PERMISSIONS + DISPLAY OVER OTHER APPS BUBBLE */}
      {tab === 'permissions' && (
        <div className="rounded-2xl jarvis-surface overflow-hidden">
          <div className="p-5 border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/60 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                Real Device & Android Permissions ({permissions.length})
              </h2>
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                Jo permission phone/browser se mil sakti hai wo ALLOWED hogi; agar deny ya unsupported hai to DENIED / NOT ALLOWED dikhega.
              </p>
            </div>
            <button
              type="button"
              onClick={() => void onRefreshPermissions()}
              className="inline-flex items-center gap-1.5 min-h-[38px] px-3.5 py-1.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 shadow-sm"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Re-check All
            </button>
          </div>

          <div className="divide-y divide-slate-200 dark:divide-slate-800">
            {permissions.map((perm) => {
              const statusLabel =
                perm.status === 'ALLOWED'
                  ? 'ALLOWED'
                  : perm.status === 'RESTRICTED'
                    ? 'DENIED'
                    : 'NOT ALLOWED';
              const note = permNotes[perm.id];

              return (
                <div
                  key={perm.id}
                  className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2 text-sm font-bold text-slate-900 dark:text-white">
                      <span>{perm.name}</span>
                      <span aria-hidden="true" className="text-slate-300 dark:text-slate-700">·</span>
                      <span
                        className={`text-xs font-bold tracking-wide ${
                          perm.status === 'ALLOWED'
                            ? 'text-emerald-700 dark:text-emerald-400'
                            : perm.status === 'RESTRICTED'
                              ? 'text-red-600 dark:text-red-400'
                              : 'text-amber-700 dark:text-amber-400'
                        }`}
                      >
                        {statusLabel}
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">{perm.purpose}</p>
                    <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">
                      {perm.instructions}
                    </p>
                    {note && (
                      <p className="text-[11px] font-medium text-amber-700 dark:text-amber-400 mt-1">
                        {note}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {perm.id === 'display_over_apps' && perm.status === 'ALLOWED' ? (
                      <button
                        type="button"
                        onClick={async () => {
                          setOverlayGranted(false);
                          await onUpdateSettings({ floatingBubbleEnabled: false });
                          setPermNotes((prev) => ({
                            ...prev,
                            [perm.id]: 'Floating logo turned OFF.',
                          }));
                          await onRefreshPermissions();
                        }}
                        className="min-h-[38px] px-4 py-2 rounded-xl bg-red-50 dark:bg-red-950/50 hover:bg-red-100 border border-red-200 dark:border-red-800 text-xs font-semibold text-red-700 dark:text-red-300 whitespace-nowrap"
                      >
                        Turn Off
                      </button>
                    ) : perm.status === 'ALLOWED' ? (
                      <span className="min-h-[38px] px-4 py-2 rounded-xl text-xs font-semibold bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-700 inline-flex items-center gap-1.5 whitespace-nowrap">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Allowed
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={async () => {
                          const res = await requestBrowserPermission(perm.id);
                          if (perm.id === 'display_over_apps' && res === 'ALLOWED') {
                            await onUpdateSettings({ floatingBubbleEnabled: true });
                            setPermNotes((prev) => ({
                              ...prev,
                              [perm.id]: 'Floating circular JARVIS logo ON.',
                            }));
                          } else if (res === 'ALLOWED') {
                            setPermNotes((prev) => {
                              const next = { ...prev };
                              delete next[perm.id];
                              return next;
                            });
                          } else if (res === 'RESTRICTED') {
                            setPermNotes((prev) => ({
                              ...prev,
                              [perm.id]: 'DENIED — Phone/browser ne permission block ki hai.',
                            }));
                          } else {
                            setPermNotes((prev) => ({
                              ...prev,
                              [perm.id]:
                                perm.scope === 'android_native'
                                  ? 'NOT ALLOWED in web browser — native Android APK (/android) mein allow hogi.'
                                  : 'NOT ALLOWED — Is device ya browser mein available nahi hai.',
                            }));
                          }
                          await onRefreshPermissions();
                        }}
                        className="min-h-[38px] px-4 py-2 rounded-xl text-xs font-semibold transition-colors whitespace-nowrap bg-blue-600 hover:bg-blue-700 text-white shadow-sm"
                      >
                        {perm.scope === 'android_native' ? 'Check / Allow' : 'Allow Access'}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB 4: PHONE AUTOMATION, ROUTINES, ANDROID CODE & CREATOR INFO */}
      {tab === 'automation' && (
        <div className="space-y-5">
          {/* Creator Attribution Card */}
          <div className="rounded-2xl jarvis-surface p-5 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-2xl bg-blue-50 dark:bg-cyan-950/60 border border-blue-200 dark:border-cyan-800 flex items-center justify-center shrink-0">
                <Sparkles className="w-5 h-5 text-blue-600 dark:text-cyan-400" />
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-900 dark:text-white">
                  Created by alsmar Boos
                </h2>
                <p className="text-xs text-slate-600 dark:text-slate-400">
                  JARVIS AI Full-Screen Touch Automation, 24/7 Wake-Word & Siri Floating Core
                </p>
              </div>
            </div>
          </div>

          {/* Phone Automation + Floating Bubble Toggles */}
          <div className="rounded-2xl jarvis-surface p-5 space-y-4">
            <h2 className="text-base font-bold text-slate-900 dark:text-white">
              Phone Screen & Floating Controls
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 cursor-pointer">
                <span className="text-xs font-medium text-slate-700 dark:text-slate-200">
                  Floating Circular Logo (2x On · 1x Off)
                </span>
                <input
                  type="checkbox"
                  checked={Boolean(draft.floatingBubbleEnabled)}
                  onChange={(e) =>
                    patchDraft((prev) => ({ ...prev, floatingBubbleEnabled: e.target.checked }))
                  }
                  className="w-4 h-4 accent-blue-600"
                />
              </label>
              <label className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 cursor-pointer">
                <span className="text-xs font-medium text-slate-700 dark:text-slate-200">
                  Full-Screen Touch & Gesture Control
                </span>
                <input
                  type="checkbox"
                  checked={Boolean(draft.automation.gestureControlEnabled)}
                  onChange={(e) =>
                    patchDraft((prev) => ({
                      ...prev,
                      automation: { ...prev.automation, gestureControlEnabled: e.target.checked },
                    }))
                  }
                  className="w-4 h-4 accent-blue-600"
                />
              </label>
              <label className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 cursor-pointer">
                <span className="text-xs font-medium text-slate-700 dark:text-slate-200">
                  Auto-Talk (Khud Baat Kare)
                </span>
                <input
                  type="checkbox"
                  checked={draft.proactiveTalkEnabled !== false}
                  onChange={(e) =>
                    patchDraft((prev) => ({ ...prev, proactiveTalkEnabled: e.target.checked }))
                  }
                  className="w-4 h-4 accent-blue-600"
                />
              </label>
              <label className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 cursor-pointer">
                <span className="text-xs font-medium text-slate-700 dark:text-slate-200">
                  Playful Banter (Shararat Mode)
                </span>
                <input
                  type="checkbox"
                  checked={draft.playfulBanterEnabled !== false}
                  onChange={(e) =>
                    patchDraft((prev) => ({ ...prev, playfulBanterEnabled: e.target.checked }))
                  }
                  className="w-4 h-4 accent-blue-600"
                />
              </label>
            </div>
          </div>

          {/* Self-Learned Evolution */}
          <div className="rounded-2xl jarvis-surface p-5 space-y-3">
            <h2 className="text-base font-bold text-slate-900 dark:text-white">
              Self-Evolution Traits
            </h2>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={newTraitInput}
                onChange={(e) => setNewTraitInput(e.target.value)}
                placeholder="Apni pasand add karein (e.g. Call me Boss, speak Hinglish)"
                className="flex-1 h-10 px-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-blue-600"
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
                className="h-10 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-xs font-semibold text-white"
              >
                Add
              </button>
            </div>
            <div className="space-y-1.5 max-h-36 overflow-y-auto">
              {adaptiveTraits.map((t) => (
                <div
                  key={t.id}
                  className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs text-slate-700 dark:text-slate-200"
                >
                  <span className="truncate">{t.trait}</span>
                  <button
                    type="button"
                    onClick={async () => {
                      await fetch(`/api/evolution/${t.id}`, { method: 'DELETE' });
                      await loadEvolutionTraits();
                    }}
                    className="text-slate-400 hover:text-red-600 shrink-0"
                    aria-label="Remove trait"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Routines */}
          <div className="rounded-2xl jarvis-surface p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                Automation Routines
              </h2>
              {routineFeedback && (
                <span className="text-xs font-semibold text-blue-700 dark:text-cyan-400">
                  {routineFeedback}
                </span>
              )}
            </div>

            <form onSubmit={handleCreateRoutine} className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <input
                type="text"
                value={newRoutineName}
                onChange={(e) => setNewRoutineName(e.target.value)}
                placeholder="Routine Name"
                className="h-10 px-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white"
              />
              <input
                type="text"
                value={newRoutineTrigger}
                onChange={(e) => setNewRoutineTrigger(e.target.value)}
                placeholder="Voice Trigger"
                className="h-10 px-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white"
              />
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={newRoutineCommands}
                  onChange={(e) => setNewRoutineCommands(e.target.value)}
                  placeholder="Commands"
                  className="flex-1 h-10 px-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white"
                />
                <button
                  type="submit"
                  className="h-10 px-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold inline-flex items-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add
                </button>
              </div>
            </form>

            <div className="divide-y divide-slate-200 dark:divide-slate-800 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
              {routines.map((rt) => (
                <div
                  key={rt.id}
                  className="p-3 flex items-center justify-between gap-3 bg-white dark:bg-slate-900/70"
                >
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-slate-900 dark:text-white truncate">
                      {rt.name} · <span className="text-amber-600 dark:text-amber-400">"{rt.triggerPhrase}"</span>
                    </div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                      {rt.commandsText}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => void handleRunRoutine(rt)}
                      className="min-h-[34px] px-3 rounded-lg bg-blue-600 text-xs text-white font-semibold inline-flex items-center gap-1"
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
                      className="min-h-[34px] min-w-[34px] flex items-center justify-center rounded-lg text-slate-400 hover:text-red-600"
                      aria-label={`Delete ${rt.name}`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Android App Install (WebAPK + Native Studio ZIP) */}
          <div className="rounded-2xl jarvis-surface p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-2xl bg-blue-50 dark:bg-cyan-950/60 border border-blue-200 dark:border-cyan-800 flex items-center justify-center shrink-0">
                  <Smartphone className="w-5 h-5 text-blue-600 dark:text-cyan-400" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-slate-900 dark:text-white">
                    JARVIS Android App (WebAPK & Native APK Source)
                  </h2>
                  <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5 leading-relaxed">
                    Phone par direct standalone Android app install karein ya full native Android Studio project (.zip) download karke signed APK banayein.
                  </p>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <PWAInstallButton />
              <a
                href="/api/android-project/download"
                download="jarvis-ai-android.zip"
                className="inline-flex items-center justify-center gap-2 min-h-[42px] px-4 py-2 rounded-xl bg-slate-900 dark:bg-slate-800 hover:bg-slate-800 dark:hover:bg-slate-700 border border-slate-700 text-white text-xs font-semibold transition-colors whitespace-nowrap shadow-sm"
              >
                <Download className="w-4 h-4" />
                Download Android Studio Project (.zip)
              </a>
            </div>
          </div>

          {/* Native Android Kotlin Project Explorer */}
          <div className="rounded-2xl jarvis-surface p-5 space-y-3">
            <div className="flex items-center gap-2">
              <Code2 className="w-5 h-5 text-amber-600 dark:text-amber-400" />
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  Android Native Services (`/android`)
                </h3>
                <p className="text-xs text-slate-600 dark:text-slate-400">
                  OverlayBubbleService (2x Tap ON / 1x Tap OFF), WakeWordForegroundService (24/7), Accessibility Touch Control.
                </p>
              </div>
            </div>

            {androidFiles.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="md:col-span-1 space-y-1 max-h-60 overflow-y-auto pr-1">
                  {androidFiles.map((f) => (
                    <button
                      key={f.path}
                      type="button"
                      onClick={() => setSelectedAndroidFile(f.path)}
                      className={`w-full text-left px-3 py-1.5 rounded-lg text-[11px] font-mono truncate transition-colors ${
                        selectedAndroidFile === f.path
                          ? 'bg-blue-600 text-white'
                          : 'bg-slate-50 dark:bg-slate-900 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-800'
                      }`}
                    >
                      {f.path}
                    </button>
                  ))}
                </div>
                <div className="md:col-span-2 rounded-xl bg-slate-950 border border-slate-800 p-3 max-h-60 overflow-auto">
                  <pre className="text-[11px] font-mono text-slate-100 whitespace-pre-wrap break-words">
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
