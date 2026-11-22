import type {
  AppControlDirective,
  EmotionType,
  ProviderId,
  TtsEngineId,
} from '../../src/types/jarvis.ts';
import { storageStore } from './storageStore.ts';

export class VoiceAppControlEngine {
  static parseAndApply(message: string): AppControlDirective | null {
    const lower = message.toLowerCase().trim();
    const directive: AppControlDirective = { summaryNotes: [] };
    let matched = false;

    // 1. Switch Mode / Character via Voice (Strictly JARVIS & Maya)
    if (/\b(maya|girlfriend|ai girl|girl)\s*(mode|ban jao|bano|on|chalu|lagao|switch|kholo)\b|\bswitch to (maya|girl|ai girl)\b/i.test(lower)) {
      directive.switchPersonality = 'girl';
      directive.summaryNotes.push('Switched mode to Maya');
      matched = true;
    } else if (/\b(jarvis)\s*(mode|ban jao|bano|on|chalu|lagao|switch)\b|\bswitch to jarvis\b/i.test(lower)) {
      directive.switchPersonality = 'jarvis';
      directive.summaryNotes.push('Switched mode to JARVIS');
      matched = true;
    }

    // 2. Switch Mood / Emotion via Voice (11 moods including Romantic)
    const moodPatterns: Array<[RegExp, EmotionType]> = [
      [/\b(romantic|pyaar|ishq|flirt|impress)\b/i, 'Romantic'],
      [/\b(happy|khush)\b/i, 'Happy'],
      [/\b(sad|udaas|dukhi|rona)\b/i, 'Sad'],
      [/\b(angry|gussa|naraj|ladai|jhagda)\b/i, 'Angry'],
      [/\b(laughing|funny|comedy|hasi|hanse|haso)\b/i, 'Laughing'],
      [/\b(curious|sawal)\b/i, 'Curious'],
      [/\b(surprised|hairan)\b/i, 'Surprised'],
      [/\b(excited|josh)\b/i, 'Excited'],
      [/\b(serious|gambhir)\b/i, 'Serious'],
      [/\b(calm|shant)\b/i, 'Calm'],
      [/\b(normal)\b/i, 'Normal'],
    ];
    for (const [regex, emotion] of moodPatterns) {
      if (/\b(mood|emotion|bano|ho jao|lagao)\b/i.test(lower) && regex.test(lower)) {
        directive.setMood = emotion;
        directive.summaryNotes.push(`Mood set to ${emotion}`);
        matched = true;
        break;
      }
    }

    // 3. Toggle Shararat / Auto-Talk / Auto-Model / Auto-Speak by Voice
    if (/\b(shararat|majak|teasing|mischief)\b/i.test(lower)) {
      if (/\b(off|band|roko|disable|stop)\b/i.test(lower)) {
        directive.playfulBanterEnabled = false;
        directive.summaryNotes.push('Shararat Mode OFF');
        matched = true;
      } else if (/\b(on|chalu|shuru|enable|start|badhao)\b/i.test(lower)) {
        directive.playfulBanterEnabled = true;
        directive.summaryNotes.push('Shararat Mode ON');
        matched = true;
      }
    }

    if (/\b(auto talk|auto-talk|khud baat|apne aap baat)\b/i.test(lower)) {
      if (/\b(off|band|roko|disable|stop)\b/i.test(lower)) {
        directive.proactiveTalkEnabled = false;
        directive.summaryNotes.push('Auto-Talk OFF');
        matched = true;
      } else if (/\b(on|chalu|shuru|enable|start)\b/i.test(lower)) {
        directive.proactiveTalkEnabled = true;
        directive.summaryNotes.push('Auto-Talk ON');
        matched = true;
      }
    }

    if (/\b(auto model|automatic model|smart model)\b/i.test(lower)) {
      if (/\b(off|band|manual|disable)\b/i.test(lower)) {
        directive.autoModelSelection = false;
        directive.summaryNotes.push('Auto Model Selection set to MANUAL');
        matched = true;
      } else if (/\b(on|chalu|enable|auto)\b/i.test(lower)) {
        directive.autoModelSelection = true;
        directive.summaryNotes.push('Auto Model Selection ON');
        matched = true;
      }
    }

    if (/\b(chat speak|auto speak|bolkar batao)\b/i.test(lower)) {
      if (/\b(off|band|mute)\b/i.test(lower)) {
        directive.autoSpeakChatReplies = false;
        directive.summaryNotes.push('Chat Auto-Speak OFF');
        matched = true;
      } else if (/\b(on|chalu)\b/i.test(lower)) {
        directive.autoSpeakChatReplies = true;
        directive.summaryNotes.push('Chat Auto-Speak ON');
        matched = true;
      }
    }

    // 4. Switch AI Provider by Voice (Gemini / Groq)
    if (/\b(use|switch to|select|lagao|chalu karo)\s+(groq|gemini)\b/i.test(lower)) {
      const nextProvider: ProviderId = /groq/i.test(lower) ? 'groq' : 'gemini';
      directive.primaryProvider = nextProvider;
      directive.summaryNotes.push(`Primary AI switched to ${nextProvider.toUpperCase()}`);
      matched = true;
    }

    // 5. Switch Voice Engine by Voice (ElevenLabs / Groq / Gemini)
    if (/\b(eleven\s*labs?|elevenlabs)\b.*\b(voice|lagao|use|on|switch|chalu)\b|\b(use|switch to)\s+(eleven\s*labs?|elevenlabs)\b/i.test(lower)) {
      directive.ttsEngine = 'elevenlabs';
      directive.summaryNotes.push('Voice Engine switched to ElevenLabs');
      matched = true;
    } else if (/\bgroq\s+(voice)\b.*\b(lagao|use|on|switch|chalu)\b|\b(use|switch to)\s+groq\s+voice\b/i.test(lower)) {
      directive.ttsEngine = 'groq';
      directive.summaryNotes.push('Voice Engine switched to Groq Voice');
      matched = true;
    } else if (/\bgemini\s+(voice)\b.*\b(lagao|use|on|switch|chalu)\b|\b(use|switch to)\s+gemini\s+voice\b/i.test(lower)) {
      directive.ttsEngine = 'gemini';
      directive.summaryNotes.push('Voice Engine switched to Gemini Neural Voice');
      matched = true;
    }

    // 6. Toggle 24/7 Wake-Word & Background Listening by Voice
    if (/\b(wake\s*up\s*word|wake\s*word|24\s*hour|24\s*ghante|background\s*listening|always\s*listening)\b/i.test(lower)) {
      if (/\b(off|band|roko|disable|stop)\b/i.test(lower)) {
        directive.wakeWordEnabled = false;
        directive.background24x7 = false;
        directive.summaryNotes.push('24/7 Wake-Word & Background Listening OFF');
        matched = true;
      } else if (/\b(on|chalu|shuru|enable|start|active)\b/i.test(lower)) {
        directive.wakeWordEnabled = true;
        directive.background24x7 = true;
        directive.summaryNotes.push('24/7 Wake-Word & Background Listening ON');
        matched = true;
      }
    }

    // 7. Black / White Theme Switch by Voice
    if (/\b(black|dark|kala)\s*(mode|theme|ui|screen)?\b/i.test(lower) && /\b(lagao|karo|on|set|switch|enable)\b/i.test(lower)) {
      directive.themeMode = 'black';
      directive.summaryNotes.push('Switched UI Theme to Obsidian Black');
      matched = true;
    } else if (/\b(white|light|safed)\s*(mode|theme|ui|screen)?\b/i.test(lower) && /\b(lagao|karo|on|set|switch|enable)\b/i.test(lower)) {
      directive.themeMode = 'white';
      directive.summaryNotes.push('Switched UI Theme to Porcelain White');
      matched = true;
    }

    // 8. Floating Overlay Logo Bubble Control
    if (/\b(floating|overlay)\s*(logo|bubble|orb)?\b/i.test(lower)) {
      if (/\b(off|band|hide|disable)\b/i.test(lower)) {
        directive.floatingBubbleEnabled = false;
        directive.summaryNotes.push('Floating JARVIS Overlay Logo OFF');
        matched = true;
      } else if (/\b(on|chalu|show|enable)\b/i.test(lower)) {
        directive.floatingBubbleEnabled = true;
        directive.summaryNotes.push('Floating JARVIS Overlay Logo ON');
        matched = true;
      }
    }

    // 9. Navigate JARVIS Screens by Voice
    if (
      /\b(open|show|kholo|go to|dikhao)\s+(jarvis\s+)?settings\b|\bsettings\s*(kholo|dikhao|open)\b/i.test(lower)
    ) {
      directive.navigateView = 'settings';
      directive.summaryNotes.push('Opened Settings');
      matched = true;
    } else if (
      /\b(open|show|kholo|go to|dikhao)\s+(chatting|chat\s*page|chat)\b|\b(chatting|chat\s*page|chat)\s*(kholo|dikhao|open)\b/i.test(lower)
    ) {
      directive.navigateView = 'chat';
      directive.summaryNotes.push('Opened Chat Page');
      matched = true;
    } else if (
      /\b(open|show|kholo|go to|dikhao)\s+(chat\s+)?history\b|\b(history|memory)\s*(kholo|dikhao|open)\b/i.test(lower)
    ) {
      directive.navigateView = 'history';
      directive.summaryNotes.push('Opened Chat History & Memory');
      matched = true;
    } else if (
      /\b(open|show|kholo|go to|dikhao)\s+(camera\s+)?(scan|vision)\b|\b(camera|scan|vision)\s*(kholo|dikhao|open)\b/i.test(lower)
    ) {
      directive.navigateView = 'vision';
      directive.summaryNotes.push('Opened Scan / Vision');
      matched = true;
    } else if (
      /\b(close settings|settings band|go home|home screen|jarvis home|home page|home jao)\b/i.test(lower)
    ) {
      directive.navigateView = 'home';
      directive.summaryNotes.push('Returned to Home');
      matched = true;
    }

    if (/\b(clear chat|naya chat|new chat|chat saaf karo)\b/i.test(lower)) {
      directive.clearChat = true;
      directive.summaryNotes.push('Started fresh chat');
      matched = true;
    }

    if (!matched) return null;

    storageStore.update((draft) => {
      if (directive.switchPersonality) {
        draft.settings.activePersonality = directive.switchPersonality;
      }
      if (directive.themeMode) {
        draft.settings.themeMode = directive.themeMode;
      }
      if (directive.floatingBubbleEnabled !== undefined) {
        draft.settings.floatingBubbleEnabled = directive.floatingBubbleEnabled;
      }
      if (directive.background24x7 !== undefined) {
        draft.settings.background24x7 = directive.background24x7;
      }
      if (directive.wakeWordEnabled !== undefined) {
        draft.settings.jarvisVoice.wakeWordEnabled = directive.wakeWordEnabled;
        draft.settings.girlVoice.wakeWordEnabled = directive.wakeWordEnabled;
        draft.settings.jarvisVoice.backgroundListening = directive.wakeWordEnabled;
        draft.settings.girlVoice.backgroundListening = directive.wakeWordEnabled;
      }
      const targetChar = directive.switchPersonality || draft.settings.activePersonality;
      if (directive.setMood) {
        draft.settings.characterMoods[targetChar] = directive.setMood;
      }
      if (directive.proactiveTalkEnabled !== undefined) {
        draft.settings.proactiveTalkEnabled = directive.proactiveTalkEnabled;
      }
      if (directive.playfulBanterEnabled !== undefined) {
        draft.settings.playfulBanterEnabled = directive.playfulBanterEnabled;
      }
      if (directive.autoModelSelection !== undefined) {
        draft.settings.autoModelSelection = directive.autoModelSelection;
      }
      if (directive.autoSpeakChatReplies !== undefined) {
        draft.settings.autoSpeakChatReplies = directive.autoSpeakChatReplies;
      }
      if (directive.primaryProvider) {
        draft.settings.primaryProvider = directive.primaryProvider;
        const modelId = draft.settings.providerDefaultModels?.[directive.primaryProvider] || 'auto';
        draft.settings.jarvisModel.provider = directive.primaryProvider;
        draft.settings.jarvisModel.model = modelId;
        draft.settings.girlModel.provider = directive.primaryProvider;
        draft.settings.girlModel.model = modelId;
      }
      if (directive.ttsEngine) {
        draft.settings.ttsProvider = directive.ttsEngine;
        const model =
          directive.ttsEngine === 'elevenlabs'
            ? 'eleven_flash_v2_5'
            : directive.ttsEngine === 'groq'
              ? 'canopylabs/orpheus-v1-english'
              : directive.ttsEngine === 'browser'
                ? 'device-local'
                : 'gemini-3.8-flash-lite-tts';
        for (const vc of [draft.settings.jarvisVoice, draft.settings.girlVoice]) {
          vc.ttsEngine = directive.ttsEngine as TtsEngineId;
          vc.voiceModel = model;
        }
      }
    });

    return directive;
  }
}
