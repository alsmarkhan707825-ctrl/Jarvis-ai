import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  CheckCircle2,
  History,
  Home,
  ListChecks,
  Mic,
  MicOff,
  Moon,
  Power,
  RotateCcw,
  ScanLine,
  Send,
  Settings,
  ShieldAlert,
  Square,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { ChatHistoryView } from './components/ChatHistoryView';
import { HolographicOrb } from './components/HolographicOrb';
import { PermissionOnboardingModal } from './components/PermissionOnboardingModal';
import { SettingsView } from './components/SettingsView';
import { VisionView } from './components/VisionView';
import {
  getLiveGpsCoordinates,
  resolveBrowserPermissionStatuses,
} from './services/permissionClient';
import { voiceClient } from './services/voiceClient';
import type {
  AppSettingsPayload,
  ChatMessage,
  ConversationThread,
  EmotionType,
  OrbState,
  ParsedCommand,
  PermissionRecord,
  PersonalityId,
  SleepModeState,
  TaskManagerSummary,
} from './types/jarvis';

type ActiveView = 'home' | 'vision' | 'history' | 'settings';

interface SendOptions {
  speakResponse: boolean;
  fromVoice: boolean;
}

const SETTINGS_BACKUP_KEY = 'jarvis_settings_backup_v1';

const CHARACTER_META: Record<PersonalityId, { label: string; title: string }> = {
  jarvis: { label: 'JARVIS', title: 'JARVIS' },
  normal: { label: 'Normal', title: 'Normal Assistant' },
  jadavis: { label: 'JADAVIS', title: 'JADAVIS' },
  girl: { label: 'AI Girl', title: 'Aria (AI)' },
};

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

