import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

/**
 * 加密工具
 * 使用 AES-256-GCM 算法加密敏感配置
 */

const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32;

function getKey(): Buffer {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error('SESSION_SECRET not found in environment');
  }
  // 使用 SESSION_SECRET 前 32 字符作为密钥
  return Buffer.from(secret.padEnd(KEY_LENGTH, '0').slice(0, KEY_LENGTH));
}

/**
 * 加密字符串
 * @param text 明文
 * @returns 加密后的字符串（格式：iv:tag:encrypted）
 */
export function encrypt(text: string): string {
  const iv = randomBytes(16);
  const key = getKey();
  const cipher = createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  const tag = cipher.getAuthTag();

  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted}`;
}

/**
 * 解密字符串
 * @param encryptedText 加密文本（格式：iv:tag:encrypted）
 * @returns 明文
 */
export function decrypt(encryptedText: string): string {
  const parts = encryptedText.split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted text format');
  }

  const [ivHex, tagHex, encrypted] = parts;
  const iv = Buffer.from(ivHex, 'hex');
  const tag = Buffer.from(tagHex, 'hex');
  const key = getKey();

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);

  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}
