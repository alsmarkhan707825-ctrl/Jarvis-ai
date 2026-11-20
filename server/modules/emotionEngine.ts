import type { EmotionType, PersonalityId } from '../../src/types/jarvis.ts';

export const SUPPORTED_EMOTIONS: EmotionType[] = [
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

class EmotionEngine {
  /**
   * Context-driven emotion inference. Never random: follows explicit conversational cues
   * and preserves stable baseline mood per personality when neutral.
   */
  detectFromContext(
    userText: string,
    replyText: string,
    personality: PersonalityId,
    currentMood: EmotionType
  ): EmotionType {
    const combined = `${userText} ${replyText}`.toLowerCase();

    if (/\b(haha|hehe|lol|laugh|funny|joke|mazak|hansi|comedy)\b/i.test(combined)) {
      return 'Laughing';
    }
    if (/\b(angry|furious|gussa|naraj|jhagda|annoyed|unacceptable|stop it)\b/i.test(combined)) {
      return 'Angry';
    }
    if (/\b(wow|omg|really\?!|surprised|shocked|kya baat|sach mein|unbelievable)\b/i.test(combined)) {
      return 'Surprised';
    }
    if (/\b(excited|thrilled|let's go|awesome|amazing|maza aa gaya|fantastic)\b/i.test(combined)) {
      return 'Excited';
    }
    if (/\b(sad|sorry|hurt|cry|miss|dukh|udaas|lonely|broken|upset)\b/i.test(combined)) {
      return 'Sad';
    }
    if (/\b(happy|glad|congrats|khush|badiya|wonderful|great job|smile)\b/i.test(combined)) {
      return 'Happy';
    }
    if (/\b(why|how|curious|wonder|interesting|kaisa|kyu|kaise|explain)\b/i.test(combined)) {
      return 'Curious';
    }
    if (/\b(urgent|warning|critical|security|blocked|error|serious|important)\b/i.test(combined)) {
      return 'Serious';
    }

    if (personality === 'jarvis') return 'Calm';
    return currentMood || 'Normal';
  }

  buildPromptDirective(emotion: EmotionType, intensity: number): string {
    const level = intensity >= 0.75 ? 'expressive' : intensity >= 0.4 ? 'balanced' : 'subtle';
    return `Current emotional state: ${emotion} (${level} intensity). Let your word choice, pacing, and natural pauses reflect ${emotion} authentically without abrupt mood swings.`;
  }

  buildVoiceStyle(emotion: EmotionType, personality: PersonalityId, intensity: number): string {
    const scale = intensity >= 0.75 ? 'strongly' : intensity >= 0.4 ? 'naturally' : 'gently';
    const baseRole =
      personality === 'jarvis'
        ? 'deep, articulate male AI assistant'
        : personality === 'normal'
          ? 'clear, friendly conversational AI assistant'
          : personality === 'jadavis'
            ? 'witty, expressive male AI character'
            : 'warm, expressive female AI character';

    const map: Record<EmotionType, string> = {
      Normal: `Speak as a ${baseRole} with natural conversational pacing and clear human cadence.`,
      Happy: `Speak as a ${baseRole} sounding ${scale} happy, bright, and upbeat.`,
      Sad:
        personality === 'girl'
          ? `Speak as a ${baseRole} sounding ${scale} emotional, vulnerable, and softly tearful with gentle breath pauses.`
          : `Speak as a ${baseRole} sounding ${scale} tender, subdued, and empathetic with thoughtful pauses.`,
      Angry: `Speak as a ${baseRole} sounding ${scale} firm, annoyed, and sharp while remaining respectful.`,
      Laughing: `Speak as a ${baseRole} sounding ${scale} amused, lighthearted, and smiling or chuckling naturally.`,
      Curious: `Speak as a ${baseRole} sounding ${scale} inquisitive, intrigued, and attentive.`,
      Surprised: `Speak as a ${baseRole} sounding ${scale} amazed and caught off guard with lively inflection.`,
      Excited: `Speak as a ${baseRole} sounding ${scale} energetic, enthusiastic, and fast-paced.`,
      Serious: `Speak as a ${baseRole} sounding ${scale} focused, composed, and authoritative.`,
      Calm: `Speak as a ${baseRole} sounding ${scale} calm, steady, reassuring, and poised.`,
    };
    return map[emotion] || map.Normal;
  }
}

export const emotionEngine = new EmotionEngine();
