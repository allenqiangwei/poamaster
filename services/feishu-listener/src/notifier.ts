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
/** Track whether today's briefing has been sent */
let lastBriefingDate = '';

/**
 * Check if it's time to send the daily briefing (around 9:00 AM).
 * Called from the 5-minute refresh interval in index.ts.
 */
export async function checkAndSendDailyBriefing(): Promise<void> {
  const now = new Date();
  const hour = now.getHours();
  const todayStr = now.toISOString().split('T')[0];

  // Only send between 9:00-9:04 (within one 5-min interval), and only once per day
  if (hour !== 9 || lastBriefingDate === todayStr) return;

  lastBriefingDate = todayStr;
  logger.info('Generating daily briefing for Feishu push...');

  try {
    // Call the insights API on the local Next.js server
    const baseUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000';
    const resp = await fetch(`${baseUrl}/api/insights/daily`, {
      headers: { Cookie: 'session=internal-briefing' },
    });

    // If auth fails (expected since we don't have a real session),
    // generate the briefing directly using the collector
    if (resp.status === 401) {
      // Direct DB approach — collect data and format it ourselves
      await sendDirectBriefing();
      return;
    }

    const data = await resp.json();
    if (data.success && data.briefing) {
      await sendBriefingToFeishu(data.briefing);
    }
  } catch (err: any) {
    logger.error(`Failed to generate daily briefing: ${err.message}`);
  }
}

/** Collect data directly from DB and send as plain text briefing */
async function sendDirectBriefing(): Promise<void> {
  const db = prisma || new PrismaClient();
  const shouldDisconnect = !prisma;

  try {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const now = new Date();

    const [overdue, completed, created, inProgress, feishuMsgCount] = await Promise.all([
      db.task.count({ where: { status: { not: 'DONE' }, dueDate: { lt: now } } }),
      db.task.count({ where: { status: 'DONE', updatedAt: { gte: since } } }),
      db.task.count({ where: { createdAt: { gte: since } } }),
      db.task.count({ where: { status: 'IN_PROGRESS' } }),
      db.feishuMessage.count({ where: { timestamp: { gte: since } } }),
    ]);

    const dateStr = now.toLocaleDateString('zh-CN', {
      year: 'numeric', month: 'long', day: 'numeric', weekday: 'long',
    });

    const lines = [
      `📋 POA Master 每日简报 — ${dateStr}`,
      '',
      `任务: 逾期 ${overdue} | 新建 ${created} | 进行中 ${inProgress} | 已完成 ${completed}`,
      `飞书消息: 过去24小时共 ${feishuMsgCount} 条`,
    ];

    if (overdue > 0) {
      lines.push('', `⚠️ 有 ${overdue} 项逾期任务需要关注！`);
    }

    await sendBriefingToFeishu(lines.join('\n'));
  } catch (err: any) {
    logger.error(`Direct briefing failed: ${err.message}`);
  } finally {
    if (shouldDisconnect) await db.$disconnect();
  }
}

/** Send briefing text to configured Feishu chat */
async function sendBriefingToFeishu(text: string): Promise<void> {
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
      logger.warn('Cannot send daily briefing: feishu bot not configured');
      return;
    }

    const tokenResp = await fetch(`${BASE_URL}/auth/v3/tenant_access_token/internal`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ app_id: appId, app_secret: appSecret }),
    });
    const tokenData = (await tokenResp.json()) as any;
    if (tokenData.code !== 0) {
      logger.error(`Failed to get token for briefing: ${tokenData.msg}`);
      return;
    }

    const msgResp = await fetch(`${BASE_URL}/im/v1/messages?receive_id_type=chat_id`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenData.tenant_access_token}`,
      },
      body: JSON.stringify({
        receive_id: chatId,
        msg_type: 'text',
        content: JSON.stringify({ text }),
      }),
    });

    const msgData = (await msgResp.json()) as any;
    if (msgData.code !== 0) {
      logger.error(`Failed to send daily briefing: ${msgData.msg}`);
    } else {
      logger.info('Daily briefing sent to Feishu');
    }
  } catch (err: any) {
    logger.error(`Failed to send daily briefing: ${err.message}`);
  } finally {
    if (shouldDisconnect) await db.$disconnect();
  }
}

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
