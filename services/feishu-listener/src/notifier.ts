/**
 * Feishu Notifier — sends alert messages via bot API when cookie expires.
 *
 * Uses the same config keys as the main app (feishu.appId, feishu.appSecret,
 * feishu.chatId) but reads them independently since the listener is a
 * standalone process.
 */

import { PrismaClient } from '@prisma/client';
import { createDecipheriv } from 'crypto';
import { logger } from './logger.js';

const BASE_URL = 'https://open.feishu.cn/open-apis';

let prisma: PrismaClient | null = null;

export function initNotifier(prismaClient: PrismaClient) {
  prisma = prismaClient;
}

/** Decrypt AES-256-GCM (same logic as lib/crypto.ts and index.ts) */
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

/**
 * Send a cookie-expiry alert to the configured Feishu chat.
 * This is best-effort — if anything fails, we just log and move on.
 */
export async function sendCookieExpiryAlert(reason: string): Promise<void> {
  // Use a fresh Prisma client if notifier wasn't initialized with one
  const db = prisma || new PrismaClient();
  const shouldDisconnect = !prisma;

  try {
    const appIdRaw = await db.config.findUnique({ where: { key: 'feishu.appId' } });
    const appSecretRaw = await db.config.findUnique({ where: { key: 'feishu.appSecret' } });
    const chatIdRaw = await db.config.findUnique({ where: { key: 'feishu.chatId' } });

    const appId = appIdRaw?.value || '';
    const appSecret = appSecretRaw?.value ? decrypt(appSecretRaw.value) : '';
    const chatId = chatIdRaw?.value || '';

    if (!appId || !appSecret || !chatId) {
      logger.warn('Cannot send cookie expiry alert: feishu.appId, feishu.appSecret, or feishu.chatId not configured');
      return;
    }

    // Get tenant access token
    const tokenResp = await fetch(`${BASE_URL}/auth/v3/tenant_access_token/internal`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ app_id: appId, app_secret: appSecret }),
    });
    const tokenData = (await tokenResp.json()) as any;
    if (tokenData.code !== 0) {
      logger.error(`Failed to get tenant token for alert: ${tokenData.msg}`);
      return;
    }

    const accessToken = tokenData.tenant_access_token;

    // Send alert message
    const text = `⚠️ 飞书监听服务 Cookie 已失效\n\n原因: ${reason}\n时间: ${new Date().toLocaleString('zh-CN')}\n\n请在 POA Master 设置页面更新 feishu.cookie 并重启监听服务。`;

    const msgResp = await fetch(`${BASE_URL}/im/v1/messages?receive_id_type=chat_id`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        receive_id: chatId,
        msg_type: 'text',
        content: JSON.stringify({ text }),
      }),
    });

    const msgData = (await msgResp.json()) as any;
    if (msgData.code !== 0) {
      logger.error(`Failed to send cookie expiry alert: ${msgData.msg}`);
    } else {
      logger.info('Cookie expiry alert sent to Feishu');
    }
  } catch (err: any) {
    logger.error(`Failed to send cookie expiry alert: ${err.message}`);
  } finally {
    if (shouldDisconnect) {
      await db.$disconnect();
    }
  }
}
