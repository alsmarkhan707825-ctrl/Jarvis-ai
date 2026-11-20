export type PersonalityId = 'jarvis' | 'normal' | 'jadavis' | 'girl';

export type SleepModeState = 'AWAKE' | 'SLEEPING' | 'SHUTDOWN';

export type SttProviderId = 'auto' | 'browser' | 'gemini' | 'groq';

export type TtsEngineId = 'gemini' | 'elevenlabs' | 'browser';

export type EmotionType =
  | 'Normal'
  | 'Happy'
  | 'Sad'
  | 'Angry'
  | 'Laughing'
  | 'Curious'
  | 'Surprised'
  | 'Excited'
  | 'Serious'
  | 'Calm';

export type OrbState = 'IDLE' | 'LISTENING' | 'THINKING' | 'SPEAKING' | 'ERROR' | 'TOUCH';

export type ProviderId = 'gemini' | 'groq' | 'openrouter';

export interface AppControlDirective {
  switchPersonality?: PersonalityId;
  setMood?: EmotionType;
  proactiveTalkEnabled?: boolean;
  playfulBanterEnabled?: boolean;
  autoModelSelection?: boolean;
  autoSpeakChatReplies?: boolean;
  primaryProvider?: ProviderId;
  ttsEngine?: TtsEngineId;
  navigateView?: 'home' | 'vision' | 'history' | 'settings';
  clearChat?: boolean;
  summaryNotes: string[];
}

export type PermissionStatus =
  | 'ALLOWED'
  | 'NOT_ALLOWED'
  | 'RESTRICTED'
  | 'NOT_AVAILABLE';

export type IntentCategory =
  | 'phone_control'
  | 'system_settings'
  | 'search'
  | 'communication'
  | 'information'
  | 'app_navigation'
  | 'vision'
  | 'routine'
  | 'conversation'
  | 'media_control';

export type ThinkingSpeed = 'LOW' | 'MEDIUM' | 'HIGH';

export interface ModelOption {
  id: string;
  label: string;
  provider: ProviderId;
  supportsStreaming: boolean;
  supportsThinking?: boolean;
  contextWindow?: string;
}

export interface ProviderInfo {
  id: string;
  name: string;
  envKeyName?: string;
  configured: boolean;
  enabled?: boolean;
  selectedModel?: string;
  status: 'CONNECTED' | 'ENV_KEY_MISSING' | 'ERROR' | 'UNTESTED' | 'DISABLED';
  lastTestedAt?: string;
  lastLatencyMs?: number;
  errorMessage?: string;
  supportsLiveModelFetch: boolean;
  baseUrl?: string;
  models: ModelOption[];
}

export interface PersonalityModelConfig {
  provider: ProviderId;
  model: string;
  fallbackProvider: ProviderId;
  fallbackModel: string;
  thinkingSpeed: ThinkingSpeed;
  maxOutputTokens: number;
  systemPrompt: string;
}

export type VoicePersonaName =
  | 'Charon'
  | 'Fenrir'
  | 'Puck'
  | 'Kore'
  | 'Zephyr'
  | 'Adam'
  | 'Antoni'
  | 'Josh'
  | 'Rachel'
  | 'Bella'
  | string;

export interface VoiceSettings {
  ttsEngine: TtsEngineId;
  voiceName: VoicePersonaName;
  voiceModel: string;
  gender: 'male' | 'female';
  speed: number;
  pitch: number;
  volume: number;
  voiceStability: number;
  language: 'auto' | 'en-US' | 'en-IN' | 'hi-IN';
  emotionalStyle: string;
  emotionIntensity: number;
  manualFallbackToBrowserTts: boolean;
  allowInterruption: boolean;
  autoListenAfterReply: boolean;
  continuousMode: boolean;
  backgroundListening: boolean;
  wakeWordEnabled: boolean;
  wakeWord: string;
}

