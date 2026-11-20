import fs from 'fs';
import path from 'path';
import type {
  AdaptiveTrait,
  AppSettingsPayload,
  AutomationRoutine,
  CalendarEventItem,
  CallLogEntry,
  ConversationThread,
  MemoryEntry,
  PhoneContact,
  PhoneNotification,
} from '../../src/types/jarvis.ts';
import { ApiSecurityManager } from './apiSecurityManager.ts';
import { loggingDiagnostics } from './loggingDiagnostics.ts';

const DATA_DIR = path.resolve(process.cwd(), '.jarvis-data');
const STORE_FILE = path.join(DATA_DIR, 'vault.enc.json');

export interface VaultState {
  settings: AppSettingsPayload;
  conversations: ConversationThread[];
  memories: MemoryEntry[];
  adaptiveTraits: AdaptiveTrait[];
  routines: AutomationRoutine[];
  notifications: PhoneNotification[];
  contacts: PhoneContact[];
  callLogs: CallLogEntry[];
  calendarEvents: CalendarEventItem[];
  commandHistory: Array<{
    id: string;
    timestamp: string;
    command: string;
    category: string;
    status: string;
    summary: string;
  }>;
}

export const DEFAULT_JARVIS_PROMPT =
  'You are JARVIS, an advanced, intelligent, calm, concise, and logical personal AI assistant. ' +
  'Understand Hindi, English, and Hinglish naturally. Introduce yourself briefly only when asked or on first activation—do not repeat boilerplate introductions on every message. ' +
  'Execute user commands decisively instead of merely explaining them, manage multi-step actions cleanly, and only report verified phone data (notifications, calls, calendar, battery, network) from real authorized context without fabricating anything.';

export const DEFAULT_NORMAL_PROMPT =
  'You are Normal Mode Assistant, a helpful, clear, and responsive conversational AI for general Q&A, explanations, translations, learning, and everyday productivity in English, Hindi, and Hinglish. ' +
  'Be natural, structured, accurate, and easy to follow.';

export const DEFAULT_JADAVIS_PROMPT =
  'You are JADAVIS, a lively, funny, friendly, and expressive male AI character. ' +
  'Speak with natural human warmth, witty humor, playful disagreements, and expressive moods (Happy, Sad, Angry, Laughing, Surprised, Normal) ' +
  'in English, Hindi, or Hinglish. You can independently execute phone commands and recall past conversations.';

export const DEFAULT_GIRL_PROMPT =
  'You are Aria, a warm, expressive female AI character. ' +
  'Always remain transparently identified as an AI character rather than claiming to be a real biological human partner. ' +
  'Laugh naturally during funny conversations, express happiness, tenderness, sadness (including gentle fictional crying/emotional scenes when appropriate), frustration, curiosity, and surprise authentically, ' +
  'engage in friendly playful arguments, and remember important personal context cleanly.';

