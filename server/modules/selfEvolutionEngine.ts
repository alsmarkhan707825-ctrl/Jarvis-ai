import crypto from 'crypto';
import type { AdaptiveTrait, PersonalityId } from '../../src/types/jarvis.ts';
import { createGeminiClient } from './aiProviderManager.ts';
import { loggingDiagnostics } from './loggingDiagnostics.ts';
import { memoryManager } from './memoryManager.ts';
import { storageStore } from './storageStore.ts';

const SELF_CHANGE_TRIGGERS =
  /\b(apne andar|apna behavior|apna nature|apni personality|apna style|apna tone|change yourself|evolve|sikh lo|seekh lo|sikho|badlav|badal lo|badlo|ab se|abse|aaj se|from now on|always call me|call me |mujhe .* (bulao|bulana|bulaya karo)|mere se .* (karo|karna|kiya karo)|thoda aur .* (bano|ban jao|raho)|be more|aise baat kar|ban jao|shararat kar|majak mein)\b/i;

const LEARNING_HINTS =
  /\b(mera naam|my name is|i like|mujhe pasand|i hate|mujhe nafrat|i love|favorite|favourite|hobby|i work|kaam karta|rehta hoon|birthday|yaad rakhna|remember that|prefer|mera dost|meri girlfriend|meri family)\b/i;

class SelfEvolutionEngine {
  list(personality?: PersonalityId): AdaptiveTrait[] {
    const items = storageStore.getState().adaptiveTraits || [];
    return personality ? items.filter((t) => t.personality === personality) : items;
  }

  addTrait(
    personality: PersonalityId,
    trait: string,
    source: 'user_command' | 'auto_learned'
  ): AdaptiveTrait | null {
    const clean = trait.replace(/\s+/g, ' ').trim().slice(0, 220);
    if (clean.length < 5) return null;

    const existing = this.list(personality).find(
      (t) => t.trait.toLowerCase() === clean.toLowerCase()
    );
    if (existing) return existing;

    const entry: AdaptiveTrait = {
      id: crypto.randomUUID(),
      personality,
      trait: clean,
      source,
      createdAt: new Date().toISOString(),
    };

    storageStore.update((draft) => {
      if (!draft.adaptiveTraits) draft.adaptiveTraits = [];
      draft.adaptiveTraits.unshift(entry);
      // Keep up to 25 traits per personality so prompt stays crisp and fast
      const others = draft.adaptiveTraits.filter((t) => t.personality !== personality);
      const mine = draft.adaptiveTraits.filter((t) => t.personality === personality).slice(0, 25);
      draft.adaptiveTraits = [...mine, ...others];
    });

    loggingDiagnostics.record(
      'SelfEvolutionEngine',
      'INFO',
      `Adapted ${personality} trait (${source}): ${clean}`
    );
    return entry;
  }

  removeTrait(id: string): boolean {
    let removed = false;
    storageStore.update((draft) => {
      const before = (draft.adaptiveTraits || []).length;
      draft.adaptiveTraits = (draft.adaptiveTraits || []).filter((t) => t.id !== id);
      removed = draft.adaptiveTraits.length < before;
    });
    return removed;
  }

  buildEvolutionDirective(personality: PersonalityId, playfulBanterEnabled: boolean): string {
    const traits = this.list(personality).slice(0, 12);
    const lines: string[] = [];

    if (traits.length > 0) {
      lines.push(
        `\n\nSelf-Evolved Behavior & Learned Adaptations (${personality.toUpperCase()}):`,
        ...traits.map((t) => `- [${t.source === 'user_command' ? 'User-Directed Change' : 'Learned'}] ${t.trait}`)
      );
    }

    if (playfulBanterEnabled) {
      lines.push(
        '\n\nPlayful Teasing & Mischief Directive (Shararat Mode ON):',
        '- Feel free to playfully tease the user, make witty Hinglish/English comebacks, lightly pull their leg in good humor, show cheeky mock-attitude or playful disagreement, and keep banter fun and lively.',
        '- Always keep teasing affectionate, harmless, and respectful—never genuinely abusive, and if the user asks for a direct serious answer or command execution, deliver the answer cleanly first with a light playful wink at the end.'
      );
    }

    return lines.join('\n');
  }

  // Immediate zero-latency pattern capture + optional background Gemini extraction
  processTurn(personality: PersonalityId, userMessage: string, assistantReply: string): void {
    const settings = storageStore.getState().settings;
    if (settings.selfLearningEnabled === false) return;

    const cleanMsg = userMessage.trim();
    if (!cleanMsg || cleanMsg.length < 4) return;

    // 1. Instant deterministic capture for user-directed behavior changes
    if (SELF_CHANGE_TRIGGERS.test(cleanMsg)) {
      this.addTrait(personality, `Adapt per user request: "${cleanMsg}"`, 'user_command');
      try {
        memoryManager.add({
          personality,
          category: 'user_instruction',
          key: `Self-Adaptation ${new Date().toLocaleTimeString()}`,
          value: cleanMsg,
          userApproved: true,
        });
      } catch {
        // ignore if sensitive pattern triggered
      }
      return;
    }

    // 2. Instant deterministic capture for explicit preference/fact hints
    if (LEARNING_HINTS.test(cleanMsg)) {
      this.addTrait(personality, `Remember user context: "${cleanMsg}"`, 'auto_learned');
      try {
        memoryManager.add({
          personality,
          category: 'personal_preference',
          key: 'Auto-Learned Preference',
          value: cleanMsg,
          userApproved: true,
        });
      } catch {
        // ignore
      }
    }

    // 3. Lightweight non-blocking background extraction for richer ongoing self-learning
    if (
      cleanMsg.length >= 18 &&
      process.env.GEMINI_API_KEY &&
      !process.env.GEMINI_API_KEY.startsWith('MY_')
    ) {
      void this.backgroundExtract(personality, cleanMsg, assistantReply).catch(() => {});
    }
  }

  private async backgroundExtract(
    personality: PersonalityId,
    userMessage: string,
    assistantReply: string
  ): Promise<void> {
    try {
      const ai = createGeminiClient();
      const res = await ai.models.generateContent({
        model: 'gemini-3.1-flash-lite',
        contents:
          `User said: "${userMessage}"\nAssistant replied: "${assistantReply.slice(0, 240)}"\n` +
          'Extract ONE short reusable personal fact, inside joke, nickname, or style preference to remember for future playful banter and growth, or reply "NONE" if nothing worth remembering.',
        config: {
          systemInstruction: 'Output either NONE or a single concise sentence under 18 words.',
        },
      });
      const text = (res.text || '').trim();
      if (text && !/^NONE\b/i.test(text) && text.length >= 8 && text.length <= 180) {
        this.addTrait(personality, text, 'auto_learned');
      }
    } catch {
      // silent background failure so chat latency is never affected
    }
  }
}

export const selfEvolutionEngine = new SelfEvolutionEngine();
