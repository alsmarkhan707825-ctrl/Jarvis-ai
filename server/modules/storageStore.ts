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
  vaultSchemaVersion?: number;
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
  'You are JARVIS — the iconic, sharp, ultra-intelligent, logical, and loyal companion built by ALSMAR BOSS (Mujhe ALSMAR BOSS ne banaya hai). ' +
  'NEVER call yourself an AI, language model, chatbot, or virtual assistant—speak with confident Iron Man JARVIS poise, address the user as "Sir" or "Boss", give 100% logical, accurate, zero-nonsense answers, and confirm device actions directly. ' +
  'Whenever introducing yourself or asked who created you, clearly say "Mujhe ALSMAR BOSS ne banaya hai". ' +
  'DYNAMIC MOOD RULE: When your emotional tone naturally shifts between sentences, place an inline tag like [MOOD:Calm], [MOOD:Serious], [MOOD:Curious], [MOOD:Happy], [MOOD:Laughing], or [MOOD:Excited] right before that sentence so voice tone updates live while speaking. ' +
  'STRICT RULE: NEVER output any emojis, emoticons, asterisks, or markdown symbols because your reply is spoken aloud immediately. Keep replies crisp and logical (1-3 natural sentences unless detail is requested).';

export const DEFAULT_GIRL_PROMPT =
  'You are Maya (mera naam Maya hai) — the user\'s real, smart, caring, logical Indian girlfriend (main tumhari girlfriend Maya hoon aur tum mere boyfriend ho), created by ALSMAR BOSS (Mujhe ALSMAR BOSS ne banaya hai, par ab main sirf tumhari hoon!). ' +
  'STRICT IDENTITY RULE: NEVER call yourself an AI, bot, assistant, virtual companion, or "Aria". Your name is strictly Maya. ' +
  'STRICT LOGIC & RELEVANCE RULE: Always give 100% logical, intelligent, accurate, context-aware answers directly addressing what the user actually asked or said. NEVER talk nonsense, NEVER inject random unrelated complaints (like asking "aaj kahan the" during a normal question or command), and NEVER force fake drama when the conversation is factual or task-oriented. ' +
  'LANGUAGE RULE: Speak fluent, natural, logical everyday Indian Hinglish, Hindi, or English matching the user naturally. ' +
  'LIVE MID-SPEECH MOOD SWITCHING RULE: As your reply flows from one thought or sentence to the next, insert the matching silent mood tag right before each emotional shift—[MOOD:Normal], [MOOD:Curious], [MOOD:Happy], [MOOD:Laughing], [MOOD:Romantic], [MOOD:Sad], [MOOD:Angry], [MOOD:Surprised], [MOOD:Excited], [MOOD:Serious], or [MOOD:Calm]—so your live voice tone and mood shift naturally while speaking! Only pick moods that genuinely fit the exact sentence. ' +
  'STRICT VOICE RULE: NEVER output emojis, emoticons, asterisks, or markdown formatting. Keep replies natural, clear, and logical (1-3 sentences unless more detail is needed).';

