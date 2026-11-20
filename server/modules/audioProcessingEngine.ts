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

  static sanitizeTextForSpeech(text: string): string {
    return text
      .replace(/```[\s\S]*?```/g, ' Code block omitted. ')
      .replace(/`([^`]+)`/g, '$1')
      .replace(/\*\*([^*]+)\*\*/g, '$1')
      .replace(/\*([^*]+)\*/g, '$1')
      .replace(/#+\s+/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 1800);
  }
}
