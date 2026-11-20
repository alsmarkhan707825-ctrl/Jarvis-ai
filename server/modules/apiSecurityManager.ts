import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';

function getDerivedKey(): Buffer {
  const secret =
    process.env.JARVIS_ENCRYPTION_SECRET ||
    process.env.GEMINI_API_KEY ||
    'jarvis-local-runtime-encryption-key-v1';
  return crypto.createHash('sha256').update(secret).digest();
}

export class ApiSecurityManager {
  static encrypt(plainText: string): string {
    const iv = crypto.randomBytes(12);
    const key = getDerivedKey();
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    const encrypted = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
  }

  static decrypt(cipherText: string): string {
    const parts = cipherText.split(':');
    if (parts.length !== 3) {
      throw new Error('Malformed encrypted payload');
    }
    const [ivHex, tagHex, dataHex] = parts;
    const iv = Buffer.from(ivHex, 'hex');
    const tag = Buffer.from(tagHex, 'hex');
    const data = Buffer.from(dataHex, 'hex');
    const key = getDerivedKey();
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);
    const decrypted = Buffer.concat([decipher.update(data), decipher.final()]);
    return decrypted.toString('utf8');
  }

  static redactSecrets(text: string): string {
    if (!text) return text;
    return text
      .replace(/AIza[0-9A-Za-z\-_]{20,}/g, '[REDACTED_KEY]')
      .replace(/sk-[0-9A-Za-z\-_]{16,}/g, '[REDACTED_KEY]')
      .replace(/gsk_[0-9A-Za-z\-_]{16,}/g, '[REDACTED_KEY]')
      .replace(/Bearer\s+[0-9A-Za-z\-_.]{16,}/gi, 'Bearer [REDACTED_TOKEN]');
  }

  static maskKeyStatus(envVarName: string): boolean {
    const val = process.env[envVarName];
    return Boolean(val && val.trim().length > 0 && !val.startsWith('MY_'));
  }
}
