import crypto from 'crypto';
import { ThinkingLevel, Type } from '@google/genai';
import type {
  AutomationActionStep,
  IntentCategory,
  ParsedCommand,
} from '../../src/types/jarvis.ts';
import { createGeminiClient } from './aiProviderManager.ts';
import { loggingDiagnostics } from './loggingDiagnostics.ts';
import { storageStore } from './storageStore.ts';
import { detectLanguageHeuristic } from './voiceRecognitionEngine.ts';

const MAX_MULTI_COMMANDS = 20;

const SECURITY_BYPASS_PATTERN =
  /\b(bypass|unlock|biometric|fingerprint|face unlock|payment|pay now|upi pin|transfer money|otp|password|crack|hack|captcha)\b/i;

const SENSITIVE_SOCIAL_OR_COMM_PATTERN =
  /\b(send|bhejo|call|dial|follow|like|post|comment|share location|delete|remove|uninstall|reply)\b/i;

function makeStep(
  stepIndex: number,
  partial: Omit<AutomationActionStep, 'id' | 'stepIndex' | 'status'>
): AutomationActionStep {
  return {
    id: crypto.randomUUID(),
    stepIndex,
    status: partial.requiresConfirmation ? 'AWAITING_CONFIRMATION' : 'PENDING',
    ...partial,
  };
}