export default function App() {
  const [view, setView] = useState<ActiveView>('home');
  const [settings, setSettings] = useState<AppSettingsPayload | null>(null);
  const [permissions, setPermissions] = useState<PermissionRecord[]>([]);
  const [serverConnected, setServerConnected] = useState(true);
  const [orbState, setOrbState] = useState<OrbState>('IDLE');
  const [isTouchingOrb, setIsTouchingOrb] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const [frequencyBins, setFrequencyBins] = useState<Uint8Array | null>(null);

  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [voicePhaseLabel, setVoicePhaseLabel] = useState<string | null>(null);
  const [liveTranscript, setLiveTranscript] = useState<string>('');
  const [textInput, setTextInput] = useState('');
  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  const [pendingConfirmation, setPendingConfirmation] = useState<ParsedCommand | null>(null);
  const [taskSummary, setTaskSummary] = useState<TaskManagerSummary | null>(null);
  const [activePlanSteps, setActivePlanSteps] = useState<ParsedCommand['steps']>([]);

  const abortControllerRef = useRef<AbortController | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const refreshPermissions = useCallback(async () => {
    try {
      const resp = await fetch('/api/permissions/catalog');
      if (!resp.ok) return;
      const catalog = (await resp.json()) as PermissionRecord[];
      const resolved = await resolveBrowserPermissionStatuses(catalog);
      setPermissions(resolved);
    } catch {
      // ignore initial network race
    }
  }, []);

  useEffect(() => {
    const init = async () => {
      try {
        const [setResp] = await Promise.all([
          fetch('/api/settings'),
          refreshPermissions(),
        ]);
        if (setResp.ok) {
          setServerConnected(true);
          const loaded = (await setResp.json()) as AppSettingsPayload;
          setSettings(loaded);
          try {
            localStorage.setItem(SETTINGS_BACKUP_KEY, JSON.stringify(loaded));
          } catch {
            // ignore storage quota
          }
          const convResp = await fetch(`/api/conversations?personality=${loaded.activePersonality}`);
          if (convResp.ok) {
            const threads = (await convResp.json()) as ConversationThread[];
            if (threads.length > 0) {
              setActiveThreadId(threads[0].id);
              setMessages(threads[0].messages);
            }
          }
        } else {
          setServerConnected(false);
        }
      } catch {
        setServerConnected(false);
        try {
          const cached = localStorage.getItem(SETTINGS_BACKUP_KEY);
          if (cached) {
            setSettings(JSON.parse(cached) as AppSettingsPayload);
          }
        } catch {
          // ignore
        }
        setErrorBanner('Unable to reach backend service.');
      }
    };
    void init();
  }, [refreshPermissions]);

  useEffect(() => {
    const timer = window.setInterval(async () => {
      try {
        const r = await fetch('/api/health');
        setServerConnected(r.ok);
      } catch {
        setServerConnected(false);
      }
    }, 20000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, pendingConfirmation]);

  const updateSettings = useCallback(async (patch: Partial<AppSettingsPayload>): Promise<boolean> => {
    const resp = await fetch('/api/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    if (resp.ok) {
      const updated = (await resp.json()) as AppSettingsPayload;
      setSettings(updated);
      try {
        localStorage.setItem(SETTINGS_BACKUP_KEY, JSON.stringify(updated));
      } catch {
        // ignore storage quota
      }
      return true;
    }
    return false;
  }, []);

  const activePersonality: PersonalityId = settings?.activePersonality || 'jarvis';
  const sleepState: SleepModeState = settings?.sleepState || 'AWAKE';
  const activeVoice =
    settings &&
    (activePersonality === 'jarvis'
      ? settings.jarvisVoice
      : activePersonality === 'normal'
        ? settings.normalVoice
        : activePersonality === 'jadavis'
          ? settings.jadavisVoice
          : settings.girlVoice);
  const currentEmotion: EmotionType = settings?.characterMoods?.[activePersonality] || 'Normal';

  const switchPersonality = async (next: PersonalityId) => {
    if (!settings || next === activePersonality) return;
    voiceClient.interruptSpeech();
    voiceClient.stopListening(true);
    voiceClient.stopWakeWordWatch();
    setVoicePhaseLabel(null);
    setLiveTranscript('');
    setOrbState('IDLE');
    await updateSettings({ activePersonality: next });

    const convResp = await fetch(`/api/conversations?personality=${next}`);
    if (convResp.ok) {
      const threads = (await convResp.json()) as ConversationThread[];
      if (threads.length > 0) {
        setActiveThreadId(threads[0].id);
        setMessages(threads[0].messages);
      } else {
        setActiveThreadId(null);
        setMessages([]);
      }
    }
    setPendingConfirmation(null);
    setTaskSummary(null);
    setActivePlanSteps([]);
  };

  const enterSleepMode = useCallback(async () => {
    abortControllerRef.current?.abort();
    voiceClient.interruptSpeech();
    voiceClient.stopListening(true);
    setAudioLevel(0);
    setFrequencyBins(null);
    setLiveTranscript('');
    setOrbState('IDLE');
    setVoicePhaseLabel('Sleep Mode · Wake-word standby ready');
    await updateSettings({ sleepState: 'SLEEPING' });
  }, [updateSettings]);

  const enterShutdownMode = useCallback(async () => {
    abortControllerRef.current?.abort();
    voiceClient.interruptSpeech();
    voiceClient.stopListening(true);
    voiceClient.stopWakeWordWatch();
    setAudioLevel(0);
    setFrequencyBins(null);
    setLiveTranscript('');
    setOrbState('IDLE');
    setVoicePhaseLabel('Complete Shutdown · All services stopped');
    await updateSettings({ sleepState: 'SHUTDOWN' });
  }, [updateSettings]);

  const restartSystem = useCallback(async () => {
    setErrorBanner(null);
    setVoicePhaseLabel(null);
    setOrbState('IDLE');
    await updateSettings({ sleepState: 'AWAKE' });
  }, [updateSettings]);

  const sendPromptRef = useRef<(promptText: string, opts: SendOptions) => Promise<void>>(
    async () => {}
  );
  const lastActivityAtRef = useRef<number>(Date.now());
  const proactiveInFlightRef = useRef<boolean>(false);
  const proactiveFiredForWindowRef = useRef<boolean>(false);

  const markUserActivity = useCallback(() => {
    lastActivityAtRef.current = Date.now();
    proactiveFiredForWindowRef.current = false;
  }, []);

  const startVoiceListening = useCallback(async () => {
    if (!activeVoice || !settings) return;
    if (settings.sleepState === 'SHUTDOWN') return;
    if (settings.sleepState === 'SLEEPING') {
      await updateSettings({ sleepState: 'AWAKE' });
    }
    setErrorBanner(null);
    setLiveTranscript('');
    setVoicePhaseLabel('STT Listening... speak now');
    setOrbState('LISTENING');

    await voiceClient.startListening(activeVoice, settings.sttProvider || 'auto', {
      onAudioFrame: (rms, bins) => {
        setAudioLevel(rms);
        setFrequencyBins(new Uint8Array(bins));
      },
      onSpeechDetected: () => {
        setVoicePhaseLabel('STT Hearing your voice...');
      },
      onPartialText: (partial) => {
        setLiveTranscript(partial);
      },
      onTranscribing: () => {
        setAudioLevel(0);
        setFrequencyBins(null);
        setOrbState('THINKING');
        setVoicePhaseLabel('Finalizing speech...');
      },
      onFinalText: (finalTxt) => {
        setVoicePhaseLabel(null);
        setLiveTranscript('');
        setAudioLevel(0);
        setFrequencyBins(null);
        if (finalTxt.trim()) {
          void sendPromptRef.current(finalTxt.trim(), {
            speakResponse: true,
            fromVoice: true,
          });
        } else {
          setOrbState('IDLE');
        }
      },
      onNoSpeech: () => {
        setAudioLevel(0);
        setFrequencyBins(null);
        setLiveTranscript('');
        setVoicePhaseLabel('No speech detected. Tap microphone to try again.');
        setOrbState('IDLE');
        window.setTimeout(() => {
          setVoicePhaseLabel((prev) =>
            prev === 'No speech detected. Tap microphone to try again.' ? null : prev
          );
        }, 2400);
      },
      onError: (msg) => {
        setAudioLevel(0);
        setFrequencyBins(null);
        setLiveTranscript('');
        setVoicePhaseLabel(null);
        setErrorBanner(formatUiError(msg));
        setOrbState('ERROR');
        setTimeout(() => setOrbState('IDLE'), 2200);
      },
    });
  }, [activeVoice, settings, updateSettings]);

  // Wake-word watch when enabled, NOT SHUTDOWN, Home view, and IDLE (works in AWAKE and SLEEPING!)
  useEffect(() => {
    if (
      settings &&
      settings.sleepState !== 'SHUTDOWN' &&
      activeVoice?.wakeWordEnabled &&
      view === 'home' &&
      orbState === 'IDLE' &&
      !voiceClient.getIsSpeaking() &&
      !voiceClient.getIsListening()
    ) {
      const phrases =
        settings.wakeWords?.length > 0
          ? settings.wakeWords
          : ['Hey JARVIS', 'Hello JARVIS', 'Wake up JARVIS', 'JARVIS'];
      const sensitivity = settings.wakeWordSensitivity ?? 0.72;
      voiceClient.startWakeWordWatch(phrases, activeVoice.language, sensitivity, async (matched) => {
        if (settings.sleepState === 'SLEEPING') {
          await updateSettings({ sleepState: 'AWAKE' });
        }
        setVoicePhaseLabel(`Wake word "${matched}" detected`);
        setOrbState('SPEAKING');
        await voiceClient.speak(
          "Yes, I'm listening.",
          activePersonality,
          activeVoice,
          currentEmotion,
          (amp) => setAudioLevel(amp),
          () => {
            setAudioLevel(0);
            void startVoiceListening();
          },
          (err) => {
            setErrorBanner(err);
            void startVoiceListening();
          }
        );
      });
    } else {
      voiceClient.stopWakeWordWatch();
    }
    return () => {
      voiceClient.stopWakeWordWatch();
    };
  }, [
    settings,
    activeVoice,
    view,
    orbState,
    activePersonality,
    currentEmotion,
    updateSettings,
    startVoiceListening,
  ]);

  // Proactive Self-Initiated Conversation when AWAKE, IDLE, and proactiveTalkEnabled is ON
  useEffect(() => {
    if (!settings || settings.sleepState !== 'AWAKE' || settings.proactiveTalkEnabled === false) {
      return;
    }
    const intervalMs = Math.max(15000, (settings.proactiveIntervalSec ?? 35) * 1000);
    const timer = window.setInterval(async () => {
      if (
        view !== 'home' ||
        orbState !== 'IDLE' ||
        textInput.trim().length > 0 ||
        voiceClient.getIsListening() ||
        voiceClient.getIsSpeaking() ||
        proactiveInFlightRef.current ||
        proactiveFiredForWindowRef.current
      ) {
        return;
      }
      if (Date.now() - lastActivityAtRef.current < intervalMs) {
        return;
      }
      proactiveInFlightRef.current = true;
      proactiveFiredForWindowRef.current = true;
      try {
        const resp = await fetch('/api/assistant/proactive', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            conversationId: activeThreadId || undefined,
            personality: activePersonality,
          }),
        });
        if (resp.ok) {
          const data = (await resp.json()) as {
            skipped?: boolean;
            threadId?: string;
            assistantMessage?: ChatMessage;
          };
          if (!data.skipped && data.assistantMessage) {
            if (data.threadId) setActiveThreadId(data.threadId);
            setMessages((prev) => [...prev, data.assistantMessage!]);
            if (settings.autoSpeakChatReplies && activeVoice) {
              setOrbState('SPEAKING');
              await voiceClient.speak(
                data.assistantMessage.content,
                activePersonality,
                activeVoice,
                data.assistantMessage.emotion || currentEmotion,
                (amp) => setAudioLevel(amp),
                () => {
                  setAudioLevel(0);
                  setOrbState('IDLE');
                },
                () => {
                  setAudioLevel(0);
                  setOrbState('IDLE');
                }
              );
            }
          }
        }
      } catch {
        // ignore network hiccup on background check-in
      } finally {
        proactiveInFlightRef.current = false;
      }
    }, 5000);
    return () => window.clearInterval(timer);
  }, [
    settings,
    view,
    orbState,
    textInput,
    activeThreadId,
    activePersonality,
    activeVoice,
    currentEmotion,
  ]);

  const sendPrompt = async (promptText: string, opts: SendOptions) => {
    if (!promptText.trim() || !settings) return;
    markUserActivity();
    if (settings.sleepState === 'SHUTDOWN') {
      setErrorBanner('JARVIS is in Complete Shutdown mode. Tap Restart JARVIS first.');
      return;
    }

    setErrorBanner(null);
    setPendingConfirmation(null);

    // Chat submission NEVER starts mic listening
    if (!opts.fromVoice) {
      voiceClient.stopListening(true);
      voiceClient.stopWakeWordWatch();
      setVoicePhaseLabel(null);
      setLiveTranscript('');
    }

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    if (activeVoice?.allowInterruption) {
      voiceClient.interruptSpeech();
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;
    setOrbState('THINKING');

    const optimisticUserId = `temp-u-${Date.now()}`;
    const optimisticAssistantId = `temp-a-${Date.now()}`;
    const personality = settings.activePersonality;
    const activeMood = settings.characterMoods[personality] || 'Normal';
    let enteredSleepOrShutdown = false;

    const shouldSpeakStreaming = Boolean(opts.speakResponse && activeVoice);
    if (shouldSpeakStreaming && activeVoice) {
      voiceClient.startStreamSession(personality, activeVoice, activeMood, {
        onSpeakStart: () => {
          setOrbState('SPEAKING');
          setVoicePhaseLabel(`Speaking (${activeVoice.ttsEngine} · ${activeVoice.voiceName})...`);
        },
        onAmplitude: (amp) => setAudioLevel(amp),
        onComplete: () => {
          setAudioLevel(0);
          setVoicePhaseLabel(null);
          if (enteredSleepOrShutdown) {
            setOrbState('IDLE');
            return;
          }
          if (
            opts.fromVoice &&
            (activeVoice.continuousMode ||
              activeVoice.autoListenAfterReply ||
              activeVoice.backgroundListening)
          ) {
            void startVoiceListening();
          } else {
            setOrbState('IDLE');
          }
        },
        onError: (ttsErr) => {
          // Permanent Human Voice Lock: explicit error surfaced, never silently switched to robotic voice
          setErrorBanner(ttsErr);
          setAudioLevel(0);
          setVoicePhaseLabel(null);
          setOrbState('ERROR');
          setTimeout(() => setOrbState('IDLE'), 2200);
        },
      });
    }

    setMessages((prev) => [
      ...prev,
      {
        id: optimisticUserId,
        role: 'user',
        content: promptText,
        timestamp: new Date().toISOString(),
        personality,
      },
      {
        id: optimisticAssistantId,
        role: 'assistant',
        content: '',
        timestamp: new Date().toISOString(),
        personality,
      },
    ]);

    try {
      const locPerm = permissions.find((p) => p.id === 'location');
      const needsLocation = /\b(location|gps|where am i|meri location)\b/i.test(promptText);
      const gpsCoords =
        needsLocation && locPerm?.status === 'ALLOWED' ? await getLiveGpsCoordinates() : null;

      const resp = await fetch('/api/assistant/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          conversationId: activeThreadId || undefined,
          personality,
          message: promptText,
          gpsCoords,
          moodOverride: activeMood,
        }),
      });

      if (!resp.ok || !resp.body) {
        throw new Error(`Server returned HTTP ${resp.status}`);
      }

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let streamedText = '';
      let finalEmotion: EmotionType = activeMood;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split('\n\n');
        buffer = events.pop() || '';

        for (const rawEv of events) {
          const lines = rawEv.split('\n');
          let eventType = 'message';
          let dataStr = '';
          for (const line of lines) {
            if (line.startsWith('event: ')) eventType = line.slice(7).trim();
            if (line.startsWith('data: ')) dataStr += line.slice(6);
          }
          if (!dataStr) continue;
          const payload = JSON.parse(dataStr);

          if (eventType === 'thread') {
            setActiveThreadId(payload.threadId);
            setMessages((prev) =>
              prev.map((m) => (m.id === optimisticUserId ? payload.userMessage : m))
            );
          } else if (eventType === 'sleepState') {
            const nextSleep = payload.sleepState as SleepModeState;
            enteredSleepOrShutdown = nextSleep === 'SLEEPING' || nextSleep === 'SHUTDOWN';
            setSettings((prev) => (prev ? { ...prev, sleepState: nextSleep } : prev));
            if (nextSleep === 'SHUTDOWN') {
              voiceClient.stopListening(true);
              voiceClient.stopWakeWordWatch();
              // Allow brief final shutdown confirmation if spoken from voice, then remain in SHUTDOWN
            }
          } else if (eventType === 'command') {
            if (payload.taskSummary) {
              setTaskSummary(payload.taskSummary as TaskManagerSummary);
            }
            if (payload.commandPlan?.steps) {
              setActivePlanSteps(payload.commandPlan.steps);
            }
            if (payload.awaitingConfirmation && payload.commandPlan) {
              setPendingConfirmation(payload.commandPlan);
            }
          } else if (eventType === 'delta') {
            const deltaText = payload.text || '';
            streamedText += deltaText;
            if (shouldSpeakStreaming && deltaText) {
              voiceClient.pushStreamDelta(deltaText);
            }
            setMessages((prev) =>
              prev.map((m) =>
                m.id === optimisticAssistantId ? { ...m, content: streamedText } : m
              )
            );
          } else if (eventType === 'done') {
            const assistantMsg = payload.assistantMessage as ChatMessage;
            finalEmotion = (payload.emotion as EmotionType) || assistantMsg.emotion || activeMood;
            setSettings((prev) =>
              prev
                ? {
                    ...prev,
                    sleepState: (payload.sleepState as SleepModeState) || prev.sleepState,
                    characterMoods: { ...prev.characterMoods, [personality]: finalEmotion },
                  }
                : prev
            );
            setMessages((prev) =>
              prev.map((m) => (m.id === optimisticAssistantId ? assistantMsg : m))
            );
          } else if (eventType === 'error') {
            throw new Error(payload.error || 'AI generation failed');
          }
        }
      }

      if (shouldSpeakStreaming) {
        voiceClient.finishStreamSession();
      } else {
        setOrbState('IDLE');
      }
    } catch (err) {
      voiceClient.interruptSpeech();
      if ((err as Error).name === 'AbortError') return;
      const errMsg = err instanceof Error ? err.message : 'Connection failed';
      setErrorBanner(formatUiError(errMsg));
      setOrbState('ERROR');
      setMessages((prev) => prev.filter((m) => m.id !== optimisticAssistantId || m.content));
      setTimeout(() => setOrbState('IDLE'), 2400);
    }
  };
  sendPromptRef.current = sendPrompt;

  const formatUiError = (raw: string): string => {
    if (/503|UNAVAILABLE|high demand|overloaded/i.test(raw)) {
      return 'AI model is temporarily busy (high demand). Retrying fallback or switch fast model in Settings.';
    }
    return raw;
  };

  const handleMicToggle = () => {
    if (sleepState === 'SHUTDOWN') return;
    voiceClient.primeAudio();
    if (orbState === 'SPEAKING') {
      if (activeVoice?.allowInterruption) {
        voiceClient.interruptSpeech();
        setAudioLevel(0);
        setVoicePhaseLabel(null);
        setOrbState('IDLE');
      }
      return;
    }
    if (orbState === 'LISTENING') {
      voiceClient.stopListening(true);
      setAudioLevel(0);
      setFrequencyBins(null);
      setLiveTranscript('');
      setVoicePhaseLabel(null);
      setOrbState('IDLE');
      return;
    }
    if (orbState === 'THINKING') {
      abortControllerRef.current?.abort();
      voiceClient.interruptSpeech();
      voiceClient.stopListening(true);
      setAudioLevel(0);
      setFrequencyBins(null);
      setLiveTranscript('');
      setVoicePhaseLabel(null);
      setOrbState('IDLE');
      return;
    }
    void startVoiceListening();
  };

  const handleSendListeningNow = () => {
    if (orbState === 'LISTENING') {
      voiceClient.finishListeningAndProcess();
    }
  };

  const handleSpeakMessage = async (msg: ChatMessage) => {
    if (!activeVoice || !msg.content.trim()) return;
    setErrorBanner(null);
    voiceClient.primeAudio();
    setOrbState('SPEAKING');
    setVoicePhaseLabel(`Speaking (${activeVoice.ttsEngine} · ${activeVoice.voiceName})...`);
    await voiceClient.speak(
      msg.content,
      msg.personality,
      activeVoice,
      msg.emotion || currentEmotion,
      (amp) => setAudioLevel(amp),
      () => {
        setAudioLevel(0);
        setVoicePhaseLabel(null);
        setOrbState('IDLE');
      },
      (err) => {
        setAudioLevel(0);
        setVoicePhaseLabel(null);
        setErrorBanner(err);
        setOrbState('ERROR');
        setTimeout(() => setOrbState('IDLE'), 2200);
      }
    );
  };

  const handleConfirmAction = async (approved: boolean) => {
    if (!pendingConfirmation) return;
    const plan = pendingConfirmation;
    setPendingConfirmation(null);
    if (!approved) {
      setMessages((prev) => [
        ...prev,
        {
          id: `cancel-${Date.now()}`,
          role: 'system',
          content: `Action cancelled by user: ${plan.summary}`,
          timestamp: new Date().toISOString(),
          personality: activePersonality,
        },
      ]);
      return;
    }

    const resp = await fetch('/api/automation/confirm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ commandPlan: plan }),
    });
    if (resp.ok) {
      const report = (await resp.json()) as {
        executedSteps: ParsedCommand['steps'];
        taskSummary?: TaskManagerSummary;
      };
      if (report.taskSummary) setTaskSummary(report.taskSummary);
      setActivePlanSteps(report.executedSteps);
      setMessages((prev) => [
        ...prev,
        {
          id: `exec-${Date.now()}`,
          role: 'system',
          content: `Confirmed & executed: ${report.executedSteps
            .map((s) => `${s.action} (${s.verificationNote || s.status})`)
            .join(' · ')}`,
          timestamp: new Date().toISOString(),
          personality: activePersonality,
        },
      ]);
    }
  };

  const effectiveOrbState: OrbState = isTouchingOrb && orbState === 'IDLE' ? 'TOUCH' : orbState;
  const charMeta = CHARACTER_META[activePersonality];

  const lockedVoiceSummary = activeVoice
    ? `${activeVoice.ttsEngine.toUpperCase()} · ${activeVoice.voiceName}`
    : 'Loading';
  const micStatusLabel =
    sleepState === 'SHUTDOWN'
      ? 'Mic Off'
      : orbState === 'LISTENING'
        ? 'Mic Active'
        : 'Mic Standby';
  const wakeStatusLabel =
    sleepState === 'SHUTDOWN'
      ? 'Wake Stopped'
      : activeVoice?.wakeWordEnabled
        ? 'Wake Armed'
        : 'Wake Off';
  const bgServiceLabel =
    sleepState === 'SHUTDOWN'
      ? 'Bg Stopped'
      : activeVoice?.backgroundListening || activeVoice?.wakeWordEnabled
        ? 'Bg Standby'
        : 'Bg Idle';

  return (
    <div className="min-h-screen flex flex-col bg-[#040918] text-slate-100 relative overflow-x-hidden">
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-x-0 top-0 h-[420px] bg-[radial-gradient(ellipse_at_top,rgba(30,64,175,0.28),transparent_70%)]"
      />

      {/* Minimal Top Bar: Brand + Live Connection Text + Sleep / Shutdown + Chat History */}
      <header className="sticky top-0 z-30 h-14 px-4 sm:px-8 flex items-center justify-between bg-[#040918]/80 backdrop-blur-md border-b border-blue-950/60">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={() => setView('home')}
            className="font-display text-base sm:text-lg font-semibold tracking-tight text-white hover:text-amber-300 transition-colors whitespace-nowrap shrink-0"
          >
            JARVIS AI
          </button>
          <span aria-hidden="true" className="text-slate-600">·</span>
          <span className={`text-xs whitespace-nowrap ${serverConnected ? 'text-amber-300/90' : 'text-red-400'}`}>
            {serverConnected ? 'Connected' : 'Offline'}
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          {sleepState === 'AWAKE' && (
            <>
              <button
                type="button"
                onClick={() => void enterSleepMode()}
                aria-label="Sleep Mode"
                title="Sleep Mode"
                className="min-h-[40px] min-w-[40px] px-2.5 flex items-center justify-center gap-1 rounded-xl text-slate-400 hover:text-amber-300 hover:bg-blue-950/60 text-xs transition-colors"
              >
                <Moon className="w-4 h-4" />
                <span className="hidden md:inline">Sleep</span>
              </button>
              <button
                type="button"
                onClick={() => void enterShutdownMode()}
                aria-label="Shutdown Mode"
                title="Complete Shutdown"
                className="min-h-[40px] min-w-[40px] px-2.5 flex items-center justify-center gap-1 rounded-xl text-slate-400 hover:text-red-400 hover:bg-red-950/30 text-xs transition-colors"
              >
                <Power className="w-4 h-4" />
                <span className="hidden md:inline">Shutdown</span>
              </button>
            </>
          )}

          <button
            type="button"
            onClick={() => setView(view === 'history' ? 'home' : 'history')}
            aria-label="Chat History & Memory"
            className={`min-h-[44px] min-w-[44px] px-3 flex items-center justify-center gap-1.5 rounded-xl transition-colors text-xs font-medium whitespace-nowrap ${
              view === 'history'
                ? 'bg-blue-600/25 text-amber-300'
                : 'text-slate-300 hover:text-white hover:bg-blue-950/60'
            }`}
          >
            <History className="w-4 h-4" />
            <span className="hidden sm:inline">History</span>
          </button>
        </div>
      </header>

      {/* Main Content Viewport */}
      <main className="relative z-10 flex-1 flex flex-col">
        {view === 'home' && (
          <div className="flex-1 w-full max-w-4xl mx-auto px-4 sm:px-6 pt-2 pb-24 flex flex-col items-center">
            {/* Upper Section: Holographic AI Orb */}
            <div className={`w-full flex flex-col items-center ${sleepState !== 'AWAKE' ? 'opacity-65 transition-opacity' : ''}`}>
              <HolographicOrb
                state={effectiveOrbState}
                personality={activePersonality}
                emotion={currentEmotion}
                audioLevel={audioLevel}
                frequencyBins={frequencyBins}
                paused={view !== 'home' || sleepState === 'SHUTDOWN'}
                onTouchStateChange={setIsTouchingOrb}
                onOrbTap={() => {
                  if (sleepState !== 'AWAKE') {
                    void restartSystem();
                  } else if (orbState === 'SPEAKING' && activeVoice?.allowInterruption) {
                    voiceClient.interruptSpeech();
                    setVoicePhaseLabel(null);
                    setOrbState('IDLE');
                  } else {
                    handleMicToggle();
                  }
                }}
              />

              {/* Unboxed Real-Time Telemetry Strip + Mode Switcher */}
              <div className="flex flex-col items-center gap-3 -mt-2 w-full">
                <div className="text-xs font-medium tracking-wide text-amber-300/95 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-center px-2">
                  <span>{charMeta.title}</span>
                  <span aria-hidden="true" className="text-slate-600">·</span>
                  <span className="text-blue-200">{currentEmotion}</span>
                  <span aria-hidden="true" className="text-slate-600">·</span>
                  <span>
                    {sleepState === 'SHUTDOWN'
                      ? 'Shutdown'
                      : sleepState === 'SLEEPING'
                        ? 'Sleeping'
                        : effectiveOrbState === 'IDLE'
                          ? 'Ready'
                          : effectiveOrbState === 'LISTENING'
                            ? 'STT Listening'
                            : effectiveOrbState === 'THINKING'
                              ? 'Thinking'
                              : effectiveOrbState === 'SPEAKING'
                                ? 'Streaming TTS'
                                : effectiveOrbState === 'TOUCH'
                                  ? 'Interactive Field'
                                  : 'Attention Needed'}
                  </span>
                </div>

                {/* Unboxed Voice / Mic / Wake-word / Background Status Line */}
                <div className="text-[11px] text-slate-400 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-center px-2">
                  <span className="text-blue-300">Voice: {lockedVoiceSummary}</span>
                  <span aria-hidden="true" className="text-slate-600">·</span>
                  <span>{micStatusLabel}</span>
                  <span aria-hidden="true" className="text-slate-600">·</span>
                  <span>{wakeStatusLabel}</span>
                  <span aria-hidden="true" className="text-slate-600">·</span>
                  <span>{bgServiceLabel}</span>
                </div>

                {/* 4-Way Mode & Character Switcher (3 Main Modes + Preserved JADAVIS) */}
                <div className="inline-flex flex-wrap justify-center p-1 rounded-xl bg-[#09132d] border border-blue-900/60">
                  {(['jarvis', 'normal', 'jadavis', 'girl'] as PersonalityId[]).map((pid) => (
                    <button
                      key={pid}
                      type="button"
                      onClick={() => void switchPersonality(pid)}
                      className={`min-h-[38px] px-3.5 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
                        activePersonality === pid
                          ? 'bg-blue-600 text-white shadow-sm'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {CHARACTER_META[pid].label}
                    </button>
                  ))}
                </div>

                {/* Manual 10-Emotion Selector */}
                <div className="flex flex-wrap items-center justify-center gap-1 max-w-xl">
                  {EMOTIONS.map((em) => (
                    <button
                      key={em}
                      type="button"
                      onClick={() =>
                        settings &&
                        void updateSettings({
                          characterMoods: { ...settings.characterMoods, [activePersonality]: em },
                        })
                      }
                      className={`min-h-[30px] px-2.5 rounded-lg text-[11px] transition-colors whitespace-nowrap ${
                        currentEmotion === em
                          ? 'bg-amber-500/20 text-amber-300 border border-amber-400/30'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {em}
                    </button>
                  ))}
                </div>

                {/* Quick Behavior Toggles: Auto-Talk, Playful Banter (Shararat), Auto Model */}
                {settings && (
                  <div className="flex flex-wrap items-center justify-center gap-2 text-[11px]">
                    <button
                      type="button"
                      onClick={() =>
                        void updateSettings({ proactiveTalkEnabled: settings.proactiveTalkEnabled === false })
                      }
                      className={`min-h-[28px] px-2.5 rounded-lg border transition-colors ${
                        settings.proactiveTalkEnabled !== false
                          ? 'bg-blue-600/20 border-blue-400/40 text-blue-200'
                          : 'bg-[#09132d]/60 border-blue-950/60 text-slate-500'
                      }`}
                    >
                      Auto-Talk: {settings.proactiveTalkEnabled !== false ? 'ON' : 'OFF'}
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        void updateSettings({ playfulBanterEnabled: settings.playfulBanterEnabled === false })
                      }
                      className={`min-h-[28px] px-2.5 rounded-lg border transition-colors ${
                        settings.playfulBanterEnabled !== false
                          ? 'bg-amber-500/15 border-amber-400/40 text-amber-200'
                          : 'bg-[#09132d]/60 border-blue-950/60 text-slate-500'
                      }`}
                    >
                      Shararat: {settings.playfulBanterEnabled !== false ? 'ON' : 'OFF'}
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        void updateSettings({ autoModelSelection: settings.autoModelSelection === false })
                      }
                      className={`min-h-[28px] px-2.5 rounded-lg border transition-colors ${
                        settings.autoModelSelection !== false
                          ? 'bg-emerald-500/15 border-emerald-400/35 text-emerald-200'
                          : 'bg-[#09132d]/60 border-blue-950/60 text-slate-500'
                      }`}
                    >
                      Auto Model: {settings.autoModelSelection !== false ? 'ON' : 'MANUAL'}
                    </button>
                  </div>
                )}
              </div>

              {/* Microphone / Restart Control */}
              <div className="mt-4 flex flex-col items-center gap-2">
                {sleepState === 'SHUTDOWN' ? (
                  <button
                    type="button"
                    onClick={() => void restartSystem()}
                    className="min-h-[52px] px-6 py-2.5 rounded-full bg-blue-600 hover:bg-blue-500 border border-amber-400/50 text-white text-sm font-semibold inline-flex items-center gap-2 shadow-[0_0_24px_rgba(37,99,235,0.45)] transition-all"
                  >
                    <RotateCcw className="w-4 h-4" />
                    Restart JARVIS
                  </button>
                ) : sleepState === 'SLEEPING' ? (
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => void restartSystem()}
                      className="min-h-[48px] px-5 py-2 rounded-full bg-[#0b1736] hover:bg-blue-950 border border-amber-400/40 text-amber-300 text-xs font-semibold inline-flex items-center gap-2 transition-all"
                    >
                      <RotateCcw className="w-4 h-4" />
                      Wake Up
                    </button>
                    <button
                      type="button"
                      onClick={() => void enterShutdownMode()}
                      className="min-h-[48px] px-4 py-2 rounded-full bg-[#09132d] hover:bg-red-950/40 border border-blue-900/60 text-slate-300 hover:text-red-300 text-xs font-medium inline-flex items-center gap-1.5"
                    >
                      <Power className="w-4 h-4" />
                      Shutdown
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center justify-center gap-3">
                    <button
                      type="button"
                      onClick={handleMicToggle}
                      aria-label={
                        orbState === 'LISTENING'
                          ? 'Turn off microphone and stop listening'
                          : orbState === 'SPEAKING' || orbState === 'THINKING'
                            ? 'Stop current response'
                            : 'Start voice listening'
                      }
                      className={`w-16 h-16 rounded-full flex items-center justify-center transition-all border ${
                        orbState === 'LISTENING'
                          ? 'bg-red-600/90 border-amber-400 text-white shadow-[0_0_28px_rgba(220,38,38,0.65)] scale-105'
                          : orbState === 'SPEAKING' || orbState === 'THINKING'
                            ? 'bg-amber-500/20 border-amber-400 text-amber-300 hover:bg-amber-500/30'
                            : 'bg-[#0b1736] hover:bg-blue-950 border-blue-500/40 text-blue-300 hover:text-amber-300 shadow-[0_0_20px_rgba(30,64,175,0.35)]'
                      }`}
                    >
                      {orbState === 'LISTENING' ? (
                        <MicOff className="w-6 h-6" />
                      ) : orbState === 'SPEAKING' || orbState === 'THINKING' ? (
                        <Square className="w-5 h-5" />
                      ) : (
                        <Mic className="w-6 h-6" />
                      )}
                    </button>

                    {orbState === 'LISTENING' && (
                      <button
                        type="button"
                        onClick={handleSendListeningNow}
                        className="min-h-[44px] px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-xs font-medium text-white border border-amber-400/30 inline-flex items-center gap-1.5 whitespace-nowrap"
                      >
                        <Send className="w-3.5 h-3.5" />
                        Send Now
                      </button>
                    )}
                  </div>
                )}

                {liveTranscript && orbState === 'LISTENING' && (
                  <p className="text-sm text-amber-200 font-medium text-center max-w-lg px-4 py-1.5 rounded-xl bg-[#09132d]/80 border border-blue-800/60 mt-1">
                    “{liveTranscript}”
                  </p>
                )}

                {voicePhaseLabel && (
                  <p className="text-xs text-blue-200 text-center max-w-md px-3 mt-1">
                    {voicePhaseLabel}
                  </p>
                )}

                {errorBanner && (
                  <div className="flex flex-col items-center gap-2 max-w-md px-3 mt-1">
                    <p className="text-xs text-red-400 text-center">{errorBanner}</p>
                    {/(429|tts|voice|not configured)/i.test(errorBanner) && activeVoice && (
                      <div className="flex flex-wrap items-center justify-center gap-2">
                        {!activeVoice.manualFallbackToBrowserTts && (
                          <button
                            type="button"
                            onClick={async () => {
                              const voiceKey =
                                activePersonality === 'normal'
                                  ? 'normalVoice'
                                  : activePersonality === 'jadavis'
                                    ? 'jadavisVoice'
                                    : activePersonality === 'girl'
                                      ? 'girlVoice'
                                      : 'jarvisVoice';
                              await updateSettings({
                                [voiceKey]: { ...activeVoice, manualFallbackToBrowserTts: true },
                              });
                              setErrorBanner(null);
                              setVoicePhaseLabel('Temporary Browser Voice enabled');
                            }}
                            className="px-3 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 border border-amber-400/40 text-amber-200 text-[11px] font-medium"
                          >
                            Enable Temporary Browser Voice
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => setView('settings')}
                          className="px-3 py-1.5 rounded-lg bg-blue-600/25 hover:bg-blue-600/40 border border-blue-500/40 text-blue-200 text-[11px] font-medium"
                        >
                          Open AI & Voice Settings
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Live Multi-Command Task Manager Panel */}
            {taskSummary && taskSummary.total > 0 && (
              <div className="w-full max-w-2xl mt-5 rounded-2xl bg-[#09132d]/90 border border-blue-800/50 p-4 space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <span className="inline-flex items-center gap-1.5 font-semibold text-amber-300">
                    <ListChecks className="w-4 h-4" />
                    Task Manager
                  </span>
                  <span className="text-slate-300 tabular-nums">
                    Total {taskSummary.total} · Completed {taskSummary.completed} · Running{' '}
                    {taskSummary.running} · Pending {taskSummary.pending} · Failed {taskSummary.failed}
                  </span>
                </div>
                <div className="text-xs text-blue-200 truncate">
                  Current Action: {taskSummary.currentAction}
                </div>
                {activePlanSteps.length > 0 && (
                  <div className="pt-2 border-t border-blue-900/50 grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                    {activePlanSteps.map((step) => (
                      <div
                        key={step.id}
                        className="flex items-center justify-between gap-2 text-[11px] text-slate-300 bg-[#040918]/70 px-2.5 py-1.5 rounded-lg"
                      >
                        <span className="truncate">
                          {step.stepIndex}. {step.action}
                          {step.targetApp ? ` (${step.targetApp})` : ''}
                        </span>
                        <span className="text-amber-300/90 shrink-0">{step.status}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Sensitive Action Confirmation Bar */}
            {pendingConfirmation && (
              <div className="w-full max-w-2xl mt-5 rounded-2xl bg-[#0b1736] border border-amber-400/40 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-start gap-3">
                  <ShieldAlert className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                  <div>
                    <div className="text-sm font-semibold text-white">Confirmation Required</div>
                    <p className="text-xs text-slate-300 mt-0.5">
                      {pendingConfirmation.confirmationPrompt || pendingConfirmation.summary}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => void handleConfirmAction(false)}
                    className="min-h-[40px] px-4 py-2 rounded-xl bg-[#040918] border border-blue-900/60 text-xs font-medium text-slate-300 hover:text-white"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleConfirmAction(true)}
                    className="min-h-[40px] px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-xs font-medium text-white"
                  >
                    Confirm Action
                  </button>
                </div>
              </div>
            )}

            {/* Quick Text Chat Input Bar (Chat NEVER starts listening) */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const val = textInput.trim();
                if (!val) return;
                setTextInput('');
                void sendPrompt(val, {
                  speakResponse: Boolean(settings?.autoSpeakChatReplies),
                  fromVoice: false,
                });
              }}
              className="w-full max-w-2xl mt-5 flex items-center gap-2"
            >
              <button
                type="button"
                onClick={() =>
                  settings &&
                  void updateSettings({ autoSpeakChatReplies: !settings.autoSpeakChatReplies })
                }
                title={
                  settings?.autoSpeakChatReplies
                    ? 'Auto-Speak Chat Replies: ON (Mic listening stays OFF)'
                    : 'Auto-Speak Chat Replies: OFF'
                }
                aria-label="Toggle auto-speak for chat replies"
                className={`min-h-[48px] min-w-[44px] px-2.5 rounded-2xl border flex items-center justify-center transition-colors shrink-0 ${
                  settings?.autoSpeakChatReplies
                    ? 'bg-blue-600/25 border-amber-400/50 text-amber-300'
                    : 'bg-[#09132d]/90 border-blue-900/60 text-slate-400 hover:text-slate-200'
                }`}
              >
                {settings?.autoSpeakChatReplies ? (
                  <Volume2 className="w-4 h-4" />
                ) : (
                  <VolumeX className="w-4 h-4" />
                )}
              </button>
              <input
                type="text"
                value={textInput}
                disabled={sleepState === 'SHUTDOWN'}
                onChange={(e) => setTextInput(e.target.value)}
                placeholder={
                  sleepState === 'SHUTDOWN'
                    ? 'System shut down — tap Restart JARVIS to resume'
                    : `Message ${charMeta.title} (English, Hindi, Hinglish, or multi-step commands)...`
                }
                className="flex-1 h-12 px-4 rounded-2xl bg-[#09132d]/90 border border-blue-900/60 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-blue-500 disabled:opacity-50"
              />
              <button
                type="submit"
                disabled={sleepState === 'SHUTDOWN'}
                aria-label="Send chat message"
                className="min-h-[48px] min-w-[48px] rounded-2xl bg-blue-600 hover:bg-blue-500 text-white flex items-center justify-center transition-colors shrink-0 disabled:opacity-50"
              >
                <Send className="w-4 h-4" />
              </button>
            </form>

            {/* Real-Time Conversation Stream */}
            {messages.length > 0 && (
              <div className="w-full max-w-2xl mt-6 space-y-4">
                {messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`flex flex-col ${
                      msg.role === 'user' ? 'items-end' : 'items-start'
                    }`}
                  >
                    <div
                      className={`max-w-[88%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                        msg.role === 'user'
                          ? 'bg-blue-600/25 border border-blue-500/35 text-slate-100'
                          : msg.role === 'system'
                            ? 'bg-amber-500/10 border border-amber-400/25 text-amber-200 text-xs'
                            : 'bg-[#09132d]/85 border border-blue-900/50 text-slate-200'
                      }`}
                    >
                      <p className="whitespace-pre-wrap">{msg.content || '...'}</p>

                      {msg.commandPlan && msg.commandPlan.steps.length > 0 && (
                        <div className="mt-3 pt-2.5 border-t border-blue-900/50 space-y-1.5">
                          <div className="text-xs font-medium text-amber-300">
                            Automation Plan · {msg.commandPlan.category.replace(/_/g, ' ')}
                          </div>
                          {msg.commandPlan.steps.map((step) => (
                            <div
                              key={step.id}
                              className="flex items-center justify-between gap-2 text-xs text-slate-300"
                            >
                              <span className="inline-flex items-center gap-1.5 truncate">
                                <CheckCircle2 className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                                <span className="truncate">
                                  {step.action}
                                  {step.targetApp ? ` (${step.targetApp})` : ''}
                                  {step.inputText ? ` "${step.inputText}"` : ''}
                                </span>
                              </span>
                              <span className="text-slate-400 shrink-0">{step.status}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {msg.role === 'assistant' && msg.content && (
                      <div className="mt-1 px-1 text-[11px] text-slate-500 flex items-center gap-2.5">
                        {msg.emotion && <span className="text-amber-300/80">{msg.emotion}</span>}
                        {msg.modelUsed && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span>{msg.modelUsed}</span>
                          </>
                        )}
                        {msg.latencyMs !== undefined && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="tabular-nums">{msg.latencyMs}ms</span>
                          </>
                        )}
                        <button
                          type="button"
                          onClick={() => void handleSpeakMessage(msg)}
                          aria-label="Listen to response"
                          className="inline-flex items-center gap-1 text-blue-300 hover:text-amber-300 transition-colors"
                        >
                          <Volume2 className="w-3.5 h-3.5" />
                          <span>Speak</span>
                        </button>
                      </div>
                    )}
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </div>
            )}
          </div>
        )}

        {view === 'vision' && (
          <VisionView
            activePersonality={activePersonality}
            activeEmotion={currentEmotion}
            activeVoice={activeVoice || undefined}
            onPermissionsChanged={refreshPermissions}
          />
        )}

        {view === 'history' && (
          <ChatHistoryView
            activePersonality={activePersonality}
            activeThreadId={activeThreadId}
            onSelectThread={(thread) => {
              setActiveThreadId(thread.id);
              setMessages(thread.messages);
              if (thread.personality !== activePersonality) {
                void updateSettings({ activePersonality: thread.personality });
              }
              setView('home');
            }}
            onNewChat={async (personality) => {
              const resp = await fetch('/api/conversations', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ personality }),
              });
              if (resp.ok) {
                const created = (await resp.json()) as ConversationThread;
                setActiveThreadId(created.id);
                setMessages([]);
                if (personality !== activePersonality) {
                  await updateSettings({ activePersonality: personality });
                }
                setView('home');
              }
            }}
          />
        )}

        {view === 'settings' && settings && (
          <SettingsView
            settings={settings}
            permissions={permissions}
            onUpdateSettings={updateSettings}
            onRefreshPermissions={refreshPermissions}
          />
        )}
      </main>

      {/* 3-Item Bottom Navigation: Home, Scan / Vision, Settings */}
      <nav
        aria-label="Primary Bottom Navigation"
        className="fixed bottom-0 inset-x-0 z-30 h-16 bg-[#040918]/92 backdrop-blur-md border-t border-blue-950/70 flex items-center justify-around px-4"
      >
        <button
          type="button"
          onClick={() => setView('home')}
          className={`min-h-[48px] min-w-[84px] flex flex-col items-center justify-center gap-1 rounded-xl transition-colors whitespace-nowrap ${
            view === 'home' ? 'text-amber-300' : 'text-slate-400 hover:text-white'
          }`}
        >
          <Home className="w-5 h-5" />
          <span className="text-[11px] font-medium tracking-wider">HOME</span>
        </button>

        <button
          type="button"
          onClick={() => setView('vision')}
          className={`min-h-[48px] min-w-[96px] flex flex-col items-center justify-center gap-1 rounded-xl transition-colors whitespace-nowrap ${
            view === 'vision' ? 'text-amber-300' : 'text-slate-400 hover:text-white'
          }`}
        >
          <ScanLine className="w-5 h-5" />
          <span className="text-[11px] font-medium tracking-wider">SCAN / VISION</span>
        </button>

        <button
          type="button"
          onClick={() => setView('settings')}
          className={`min-h-[48px] min-w-[84px] flex flex-col items-center justify-center gap-1 rounded-xl transition-colors whitespace-nowrap ${
            view === 'settings' ? 'text-amber-300' : 'text-slate-400 hover:text-white'
          }`}
        >
          <Settings className="w-5 h-5" />
          <span className="text-[11px] font-medium tracking-wider">SETTINGS</span>
        </button>
      </nav>

      {/* First-Launch Progressive Permission Setup */}
      {settings && !settings.onboardingCompleted && permissions.length > 0 && (
        <PermissionOnboardingModal
          permissions={permissions}
          onRefreshPermissions={refreshPermissions}
          onComplete={() => void updateSettings({ onboardingCompleted: true })}
        />
      )}
    </div>
  );
}
