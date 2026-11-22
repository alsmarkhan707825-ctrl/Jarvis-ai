import type { EmotionType, PersonalityId } from '../../src/types/jarvis.ts';

export const SUPPORTED_EMOTIONS: EmotionType[] = [
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

class EmotionEngine {
  detectUserMood(
    userText: string,
    personality: PersonalityId,
    currentMood: EmotionType
  ): EmotionType {
    const text = userText.toLowerCase();

    if (
      /\b(haha|hehe|lol|laugh|funny|joke|chutkula|mazak|mazaak|hansi|hans|hanso|hasna|comedy|gudgudi)\b/i.test(
        text
      )
    ) {
      return 'Laughing';
    }
    if (
      /\b(angry|furious|gussa|naraj|naraz|jhagda|ladai|annoyed|stop it|chup|hatt|bekar|bakwas|dhoka|ignore|bhaag|bhag)\b/i.test(
        text
      )
    ) {
      return 'Angry';
    }
    if (
      /\b(sad|hurt|cry|rona|ro rahi|ro raha|dukh|udaas|udas|lonely|akela|broken|upset|bura laga|dard|sorry|maaf)\b/i.test(
        text
      )
    ) {
      return 'Sad';
    }
    if (
      /\b(romantic|love|pyaar|pyar|ishq|mohabbat|jaan|janu|baby|babu|shona|sweetheart|cute|handsome|beautiful|miss you|yaad|kiss|hug|flirt|boyfriend|girlfriend)\b/i.test(
        text
      )
    ) {
      return 'Romantic';
    }
    if (/\b(excited|thrilled|let's go|awesome|amazing|maza aa gaya|fantastic|party)\b/i.test(text)) {
      return 'Excited';
    }
    if (/\b(wow|omg|really\?!|surprised|shocked|kya baat|sach mein|unbelievable)\b/i.test(text)) {
      return 'Surprised';
    }
    if (/\b(happy|glad|congrats|khush|badiya|badhiya|wonderful|great job|smile|muskur)\b/i.test(text)) {
      return 'Happy';
    }
    if (/\b(why|how|curious|wonder|kahan the|itni der|late|der ho|kyon|kyu|kaise|kab|kis se)\b/i.test(text)) {
      return 'Curious';
    }
    if (
      /\b(normal|theek hai|thik hai|chalo chhodo|chodo|suno|kya haal|kaise ho|kya kar rahi|hello|hi|hey)\b/i.test(
        text
      )
    ) {
      return personality === 'jarvis' ? 'Calm' : 'Normal';
    }
    if (/\b(urgent|warning|critical|security|blocked|error|serious|important)\b/i.test(text)) {
      return 'Serious';
    }

    if (personality === 'jarvis') return currentMood === 'Normal' ? 'Calm' : currentMood || 'Calm';
    return currentMood || 'Normal';
  }

  detectFromContext(
    userText: string,
    replyText: string,
    personality: PersonalityId,
    currentMood: EmotionType
  ): EmotionType {
    const userMood = this.detectUserMood(userText, personality, currentMood);
    if (userMood !== currentMood) return userMood;

    const reply = replyText.toLowerCase();
    if (/\b(haha|hehe|hahaha|haste)\b/i.test(reply)) return 'Laughing';
    if (/\b(naraz|gussa|baat mat|chup|hatt)\b/i.test(reply)) return 'Angry';
    if (/\b(ro |aansu|bura laga|udaas|dukh)\b/i.test(reply)) return 'Sad';
    if (/\b(baby|jaan|janu|pyaar|miss you|dil)\b/i.test(reply)) return 'Romantic';
    return userMood;
  }

  detectSentenceMood(
    sentenceText: string,
    personality: PersonalityId,
    currentMood: EmotionType
  ): EmotionType {
    const s = sentenceText.toLowerCase();
    if (/\b(haha|hehe|hahaha|lol|funny|joke|mazak|hansi|hasi)\b/i.test(s)) return 'Laughing';
    if (/\b(naraz|gussa|baat mat|hatt|chup|annoyed|jhagda|bakwas)\b/i.test(s)) return 'Angry';
    if (/\b(ro |aansu|bura laga|udaas|dukh|hurt|sorry|maaf|miss)\b/i.test(s)) return 'Sad';
    if (/\b(jaan|janu|pyaar|pyar|love you|dil se|miss you|hug|kiss|sweetheart)\b/i.test(s)) return 'Romantic';
    if (/\b(wow|omg|kya baat|sach mein|really\?!|surprised|hairan)\b/i.test(s)) return 'Surprised';
    if (/\b(yay|awesome|amazing|excited|maza|great news|let's go)\b/i.test(s)) return 'Excited';
    if (/\b(warning|error|alert|careful|serious|dhyan|important|check)\b/i.test(s)) return 'Serious';
    if (/\b(kahan|kyon|kyu|kaise|kab|why|how|what|batao|puchho)\b|\?$/i.test(s)) return 'Curious';
    if (/\b(khush|badhiya|badiya|great|good|happy|bilkul|zaroor|welcome)\b/i.test(s)) return 'Happy';
    return currentMood || (personality === 'jarvis' ? 'Calm' : 'Normal');
  }

  buildPromptDirective(emotion: EmotionType, intensity: number, personality: PersonalityId): string {
    const level = intensity >= 0.75 ? 'expressive' : intensity >= 0.4 ? 'balanced' : 'subtle';
    if (personality === 'girl') {
      const moodGuide: Record<EmotionType, string> = {
        Normal:
          'Be Maya: logical, natural, warm, and smart with your boyfriend. Answer directly and accurately without filler.',
        Happy:
          'Be Maya: genuinely cheerful, warm, and upbeat while keeping your answer 100% logical and helpful.',
        Laughing:
          'Be Maya: chuckle naturally where genuinely funny while staying logical and on-topic.',
        Romantic:
          'Be Maya: warm, affectionate, and sweet ("jaan", "baby") while answering directly and logically.',
        Sad:
          'Be Maya: empathetic, gentle, and caring if the topic is emotional or sad.',
        Angry:
          'Be Maya: playfully annoyed or firm if genuinely teased, while still answering clearly.',
        Curious:
          'Be Maya: attentive, inquisitive, and thoughtful about what the user said.',
        Surprised:
          'Be Maya: react with natural surprise while addressing the user\'s point logically.',
        Excited:
          'Be Maya: energetic and enthusiastic when sharing good news or plans.',
        Serious:
          'Be Maya: focused, grounded, and serious—deliver facts cleanly without jokes.',
        Calm:
          'Be Maya: calm, reassuring, and steady.',
      };
      return (
        `Current Mood: ${emotion} (${level}). ` +
        (moodGuide[emotion] || moodGuide.Normal)
      );
    }

    return (
      `Current Mood: ${emotion} (${level}). ` +
      `Respond like Tony Stark's Iron Man JARVIS (created by ALSMAR BOSS): sharp, ultra-intelligent, 100% logical, composed, calling the user Sir or Boss.`
    );
  }

  buildVoiceStyle(emotion: EmotionType, personality: PersonalityId, intensity: number): string {
    const scale = intensity >= 0.75 ? 'strongly' : intensity >= 0.4 ? 'naturally' : 'gently';
    const baseRole =
      personality === 'jarvis'
        ? 'sharp, classy, intelligent British-toned Iron Man JARVIS companion'
        : 'real, smart, warm, expressive human girlfriend Maya';

    const map: Record<EmotionType, string> = {
      Normal: `Speak as a ${baseRole} with natural conversational pacing and clear human cadence.`,
      Happy: `Speak as a ${baseRole} sounding ${scale} happy, bright, smiling, and upbeat.`,
      Romantic: `Speak as a ${baseRole} sounding ${scale} warm, affectionate, charming, soft, and captivating.`,
      Sad:
        personality === 'girl'
          ? `Speak as a ${baseRole} sounding ${scale} emotional, soft, and empathetic with gentle pauses.`
          : `Speak as a ${baseRole} sounding ${scale} tender, subdued, and empathetic with thoughtful pauses.`,
      Angry: `Speak as a ${baseRole} sounding ${scale} firm, expressive, and annoyed while keeping human charm.`,
      Laughing: `Speak as a ${baseRole} sounding ${scale} amused, chuckling naturally with lively energy.`,
      Curious: `Speak as a ${baseRole} sounding ${scale} inquisitive, intrigued, and attentive.`,
      Surprised: `Speak as a ${baseRole} sounding ${scale} amazed and lively.`,
      Excited: `Speak as a ${baseRole} sounding ${scale} energetic, enthusiastic, and upbeat.`,
      Serious: `Speak as a ${baseRole} sounding ${scale} focused, composed, and steady.`,
      Calm: `Speak as a ${baseRole} sounding ${scale} calm, steady, reassuring, and poised.`,
    };
    return map[emotion] || map.Normal;
  }
}

export const emotionEngine = new EmotionEngine();