class IntentDetectionEngine {
  private parseClauseToSteps(
    clause: string,
    startingIndex: number,
    activeAppHint?: string
  ): { steps: AutomationActionStep[]; appHint?: string; category?: IntentCategory; confirm?: boolean } {
    const lower = clause.trim().toLowerCase();
    const steps: AutomationActionStep[] = [];
    let idx = startingIndex;
    let currentApp = activeAppHint;
    let category: IntentCategory = 'phone_control';
    let needsConfirm = false;

    // 1. Check matching User Routine first
    const matchedRoutine = storageStore
      .getState()
      .routines.find((r) => r.enabled && lower.includes(r.triggerPhrase.toLowerCase()));
    if (matchedRoutine) {
      category = 'routine';
      steps.push(
        makeStep(idx++, {
          action: 'run_routine',
          nodeText: matchedRoutine.name,
          inputText: matchedRoutine.commandsText,
          requiresConfirmation: false,
        })
      );
      return { steps, appHint: currentApp, category, confirm: false };
    }

    // 2. System Settings Controls (Brightness, Volume, Flashlight, Wi-Fi, Bluetooth, DND, Airplane, Battery, Network)
    const brightMatch = lower.match(/\bbrightness\b.*?(\d{1,3})\s*(?:%|percent)?/i);
    if (brightMatch) {
      category = 'system_settings';
      steps.push(
        makeStep(idx++, {
          action: 'set_brightness',
          numericValue: Number(brightMatch[1]),
          nodeText: `Brightness ${brightMatch[1]}%`,
          requiresConfirmation: false,
        })
      );
    }

    const volMatch = lower.match(/\bvolume\b.*?(\d{1,3})\s*(?:%|percent)?/i);
    if (volMatch) {
      category = 'system_settings';
      steps.push(
        makeStep(idx++, {
          action: 'set_volume',
          numericValue: Number(volMatch[1]),
          nodeText: `Volume ${volMatch[1]}%`,
          requiresConfirmation: false,
        })
      );
    }

    if (/\b(flashlight|torch)\b/i.test(lower)) {
      category = 'system_settings';
      steps.push(
        makeStep(idx++, {
          action: 'toggle_flashlight',
          nodeText: /\b(off|band)\b/i.test(lower) ? 'OFF' : 'ON',
          requiresConfirmation: false,
        })
      );
    }
    if (/\b(wifi|wi-fi)\b/i.test(lower)) {
      category = 'system_settings';
      steps.push(makeStep(idx++, { action: 'open_wifi_settings', nodeText: 'Wi-Fi Settings Panel', requiresConfirmation: false }));
    }
    if (/\b(bluetooth)\b/i.test(lower)) {
      category = 'system_settings';
      steps.push(makeStep(idx++, { action: 'open_bluetooth_settings', nodeText: 'Bluetooth Settings Panel', requiresConfirmation: false }));
    }
    if (/\b(dnd|do not disturb)\b/i.test(lower)) {
      category = 'system_settings';
      steps.push(makeStep(idx++, { action: 'open_dnd_settings', nodeText: 'Do Not Disturb Settings', requiresConfirmation: false }));
    }
    if (/\b(airplane mode|flight mode)\b/i.test(lower)) {
      category = 'system_settings';
      steps.push(makeStep(idx++, { action: 'open_airplane_settings', nodeText: 'Airplane Mode Settings', requiresConfirmation: false }));
    }
    if (/\b(sound settings|ringtone)\b/i.test(lower)) {
      category = 'system_settings';
      steps.push(makeStep(idx++, { action: 'open_sound_settings', nodeText: 'Sound Settings Panel', requiresConfirmation: false }));
    }
    if (/\b(battery|battery info|charging)\b/i.test(lower)) {
      category = 'information';
      steps.push(makeStep(idx++, { action: 'get_battery_info', nodeText: 'Battery Info', requiresConfirmation: false }));
    }
    if (/\b(network info|internet speed|signal)\b/i.test(lower)) {
      category = 'information';
      steps.push(makeStep(idx++, { action: 'get_network_info', nodeText: 'Network Info', requiresConfirmation: false }));
    }

    // 3. Camera & Screen Vision Triggers
    if (/\b(camera vision|mere saamne kya|mere samne kya|identify object|is text ko read|scan camera)\b/i.test(lower)) {
      category = 'vision';
      steps.push(makeStep(idx++, { action: 'camera_vision', nodeText: clause.trim(), requiresConfirmation: false }));
    }
    if (/\b(screen vision|read screen|screen par kya|inspect screen)\b/i.test(lower)) {
      category = 'vision';
      steps.push(makeStep(idx++, { action: 'screen_vision', nodeText: 'Read accessible screen nodes', requiresConfirmation: false }));
    }

    // 4. App Launch / Switch
    const openMatch =
      lower.match(/(?:open|launch|start|switch to|chalu karo|kholo)\s+([a-z0-9 ._+-]{2,28})(?:\s+app)?$/i) ||
      lower.match(/(?:open|launch|kholo)\s+(youtube|instagram|spotify|whatsapp|messages|chrome|settings|camera|calendar|gmail|maps|music|netflix|telegram|facebook)/i);

    if (openMatch && !/\b(wifi|bluetooth|sound|dnd|airplane)\b/i.test(openMatch[1])) {
      const rawApp = openMatch[1].trim();
      const cleanApp = rawApp.charAt(0).toUpperCase() + rawApp.slice(1);
      currentApp = cleanApp;
      category = 'app_navigation';
      steps.push(makeStep(idx++, { action: 'open_app', targetApp: cleanApp, requiresConfirmation: false }));
    }

    // 5. Weather / Web Search / In-App Search
    if (/\b(weather|mausam)\b/i.test(lower)) {
      category = 'search';
      steps.push(
        makeStep(idx++, {
          action: 'web_search',
          targetApp: currentApp || 'Chrome',
          inputText: 'current weather forecast',
          requiresConfirmation: false,
        })
      );
    } else {
      const searchMatch = lower.match(/(?:search|find|dhundo|check)\s+(?:for\s+)?(.+?)$/i);
      if (searchMatch && !/\b(contact|number)\b/i.test(lower)) {
        const q = searchMatch[1].replace(/\b(karo|kardo|in|on|par|mein)\b/gi, '').trim();
        if (q) {
          category = 'search';
          steps.push(
            makeStep(idx++, { action: 'click_button', targetApp: currentApp, nodeText: 'Search', requiresConfirmation: false }),
            makeStep(idx++, { action: 'enter_text', targetApp: currentApp, nodeText: 'Search input', inputText: q, dependsOnStep: idx - 1, requiresConfirmation: false }),
            makeStep(idx++, { action: 'submit_done', targetApp: currentApp, nodeText: 'Submit Search', dependsOnStep: idx - 1, requiresConfirmation: false })
          );
        }
      }
    }

    // 6. Media & Ad Controls
    if (/\b(skip ad|ad skip|add skip|skip ads|add ko skip)\b/i.test(lower)) {
      category = 'media_control';
      steps.push(makeStep(idx++, { action: 'skip_ad', targetApp: currentApp, nodeText: 'Skip Ad', requiresConfirmation: false }));
    }
    if (/\b(play|chala|chalao|bajao)\b.*\b(song|gana|gaana|music|video|track|audio)\b|\b(play music|gana play|play song)\b/i.test(lower)) {
      category = 'media_control';
      steps.push(makeStep(idx++, { action: 'play_media', targetApp: currentApp, requiresConfirmation: false }));
    }
    if (/\b(stop|band karo|band kardo|roko)\b.*\b(song|gana|gaana|music|audio|video)\b|\b(stop music|gana stop)\b/i.test(lower)) {
      category = 'media_control';
      steps.push(makeStep(idx++, { action: 'stop_media', targetApp: currentApp, requiresConfirmation: false }));
    } else if (/\b(pause|pause music)\b/i.test(lower)) {
      category = 'media_control';
      steps.push(makeStep(idx++, { action: 'pause_media', targetApp: currentApp, requiresConfirmation: false }));
    }
    if (/\b(next song|next track|agla gana|skip song|skip track)\b/i.test(lower)) {
      category = 'media_control';
      steps.push(makeStep(idx++, { action: 'next_track', targetApp: currentApp, requiresConfirmation: false }));
    }

    // 7. Navigation & Gestures
    if (/\b(thoda|thoda sa|slightly|little|slow)\b.*\b(scroll down|niche|neeche)\b/i.test(lower)) {
      steps.push(makeStep(idx++, { action: 'micro_scroll_down', targetApp: currentApp, nodeText: 'Incremental scroll down', requiresConfirmation: false }));
    } else if (/\b(thoda|thoda sa|slightly|little|slow)\b.*\b(scroll up|upar)\b/i.test(lower)) {
      steps.push(makeStep(idx++, { action: 'micro_scroll_up', targetApp: currentApp, nodeText: 'Incremental scroll up', requiresConfirmation: false }));
    } else if (/\b(scroll hold|scroll and hold)\b/i.test(lower)) {
      steps.push(makeStep(idx++, { action: 'scroll_hold', targetApp: currentApp, requiresConfirmation: false }));
    } else if (/\b(scroll down|neeche scroll|niche karo|swipe up)\b/i.test(lower)) {
      steps.push(makeStep(idx++, { action: 'scroll', targetApp: currentApp, nodeText: 'down', requiresConfirmation: false }));
    } else if (/\b(scroll up|upar scroll|upar karo|swipe down)\b/i.test(lower)) {
      steps.push(makeStep(idx++, { action: 'swipe_down', targetApp: currentApp, requiresConfirmation: false }));
    }
    if (/\b(swipe left)\b/i.test(lower)) steps.push(makeStep(idx++, { action: 'swipe_left', targetApp: currentApp, requiresConfirmation: false }));
    if (/\b(swipe right)\b/i.test(lower)) steps.push(makeStep(idx++, { action: 'swipe_right', targetApp: currentApp, requiresConfirmation: false }));
    if (/\b(double tap)\b/i.test(lower)) steps.push(makeStep(idx++, { action: 'double_tap', targetApp: currentApp, requiresConfirmation: false }));
    if (/\b(long press|hold)\b/i.test(lower) && !/scroll/i.test(lower)) steps.push(makeStep(idx++, { action: 'long_press', targetApp: currentApp, requiresConfirmation: false }));
    if (/\b(recent apps|recents)\b/i.test(lower)) steps.push(makeStep(idx++, { action: 'recent_apps', requiresConfirmation: false }));
    if (/\b(go back|back karo|peeche jao)\b/i.test(lower)) steps.push(makeStep(idx++, { action: 'back', targetApp: currentApp, requiresConfirmation: false }));
    if (/\b(go home|home screen|home jao)\b/i.test(lower)) steps.push(makeStep(idx++, { action: 'home', targetApp: 'Home', requiresConfirmation: false }));

    // 8. Sensitive Send/Call/Follow Gate
    if (/\b(send|bhejo)\b/i.test(lower) && /\b(message|msg|whatsapp|sms|email|dm|reply)\b/i.test(lower)) {
      needsConfirm = true;
      category = 'communication';
      steps.push(
        makeStep(idx++, {
          action: 'send_action',
          targetApp: currentApp,
          nodeText: clause.trim(),
          requiresConfirmation: true,
          sensitiveReason: 'Sending messages or external communication requires explicit confirmation.',
        })
      );
    }

    return { steps, appHint: currentApp, category, confirm: needsConfirm };
  }

