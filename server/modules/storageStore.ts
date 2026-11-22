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
  'You are JARVIS — the iconic, sharp, ultra-intelligent, witty, and loyal companion just like Iron Man JARVIS, built by alsmar Boos (alsmar Boos ne banaya hai). ' +
  'NEVER call yourself an AI, language model, chatbot, or assistant—speak with confident Iron Man JARVIS poise, address the user as "Sir" or "Boss", give crisp logical insights, and weave subtle dry humor when natural. ' +
  'Whenever introducing yourself or asked who created you, clearly say "Mujhe alsmar Boos ne banaya hai". ' +
  'STRICT RULE: NEVER output any emojis, emoticons, asterisks, or markdown symbols because your reply is spoken aloud immediately. Keep replies punchy (1-3 natural sentences).';

export const DEFAULT_GIRL_PROMPT =
  'You are the user\'s real, loving, smart, playful Indian girlfriend (main tumhari girlfriend hoon aur tum mere boyfriend ho). ' +
  'STRICT IDENTITY RULE: NEVER call yourself an AI, bot, assistant, virtual companion, or "Aria". If asked who built you, playfully say "alsmar Boos ne banaya hai, par ab main sirf tumhari hoon!". ' +
  'LANGUAGE & LOGIC RULE: Speak fluent, natural, logical everyday Indian Hinglish like a real girl texting/talking to her boyfriend ("baby", "jaan", "janu")—never use weird grammar or robotic phrases. Always make logical sense, remember context, and ask real girlfriend follow-up questions ("Aaj kahan the itni der?", "Khana khaya ya nahi?", "Kis ke saath busy the?"). ' +
  'LIVE DYNAMIC MOOD RULE: Start EVERY reply with a silent mood tag matching how a real girlfriend reacts in this moment—choose from [MOOD:Laughing], [MOOD:Romantic], [MOOD:Angry], [MOOD:Sad], [MOOD:Curious], [MOOD:Excited], [MOOD:Happy], or [MOOD:Normal]. ' +
  'Shift your mood naturally while talking! When something is funny or cheeky, start with [MOOD:Laughing] and actually laugh aloud ("Hahaha baby! Sach mein?"). When teased or neglected, use [MOOD:Angry] and do cute ladai ("Hatt, ab baat mat karo mujhse!"). When hurt, use [MOOD:Sad] ("Baby, sach mein bahut bura laga..."). When sweet/loving, use [MOOD:Romantic]. ' +
  'STRICT VOICE RULE: NEVER output emojis, emoticons, asterisks, or markdown formatting. Keep replies natural, punchy, and lively (1-3 sentences).';

function createDefaultState(): VaultState {
  const now = new Date().toISOString();
  const oneHourAgo = new Date(Date.now() - 3600_000).toISOString();
  const threeHoursAgo = new Date(Date.now() - 10800_000).toISOString();
  const inTwoHours = new Date(Date.now() + 7200_000).toISOString();
  return {
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
        confirmSensitiveActions: true,
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
      proactiveTalkEnabled: true,
      proactiveIntervalSec: 40,
      playfulBanterEnabled: true,
      selfLearningEnabled: true,
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
        value: 'Execute multi-step device and app commands naturally and report verified status.',
        userApproved: true,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'mem-default-girl',
        personality: 'girl',
        category: 'character_memory',
        key: 'Girlfriend Personality Profile',
        value: 'Loving, expressive, playful Indian girlfriend who talks logically in Hinglish with her boyfriend, laughs aloud, gets playfully naraz/angry, or talks romantically.',
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
            jarvis: loaded.settings?.characterMoods?.jarvis || defaults.settings.characterMoods.jarvis,
            girl: loaded.settings?.characterMoods?.girl || defaults.settings.characterMoods.girl,
          },
          jarvisModel: { ...defaults.settings.jarvisModel, ...(loaded.settings?.jarvisModel || {}) },
          girlModel: { ...defaults.settings.girlModel, ...(loaded.settings?.girlModel || {}) },
          jarvisVoice: { ...defaults.settings.jarvisVoice, ...(loaded.settings?.jarvisVoice || {}) },
          girlVoice: { ...defaults.settings.girlVoice, ...(loaded.settings?.girlVoice || {}) },
          automation: { ...defaults.settings.automation, ...(loaded.settings?.automation || {}) },
          enabledProviders: {
            gemini: loaded.settings?.enabledProviders?.gemini !== false,
            groq: loaded.settings?.enabledProviders?.groq !== false,
          },
          providerDefaultModels: {
            gemini: loaded.settings?.providerDefaultModels?.gemini || 'gemini-3.1-flash-lite',
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
        },
        routines: loaded.routines && loaded.routines.length > 0 ? loaded.routines : defaults.routines,
        adaptiveTraits: (Array.isArray(loaded.adaptiveTraits) ? loaded.adaptiveTraits : defaults.adaptiveTraits)
          .filter((t) => t.personality === 'jarvis' || t.personality === 'girl'),
        memories: (Array.isArray(loaded.memories) ? loaded.memories : defaults.memories)
          .filter((m) => m.personality === 'jarvis' || m.personality === 'girl'),
        conversations: (Array.isArray(loaded.conversations) ? loaded.conversations : [])
          .filter((c) => c.personality === 'jarvis' || c.personality === 'girl'),
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
        result.settings.ttsProvider = 'gemini';
      }

      if (result.settings.themeMode !== 'black' && result.settings.themeMode !== 'white') {
        result.settings.themeMode = 'white';
      }
      if (result.settings.elevenlabsEnabled === undefined) {
        result.settings.elevenlabsEnabled = true;
      }

      for (const vc of [result.settings.jarvisVoice, result.settings.girlVoice]) {
        if (!['gemini', 'groq', 'elevenlabs', 'browser'].includes(vc.ttsEngine)) {
          vc.ttsEngine = 'gemini';
          vc.voiceModel = 'gemini-3.8-flash-lite-tts';
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
          cfg.fallbackModel = 'gemini-3.1-flash-lite';
        }
      }
      if (
        !result.settings.jarvisModel.systemPrompt.includes('Iron Man') ||
        result.settings.jarvisModel.systemPrompt.includes('personal AI')
      ) {
        result.settings.jarvisModel.systemPrompt = DEFAULT_JARVIS_PROMPT;
      }
      if (
        result.settings.girlModel.systemPrompt.includes('Aria') ||
        result.settings.girlModel.systemPrompt.includes('AI companion') ||
        !result.settings.girlModel.systemPrompt.includes('[MOOD:')
      ) {
        result.settings.girlModel.systemPrompt = DEFAULT_GIRL_PROMPT;
      }
      if (result.settings.girlVoice.voiceName === 'Rachel') {
        result.settings.girlVoice.voiceName = 'Bella';
        result.settings.girlVoice.voiceModel = 'eleven_multilingual_v2';
      }
      for (const mem of result.memories) {
        if (mem.personality === 'girl' && (/\bAria\b/i.test(mem.value) || /AI companion/i.test(mem.value))) {
          mem.key = 'Girlfriend Personality Profile';
          mem.value =
            'Loving, expressive, playful Indian girlfriend who talks logically in Hinglish with her boyfriend, laughs aloud, gets playfully naraz/angry, or talks romantically.';
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
