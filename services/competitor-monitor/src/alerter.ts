import { PrismaClient } from '@prisma/client';
import { createDecipheriv } from 'crypto';
import { logger } from './logger.js';

const BASE_URL = 'https://open.feishu.cn/open-apis';

let prisma: PrismaClient;

export function initAlerter(prismaClient: PrismaClient) {
  prisma = prismaClient;
}

export async function createAlert(
  competitorId: string,
  alertType: string,
  severity: string,
  title: string,
  summary: string
): Promise<void> {
  try {
    await prisma.competitorAlert.create({
      data: { competitorId, alertType, severity, title, summary },
    });

    logger.info(`[Alert] ${alertType}/${severity}: ${title}`);

    if (severity === 'HIGH' || severity === 'CRITICAL') {
      await sendFeishuAlert(title, summary, severity).catch(err =>
        logger.error(`[Alert] Feishu notification failed: ${err.message}`)
      );
    }
  } catch (err: any) {
    logger.error(`[Alert] Failed to create alert: ${err.message}`);
  }
}

function decrypt(encryptedText: string): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) return encryptedText;
  const parts = encryptedText.split(':');
  if (parts.length !== 3) return encryptedText;
  const key = Buffer.from(secret.padEnd(32, '0').slice(0, 32));
  const [ivHex, tagHex, encrypted] = parts;
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  return decipher.update(encrypted, 'hex', 'utf8') + decipher.final('utf8');
}

async function getConfig(key: string): Promise<string> {
  const cfg = await prisma.config.findUnique({ where: { key } });
  return cfg?.value || '';
}

async function sendFeishuAlert(title: string, summary: string, severity: string): Promise<void> {
  const appId = await getConfig('feishu.appId');
  const appSecretRaw = await getConfig('feishu.appSecret');
  const targetChatId = await getConfig('feishu.chatId');
  if (!appId || !appSecretRaw || !targetChatId) return;

  const appSecret = decrypt(appSecretRaw);
  const icon = severity === 'CRITICAL' ? '🔴' : '🟡';
  const text = `${icon} 竞品情报 [${severity}]\n\n${title}\n\n${summary}\n\n时间: ${new Date().toLocaleString('zh-CN')}`;

  const tokenResp = await fetch(`${BASE_URL}/auth/v3/tenant_access_token/internal`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ app_id: appId, app_secret: appSecret }),
  });
  const tokenData = (await tokenResp.json()) as any;
  if (tokenData.code !== 0) return;

  await fetch(`${BASE_URL}/im/v1/messages?receive_id_type=chat_id`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${tokenData.tenant_access_token}`,
    },
    body: JSON.stringify({
      receive_id: targetChatId,
      msg_type: 'text',
      content: JSON.stringify({ text }),
    }),
  });

  logger.info(`[Alert] Feishu notification sent for ${severity}: ${title}`);
}