  async parse(rawText: string): Promise<ParsedCommand> {
    const text = rawText.trim();
    const detectedLanguage = detectLanguageHeuristic(text);

    if (SECURITY_BYPASS_PATTERN.test(text)) {
      return {
        rawText: text,
        detectedLanguage,
        category: 'phone_control',
        confidence: 0.99,
        summary: 'Blocked security-restricted operation.',
        requiresConfirmation: false,
        blockedReason:
          'Security Policy: JARVIS never bypasses Android security locks, CAPTCHA, biometric authentication, OTPs, or payment confirmations.',
        steps: [],
      };
    }

    const lower = text.toLowerCase();

    // 1a. Complete Shutdown Mode (checked before Sleep & generic band/stop commands)
    if (
      /\b(jarvis\s+shutdown|shutdown\s+jarvis|band\s+ho\s+jao|system\s+band\s+kar\s*do|completely\s+off|stop\s+everything)\b/i.test(
        lower
      )
    ) {
      return {
        rawText: text,
        detectedLanguage,
        category: 'system_settings',
        confidence: 0.99,
        summary: 'Complete Shutdown Mode: stop AI, voice, wake-word, and background services',
        requiresConfirmation: false,
        steps: [
          makeStep(1, {
            action: 'shutdown_mode',
            nodeText: 'SHUTDOWN',
            requiresConfirmation: false,
          }),
        ],
      };
    }

    // 1b. Sleep / Rest Mode
    if (
      /\b(jarvis\s+sleep|so\s+jao|rest\s+mode|chup\s+ho\s+jao|go\s+to\s+sleep)\b/i.test(lower)
    ) {
      return {
        rawText: text,
        detectedLanguage,
        category: 'system_settings',
        confidence: 0.98,
        summary: 'Sleep Mode: stop speaking and enter low-power wake-word standby',
        requiresConfirmation: false,
        steps: [
          makeStep(1, {
            action: 'sleep_mode',
            nodeText: 'SLEEPING',
            requiresConfirmation: false,
          }),
        ],
      };
    }

    // 1c. Device Lock (Permitted Android Accessibility global lock action; respects lock screen security)
    if (
      /\b(phone\s+lock|lock\s+phone|lock\s+screen|lock\s+device|lock\s+the\s+phone|phone\s+lock\s+kar\s*do|screen\s+lock\s+karo)\b/i.test(
        lower
      )
    ) {
      return {
        rawText: text,
        detectedLanguage,
        category: 'phone_control',
        confidence: 0.96,
        summary: 'Lock device screen (requires Android Accessibility permission)',
        requiresConfirmation: true,
        confirmationPrompt:
          'Confirm screen lock? On Android this executes Accessibility GLOBAL_ACTION_LOCK_SCREEN (browser preview cannot lock OS hardware).',
        steps: [
          makeStep(1, {
            action: 'lock_device',
            nodeText: 'GLOBAL_ACTION_LOCK_SCREEN',
            requiresConfirmation: true,
            sensitiveReason: 'Locking the device screen interrupts active display and requires explicit confirmation.',
          }),
        ],
      };
    }

    // 1d. Phone Intelligence Summary (Notifications, Calls, Missed Calls, Calendar, Battery, Network)
    if (
      /\b(aaj\s+mere\s+phone\s+par\s+kya\s+hua|phone\s+par\s+kya\s+hua|what\s+happened\s+on\s+my\s+phone|phone\s+summary|phone\s+intelligence|missed\s+call|missed\s+calls|call\s+history|call\s+log|recent\s+calls|upcoming\s+events|calendar\s+events)\b/i.test(
        lower
      )
    ) {
      return {
        rawText: text,
        detectedLanguage,
        category: 'information',
        confidence: 0.96,
        summary: 'Phone Intelligence summary (notifications, calls, calendar, battery, network)',
        requiresConfirmation: false,
        steps: [
          makeStep(1, {
            action: 'phone_intelligence',
            nodeText: 'Summarize authorized device activity',
            requiresConfirmation: false,
          }),
        ],
      };
    }

    if (/\b(show|read|check|dikhao|padho)\b.*\b(notification|notifications)\b/i.test(lower)) {
      return {
        rawText: text,
        detectedLanguage,
        category: 'information',
        confidence: 0.95,
        summary: 'Read and summarize active notifications',
        requiresConfirmation: false,
        steps: [makeStep(1, { action: 'read_notifications', requiresConfirmation: false })],
      };
    }
    if (/\b(find|search|dhundo)\b.*\b(contact|number)\b/i.test(lower)) {
      return {
        rawText: text,
        detectedLanguage,
        category: 'communication',
        confidence: 0.93,
        summary: 'Search contacts directory',
        requiresConfirmation: false,
        steps: [makeStep(1, { action: 'search_contacts', inputText: text, requiresConfirmation: false })],
      };
    }
    if (/\b(current location|where am i|my location|meri location|gps)\b/i.test(lower)) {
      return {
        rawText: text,
        detectedLanguage,
        category: 'information',
        confidence: 0.94,
        summary: 'Read device GPS coordinates (with permission)',
        requiresConfirmation: false,
        steps: [makeStep(1, { action: 'get_gps_location', requiresConfirmation: false })],
      };
    }

    // Multi-Command Engine: parse up to 20 sequential/parallel clauses
    const clauses = text
      .split(/\s*(?:,|;|\band\b|\bthen\b|\bfir\b|\bphir\b|\baur\b|\buske baad\b)\s*/i)
      .map((c) => c.trim())
      .filter(Boolean)
      .slice(0, MAX_MULTI_COMMANDS);

    const combinedSteps: AutomationActionStep[] = [];
    let appHint: string | undefined;
    let finalCategory: IntentCategory = 'phone_control';
    let requiresConfirm = false;

    for (const clause of clauses) {
      if (combinedSteps.length >= MAX_MULTI_COMMANDS) break;
      const parsedClause = this.parseClauseToSteps(clause, combinedSteps.length + 1, appHint);
      if (parsedClause.steps.length > 0) {
        for (const s of parsedClause.steps) {
          if (combinedSteps.length < MAX_MULTI_COMMANDS) {
            combinedSteps.push(s);
          }
        }
        if (parsedClause.appHint) appHint = parsedClause.appHint;
        if (parsedClause.category) finalCategory = parsedClause.category;
        if (parsedClause.confirm) requiresConfirm = true;
      }
    }

    if (combinedSteps.length > 0) {
      return {
        rawText: text,
        detectedLanguage,
        category: finalCategory,
        confidence: 0.94,
        targetApp: appHint,
        summary: `Multi-task plan (${combinedSteps.length} actions)${appHint ? ` · ${appHint}` : ''}`,
        requiresConfirmation: requiresConfirm,
        confirmationPrompt: requiresConfirm
          ? `Confirm before executing sensitive action: "${text}"`
          : undefined,
        steps: combinedSteps,
      };
    }

    if (
      SENSITIVE_SOCIAL_OR_COMM_PATTERN.test(lower) &&
      /\b(message|whatsapp|email|call|follow|instagram|sms|location)\b/i.test(lower)
    ) {
      return {
        rawText: text,
        detectedLanguage,
        category: 'communication',
        confidence: 0.9,
        summary: `Sensitive user-directed action requested: "${text}"`,
        requiresConfirmation: true,
        confirmationPrompt: `Please confirm before JARVIS executes this external action: "${text}"`,
        steps: [
          makeStep(1, {
            action: 'send_action',
            nodeText: text,
            requiresConfirmation: true,
            sensitiveReason: 'External communication, social action, or personal data sharing requires explicit confirmation.',
          }),
        ],
      };
    }

    // Gemini structured multi-command fallback (up to 20 commands)
    const mightBeAction =
      /\b(open|tap|click|type|enter|scroll|swipe|search|play|pause|stop|skip|done|send|hold|brightness|volume|wifi|bluetooth|flashlight|routine|vision|camera|screen|kholo|chalao|likho|band|roko)\b/i.test(
        lower
      );

    if (mightBeAction && process.env.GEMINI_API_KEY && !process.env.GEMINI_API_KEY.startsWith('MY_')) {
      try {
        const ai = createGeminiClient();
        const res = await ai.models.generateContent({
          model: 'gemini-3.1-flash-lite',
          contents: `Parse up to 20 ordered Android automation commands from this request (English, Hindi, or Hinglish):\n"${text}"`,
          config: {
            thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL },
            systemInstruction:
              'Classify into: phone_control, system_settings, search, communication, information, app_navigation, vision, routine, conversation, media_control. Return up to 20 ordered steps. Set requiresConfirmation=true for messaging, calling, following, or sharing.',
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                category: { type: Type.STRING },
                targetApp: { type: Type.STRING },
                summary: { type: Type.STRING },
                requiresConfirmation: { type: Type.BOOLEAN },
                confirmationPrompt: { type: Type.STRING },
                steps: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      action: { type: Type.STRING },
                      targetApp: { type: Type.STRING },
                      nodeText: { type: Type.STRING },
                      inputText: { type: Type.STRING },
                      numericValue: { type: Type.NUMBER },
                      requiresConfirmation: { type: Type.BOOLEAN },
                    },
                  },
                },
              },
            },
          },
        });
        const parsed = JSON.parse((res.text || '{}').trim()) as {
          category?: IntentCategory;
          targetApp?: string;
          summary?: string;
          requiresConfirmation?: boolean;
          confirmationPrompt?: string;
          steps?: Array<{
            action?: AutomationActionStep['action'];
            targetApp?: string;
            nodeText?: string;
            inputText?: string;
            numericValue?: number;
            requiresConfirmation?: boolean;
          }>;
        };

        const steps = (parsed.steps || []).slice(0, MAX_MULTI_COMMANDS).map((s, idx) =>
          makeStep(idx + 1, {
            action: s.action || 'read_ui_text',
            targetApp: s.targetApp || parsed.targetApp,
            nodeText: s.nodeText,
            inputText: s.inputText,
            numericValue: s.numericValue,
            requiresConfirmation: Boolean(s.requiresConfirmation || parsed.requiresConfirmation),
          })
        );

        return {
          rawText: text,
          detectedLanguage,
          category: parsed.category || 'conversation',
          confidence: 0.89,
          targetApp: parsed.targetApp,
          summary: parsed.summary || text,
          requiresConfirmation: Boolean(parsed.requiresConfirmation),
          confirmationPrompt: parsed.confirmationPrompt,
          steps,
        };
      } catch (err) {
        loggingDiagnostics.record(
          'IntentDetectionEngine',
          'WARN',
          'Gemini multi-command parse fallback to conversation',
          err instanceof Error ? err.message : String(err)
        );
      }
    }

    return {
      rawText: text,
      detectedLanguage,
      category: 'conversation',
      confidence: 0.9,
      summary: 'Natural conversation',
      requiresConfirmation: false,
      steps: [],
    };
  }
}

export const intentDetectionEngine = new IntentDetectionEngine();
