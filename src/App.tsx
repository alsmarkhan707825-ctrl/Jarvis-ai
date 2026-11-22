import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Battery,
  BatteryCharging,
  Camera,
  CheckCircle2,
  Download,
  History,
  Home,
  Layers,
  ListChecks,
  MessageSquare,
  Mic,
  MicOff,
  Moon,
  Power,
  Radio,
  RotateCcw,
  ScanLine,
  Send,
  Settings,
  ShieldAlert,
  Sparkles,
  Sun,
  Volume2,
  VolumeX,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { ChatHistoryView } from './components/ChatHistoryView';
import { FloatingJarvisBubble } from './components/FloatingJarvisBubble';
import { OfflineIndicator } from './components/OfflineIndicator';
import { PermissionOnboardingModal } from './components/PermissionOnboardingModal';
import { PWAInstallButton } from './components/PWAInstallButton';
import { SettingsView } from './components/SettingsView';
import { SiriOrb } from './components/SiriOrb';
import { VisionView } from './components/VisionView';
import { WeatherWidget } from './components/WeatherWidget';
import {
  acquireScreenWakeLock,
  getLiveDeviceTelemetry,
  getLiveGpsCoordinates,
  isOverlayGranted,
  releaseScreenWakeLock,
  resolveBrowserPermissionStatuses,
  setOverlayGranted,
  type LiveDeviceTelemetry,
} from './services/permissionClient';
import { voiceClient } from './services/voiceClient';
import type {
  AppControlDirective,
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
  ThemeMode,
} from './types/jarvis';

type ActiveView = 'home' | 'chat' | 'vision' | 'history' | 'settings';

interface SendOptions {
  speakResponse: boolean;
  fromVoice: boolean;
}

const SETTINGS_BACKUP_KEY = 'jarvis_settings_backup_v3';

const CHARACTER_META: Record<PersonalityId, { label: string; title: string; subtitle: string }> = {
  jarvis: { label: 'JARVIS', title: 'JARVIS', subtitle: 'Created by ALSMAR BOSS' },
  girl: { label: 'Maya · AI Girl', title: 'Maya', subtitle: 'Created by ALSMAR BOSS' },
};

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