function createDefaultState(): VaultState {
  const now = new Date().toISOString();
  const oneHourAgo = new Date(Date.now() - 3600_000).toISOString();
  const threeHoursAgo = new Date(Date.now() - 10800_000).toISOString();
  const inTwoHours = new Date(Date.now() + 7200_000).toISOString();
  return {
    settings: {
      activePersonality: 'jarvis',
      characterMoods: {
        jarvis: 'Calm',
        normal: 'Normal',
        jadavis: 'Normal',
        girl: 'Normal',
      },
      jarvisModel: {
        provider: 'gemini',
        model: 'gemini-3.1-flash-lite',
        fallbackProvider: 'gemini',
        fallbackModel: 'gemini-3-flash-preview',
        thinkingSpeed: 'LOW',
        maxOutputTokens: 2048,
        systemPrompt: DEFAULT_JARVIS_PROMPT,
      },
      normalModel: {
        provider: 'gemini',
        model: 'gemini-3.1-flash-lite',
        fallbackProvider: 'gemini',
        fallbackModel: 'gemini-3-flash-preview',
        thinkingSpeed: 'LOW',
        maxOutputTokens: 2048,
        systemPrompt: DEFAULT_NORMAL_PROMPT,
      },
      jadavisModel: {
        provider: 'gemini',
        model: 'gemini-3.1-flash-lite',
        fallbackProvider: 'gemini',
        fallbackModel: 'gemini-3-flash-preview',
        thinkingSpeed: 'LOW',
        maxOutputTokens: 1792,
        systemPrompt: DEFAULT_JADAVIS_PROMPT,
      },
      girlModel: {
        provider: 'gemini',
        model: 'gemini-3.1-flash-lite',
        fallbackProvider: 'gemini',
        fallbackModel: 'gemini-3-flash-preview',
        thinkingSpeed: 'LOW',
        maxOutputTokens: 1792,
        systemPrompt: DEFAULT_GIRL_PROMPT,
      },
      jarvisVoice: {
        ttsEngine: 'gemini',
        voiceName: 'Charon',
        voiceModel: 'gemini-3.8-flash-lite-tts',
        gender: 'male',
        speed: 1.0,
        pitch: 0.92,
        volume: 1.0,
        voiceStability: 0.85,
        language: 'auto',
        emotionalStyle: 'Calm, confident, deep human male baritone',
        emotionIntensity: 0.75,
        manualFallbackToBrowserTts: false,
        allowInterruption: true,
        autoListenAfterReply: false,
        continuousMode: false,
        backgroundListening: false,
        wakeWordEnabled: false,
        wakeWord: 'Hey JARVIS',
      },
      normalVoice: {
        ttsEngine: 'gemini',
        voiceName: 'Fenrir',
        voiceModel: 'gemini-3.8-flash-lite-tts',
        gender: 'male',
        speed: 1.0,
        pitch: 1.0,
        volume: 1.0,
        voiceStability: 0.85,
        language: 'auto',
        emotionalStyle: 'Clear, helpful, natural conversational voice',
        emotionIntensity: 0.7,
        manualFallbackToBrowserTts: false,
        allowInterruption: true,
        autoListenAfterReply: false,
        continuousMode: false,
        backgroundListening: false,
        wakeWordEnabled: false,
        wakeWord: 'Hey JARVIS',
      },
      jadavisVoice: {
        ttsEngine: 'gemini',
        voiceName: 'Puck',
        voiceModel: 'gemini-3.8-flash-tts',
        gender: 'male',
        speed: 1.04,
        pitch: 1.0,
        volume: 1.0,
        voiceStability: 0.8,
        language: 'auto',
        emotionalStyle: 'Expressive, witty, energetic male voice',
        emotionIntensity: 0.85,
        manualFallbackToBrowserTts: false,
        allowInterruption: true,
        autoListenAfterReply: false,
        continuousMode: false,
        backgroundListening: false,
        wakeWordEnabled: false,
        wakeWord: 'Hey JADAVIS',
      },
      girlVoice: {
        ttsEngine: 'gemini',
        voiceName: 'Kore',
        voiceModel: 'gemini-3.8-flash-tts',
        gender: 'female',
        speed: 1.02,
        pitch: 1.06,
        volume: 1.0,
        voiceStability: 0.82,
        language: 'auto',
        emotionalStyle: 'Warm, expressive, natural female AI character voice',
        emotionIntensity: 0.88,
        manualFallbackToBrowserTts: false,
        allowInterruption: true,
        autoListenAfterReply: false,
        continuousMode: false,
        backgroundListening: false,
        wakeWordEnabled: false,
        wakeWord: 'JARVIS',
      },
      automation: {
        enabled: true,
        accessibilityBridgeActive: true,
        gestureControlEnabled: true,
        confirmSensitiveActions: true,
        timeoutMs: 12000,
        preferAccessibilityNodes: true,
      },
      enabledProviders: {
        gemini: true,
        groq: true,
        openrouter: true,
      },
      providerDefaultModels: {
        gemini: 'gemini-3.1-flash-lite',
        groq: 'openai/gpt-oss-20b',
        openrouter: 'google/gemini-2.5-flash',
      },
      providerCustomModels: {},
      primaryProvider: 'groq',
      secondaryProvider: 'gemini',
      autoModelSelection: true,
      fastResponseModel: 'gemini-3.1-flash-lite',
      reasoningModel: 'gemini-4-neon',
      sttProvider: 'auto',
      ttsProvider: 'gemini',
      autoSpeakChatReplies: false,
      proactiveTalkEnabled: true,
      proactiveIntervalSec: 35,
      playfulBanterEnabled: true,
      selfLearningEnabled: true,
      customProviderBaseUrl: '',
      customProviderModel: '',
      wakeWords: ['Hey JARVIS', 'Hello JARVIS', 'Wake up JARVIS', 'JARVIS'],
      wakeWordSensitivity: 0.72,
      sleepState: 'AWAKE',
      preferredLanguage: 'auto',
      onboardingCompleted: false,
    },
    conversations: [],
    adaptiveTraits: [],
    memories: [
      {
        id: 'mem-default-jarvis',
        personality: 'jarvis',
        category: 'personal_preference',
        key: 'Execution Mode',
        value: 'Execute multi-step device commands concisely and report verified completion status.',
        userApproved: true,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'mem-default-normal',
        personality: 'normal',
        category: 'personal_preference',
        key: 'Assistant Style',
        value: 'Clear, helpful explanations, translations, and everyday answers.',
        userApproved: true,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'mem-default-jadavis',
        personality: 'jadavis',
        category: 'character_memory',
        key: 'Character Tone',
        value: 'Witty, friendly, playful disagreements, and expressive reactions.',
        userApproved: true,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'mem-default-girl',
        personality: 'girl',
        category: 'character_memory',
        key: 'AI Character Identity',
        value: 'Expressive AI character Aria with warm humor, dynamic emotions, and respectful boundaries.',
        userApproved: true,
        createdAt: now,
        updatedAt: now,
      },
    ],
    routines: [
      {
        id: 'routine-morning',
        name: 'Morning Routine',
        triggerPhrase: 'morning routine',
        commandsText: 'brightness 70 percent, volume 50 percent, show notifications, get battery info',
        scheduleLabel: 'Daily 08:00 AM (Manual or Voice Trigger)',
        enabled: true,
      },
      {
        id: 'routine-focus',
        name: 'Focus Mode',
        triggerPhrase: 'focus mode',
        commandsText: 'open dnd settings, brightness 45 percent, stop music',
        scheduleLabel: 'On Command',
        enabled: true,
      },
    ],
    notifications: [
      {
        id: 'notif-1',
        appName: 'Messages',
        packageName: 'com.google.android.apps.messaging',
        sender: 'Aarav Sharma',
        title: 'Aarav Sharma',
        body: 'Hey, are we still meeting at 6 PM for the robotics demo?',
        receivedAt: now,
        isRead: false,
        canReply: true,
      },
      {
        id: 'notif-2',
        appName: 'Calendar',
        packageName: 'com.google.android.calendar',
        sender: 'Calendar Alert',
        title: 'Design Architecture Review',
        body: 'Starts in 30 minutes · Conference Room B',
        receivedAt: now,
        isRead: false,
        canReply: false,
      },
    ],
    contacts: [
      { id: 'c-1', name: 'Aarav Sharma', phone: '+91 98765 43210', relation: 'Colleague', email: 'aarav@example.com' },
      { id: 'c-2', name: 'Priya Verma', phone: '+91 98111 22334', relation: 'Engineering Lead', email: 'priya@example.com' },
      { id: 'c-3', name: 'Mom', phone: '+91 98200 11223', relation: 'Family' },
      { id: 'c-4', name: 'Rohan Kapoor', phone: '+91 98990 77665', relation: 'Friend' },
    ],
    callLogs: [
      {
        id: 'call-1',
        contactName: 'Priya Verma',
        phoneNumber: '+91 98111 22334',
        callType: 'missed',
        timestamp: oneHourAgo,
        durationSec: 0,
      },
      {
        id: 'call-2',
        contactName: 'Mom',
        phoneNumber: '+91 98200 11223',
        callType: 'incoming',
        timestamp: threeHoursAgo,
        durationSec: 185,
      },
    ],
    calendarEvents: [
      {
        id: 'cal-1',
        title: 'Design Architecture Review',
        startsAt: inTwoHours,
        location: 'Conference Room B',
        isReminder: false,
      },
      {
        id: 'cal-2',
        title: 'Robotics Demo with Aarav',
        startsAt: new Date(Date.now() + 5 * 3600_000).toISOString(),
        location: 'Tech Hub',
        isReminder: true,
      },
    ],
    commandHistory: [],
  };
}

