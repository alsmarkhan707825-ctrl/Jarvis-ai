import type {
  AppControlDirective,
  EmotionType,
  PersonalityId,
  ProviderId,
  TtsEngineId,
} from '../../src/types/jarvis.ts';
import { storageStore } from './storageStore.ts';

export class VoiceAppControlEngine {
  static parseAndApply(message: string): AppControlDirective | null {
    const lower = message.toLowerCase().trim();
    const directive: AppControlDirective = { summaryNotes: [] };
    let matched = false;

    // 1. Switch Mode / Character via Voice
    if (/\b(girlfriend|girl|aria)\s*(mode|ban jao|bano|on|chalu|lagao|switch|kholo)\b|\bswitch to (girl|aria)\b/i.test(lower)) {
      directive.switchPersonality = 'girl';
      directive.summaryNotes.push('Switched mode to AI Girl');
      matched = true;
    } else if (/\b(jadavis)\s*(mode|ban jao|bano|on|chalu|lagao|switch|kholo)\b|\bswitch to jadavis\b/i.test(lower)) {
      directive.switchPersonality = 'jadavis';
      directive.summaryNotes.push('Switched mode to JADAVIS');
      matched = true;
    } else if (/\b(normal)\s*(mode|on|chalu|lagao|switch)\b|\bswitch to normal\b/i.test(lower)) {
      directive.switchPersonality = 'normal';
      directive.summaryNotes.push('Switched mode to Normal');
      matched = true;
    } else if (/\b(jarvis)\s*(mode|on|chalu|lagao|switch)\b|\bswitch to jarvis\b/i.test(lower)) {
      directive.switchPersonality = 'jarvis';
      directive.summaryNotes.push('Switched mode to JARVIS');
      matched = true;
    }

    // 2. Switch Mood / Emotion via Voice
    const moodPatterns: Array<[RegExp, EmotionType]> = [
      [/\b(happy|khush)\s*(mood|ho jao|bano|karo)?\b/i, 'Happy'],
      [/\b(sad|udaas|dukhi)\s*(mood|ho jao|bano|karo)\b/i, 'Sad'],
      [/\b(angry|gussa)\s*(mood|ho jao|bano|karo)\b/i, 'Angry'],
      [/\b(laughing|funny|comedy|hasi)\s*(mood|ho jao|bano|karo)\b/i, 'Laughing'],
      [/\b(curious|sawal)\s*(mood|ho jao|bano|karo)\b/i, 'Curious'],
      [/\b(surprised|hairan)\s*(mood|ho jao|bano|karo)\b/i, 'Surprised'],
      [/\b(excited|josh)\s*(mood|ho jao|bano|karo)\b/i, 'Excited'],
      [/\b(serious|gambhir)\s*(mood|ho jao|bano|karo)\b/i, 'Serious'],
      [/\b(calm|shant)\s*(mood|ho jao|bano|karo)\b/i, 'Calm'],
    ];
    for (const [regex, emotion] of moodPatterns) {
      if (/\b(mood|emotion|bano|ho jao)\b/i.test(lower) && regex.test(lower)) {
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

    // 4. Switch AI Provider by Voice (Gemini / Groq / OpenRouter)
    if (/\b(use|switch to|select|lagao|chalu karo)\s+(groq|openrouter|open router|gemini)\b/i.test(lower)) {
      let nextProvider: ProviderId = 'gemini';
      if (/groq/i.test(lower)) nextProvider = 'groq';
      else if (/open\s*router/i.test(lower)) nextProvider = 'openrouter';
      directive.primaryProvider = nextProvider;
      directive.summaryNotes.push(`Primary AI switched to ${nextProvider.toUpperCase()}`);
      matched = true;
    }

    // 5. Switch Voice Engine by Voice (ElevenLabs / Gemini)
    if (/\b(eleven\s*labs?|elevenlabs)\b.*\b(voice|lagao|use|on|switch|chalu)\b|\b(use|switch to)\s+(eleven\s*labs?|elevenlabs)\b/i.test(lower)) {
      directive.ttsEngine = 'elevenlabs';
      directive.summaryNotes.push('Voice Engine switched to ElevenLabs');
      matched = true;
    } else if (/\bgemini\s+(voice)\b.*\b(lagao|use|on|switch|chalu)\b|\b(use|switch to)\s+gemini\s+voice\b/i.test(lower)) {
      directive.ttsEngine = 'gemini';
      directive.summaryNotes.push('Voice Engine switched to Gemini Neural Voice');
      matched = true;
    }

    // 6. Navigate JARVIS Screens by Voice
    if (/\b(open|show|kholo|go to|dikhao)\s+(jarvis\s+)?settings\b/i.test(lower)) {
      directive.navigateView = 'settings';
      directive.summaryNotes.push('Opened Settings');
      matched = true;
    } else if (/\b(open|show|kholo|go to|dikhao)\s+(chat\s+)?history\b/i.test(lower)) {
      directive.navigateView = 'history';
      directive.summaryNotes.push('Opened Chat History');
      matched = true;
    } else if (/\b(open|show|kholo|go to|dikhao)\s+(camera\s+)?(scan|vision)\b/i.test(lower)) {
      directive.navigateView = 'vision';
      directive.summaryNotes.push('Opened Scan / Vision');
      matched = true;
    } else if (/\b(close settings|settings band|go home|home screen|jarvis home)\b/i.test(lower)) {
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

    // Persist changes cleanly in encrypted store
    storageStore.update((draft) => {
      if (directive.switchPersonality) {
        draft.settings.activePersonality = directive.switchPersonality;
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
      }
      if (directive.ttsEngine) {
        draft.settings.ttsProvider = directive.ttsEngine;
        const model =
          directive.ttsEngine === 'elevenlabs'
            ? 'eleven_flash_v2_5'
            : directive.ttsEngine === 'browser'
              ? 'device-local'
              : 'gemini-3.8-flash-lite-tts';
        for (const vc of [
          draft.settings.jarvisVoice,
          draft.settings.normalVoice,
          draft.settings.jadavisVoice,
          draft.settings.girlVoice,
        ]) {
          vc.ttsEngine = directive.ttsEngine as TtsEngineId;
          vc.voiceModel = model;
        }
      }
    });

    return directive;
  }
}