export interface AutomationSettings {
  enabled: boolean;
  accessibilityBridgeActive: boolean;
  gestureControlEnabled: boolean;
  confirmSensitiveActions: boolean;
  timeoutMs: number;
  preferAccessibilityNodes: boolean;
}

export interface AutomationRoutine {
  id: string;
  name: string;
  triggerPhrase: string;
  commandsText: string;
  scheduleLabel?: string;
  enabled: boolean;
  lastRunAt?: string;
}

export type AutomationActionType =
  | 'open_app'
  | 'switch_app'
  | 'open_deep_link'
  | 'tap'
  | 'double_tap'
  | 'long_press'
  | 'swipe_up'
  | 'swipe_down'
  | 'swipe_left'
  | 'swipe_right'
  | 'scroll'
  | 'micro_scroll_down'
  | 'micro_scroll_up'
  | 'scroll_hold'
  | 'back'
  | 'home'
  | 'recent_apps'
  | 'lock_device'
  | 'sleep_mode'
  | 'shutdown_mode'
  | 'phone_intelligence'
  | 'click_button'
  | 'read_ui_text'
  | 'enter_text'
  | 'submit_done'
  | 'send_action'
  | 'copy_paste'
  | 'play_media'
  | 'pause_media'
  | 'stop_media'
  | 'next_track'
  | 'previous_track'
  | 'skip_ad'
  | 'set_brightness'
  | 'set_volume'
  | 'toggle_flashlight'
  | 'open_wifi_settings'
  | 'open_bluetooth_settings'
  | 'open_sound_settings'
  | 'open_dnd_settings'
  | 'open_airplane_settings'
  | 'get_battery_info'
  | 'get_network_info'
  | 'read_notifications'
  | 'search_contacts'
  | 'get_gps_location'
  | 'camera_vision'
  | 'screen_vision'
  | 'run_routine'
  | 'web_search';

export interface AutomationActionStep {
  id: string;
  stepIndex: number;
  action: AutomationActionType;
  targetApp?: string;
  nodeText?: string;
  nodeId?: string;
  coordinates?: { x: number; y: number };
  inputText?: string;
  numericValue?: number;
  dependsOnStep?: number;
  requiresConfirmation: boolean;
  sensitiveReason?: string;
  status: 'PENDING' | 'RUNNING' | 'AWAITING_CONFIRMATION' | 'VERIFIED' | 'FAILED' | 'BLOCKED';
  verificationNote?: string;
}

export interface TaskManagerSummary {
  total: number;
  completed: number;
  running: number;
  pending: number;
  failed: number;
  currentAction: string;
}

export interface ParsedCommand {
  rawText: string;
  detectedLanguage: 'English' | 'Hindi' | 'Hinglish';
  category: IntentCategory;
  confidence: number;
  targetApp?: string;
  summary: string;
  requiresConfirmation: boolean;
  confirmationPrompt?: string;
  blockedReason?: string;
  steps: AutomationActionStep[];
  taskSummary?: TaskManagerSummary;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  personality: PersonalityId;
  emotion?: EmotionType;
  detectedLanguage?: 'English' | 'Hindi' | 'Hinglish';
  providerUsed?: ProviderId;
  modelUsed?: string;
  latencyMs?: number;
  commandPlan?: ParsedCommand;
}

export interface ConversationThread {
  id: string;
  title: string;
  personality: PersonalityId;
  createdAt: string;
  updatedAt: string;
  summary?: string;
  messages: ChatMessage[];
}

export type MemoryCategory =
  | 'personal_preference'
  | 'important_info'
  | 'conversation_history'
  | 'important_event'
  | 'user_instruction'
  | 'frequent_command'
  | 'character_memory'
  | 'conversation_context';

