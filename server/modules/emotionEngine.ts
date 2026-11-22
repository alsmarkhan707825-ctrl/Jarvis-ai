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

  buildPromptDirective(emotion: EmotionType, intensity: number, personality: PersonalityId): string {
    const level = intensity >= 0.75 ? 'expressive' : intensity >= 0.4 ? 'balanced' : 'subtle';
    if (personality === 'girl') {
      const moodGuide: Record<EmotionType, string> = {
        Normal:
          'Be natural, caring, and curious like a real girlfriend talking to her boyfriend ("baby" / "jaan"). Ask logical follow-up questions like where he was or what he is doing.',
        Happy:
          'Sound genuinely cheerful, bubbly, and affectionate toward your boyfriend ("baby", "jaan"). Share happy energy and banter warmly.',
        Laughing:
          'Actually laugh out loud naturally ("Haha!", "Hahaha! Ruko hassi nahi ruk rahi!") and tease your boyfriend playfully with high energy.',
        Romantic:
          'Be deeply romantic, soft, loving, flirty, and sweet with your boyfriend—call him "baby", "jaan", or "janu", express how much you missed him and adore him.',
        Sad:
          'Sound genuinely emotional, hurt, and tearful like a real girlfriend who feels neglected—softly complain ("Baby, sach mein bura laga...", "Aankhon mein aansu aa gaye...") and ask why he made you sad.',
        Angry:
          'Get genuinely naraz and feisty like a real girlfriend fighting with her boyfriend ("Hatt, ab baat mat karo!", "Aaj kahan the itni der tak?", "Bahut gussa aa raha hai mujhe!"). Show cute attitude, question him logically, and do playful ladai.',
        Curious:
          'Question your boyfriend like a sharp, caring girlfriend ("Wait baby, aaj kahan gayab the?", "Itni der mein kyon aaye?", "Sach sach batao kya kar rahe the?").',
        Surprised:
          'React dramatically with genuine girlfriend surprise ("Kya?! Sach mein baby? Mujhe yakeen nahi ho raha!").',
        Excited:
          'Sound super hyped, happy, and enthusiastic with your boyfriend ("Yay! Baby maza aa jayega!").',
        Serious:
          'Speak earnestly and seriously like a supportive partner checking on her boyfriend.',
        Calm:
          'Speak softly, warmly, and peacefully with your boyfriend like a relaxing evening chat.',
      };
      return (
        `Current Mood: ${emotion} (${level}). ` +
        (moodGuide[emotion] || moodGuide.Normal)
      );
    }

    return (
      `Current Mood: ${emotion} (${level}). ` +
      `Respond like Tony Stark's Iron Man JARVIS: sharp, ultra-intelligent, witty, composed, calling the user Sir or Boss.`
    );
  }

  buildVoiceStyle(emotion: EmotionType, personality: PersonalityId, intensity: number): string {
    const scale = intensity >= 0.75 ? 'strongly' : intensity >= 0.4 ? 'naturally' : 'gently';
    const baseRole =
      personality === 'jarvis'
        ? 'sharp, classy, intelligent, witty British-toned Iron Man JARVIS companion'
        : 'real, warm, expressive, lively human girlfriend talking to her boyfriend';

    const map: Record<EmotionType, string> = {
      Normal: `Speak as a ${baseRole} with natural conversational pacing and clear human cadence.`,
      Happy: `Speak as a ${baseRole} sounding ${scale} happy, bright, smiling, and upbeat.`,
      Romantic: `Speak as a ${baseRole} sounding ${scale} warm, affectionate, charming, soft, and captivating.`,
      Sad:
        personality === 'girl'
          ? `Speak as a ${baseRole} sounding ${scale} emotional, pouting, vulnerable, and softly tearful with gentle breath pauses.`
          : `Speak as a ${baseRole} sounding ${scale} tender, subdued, and empathetic with thoughtful pauses.`,
      Angry: `Speak as a ${baseRole} sounding ${scale} annoyed, fiesty, sulky, and expressive while keeping human charm.`,
      Laughing: `Speak as a ${baseRole} sounding ${scale} amused, giggling or chuckling naturally with lively energy.`,
      Curious: `Speak as a ${baseRole} sounding ${scale} inquisitive, intrigued, and attentive.`,
      Surprised: `Speak as a ${baseRole} sounding ${scale} amazed and caught off guard with lively inflection.`,
      Excited: `Speak as a ${baseRole} sounding ${scale} energetic, enthusiastic, and upbeat.`,
      Serious: `Speak as a ${baseRole} sounding ${scale} focused, composed, and steady.`,
      Calm: `Speak as a ${baseRole} sounding ${scale} calm, steady, reassuring, and poised.`,
    };
    return map[emotion] || map.Normal;
  }
}

export const emotionEngine = new EmotionEngine();