export default function App() {
  const [view, setView] = useState<ActiveView>('home');
  const [settings, setSettings] = useState<AppSettingsPayload | null>(null);
  const [permissions, setPermissions] = useState<PermissionRecord[]>([]);
  const [serverConnected, setServerConnected] = useState(true);
  const [orbState, setOrbState] = useState<OrbState>('IDLE');
  const [voiceLoopActive, setVoiceLoopActive] = useState(false);
  const [isTouchingOrb, setIsTouchingOrb] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const [frequencyBins, setFrequencyBins] = useState<Uint8Array | null>(null);

  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [voicePhaseLabel, setVoicePhaseLabel] = useState<string | null>(null);
  const [liveTranscript, setLiveTranscript] = useState<string>('');
  const [lastSpokenCaption, setLastSpokenCaption] = useState<string>('');
  const [textInput, setTextInput] = useState('');
  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  const [pendingConfirmation, setPendingConfirmation] = useState<ParsedCommand | null>(null);
  const [taskSummary, setTaskSummary] = useState<TaskManagerSummary | null>(null);
  const [activePlanSteps, setActivePlanSteps] = useState<ParsedCommand['steps']>([]);
  const [nowClock, setNowClock] = useState<Date>(() => new Date());
  const [telemetry, setTelemetry] = useState<LiveDeviceTelemetry>({
    batteryPercent: null,
    charging: null,
    networkLabel: 'Online',
  });

  const voiceLoopActiveRef = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const setVoiceLoop = useCallback((next: boolean) => {
    voiceLoopActiveRef.current = next;
    setVoiceLoopActive(next);
  }, []);

  const refreshPermissions = useCallback(async () => {
    try {
      const resp = await fetch('/api/permissions/catalog');
      if (!resp.ok) return;
      const catalog = (await resp.json()) as PermissionRecord[];
      const resolved = await resolveBrowserPermissionStatuses(catalog);
      setPermissions(resolved);
    } catch {
      // ignore transient startup network error
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

  // Apply Black / White Theme cleanly to <html>
  const themeMode: ThemeMode = settings?.themeMode === 'black' ? 'black' : 'white';
  useEffect(() => {
    const root = document.documentElement;
    if (themeMode === 'black') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    const metaTheme = document.querySelector('meta[name="theme-color"]');
    if (metaTheme) {
      metaTheme.setAttribute('content', themeMode === 'black' ? '#05070B' : '#F4F7FC');
    }
  }, [themeMode]);

  useEffect(() => {
    const refreshTelemetry = async () => {
      const snap = await getLiveDeviceTelemetry();
      setTelemetry(snap);
    };
    void refreshTelemetry();

    const clockTimer = window.setInterval(() => {
      setNowClock(new Date());
    }, 15000);

    const timer = window.setInterval(async () => {
      void refreshTelemetry();
      try {
        const r = await fetch('/api/health');
        setServerConnected(r.ok);
      } catch {
        setServerConnected(false);
      }
    }, 20000);

    return () => {
      window.clearInterval(clockTimer);
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    if (view === 'chat') {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, pendingConfirmation, view]);

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

  const activePersonality: PersonalityId =
    settings?.activePersonality === 'girl' ? 'girl' : 'jarvis';
  const sleepState: SleepModeState = settings?.sleepState || 'AWAKE';
  const activeVoice =
    settings && (activePersonality === 'girl' ? settings.girlVoice : settings.jarvisVoice);
  const currentEmotion: EmotionType = settings?.characterMoods?.[activePersonality] || 'Normal';

  // Manage Screen Wake Lock when 24/7 background wake-word mode is enabled
  const wake24x7Enabled = Boolean(settings?.background24x7 || activeVoice?.wakeWordEnabled);
  useEffect(() => {
    if (wake24x7Enabled && sleepState === 'AWAKE') {
      void acquireScreenWakeLock();
    } else {
      void releaseScreenWakeLock();
    }
  }, [wake24x7Enabled, sleepState]);

  const switchPersonality = async (next: PersonalityId) => {
    if (!settings || next === activePersonality) return;
    setVoiceLoop(false);
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

  const turnJarvisOff = useCallback(() => {
    setVoiceLoop(false);
    abortControllerRef.current?.abort();
    voiceClient.interruptSpeech();
    voiceClient.stopListening(true);
    setAudioLevel(0);
    setFrequencyBins(null);
    setLiveTranscript('');
    setVoicePhaseLabel(null);
    setOrbState('IDLE');
  }, [setVoiceLoop]);

  const enterSleepMode = useCallback(async () => {
    turnJarvisOff();
    setVoicePhaseLabel('Sleep Mode · Wake-word standby ready');
    await updateSettings({ sleepState: 'SLEEPING' });
  }, [turnJarvisOff, updateSettings]);

  const enterShutdownMode = useCallback(async () => {
    turnJarvisOff();
    voiceClient.stopWakeWordWatch();
    setVoicePhaseLabel('Complete Shutdown · All services stopped');
    await updateSettings({ sleepState: 'SHUTDOWN' });
  }, [turnJarvisOff, updateSettings]);

  const restartSystem = useCallback(async () => {
    setErrorBanner(null);
    setVoicePhaseLabel(null);
    setOrbState('IDLE');
    await updateSettings({ sleepState: 'AWAKE' });
  }, [updateSettings]);

  const sendPromptRef = useRef<(promptText: string, opts: SendOptions) => Promise<void>>(
    async () => {}
  );
  const startVoiceListeningRef = useRef<() => Promise<void>>(async () => {});
  const lastActivityAtRef = useRef<number>(Date.now());
  const proactiveInFlightRef = useRef<boolean>(false);
  const proactiveFiredForWindowRef = useRef<boolean>(false);

  const markUserActivity = useCallback(() => {
    lastActivityAtRef.current = Date.now();
    proactiveFiredForWindowRef.current = false;
  }, []);

  const formatUiError = (raw: string): string => {
    if (/503|UNAVAILABLE|high demand|overloaded/i.test(raw)) {
      return 'AI model busy hai. Backup model se try karein ya Settings check karein.';
    }
    return raw;
  };

  const startVoiceListening = useCallback(async () => {
    if (!activeVoice || !settings) return;
    if (settings.sleepState === 'SHUTDOWN') return;
    if (settings.sleepState === 'SLEEPING') {
      await updateSettings({ sleepState: 'AWAKE' });
    }
    setErrorBanner(null);
    setLiveTranscript('');
    setVoicePhaseLabel('Listening... boliye');
    setOrbState('LISTENING');

    await voiceClient.startListening(activeVoice, settings.sttProvider || 'auto', {
      onAudioFrame: (rms, bins) => {
        setAudioLevel(rms);
        setFrequencyBins(new Uint8Array(bins));
      },
      onSpeechDetected: () => {
        setVoicePhaseLabel('Awaaz sun raha hoon...');
      },
      onPartialText: (partial) => {
        setLiveTranscript(partial);
      },
      onTranscribing: () => {
        setAudioLevel(0);
        setFrequencyBins(null);
        setOrbState('THINKING');
        setVoicePhaseLabel('Samajh raha hoon...');
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
        } else if (voiceLoopActiveRef.current) {
          window.setTimeout(() => {
            if (voiceLoopActiveRef.current) {
              void startVoiceListeningRef.current();
            }
          }, 260);
        } else {
          setOrbState('IDLE');
        }
      },
      onNoSpeech: () => {
        setAudioLevel(0);
        setFrequencyBins(null);
        setLiveTranscript('');
        if (voiceLoopActiveRef.current) {
          setVoicePhaseLabel('Standby listening... boliye');
          window.setTimeout(() => {
            if (voiceLoopActiveRef.current) {
              void startVoiceListeningRef.current();
            }
          }, 280);
        } else {
          setVoicePhaseLabel('Koi awaaz nahi aayi. Mic dobara dabaiye.');
          setOrbState('IDLE');
          window.setTimeout(() => {
            setVoicePhaseLabel((prev) =>
              prev === 'Koi awaaz nahi aayi. Mic dobara dabaiye.' ? null : prev
            );
          }, 2200);
        }
      },
      onError: (msg) => {
        setAudioLevel(0);
        setFrequencyBins(null);
        setLiveTranscript('');
        setVoicePhaseLabel(null);
        setVoiceLoop(false);
        setErrorBanner(formatUiError(msg));
        setOrbState('ERROR');
        setTimeout(() => setOrbState('IDLE'), 2200);
      },
    });
  }, [activeVoice, settings, setVoiceLoop, updateSettings]);

  startVoiceListeningRef.current = startVoiceListening;

  // 24/7 Wake-word standby watch
  useEffect(() => {
    if (
      settings &&
      settings.sleepState !== 'SHUTDOWN' &&
      (settings.background24x7 || activeVoice?.wakeWordEnabled) &&
      orbState === 'IDLE' &&
      !voiceLoopActive &&
      !voiceClient.getIsSpeaking() &&
      !voiceClient.getIsListening()
    ) {
      const phrases =
        settings.wakeWords?.length > 0
          ? settings.wakeWords
          : ['Hey JARVIS', 'Hello JARVIS', 'Wake up JARVIS', 'JARVIS'];
      const sensitivity = settings.wakeWordSensitivity ?? 0.72;
      voiceClient.startWakeWordWatch(phrases, activeVoice?.language || 'auto', sensitivity, async (matched) => {
        if (settings.sleepState === 'SLEEPING') {
          await updateSettings({ sleepState: 'AWAKE' });
        }
        voiceClient.primeAudio();
        setVoiceLoop(true);
        setVoicePhaseLabel(`Wake word "${matched}" active`);
        setOrbState('SPEAKING');
        if (activeVoice) {
          await voiceClient.speak(
            'Ji boliye, main sun raha hoon.',
            activePersonality,
            activeVoice,
            currentEmotion,
            (amp) => setAudioLevel(amp),
            () => {
              setAudioLevel(0);
              if (voiceLoopActiveRef.current) {
                void startVoiceListeningRef.current();
              } else {
                setOrbState('IDLE');
              }
            },
            () => {
              if (voiceLoopActiveRef.current) {
                void startVoiceListeningRef.current();
              } else {
                setOrbState('IDLE');
              }
            }
          );
        } else {
          void startVoiceListeningRef.current();
        }
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
    orbState,
    voiceLoopActive,
    activePersonality,
    currentEmotion,
    setVoiceLoop,
    updateSettings,
  ]);

  // Proactive Autonomous Conversation Check-In
  useEffect(() => {
    if (!settings || settings.sleepState !== 'AWAKE' || settings.proactiveTalkEnabled === false) {
      return;
    }
    const intervalMs = Math.max(15000, (settings.proactiveIntervalSec ?? 35) * 1000);
    const timer = window.setInterval(async () => {
      if (
        orbState !== 'IDLE' ||
        voiceLoopActiveRef.current ||
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
            setLastSpokenCaption(data.assistantMessage.content);
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
        // ignore
      } finally {
        proactiveInFlightRef.current = false;
      }
    }, 5000);
    return () => window.clearInterval(timer);
  }, [
    settings,
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
      setErrorBanner('JARVIS Shutdown mode mein hai. Restart JARVIS dabaiye.');
      return;
    }

    setErrorBanner(null);
    setPendingConfirmation(null);

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
    let effectivePersonality: PersonalityId =
      settings.activePersonality === 'girl' ? 'girl' : 'jarvis';
    const activeMood = settings.characterMoods[effectivePersonality] || 'Normal';
    let enteredSleepOrShutdown = false;

    const shouldSpeakStreaming = Boolean(opts.speakResponse && activeVoice);
    if (shouldSpeakStreaming && activeVoice) {
      voiceClient.startStreamSession(effectivePersonality, activeVoice, activeMood, {
        onSpeakStart: () => {
          setOrbState('SPEAKING');
          setVoicePhaseLabel(`Speaking (${activeVoice.voiceName})...`);
        },
        onEmotionChange: (spokenMood) => {
          setSettings((prev) =>
            prev
              ? {
                  ...prev,
                  characterMoods: {
                    ...prev.characterMoods,
                    [effectivePersonality]: spokenMood,
                  },
                }
              : prev
          );
        },
        onAmplitude: (amp) => setAudioLevel(amp),
        onComplete: () => {
          setAudioLevel(0);
          setVoicePhaseLabel(null);
          if (enteredSleepOrShutdown) {
            setVoiceLoop(false);
            setOrbState('IDLE');
            return;
          }
          // 1-Tap Continuous Voice Loop: speak finished -> automatically listen again!
          if (
            voiceLoopActiveRef.current ||
            (opts.fromVoice &&
              (activeVoice.continuousMode ||
                activeVoice.autoListenAfterReply ||
                activeVoice.backgroundListening))
          ) {
            void startVoiceListeningRef.current();
          } else {
            setOrbState('IDLE');
          }
        },
        onError: (ttsErr) => {
          setErrorBanner(ttsErr);
          setAudioLevel(0);
          setVoicePhaseLabel(null);
          if (voiceLoopActiveRef.current) {
            void startVoiceListeningRef.current();
          } else {
            setOrbState('ERROR');
            setTimeout(() => setOrbState('IDLE'), 2200);
          }
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
        personality: effectivePersonality,
      },
      {
        id: optimisticAssistantId,
        role: 'assistant',
        content: '',
        timestamp: new Date().toISOString(),
        personality: effectivePersonality,
      },
    ]);

    try {
      const locPerm = permissions.find((p) => p.id === 'location');
      const needsLocation = /\b(location|gps|where am i|meri location|weather|mausam)\b/i.test(
        promptText
      );
      const gpsCoords =
        needsLocation && locPerm?.status === 'ALLOWED' ? await getLiveGpsCoordinates() : null;

      const resp = await fetch('/api/assistant/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          conversationId: activeThreadId || undefined,
          personality: effectivePersonality,
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
          } else if (eventType === 'appControl') {
            const directive = payload.directive as AppControlDirective;
            const nextSettings = payload.settings as AppSettingsPayload;
            if (nextSettings) {
              setSettings(nextSettings);
              try {
                localStorage.setItem(SETTINGS_BACKUP_KEY, JSON.stringify(nextSettings));
              } catch {
                // ignore
              }
            }
            if (directive?.switchPersonality) {
              effectivePersonality = directive.switchPersonality;
            }
            if (directive?.clearChat) {
              setMessages((prev) =>
                prev.filter(
                  (m) => m.id === optimisticUserId || m.id === optimisticAssistantId
                )
              );
            }
            if (directive?.navigateView) {
              setView(directive.navigateView);
            }
          } else if (eventType === 'sleepState') {
            const nextSleep = payload.sleepState as SleepModeState;
            enteredSleepOrShutdown = nextSleep === 'SLEEPING' || nextSleep === 'SHUTDOWN';
            setSettings((prev) => (prev ? { ...prev, sleepState: nextSleep } : prev));
            if (nextSleep === 'SHUTDOWN') {
              setVoiceLoop(false);
              voiceClient.stopListening(true);
              voiceClient.stopWakeWordWatch();
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
          } else if (eventType === 'emotion') {
            const nextMood = payload.emotion as EmotionType | undefined;
            if (nextMood) {
              finalEmotion = nextMood;
              voiceClient.setStreamEmotion(nextMood);
              if (!shouldSpeakStreaming) {
                setSettings((prev) =>
                  prev
                    ? {
                        ...prev,
                        characterMoods: {
                          ...prev.characterMoods,
                          [effectivePersonality]: nextMood,
                        },
                      }
                    : prev
                );
              }
            }
          } else if (eventType === 'delta') {
            const deltaText = payload.text || '';
            const deltaMood = payload.emotion as EmotionType | undefined;
            if (shouldSpeakStreaming && deltaMood) {
              voiceClient.setStreamEmotion(deltaMood);
            }
            streamedText += deltaText;
            setLastSpokenCaption(streamedText);
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
            setLastSpokenCaption(assistantMsg.content);
            setSettings((prev) =>
              prev
                ? {
                    ...prev,
                    sleepState: (payload.sleepState as SleepModeState) || prev.sleepState,
                    characterMoods: {
                      ...prev.characterMoods,
                      [assistantMsg.personality || effectivePersonality]: finalEmotion,
                    },
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
      } else if (voiceLoopActiveRef.current) {
        void startVoiceListeningRef.current();
      } else {
        setOrbState('IDLE');
      }
    } catch (err) {
      voiceClient.interruptSpeech();
      if ((err as Error).name === 'AbortError') return;
      const errMsg = err instanceof Error ? err.message : 'Connection failed';
      setErrorBanner(formatUiError(errMsg));
      setVoiceLoop(false);
      setOrbState('ERROR');
      setMessages((prev) => prev.filter((m) => m.id !== optimisticAssistantId || m.content));
      setTimeout(() => setOrbState('IDLE'), 2400);
    }
  };
  sendPromptRef.current = sendPrompt;

  // One-Tap Continuous Loop Toggle:
  // Tap 1 = Activate continuous Listen -> Speak -> Listen loop
  // Tap 2 = Turn JARVIS completely OFF
  const handleMicToggle = () => {
    if (sleepState === 'SHUTDOWN') return;
    voiceClient.primeAudio();
    if (
      voiceLoopActiveRef.current ||
      orbState === 'LISTENING' ||
      orbState === 'SPEAKING' ||
      orbState === 'THINKING'
    ) {
      turnJarvisOff();
      return;
    }
    setVoiceLoop(true);
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
    setVoicePhaseLabel(`Speaking (${activeVoice.voiceName})...`);
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

  const toggleThemeMode = () => {
    const next: ThemeMode = themeMode === 'black' ? 'white' : 'black';
    void updateSettings({ themeMode: next });
  };

  const toggle24x7WakeWord = () => {
    if (!settings) return;
    const next = !wake24x7Enabled;
    void updateSettings({
      background24x7: next,
      jarvisVoice: { ...settings.jarvisVoice, wakeWordEnabled: next, backgroundListening: next },
      girlVoice: { ...settings.girlVoice, wakeWordEnabled: next, backgroundListening: next },
    });
  };

  const effectiveOrbState: OrbState = isTouchingOrb && orbState === 'IDLE' ? 'TOUCH' : orbState;
  const charMeta = CHARACTER_META[activePersonality];
  const locationAllowed = permissions.some((p) => p.id === 'location' && p.status === 'ALLOWED');
  const overlayAllowed =
    settings?.floatingBubbleEnabled === true ||
    (settings?.floatingBubbleEnabled !== false &&
      (isOverlayGranted() ||
        permissions.some((p) => p.id === 'display_over_apps' && p.status === 'ALLOWED')));
  const showFloatingBubble = Boolean(
    overlayAllowed && (view !== 'home' || settings?.floatingBubbleEnabled)
  );

  const hourNow = nowClock.getHours();
  const greetingText =
    hourNow < 12 ? 'Good Morning' : hourNow < 17 ? 'Good Afternoon' : 'Good Evening';
  const formattedTime = nowClock.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const formattedDate = nowClock.toLocaleDateString([], {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });

  const handleToggleFloatingLogo = async () => {
    if (!settings) return;
    const next = !settings.floatingBubbleEnabled;
    setOverlayGranted(next);
    await updateSettings({ floatingBubbleEnabled: next });
    await refreshPermissions();
  };

  const handleDailyBriefing = () => {
    if (sleepState === 'SHUTDOWN') return;
    voiceClient.primeAudio();
    void sendPrompt(
      'Mujhe abhi ka short natural briefing do: time, weather aur battery ke saath friendly greeting do, bina kisi emoji ke.',
      { speakResponse: true, fromVoice: false }
    );
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#F4F7FC] dark:bg-[#05070B] text-slate-900 dark:text-slate-100 relative overflow-x-hidden transition-colors duration-200">
      {/* Horizon Radiance */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-x-0 top-0 h-[420px] bg-[radial-gradient(ellipse_at_top,rgba(37,99,235,0.10),transparent_72%)] dark:bg-[radial-gradient(ellipse_at_top,rgba(56,189,248,0.14),transparent_72%)]"
      />

      {/* Clean 3-Zone Top Bar */}
      <header className="sticky top-0 z-30 h-14 px-4 sm:px-8 flex items-center justify-between bg-white/88 dark:bg-[#090D16]/88 backdrop-blur-md border-b border-slate-200/80 dark:border-slate-800/80">
        <div className="flex items-center gap-2.5 min-w-0">
          <button
            type="button"
            onClick={() => setView('home')}
            className="font-display text-base sm:text-lg font-bold tracking-tight text-slate-900 dark:text-white hover:text-blue-600 dark:hover:text-cyan-400 transition-colors whitespace-nowrap shrink-0"
          >
            JARVIS AI
          </button>
          <span aria-hidden="true" className="text-slate-300 dark:text-slate-700">·</span>
          <span
            className={`text-xs font-semibold whitespace-nowrap ${
              serverConnected
                ? 'text-emerald-700 dark:text-emerald-400'
                : 'text-red-600 dark:text-red-400'
            }`}
          >
            {serverConnected ? 'Online' : 'Offline'}
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          <a
            href="/api/android-apk/download"
            download="jarvis-ai-debug.apk"
            title="Download Installable Android Debug APK"
            aria-label="Download Android APK"
            className="min-h-[38px] px-2.5 flex items-center justify-center gap-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold transition-colors whitespace-nowrap shadow-sm"
          >
            <Download className="w-3.5 h-3.5" />
            <span>APK</span>
          </a>
          <PWAInstallButton compact />

          {/* Black / White Theme Switch */}
          <button
            type="button"
            onClick={toggleThemeMode}
            aria-label={themeMode === 'black' ? 'Switch to White Theme' : 'Switch to Black Theme'}
            title={themeMode === 'black' ? 'White UI' : 'Black UI'}
            className="min-h-[38px] px-2.5 flex items-center justify-center gap-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-amber-300 text-xs font-semibold transition-colors whitespace-nowrap"
          >
            {themeMode === 'black' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            <span className="hidden sm:inline">{themeMode === 'black' ? 'White' : 'Black'}</span>
          </button>

          {sleepState === 'AWAKE' && (
            <button
              type="button"
              onClick={() => void enterShutdownMode()}
              aria-label="Shutdown Mode"
              title="Complete Shutdown"
              className="min-h-[38px] min-w-[38px] px-2 flex items-center justify-center rounded-xl text-slate-500 dark:text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 text-xs font-medium transition-colors"
            >
              <Power className="w-4 h-4" />
            </button>
          )}

          <button
            type="button"
            onClick={() => setView(view === 'history' ? 'chat' : 'history')}
            aria-label="Saved Chats & Memory"
            title="Saved Chats & Memory"
            className={`min-h-[38px] px-2.5 flex items-center justify-center gap-1.5 rounded-xl transition-colors text-xs font-semibold whitespace-nowrap ${
              view === 'history'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <History className="w-4 h-4" />
            <span className="hidden sm:inline">Memory</span>
          </button>
        </div>
      </header>

      {/* Main Content Viewport */}
      <main className="relative z-10 flex-1 flex flex-col">
        {/* HOME PAGE: Live Clock + Weather + Siri Orb + Telemetry + Quick Actions (NO Chat Panel Here) */}
        {view === 'home' && (
          <div className="flex-1 w-full max-w-2xl mx-auto px-4 pt-4 pb-24 flex flex-col items-center justify-between gap-4">
            {/* Top Live Clock & Greeting + Live Weather */}
            <div className="w-full space-y-3">
              <div className="w-full rounded-2xl jarvis-surface px-4 py-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-blue-700 dark:text-cyan-400">
                    {greetingText} · {formattedDate}
                  </p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                    {activePersonality === 'girl'
                      ? `Maya · ${currentEmotion}`
                      : `Iron Man Core · ${currentEmotion}`}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <div className="font-display text-xl sm:text-2xl font-bold tabular-nums text-slate-900 dark:text-white leading-none">
                    {formattedTime}
                  </div>
                </div>
              </div>

              <WeatherWidget locationAllowed={locationAllowed} />
            </div>

            {/* Central Siri Animation Orb */}
            <div className="flex flex-col items-center justify-center my-auto w-full">
              <div className={sleepState !== 'AWAKE' ? 'opacity-55 transition-opacity' : ''}>
                <SiriOrb
                  state={effectiveOrbState}
                  personality={activePersonality}
                  emotion={currentEmotion}
                  themeMode={themeMode}
                  audioLevel={audioLevel}
                  frequencyBins={frequencyBins}
                  paused={sleepState === 'SHUTDOWN'}
                  onTouchStateChange={setIsTouchingOrb}
                  onOrbTap={() => {
                    if (sleepState !== 'AWAKE') {
                      void restartSystem();
                    } else {
                      handleMicToggle();
                    }
                  }}
                />
              </div>

              {/* Clean Status Headline */}
              <div className="text-center mt-1 space-y-1">
                <div className="text-sm font-bold tracking-wide text-slate-900 dark:text-white flex items-center justify-center gap-2">
                  <span className={activePersonality === 'girl' ? 'text-rose-600 dark:text-rose-400' : 'text-blue-700 dark:text-cyan-400'}>
                    {charMeta.title}
                  </span>
                  <span aria-hidden="true" className="text-slate-300 dark:text-slate-700">·</span>
                  <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                    {sleepState === 'SHUTDOWN'
                      ? 'Shutdown'
                      : sleepState === 'SLEEPING'
                        ? 'Sleeping'
                        : orbState === 'LISTENING'
                          ? 'Listening'
                          : orbState === 'THINKING'
                            ? 'Thinking'
                            : orbState === 'SPEAKING'
                              ? 'Speaking'
                              : voiceLoopActive
                                ? 'Continuous ON'
                                : 'Tap Mic to Start'}
                  </span>
                </div>
                {activeVoice && (
                  <p className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                    Mood: {currentEmotion} · Voice: {activeVoice.voiceName}
                  </p>
                )}
              </div>

              {/* Strictly 2-Mode Switch (JARVIS & AI Girl) */}
              <div className="w-full max-w-xs grid grid-cols-2 p-1 rounded-2xl bg-white/90 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm mt-4">
                {(['jarvis', 'girl'] as PersonalityId[]).map((pid) => (
                  <button
                    key={pid}
                    type="button"
                    onClick={() => void switchPersonality(pid)}
                    className={`min-h-[38px] px-4 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
                      activePersonality === pid
                        ? pid === 'girl'
                          ? 'bg-gradient-to-r from-rose-500 to-indigo-600 text-white shadow-sm'
                          : 'bg-blue-600 dark:bg-cyan-500 text-white dark:text-slate-950 shadow-sm'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    {CHARACTER_META[pid].label}
                  </button>
                ))}
              </div>

              {/* 1-Tap Continuous Mic Button & 24/7 Wake-Word Toggle */}
              <div className="mt-5 flex flex-col items-center gap-3 w-full">
                {sleepState === 'SHUTDOWN' ? (
                  <button
                    type="button"
                    onClick={() => void restartSystem()}
                    className="min-h-[52px] px-7 py-3 rounded-full bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold inline-flex items-center gap-2 shadow-lg transition-all"
                  >
                    <RotateCcw className="w-4 h-4" />
                    Restart JARVIS
                  </button>
                ) : (
                  <div className="flex items-center justify-center gap-3">
                    <button
                      type="button"
                      onClick={handleMicToggle}
                      aria-label={
                        voiceLoopActive || orbState !== 'IDLE'
                          ? 'Turn OFF JARVIS Microphone'
                          : 'Turn ON JARVIS Continuous Voice'
                      }
                      className={`w-18 h-18 rounded-full flex flex-col items-center justify-center transition-all border-2 ${
                        voiceLoopActive || orbState !== 'IDLE'
                          ? 'bg-red-600 hover:bg-red-700 border-red-300 text-white shadow-2xl shadow-red-600/35 scale-105'
                          : 'bg-blue-600 hover:bg-blue-700 dark:bg-cyan-500 dark:hover:bg-cyan-400 border-blue-400 dark:border-cyan-300 text-white dark:text-slate-950 shadow-xl shadow-blue-600/25'
                      }`}
                    >
                      {voiceLoopActive || orbState !== 'IDLE' ? (
                        <>
                          <MicOff className="w-6 h-6" />
                          <span className="text-[9px] font-bold mt-0.5 uppercase tracking-wider">Stop</span>
                        </>
                      ) : (
                        <>
                          <Mic className="w-6 h-6" />
                          <span className="text-[9px] font-bold mt-0.5 uppercase tracking-wider">Start</span>
                        </>
                      )}
                    </button>

                    {orbState === 'LISTENING' && (
                      <button
                        type="button"
                        onClick={handleSendListeningNow}
                        className="min-h-[44px] px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-xs font-semibold text-white inline-flex items-center gap-1.5 shadow-sm"
                      >
                        <Send className="w-3.5 h-3.5" />
                        Send Now
                      </button>
                    )}
                  </div>
                )}

                <button
                  type="button"
                  onClick={toggle24x7WakeWord}
                  className={`min-h-[34px] px-3.5 py-1.5 rounded-xl border text-[11px] font-semibold inline-flex items-center gap-1.5 transition-colors ${
                    wake24x7Enabled
                      ? 'bg-emerald-50 dark:bg-emerald-950/60 border-emerald-200 dark:border-emerald-700 text-emerald-700 dark:text-emerald-300'
                      : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400'
                  }`}
                >
                  <Radio className="w-3.5 h-3.5" />
                  24/7 Wake-Word: {wake24x7Enabled ? 'ON' : 'OFF'}
                </button>

                {/* Live Voice / Reply Single Caption */}
                {liveTranscript && orbState === 'LISTENING' ? (
                  <p className="text-sm text-blue-900 dark:text-cyan-200 font-medium text-center max-w-md px-4 py-2 rounded-2xl bg-blue-50 dark:bg-slate-900 border border-blue-200 dark:border-cyan-800">
                    “{liveTranscript}”
                  </p>
                ) : voicePhaseLabel ? (
                  <p className="text-xs text-slate-600 dark:text-slate-300 text-center max-w-md">
                    {voicePhaseLabel}
                  </p>
                ) : lastSpokenCaption ? (
                  <p className="text-xs text-slate-600 dark:text-slate-300 text-center max-w-md line-clamp-2 px-3">
                    {lastSpokenCaption}
                  </p>
                ) : null}

                {errorBanner && (
                  <p className="text-xs text-red-600 dark:text-red-400 font-medium text-center max-w-md px-3">
                    {errorBanner}
                  </p>
                )}
              </div>
            </div>

            {/* Live Device Telemetry & Quick Actions Deck */}
            <div className="w-full space-y-3">
              {/* Real Device Telemetry Strip */}
              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-2xl jarvis-surface px-3 py-2.5 flex items-center gap-2 min-w-0">
                  {telemetry.charging ? (
                    <BatteryCharging className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                  ) : (
                    <Battery className="w-4 h-4 text-blue-600 dark:text-cyan-400 shrink-0" />
                  )}
                  <div className="min-w-0">
                    <div className="text-[10px] text-slate-500 dark:text-slate-400 font-medium">
                      Battery
                    </div>
                    <div className="text-xs font-bold tabular-nums text-slate-900 dark:text-white truncate">
                      {telemetry.batteryPercent !== null
                        ? `${telemetry.batteryPercent}%${telemetry.charging ? ' · Charging' : ''}`
                        : 'AC / Ready'}
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl jarvis-surface px-3 py-2.5 flex items-center gap-2 min-w-0">
                  {navigator.onLine ? (
                    <Wifi className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                  ) : (
                    <WifiOff className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0" />
                  )}
                  <div className="min-w-0">
                    <div className="text-[10px] text-slate-500 dark:text-slate-400 font-medium">
                      Network
                    </div>
                    <div className="text-xs font-bold text-slate-900 dark:text-white truncate">
                      {telemetry.networkLabel}
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl jarvis-surface px-3 py-2.5 flex items-center gap-2 min-w-0">
                  <Sparkles className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                  <div className="min-w-0">
                    <div className="text-[10px] text-slate-500 dark:text-slate-400 font-medium">
                      Brain
                    </div>
                    <div className="text-xs font-bold text-slate-900 dark:text-white uppercase truncate">
                      {settings?.autoModelSelection !== false
                        ? 'Auto Fast'
                        : settings?.primaryProvider || 'Gemini'}
                    </div>
                  </div>
                </div>
              </div>

              {/* 4 Tactile Quick Actions */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <button
                  type="button"
                  onClick={handleDailyBriefing}
                  className="rounded-2xl jarvis-surface px-3 py-3 flex items-center gap-2.5 text-left hover:border-blue-400 dark:hover:border-cyan-500 transition-colors"
                >
                  <Volume2 className="w-4 h-4 text-blue-600 dark:text-cyan-400 shrink-0" />
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-slate-900 dark:text-white truncate">
                      Daily Briefing
                    </div>
                    <div className="text-[10px] text-slate-500 dark:text-slate-400 truncate">
                      Voice summary
                    </div>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setView('chat')}
                  className="rounded-2xl jarvis-surface px-3 py-3 flex items-center gap-2.5 text-left hover:border-blue-400 dark:hover:border-cyan-500 transition-colors"
                >
                  <MessageSquare className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-slate-900 dark:text-white truncate">
                      Open Chat
                    </div>
                    <div className="text-[10px] text-slate-500 dark:text-slate-400 truncate">
                      Text + Moods
                    </div>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setView('vision')}
                  className="rounded-2xl jarvis-surface px-3 py-3 flex items-center gap-2.5 text-left hover:border-blue-400 dark:hover:border-cyan-500 transition-colors"
                >
                  <Camera className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-slate-900 dark:text-white truncate">
                      Camera Scan
                    </div>
                    <div className="text-[10px] text-slate-500 dark:text-slate-400 truncate">
                      Live AI vision
                    </div>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => void handleToggleFloatingLogo()}
                  className={`rounded-2xl jarvis-surface px-3 py-3 flex items-center gap-2.5 text-left transition-colors ${
                    settings?.floatingBubbleEnabled
                      ? 'border-blue-500 dark:border-cyan-400'
                      : 'hover:border-blue-400 dark:hover:border-cyan-500'
                  }`}
                >
                  <Layers className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-slate-900 dark:text-white truncate">
                      Floating Logo
                    </div>
                    <div className="text-[10px] text-slate-500 dark:text-slate-400 truncate">
                      {settings?.floatingBubbleEnabled ? 'Active ON' : 'Tap to Show'}
                    </div>
                  </div>
                </button>
              </div>

              {/* Creator Attribution */}
              <div className="flex items-center justify-center gap-1.5 text-[11px] font-semibold text-slate-500 dark:text-slate-400 pt-1">
                <Sparkles className="w-3.5 h-3.5 text-blue-600 dark:text-cyan-400" />
                <span>Created by ALSMAR BOSS</span>
              </div>
            </div>
          </div>
        )}

        {/* DEDICATED CHAT PAGE */}
        {view === 'chat' && (
          <div className="flex-1 w-full max-w-4xl mx-auto px-4 sm:px-6 pt-4 pb-28 flex flex-col gap-4">
            {/* Mode Switcher + 11 Moods + Saved History Link */}
            <div className="rounded-2xl jarvis-surface p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="inline-flex p-1 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                  {(['jarvis', 'girl'] as PersonalityId[]).map((pid) => (
                    <button
                      key={pid}
                      type="button"
                      onClick={() => void switchPersonality(pid)}
                      className={`min-h-[36px] px-4 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${
                        activePersonality === pid
                          ? pid === 'girl'
                            ? 'bg-gradient-to-r from-rose-500 to-indigo-600 text-white shadow-sm'
                            : 'bg-blue-600 text-white shadow-sm'
                          : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                      }`}
                    >
                      {CHARACTER_META[pid].label}
                    </button>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={() => setView('history')}
                  className="inline-flex items-center gap-1.5 min-h-[36px] px-3 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200"
                >
                  <History className="w-3.5 h-3.5" />
                  Saved Threads & Memory
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
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
                    className={`min-h-[28px] px-2.5 rounded-lg text-[11px] font-medium transition-all whitespace-nowrap ${
                      currentEmotion === em
                        ? em === 'Romantic'
                          ? 'bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-700 font-semibold'
                          : 'bg-blue-50 dark:bg-cyan-950/60 text-blue-700 dark:text-cyan-300 border border-blue-200 dark:border-cyan-700 font-semibold'
                        : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800'
                    }`}
                  >
                    {em}
                  </button>
                ))}
              </div>
            </div>

            {taskSummary && taskSummary.total > 0 && (
              <div className="rounded-2xl jarvis-surface p-4 space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <span className="inline-flex items-center gap-1.5 font-bold text-blue-700 dark:text-cyan-400">
                    <ListChecks className="w-4 h-4" />
                    Task Manager
                  </span>
                  <span className="text-slate-600 dark:text-slate-300 tabular-nums font-mono">
                    Total {taskSummary.total} · Done {taskSummary.completed} · Failed {taskSummary.failed}
                  </span>
                </div>
                {activePlanSteps.length > 0 && (
                  <div className="pt-2 border-t border-slate-200 dark:border-slate-800 grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                    {activePlanSteps.map((step) => (
                      <div
                        key={step.id}
                        className="flex items-center justify-between gap-2 text-[11px] text-slate-700 dark:text-slate-200 bg-slate-50 dark:bg-slate-900 border border-slate-200/70 dark:border-slate-800 px-2.5 py-1.5 rounded-lg"
                      >
                        <span className="truncate">
                          {step.stepIndex}. {step.action}
                        </span>
                        <span className="text-amber-700 dark:text-amber-400 font-semibold shrink-0">
                          {step.status}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {pendingConfirmation && (
              <div className="rounded-2xl jarvis-surface border-amber-300 dark:border-amber-700 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-start gap-3">
                  <ShieldAlert className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <div className="text-sm font-bold text-slate-900 dark:text-white">
                      Confirmation Required
                    </div>
                    <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5">
                      {pendingConfirmation.confirmationPrompt || pendingConfirmation.summary}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => void handleConfirmAction(false)}
                    className="min-h-[38px] px-4 py-1.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleConfirmAction(true)}
                    className="min-h-[38px] px-4 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-xs font-semibold text-white shadow-sm"
                  >
                    Confirm
                  </button>
                </div>
              </div>
            )}

            {/* Chat Input Bar */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const val = textInput.trim();
                if (!val) return;
                setTextInput('');
                voiceClient.primeAudio();
                void sendPrompt(val, {
                  speakResponse: Boolean(settings?.autoSpeakChatReplies),
                  fromVoice: false,
                });
              }}
              className="flex items-center gap-2 rounded-2xl jarvis-surface p-2"
            >
              <button
                type="button"
                onClick={() =>
                  settings &&
                  void updateSettings({ autoSpeakChatReplies: !settings.autoSpeakChatReplies })
                }
                title={
                  settings?.autoSpeakChatReplies
                    ? 'Auto-Speak Replies: ON'
                    : 'Auto-Speak Replies: OFF'
                }
                aria-label="Toggle auto-speak for chat replies"
                className={`min-h-[42px] min-w-[42px] rounded-xl border flex items-center justify-center transition-colors shrink-0 ${
                  settings?.autoSpeakChatReplies
                    ? 'bg-blue-50 dark:bg-cyan-950/60 border-blue-200 dark:border-cyan-700 text-blue-700 dark:text-cyan-300'
                    : 'bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-500'
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
                placeholder={`Message ${charMeta.title} (Hindi, Hinglish, English)...`}
                className="flex-1 h-11 px-3 rounded-xl bg-transparent text-sm text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none disabled:opacity-50"
              />

              <button
                type="button"
                onClick={handleMicToggle}
                aria-label="Voice Microphone"
                className={`min-h-[42px] min-w-[42px] rounded-xl flex items-center justify-center transition-colors shrink-0 ${
                  orbState === 'LISTENING' || voiceLoopActive
                    ? 'bg-red-600 text-white'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700'
                }`}
              >
                {orbState === 'LISTENING' || voiceLoopActive ? (
                  <MicOff className="w-4 h-4" />
                ) : (
                  <Mic className="w-4 h-4" />
                )}
              </button>

              <button
                type="submit"
                disabled={sleepState === 'SHUTDOWN'}
                aria-label="Send chat message"
                className="min-h-[42px] min-w-[42px] rounded-xl bg-blue-600 hover:bg-blue-700 text-white flex items-center justify-center transition-colors shrink-0 shadow-sm disabled:opacity-50"
              >
                <Send className="w-4 h-4" />
              </button>
            </form>

            {/* Chat Feed */}
            {messages.length === 0 ? (
              <div className="rounded-3xl jarvis-surface p-8 text-center">
                <h2 className="font-display text-lg font-bold text-slate-900 dark:text-white">
                  {activePersonality === 'girl'
                    ? 'Maya Ready Hai'
                    : 'JARVIS Online Hai, Sir'}
                </h2>
                <p className="text-xs text-slate-600 dark:text-slate-400 mt-1.5 max-w-md mx-auto leading-relaxed">
                  {activePersonality === 'girl'
                    ? 'Main Maya hoon, created by ALSMAR BOSS — logical aur natural baat karo, bolte-bolte mood baat ke hisab se khud change hoga.'
                    : 'Created by ALSMAR BOSS — koi bhi logical sawal poochhein, phone commands chalaiye, ya Iron Man style voice mein baat karein.'}
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`flex flex-col ${
                      msg.role === 'user' ? 'items-end' : 'items-start'
                    }`}
                  >
                    <div
                      className={`max-w-[90%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                        msg.role === 'user'
                          ? 'bg-blue-600 text-white shadow-md shadow-blue-600/15'
                          : msg.role === 'system'
                            ? 'bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800 text-amber-900 dark:text-amber-200 text-xs'
                            : 'jarvis-surface text-slate-800 dark:text-slate-100'
                      }`}
                    >
                      <p className="whitespace-pre-wrap">{msg.content || '...'}</p>

                      {msg.commandPlan && msg.commandPlan.steps.length > 0 && (
                        <div className="mt-3 pt-2.5 border-t border-slate-200 dark:border-slate-700 space-y-1.5">
                          <div className="text-xs font-semibold text-blue-700 dark:text-cyan-400">
                            Automation Plan · {msg.commandPlan.category.replace(/_/g, ' ')}
                          </div>
                          {msg.commandPlan.steps.map((step) => (
                            <div
                              key={step.id}
                              className="flex items-center justify-between gap-2 text-xs text-slate-700 dark:text-slate-300"
                            >
                              <span className="inline-flex items-center gap-1.5 truncate">
                                <CheckCircle2 className="w-3.5 h-3.5 text-blue-600 dark:text-cyan-400 shrink-0" />
                                <span className="truncate">{step.action}</span>
                              </span>
                              <span className="text-slate-500 dark:text-slate-400 font-medium shrink-0">
                                {step.status}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {msg.role === 'assistant' && msg.content && (
                      <div className="mt-1.5 px-1 text-[11px] text-slate-500 dark:text-slate-400 flex flex-wrap items-center gap-2.5">
                        {msg.emotion && (
                          <span className="text-amber-700 dark:text-amber-400 font-semibold">
                            {msg.emotion}
                          </span>
                        )}
                        {msg.modelUsed && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="font-mono">{msg.modelUsed}</span>
                          </>
                        )}
                        {msg.latencyMs !== undefined && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="tabular-nums font-mono">{msg.latencyMs}ms</span>
                          </>
                        )}
                        <button
                          type="button"
                          onClick={() => void handleSpeakMessage(msg)}
                          aria-label="Listen to response"
                          className="inline-flex items-center gap-1 font-semibold text-blue-600 dark:text-cyan-400 hover:text-blue-700 transition-colors"
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
              setView('chat');
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
                setView('chat');
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
            onResetMemory={async () => {
              setActiveThreadId(null);
              setMessages([]);
              setTaskSummary(null);
              setActivePlanSteps([]);
              const setResp = await fetch('/api/settings');
              if (setResp.ok) {
                const updated = (await setResp.json()) as AppSettingsPayload;
                setSettings(updated);
              }
            }}
          />
        )}
      </main>

      {/* Display Over Other Apps — Floating Circular JARVIS Logo */}
      <FloatingJarvisBubble
        visible={showFloatingBubble}
        orbState={orbState}
        voiceLoopActive={voiceLoopActive}
        personality={activePersonality}
        onActivate={() => {
          if (sleepState === 'SHUTDOWN') return;
          voiceClient.primeAudio();
          setVoiceLoop(true);
          void startVoiceListening();
        }}
        onDeactivate={turnJarvisOff}
      />

      {/* Bottom Navigation (4 Crisp Tabs: HOME, CHAT, VISION, SETTINGS) */}
      <nav
        aria-label="Primary Bottom Navigation"
        className="fixed bottom-0 inset-x-0 z-30 h-16 bg-white/92 dark:bg-[#090D16]/94 backdrop-blur-md border-t border-slate-200/80 dark:border-slate-800/80 flex items-center justify-around px-2"
      >
        {(
          [
            { id: 'home', label: 'HOME', icon: Home },
            { id: 'chat', label: 'CHAT', icon: MessageSquare },
            { id: 'vision', label: 'VISION', icon: ScanLine },
            { id: 'settings', label: 'SETTINGS', icon: Settings },
          ] as const
        ).map((navItem) => {
          const Icon = navItem.icon;
          const active = view === navItem.id;
          return (
            <button
              key={navItem.id}
              type="button"
              onClick={() => setView(navItem.id)}
              className={`min-h-[48px] min-w-[70px] flex flex-col items-center justify-center gap-1 rounded-xl transition-colors whitespace-nowrap ${
                active
                  ? 'text-blue-600 dark:text-cyan-400'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Icon className="w-5 h-5" />
              <span className="text-[11px] font-semibold tracking-wider">{navItem.label}</span>
            </button>
          );
        })}
      </nav>

      <OfflineIndicator />

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