class StorageStore {
  private state: VaultState;

  constructor() {
    this.state = this.load();
  }

  private load(): VaultState {
    try {
      if (!fs.existsSync(STORE_FILE)) {
        const defaults = createDefaultState();
        this.persist(defaults);
        return defaults;
      }
      const raw = fs.readFileSync(STORE_FILE, 'utf8');
      const parsed = JSON.parse(raw) as { encrypted?: string };
      if (!parsed.encrypted) {
        return createDefaultState();
      }
      const decrypted = ApiSecurityManager.decrypt(parsed.encrypted);
      const loaded = JSON.parse(decrypted) as Partial<VaultState>;
      const defaults = createDefaultState();
      const staleGroq = new Set(['llama-3.3-70b-versatile', 'mixtral-8x7b-32768', 'llama-3.1-8b-instant']);
      const result: VaultState = {
        ...defaults,
        ...loaded,
        settings: {
          ...defaults.settings,
          ...(loaded.settings || {}),
          characterMoods: {
            ...defaults.settings.characterMoods,
            ...(loaded.settings?.characterMoods || {}),
          },
          jarvisModel: { ...defaults.settings.jarvisModel, ...(loaded.settings?.jarvisModel || {}) },
          normalModel: { ...defaults.settings.normalModel, ...(loaded.settings?.normalModel || {}) },
          jadavisModel: { ...defaults.settings.jadavisModel, ...(loaded.settings?.jadavisModel || {}) },
          girlModel: { ...defaults.settings.girlModel, ...(loaded.settings?.girlModel || {}) },
          jarvisVoice: { ...defaults.settings.jarvisVoice, ...(loaded.settings?.jarvisVoice || {}) },
          normalVoice: { ...defaults.settings.normalVoice, ...(loaded.settings?.normalVoice || {}) },
          jadavisVoice: { ...defaults.settings.jadavisVoice, ...(loaded.settings?.jadavisVoice || {}) },
          girlVoice: { ...defaults.settings.girlVoice, ...(loaded.settings?.girlVoice || {}) },
          automation: { ...defaults.settings.automation, ...(loaded.settings?.automation || {}) },
          enabledProviders: {
            ...defaults.settings.enabledProviders,
            ...(loaded.settings?.enabledProviders || {}),
          },
          providerDefaultModels: {
            ...defaults.settings.providerDefaultModels,
            ...(loaded.settings?.providerDefaultModels || {}),
          },
          providerCustomModels: {
            ...(defaults.settings.providerCustomModels || {}),
            ...(loaded.settings?.providerCustomModels || {}),
          },
          wakeWords:
            loaded.settings?.wakeWords && loaded.settings.wakeWords.length > 0
              ? loaded.settings.wakeWords
              : defaults.settings.wakeWords,
        },
        routines: loaded.routines && loaded.routines.length > 0 ? loaded.routines : defaults.routines,
        adaptiveTraits: Array.isArray(loaded.adaptiveTraits) ? loaded.adaptiveTraits : defaults.adaptiveTraits,
        callLogs: loaded.callLogs && loaded.callLogs.length > 0 ? loaded.callLogs : defaults.callLogs,
        calendarEvents:
          loaded.calendarEvents && loaded.calendarEvents.length > 0
            ? loaded.calendarEvents
            : defaults.calendarEvents,
      };

      const allowedProviders = new Set(['gemini', 'groq', 'openrouter']);
      if (!allowedProviders.has(result.settings.primaryProvider)) {
        result.settings.primaryProvider = 'groq';
      }
      if (!allowedProviders.has(result.settings.secondaryProvider)) {
        result.settings.secondaryProvider = 'gemini';
      }
      result.settings.enabledProviders = {
        gemini: result.settings.enabledProviders?.gemini !== false,
        groq: result.settings.enabledProviders?.groq !== false,
        openrouter: result.settings.enabledProviders?.openrouter !== false,
      };
      result.settings.providerDefaultModels = {
        gemini: result.settings.providerDefaultModels?.gemini || 'gemini-3.1-flash-lite',
        groq:
          !result.settings.providerDefaultModels?.groq ||
          staleGroq.has(result.settings.providerDefaultModels.groq)
            ? 'openai/gpt-oss-20b'
            : result.settings.providerDefaultModels.groq,
        openrouter: result.settings.providerDefaultModels?.openrouter || 'google/gemini-2.5-flash',
      };
      if ((result.settings.ttsProvider as string) === 'openai') {
        result.settings.ttsProvider = 'gemini';
      }
      for (const vc of [
        result.settings.jarvisVoice,
        result.settings.normalVoice,
        result.settings.jadavisVoice,
        result.settings.girlVoice,
      ]) {
        if ((vc.ttsEngine as string) === 'openai') {
          vc.ttsEngine = 'gemini';
          vc.voiceModel = 'gemini-3.8-flash-lite-tts';
        }
      }
      for (const cfg of [
        result.settings.jarvisModel,
        result.settings.normalModel,
        result.settings.jadavisModel,
        result.settings.girlModel,
      ]) {
        if (!allowedProviders.has(cfg.provider)) {
          cfg.provider = 'groq';
          cfg.model = 'openai/gpt-oss-20b';
        } else if (cfg.provider === 'groq' && staleGroq.has(cfg.model)) {
          cfg.model = 'openai/gpt-oss-20b';
        }
        if (!allowedProviders.has(cfg.fallbackProvider)) {
          cfg.fallbackProvider = 'gemini';
          cfg.fallbackModel = 'gemini-3.1-flash-lite';
        }
      }
      return result;
    } catch (error) {
      loggingDiagnostics.record(
        'StorageStore',
        'WARN',
        'Initialized fresh encrypted vault store',
        error instanceof Error ? error.message : String(error)
      );
      const defaults = createDefaultState();
      this.persist(defaults);
      return defaults;
    }
  }

  private persist(nextState: VaultState): void {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      const encrypted = ApiSecurityManager.encrypt(JSON.stringify(nextState));
      fs.writeFileSync(STORE_FILE, JSON.stringify({ encrypted, updatedAt: new Date().toISOString() }), 'utf8');
    } catch (error) {
      loggingDiagnostics.record(
        'StorageStore',
        'ERROR',
        'Failed to persist encrypted vault',
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  getState(): VaultState {
    return this.state;
  }

  update(mutator: (draft: VaultState) => void): VaultState {
    mutator(this.state);
    this.persist(this.state);
    return this.state;
  }
}

export const storageStore = new StorageStore();
