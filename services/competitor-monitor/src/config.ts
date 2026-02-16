/**
 * Config reader for standalone service.
 * Reads from the Config table and decrypts sensitive values using SESSION_SECRET.
 */

import { createDecipheriv } from 'crypto';
import { prisma } from './index.js';

const SENSITIVE_KEYS = ['openai.apiKey', 'feishu.appSecret', 'feishu.cookie', 'serper.apiKey', 'x.password', 'x.email'];

function decrypt(encryptedText: string): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error('SESSION_SECRET not found in environment');

  const key = Buffer.from(secret.padEnd(32, '0').slice(0, 32));
  const parts = encryptedText.split(':');
  if (parts.length !== 3) throw new Error('Invalid encrypted text format');

  const [ivHex, tagHex, encrypted] = parts;
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));

  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

export async function getConfig(key: string): Promise<string | null> {
  const config = await prisma.config.findUnique({ where: { key } });
  if (!config) return null;

  if (SENSITIVE_KEYS.includes(key)) {
    try {
      return decrypt(config.value);
    } catch {
      return null;
    }
  }

  return config.value;
}
