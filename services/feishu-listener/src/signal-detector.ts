/**
 * Real-time signal detector — scans each incoming Feishu message
 * for keyword patterns that indicate operational signals (RISK,
 * BLOCKER, ESCALATION). Matches create ChatSignal records and
 * trigger Feishu notifications for HIGH+ severity.
 */

import { PrismaClient } from '@prisma/client';
import { createDecipheriv } from 'crypto';
import { logger } from './logger.js';

const BASE_URL = 'https://open.feishu.cn/open-apis';

let prisma: PrismaClient;

export function initSignalDetector(prismaClient: PrismaClient) {
  prisma = prismaClient;
}

interface SignalRule {
  patterns: string[];
  type: string;
  severity: string;
}

const RULES: SignalRule[] = [
  // RISK — 项目/业务风险
  { patterns: ['CRITICAL', '严重', '崩溃', '宕机', '故障', '事故'], type: 'RISK', severity: 'CRITICAL' },
  { patterns: ['报警', '异常', '风险', '警告', '告警'], type: 'RISK', severity: 'HIGH' },
  // BLOCKER — 进度阻塞
  { patterns: ['延期', '卡住', '阻塞', '等待审批', '搞不定', '无法推进'], type: 'BLOCKER', severity: 'MEDIUM' },
  // ESCALATION — 需上级关注
  { patterns: ['紧急', '急需', '尽快处理', '升级处理'], type: 'ESCALATION', severity: 'HIGH' },
];

interface MessageInfo {
  messageId: string;
  chatId: string;
  senderName: string;
  content: string;
  chatType: string;
}

/**
 * Detect signals in a message. Called after message is saved to DB.
 * Only processes text/post messages from group chats.
 */
export async function detectSignals(msg: MessageInfo): Promise<void> {
  if (!prisma) return;
  // Only scan group chats with text content
  if (msg.chatType !== 'group' || !msg.content) return;

  const contentLower = msg.content.toLowerCase();

  for (const rule of RULES) {
    const matched = rule.patterns.some(p => contentLower.includes(p.toLowerCase()));
    if (!matched) continue;

    const matchedPattern = rule.patterns.find(p => contentLower.includes(p.toLowerCase())) || '';
    const preview = msg.content.length > 80 ? msg.content.substring(0, 80) + '...' : msg.content;

    try {
      await prisma.chatSignal.create({
        data: {
          chatId: msg.chatId,
          signalType: rule.type,
          severity: rule.severity,
          title: `[${matchedPattern}] ${msg.senderName}`,
          summary: preview,
          messageIds: [msg.messageId],
          relatedUser: msg.senderName,
          source: 'realtime',
        },
      });

      logger.info(`[Signal] ${rule.type}/${rule.severity} detected in ${msg.chatId}: ${matchedPattern}`);

      // Notify COO for HIGH+ severity
      if (rule.severity === 'HIGH' || rule.severity === 'CRITICAL') {
        sendSignalAlert(rule.type, rule.severity, msg.senderName, preview, msg.chatId)
          .catch(err => logger.error(`[Signal] Alert send failed: ${err.message}`));
      }
    } catch (err: any) {
      logger.error(`[Signal] Failed to create signal: ${err.message}`);
    }

    // Only create one signal per message (highest severity wins since rules are ordered)
    break;
  }
}

/** Decrypt AES-256-GCM (same pattern as notifier.ts) */
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

/** Send signal alert to COO via Feishu bot */
async function sendSignalAlert(
  type: string, severity: string, sender: string, preview: string, chatId: string
): Promise<void> {
  const chat = await prisma.feishuChat.findUnique({ where: { chatId }, select: { name: true } });
  const chatName = chat?.name || chatId;
  const icon = severity === 'CRITICAL' ? '🔴' : '🟡';
  const text = `${icon} 运营信号 [${type}/${severity}]\n\n群聊: ${chatName}\n发送人: ${sender}\n内容: ${preview}\n\n时间: ${new Date().toLocaleString('zh-CN')}`;

  const appId = await getConfig('feishu.appId');
  const appSecretRaw = await getConfig('feishu.appSecret');
  const targetChatId = await getConfig('feishu.chatId');

  if (!appId || !appSecretRaw || !targetChatId) return;

  const appSecret = decrypt(appSecretRaw);

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

  logger.info(`[Signal] Alert sent to Feishu for ${type}/${severity}`);
}

async function getConfig(key: string): Promise<string> {
  const cfg = await prisma.config.findUnique({ where: { key } });
  return cfg?.value || '';
}
