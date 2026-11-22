export class AudioProcessingEngine {
  static normalizeMimeType(rawMime?: string): string {
    if (!rawMime) return 'audio/webm';
    const base = rawMime.split(';')[0].trim().toLowerCase();
    const supported = ['audio/webm', 'audio/wav', 'audio/mp3', 'audio/mpeg', 'audio/ogg', 'audio/mp4'];
    return supported.includes(base) ? base : 'audio/webm';
  }

  static stripBase64Prefix(dataUrlOrBase64: string): string {
    const idx = dataUrlOrBase64.indexOf('base64,');
    if (idx !== -1) {
      return dataUrlOrBase64.slice(idx + 7).trim();
    }
    return dataUrlOrBase64.trim();
  }

  static stripEmojisAndMarkdown(text: string): string {
    return text
      .replace(/```[\s\S]*?```/g, ' ')
      .replace(/`([^`]+)`/g, '$1')
      .replace(/\*\*([^*]+)\*\*/g, '$1')
      .replace(/\*([^*]+)\*/g, '$1')
      .replace(/#+\s+/g, '')
      .replace(/[\p{Extended_Pictographic}\p{Emoji_Presentation}\u200D\uFE0F\u2600-\u27BF]/gu, '')
      .replace(/[:;][-~]?[)D(P]/g, '')
      .replace(/[•▪►◆★☆✓✔✕✖]/g, ' ')
      .replace(/ {2,}/g, ' ');
  }

  static sanitizeTextForSpeech(text: string): string {
    return AudioProcessingEngine.stripEmojisAndMarkdown(text)
      .replace(/[_~<>|]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 1800);
  }
}
