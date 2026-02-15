/**
 * Feishu Bot Reply — sends messages to Feishu chats via the Bot API.
 *
 * Provides a reusable `sendReply(chatId, text)` function that any module
 * can call to post a text message into a specified Feishu chat.
 *
 * Uses the same config keys (feishu.appId, feishu.appSecret) and decrypt
 * pattern as notifier.ts.
 */

import { PrismaClient } from '@prisma/client';
import { createDecipheriv } from 'crypto';
import { logger } from './logger.js';

const BASE_URL = 'https://open.feishu.cn/open-apis';

let prisma: PrismaClient | null = null;

export function initBotReply(prismaClient: PrismaClient) {
  prisma = prismaClient;
}

/** Decrypt AES-256-GCM (same logic as lib/crypto.ts and notifier.ts) */
function decrypt(encryptedText: string): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) return encryptedText;

  const parts = encryptedText.split(':');
  if (parts.length !== 3) return encryptedText;

  const key = Buffer.from(secret.padEnd(32, '0').slice(0, 32));
  const [ivHex, tagHex, encrypted] = parts;
  const iv = Buffer.from(ivHex, 'hex');
  const tag = Buffer.from(tagHex, 'hex');
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

/** Read a config value from the database */
async function getConfig(key: string): Promise<string> {
  if (!prisma) return '';
  const cfg = await prisma.config.findUnique({ where: { key } });
  return cfg?.value || '';
}

/** Get a tenant access token from Feishu using app credentials */
async function getTenantToken(): Promise<string | null> {
  const appId = await getConfig('feishu.appId');
  const appSecretRaw = await getConfig('feishu.appSecret');
  if (!appId || !appSecretRaw) return null;

  const appSecret = decrypt(appSecretRaw);
  const resp = await fetch(`${BASE_URL}/auth/v3/tenant_access_token/internal`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ app_id: appId, app_secret: appSecret }),
  });
  const data = (await resp.json()) as any;
  if (data.code !== 0) {
    logger.error(`[BotReply] Failed to get tenant token: ${data.msg}`);
    return null;
  }
  return data.tenant_access_token || null;
}

/**
 * Send a text message to a Feishu chat.
 *
 * @param chatId  The Feishu chat ID to send to
 * @param text    The text content of the message
 * @returns true if the message was sent successfully, false otherwise
 */
export async function sendReply(chatId: string, text: string): Promise<boolean> {
  try {
    const token = await getTenantToken();
    if (!token) {
      logger.error('[BotReply] No tenant token available');
      return false;
    }

    const resp = await fetch(`${BASE_URL}/im/v1/messages?receive_id_type=chat_id`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        receive_id: chatId,
        msg_type: 'text',
        content: JSON.stringify({ text }),
      }),
    });

    const data = (await resp.json()) as any;
    if (data.code !== 0) {
      logger.error(`[BotReply] Send failed: ${data.msg}`);
      return false;
    }

    logger.info(`[BotReply] Sent reply to ${chatId}`);
    return true;
  } catch (err: any) {
    logger.error(`[BotReply] Error: ${err.message}`);
    return false;
  }
}