export interface MemoryEntry {
  id: string;
  personality: PersonalityId;
  category: MemoryCategory;
  key: string;
  value: string;
  userApproved: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PermissionRecord {
  id: string;
  name: string;
  purpose: string;
  missingImpact: string;
  instructions: string;
  status: PermissionStatus;
  scope: 'browser_and_android' | 'android_native';
  canRequestInBrowser: boolean;
  requiredOnFirstLaunch: boolean;
}

export interface PhoneNotification {
  id: string;
  appName: string;
  packageName: string;
  sender: string;
  title: string;
  body: string;
  receivedAt: string;
  isRead: boolean;
  canReply: boolean;
}

export interface PhoneContact {
  id: string;
  name: string;
  phone: string;
  relation?: string;
  email?: string;
}

export interface CallLogEntry {
  id: string;
  contactName: string;
  phoneNumber: string;
  callType: 'incoming' | 'outgoing' | 'missed';
  timestamp: string;
  durationSec: number;
}

export interface CalendarEventItem {
  id: string;
  title: string;
  startsAt: string;
  location?: string;
  isReminder?: boolean;
}

export interface PhoneIntelligenceSummary {
  generatedAt: string;
  notificationsAuthorized: boolean;
  callLogAuthorized: boolean;
  unreadNotifications: PhoneNotification[];
  recentCalls: CallLogEntry[];
  missedCallsCount: number;
  upcomingEvents: CalendarEventItem[];
  batteryPercent: number;
  networkStatus: string;
  summaryText: string;
}

export interface DiagnosticLogEntry {
  id: string;
  timestamp: string;
  module: string;
  level: 'INFO' | 'WARN' | 'ERROR';
  message: string;
  details?: string;
}

export interface VirtualScreenNode {
  nodeId: string;
  type: 'button' | 'input' | 'text' | 'list_item' | 'tab';
  label: string;
  bounds: { x: number; y: number; w: number; h: number };
  clickable: boolean;
  editable: boolean;
  value?: string;
}

export interface VirtualScreenState {
  currentApp: string;
  packageName: string;
  activityName: string;
  scrollOffset: number;
  lastGesture: string;
  brightnessPercent: number;
  volumePercent: number;
  flashlightOn: boolean;
  batteryPercent: number;
  networkStatus: string;
  deviceLocked?: boolean;
  nodes: VirtualScreenNode[];
}

export interface VisionAnalysisResult {
  mode: 'object' | 'ocr' | 'scene' | 'qa';
  summary: string;
  detectedObjects: string[];
  extractedText: string;
  latencyMs: number;
}

export interface AdaptiveTrait {
  id: string;
  personality: PersonalityId;
  trait: string;
  source: 'user_command' | 'auto_learned';
  createdAt: string;
}

export interface AppSettingsPayload {
  activePersonality: PersonalityId;
  characterMoods: Record<PersonalityId, EmotionType>;
  jarvisModel: PersonalityModelConfig;
  normalModel: PersonalityModelConfig;
  jadavisModel: PersonalityModelConfig;
  girlModel: PersonalityModelConfig;
  jarvisVoice: VoiceSettings;
  normalVoice: VoiceSettings;
  jadavisVoice: VoiceSettings;
  girlVoice: VoiceSettings;
  automation: AutomationSettings;
  enabledProviders: Record<ProviderId, boolean>;
  providerDefaultModels: Record<ProviderId, string>;
  providerCustomModels?: Partial<Record<ProviderId, string[]>>;
  primaryProvider: ProviderId;
  secondaryProvider: ProviderId;
  autoModelSelection?: boolean;
  fastResponseModel: string;
  reasoningModel: string;
  sttProvider: SttProviderId;
  ttsProvider: TtsEngineId;
  autoSpeakChatReplies?: boolean;
  proactiveTalkEnabled?: boolean;
  proactiveIntervalSec?: number;
  playfulBanterEnabled?: boolean;
  selfLearningEnabled?: boolean;
  customProviderBaseUrl: string;
  customProviderModel: string;
  wakeWords: string[];
  wakeWordSensitivity: number;
  sleepState: SleepModeState;
  preferredLanguage: 'auto' | 'en-US' | 'en-IN' | 'hi-IN';
  onboardingCompleted: boolean;
}