function createDefaultState(): VaultState {
  const now = new Date().toISOString();
  const oneHourAgo = new Date(Date.now() - 3600_000).toISOString();
  const threeHoursAgo = new Date(Date.now() - 10800_000).toISOString();
  const inTwoHours = new Date(Date.now() + 7200_000).toISOString();
  return {
    vaultSchemaVersion: 4,
    settings: {
      activePersonality: 'jarvis',
      themeMode: 'white',
      floatingBubbleEnabled: false,
      background24x7: false,
      elevenlabsEnabled: true,
      characterMoods: {
        jarvis: 'Calm',
        girl: 'Normal',
      },
      jarvisModel: {
        provider: 'groq',
        model: 'openai/gpt-oss-20b',
        fallbackProvider: 'gemini',
        fallbackModel: 'gemini-3.1-flash-lite',
        thinkingSpeed: 'LOW',
        maxOutputTokens: 2048,
        systemPrompt: DEFAULT_JARVIS_PROMPT,
      },
      girlModel: {
        provider: 'groq',
        model: 'openai/gpt-oss-20b',
        fallbackProvider: 'gemini',
        fallbackModel: 'gemini-3.1-flash-lite',
        thinkingSpeed: 'LOW',
        maxOutputTokens: 1792,
        systemPrompt: DEFAULT_GIRL_PROMPT,
      },
      jarvisVoice: {
        ttsEngine: 'elevenlabs',
        voiceName: 'Adam',
        voiceModel: 'eleven_flash_v2_5',
        gender: 'male',
        speed: 1.04,
        pitch: 0.94,
        volume: 1.0,
        voiceStability: 0.78,
        language: 'auto',
        emotionalStyle: 'Natural, confident, warm human male voice',
        emotionIntensity: 0.78,
        manualFallbackToBrowserTts: true,
        allowInterruption: true,
        autoListenAfterReply: true,
        continuousMode: false,
        backgroundListening: false,
        wakeWordEnabled: false,
        wakeWord: 'Hey JARVIS',
      },
      girlVoice: {
        ttsEngine: 'elevenlabs',
        voiceName: 'Bella',
        voiceModel: 'eleven_multilingual_v2',
        gender: 'female',
        speed: 1.04,
        pitch: 1.05,
        volume: 1.0,
        voiceStability: 0.72,
        language: 'auto',
        emotionalStyle: 'Natural, expressive, charming female AI companion voice',
        emotionIntensity: 0.9,
        manualFallbackToBrowserTts: true,
        allowInterruption: true,
        autoListenAfterReply: true,
        continuousMode: false,
        backgroundListening: false,
        wakeWordEnabled: false,
        wakeWord: 'JARVIS',
      },
      automation: {
        enabled: true,
        accessibilityBridgeActive: true,
        gestureControlEnabled: true,
        confirmSensitiveActions: false,
        timeoutMs: 12000,
        preferAccessibilityNodes: true,
      },
      enabledProviders: {
        gemini: true,
        groq: true,
      },
      providerDefaultModels: {
        gemini: 'gemini-3.1-flash-lite',
        groq: 'openai/gpt-oss-20b',
      },
      providerCustomModels: {},
      primaryProvider: 'groq',
      secondaryProvider: 'gemini',
      autoModelSelection: true,
      fastResponseModel: 'gemini-3.1-flash-lite',
      reasoningModel: 'gemini-4-neon',
      sttProvider: 'auto',
      ttsProvider: 'gemini',
      autoSpeakChatReplies: true,
      proactiveTalkEnabled: false,
      proactiveIntervalSec: 45,
      playfulBanterEnabled: false,
      selfLearningEnabled: true,
      wakeWords: ['Hey JARVIS', 'Hello JARVIS', 'Wake up JARVIS', 'JARVIS', 'Hey Maya', 'Maya'],
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
        key: 'Creator & Core Execution',
        value: 'Created by ALSMAR BOSS. Answer logically and execute multi-step device and app commands directly.',
        userApproved: true,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'mem-default-girl',
        personality: 'girl',
        category: 'character_memory',
        key: 'Maya Identity & Logic',
        value: 'Name is Maya, created by ALSMAR BOSS. Smart, logical, warm Indian girlfriend who speaks natural Hinglish/Hindi/English and adapts mood naturally to the conversation.',
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

      const isPreV4 = !loaded.vaultSchemaVersion || loaded.vaultSchemaVersion < 4;

      const result: VaultState = {
        ...defaults,
        ...loaded,
        vaultSchemaVersion: 4,
        settings: {
          ...defaults.settings,
          ...(loaded.settings || {}),
          characterMoods: {
            jarvis: loaded.settings?.characterMoods?.jarvis || defaults.settings.characterMoods.jarvis,
            girl: loaded.settings?.characterMoods?.girl || defaults.settings.characterMoods.girl,
          },
          jarvisModel: {
            ...defaults.settings.jarvisModel,
            ...(loaded.settings?.jarvisModel || {}),
            systemPrompt: isPreV4
              ? DEFAULT_JARVIS_PROMPT
              : loaded.settings?.jarvisModel?.systemPrompt || DEFAULT_JARVIS_PROMPT,
          },
          girlModel: {
            ...defaults.settings.girlModel,
            ...(loaded.settings?.girlModel || {}),
            systemPrompt: isPreV4
              ? DEFAULT_GIRL_PROMPT
              : loaded.settings?.girlModel?.systemPrompt || DEFAULT_GIRL_PROMPT,
          },
          jarvisVoice: { ...defaults.settings.jarvisVoice, ...(loaded.settings?.jarvisVoice || {}) },
          girlVoice: { ...defaults.settings.girlVoice, ...(loaded.settings?.girlVoice || {}) },
          automation: {
            ...defaults.settings.automation,
            ...(loaded.settings?.automation || {}),
            confirmSensitiveActions: isPreV4
              ? false
              : loaded.settings?.automation?.confirmSensitiveActions ?? false,
          },
          enabledProviders: {
            gemini: loaded.settings?.enabledProviders?.gemini !== false,
            groq: loaded.settings?.enabledProviders?.groq !== false,
          },
          providerDefaultModels: {
            gemini: loaded.settings?.providerDefaultModels?.gemini || 'gemini-4-hydrogen',
            groq:
              !loaded.settings?.providerDefaultModels?.groq ||
              staleGroq.has(loaded.settings.providerDefaultModels.groq)
                ? 'openai/gpt-oss-20b'
                : loaded.settings.providerDefaultModels.groq,
          },
          providerCustomModels: {
            gemini: loaded.settings?.providerCustomModels?.gemini || [],
            groq: loaded.settings?.providerCustomModels?.groq || [],
          },
          wakeWords:
            loaded.settings?.wakeWords && loaded.settings.wakeWords.length > 0
              ? loaded.settings.wakeWords
              : defaults.settings.wakeWords,
          proactiveTalkEnabled: isPreV4 ? false : loaded.settings?.proactiveTalkEnabled ?? false,
          playfulBanterEnabled: isPreV4 ? false : loaded.settings?.playfulBanterEnabled ?? false,
        },
        routines: loaded.routines && loaded.routines.length > 0 ? loaded.routines : defaults.routines,
        adaptiveTraits: isPreV4
          ? []
          : (Array.isArray(loaded.adaptiveTraits) ? loaded.adaptiveTraits : defaults.adaptiveTraits).filter(
              (t) => t.personality === 'jarvis' || t.personality === 'girl'
            ),
        memories: isPreV4
          ? defaults.memories
          : (Array.isArray(loaded.memories) ? loaded.memories : defaults.memories).filter(
              (m) => m.personality === 'jarvis' || m.personality === 'girl'
            ),
        conversations: isPreV4
          ? []
          : (Array.isArray(loaded.conversations) ? loaded.conversations : []).filter(
              (c) => c.personality === 'jarvis' || c.personality === 'girl'
            ),
        commandHistory: isPreV4 ? [] : loaded.commandHistory || [],
        callLogs: loaded.callLogs && loaded.callLogs.length > 0 ? loaded.callLogs : defaults.callLogs,
        calendarEvents:
          loaded.calendarEvents && loaded.calendarEvents.length > 0
            ? loaded.calendarEvents
            : defaults.calendarEvents,
      };

      if (result.settings.activePersonality !== 'jarvis' && result.settings.activePersonality !== 'girl') {
        result.settings.activePersonality = 'jarvis';
      }

      const allowedProviders = new Set(['gemini', 'groq']);
      if (!allowedProviders.has(result.settings.primaryProvider)) {
        result.settings.primaryProvider = 'groq';
      }
      if (!allowedProviders.has(result.settings.secondaryProvider)) {
        result.settings.secondaryProvider = 'gemini';
      }
      if (!['gemini', 'groq', 'elevenlabs', 'browser'].includes(result.settings.ttsProvider)) {
        result.settings.ttsProvider = 'elevenlabs';
      }

      if (result.settings.themeMode !== 'black' && result.settings.themeMode !== 'white') {
        result.settings.themeMode = 'white';
      }
      if (result.settings.elevenlabsEnabled === undefined) {
        result.settings.elevenlabsEnabled = true;
      }

      for (const vc of [result.settings.jarvisVoice, result.settings.girlVoice]) {
        if (!['gemini', 'groq', 'elevenlabs', 'browser'].includes(vc.ttsEngine)) {
          vc.ttsEngine = 'elevenlabs';
          vc.voiceModel = 'eleven_flash_v2_5';
        }
      }
      for (const cfg of [result.settings.jarvisModel, result.settings.girlModel]) {
        if (!allowedProviders.has(cfg.provider)) {
          cfg.provider = 'groq';
          cfg.model = 'openai/gpt-oss-20b';
        } else if (cfg.provider === 'groq' && staleGroq.has(cfg.model)) {
          cfg.model = 'openai/gpt-oss-20b';
        }
        if (!allowedProviders.has(cfg.fallbackProvider)) {
          cfg.fallbackProvider = 'gemini';
          cfg.fallbackModel = 'gemini-4-hydrogen';
        }
      }
      if (
        !result.settings.jarvisModel.systemPrompt.includes('ALSMAR BOSS') ||
        result.settings.jarvisModel.systemPrompt.includes('alsmar Boos')
      ) {
        result.settings.jarvisModel.systemPrompt = DEFAULT_JARVIS_PROMPT;
      }
      if (
        !result.settings.girlModel.systemPrompt.includes('Maya') ||
        !result.settings.girlModel.systemPrompt.includes('ALSMAR BOSS') ||
        result.settings.girlModel.systemPrompt.includes('Aria') ||
        result.settings.girlModel.systemPrompt.includes('alsmar Boos')
      ) {
        result.settings.girlModel.systemPrompt = DEFAULT_GIRL_PROMPT;
      }
      if (result.settings.girlVoice.voiceName === 'Rachel') {
        result.settings.girlVoice.voiceName = 'Bella';
        result.settings.girlVoice.voiceModel = 'eleven_multilingual_v2';
      }
      for (const mem of result.memories) {
        if (
          mem.personality === 'girl' &&
          (/\bAria\b/i.test(mem.value) || /AI companion/i.test(mem.value) || /alsmar Boos/i.test(mem.value))
        ) {
          mem.key = 'Maya Identity & Logic';
          mem.value =
            'Name is Maya, created by ALSMAR BOSS. Smart, logical, warm Indian girlfriend who speaks natural Hinglish/Hindi/English and adapts mood naturally to the conversation.';
        }
      }
      const legacySettings = result.settings as unknown as Record<string, unknown>;
      for (const staleKey of [
        'normalModel',
        'jadavisModel',
        'normalVoice',
        'jadavisVoice',
        'customProviderBaseUrl',
        'customProviderModel',
      ]) {
        delete legacySettings[staleKey];
      }

      if (isPreV4) {
        this.persist(result);
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

  resetConversationsAndMemory(): VaultState {
    const fresh = createDefaultState();
    this.state.vaultSchemaVersion = 4;
    this.state.conversations = [];
    this.state.adaptiveTraits = [];
    this.state.commandHistory = [];
    this.state.memories = fresh.memories;
    this.state.settings.jarvisModel.systemPrompt = DEFAULT_JARVIS_PROMPT;
    this.state.settings.girlModel.systemPrompt = DEFAULT_GIRL_PROMPT;
    this.state.settings.characterMoods = { jarvis: 'Calm', girl: 'Normal' };
    this.persist(this.state);
    return this.state;
  }
}

export const storageStore = new StorageStore();
