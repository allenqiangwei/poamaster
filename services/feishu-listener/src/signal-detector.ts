/**
 * Real-time signal detector — scans each incoming Feishu message
 * for keyword patterns that indicate operational signals (RISK,
 * BLOCKER, ESCALATION). Matches create ChatSignal records and
 * trigger Feishu notifications for HIGH+ severity.
 *
 * Rules are loaded from DB (AlertRule table) with fallback to
 * hardcoded defaults. Supports whitelist filtering, cooldown
 * deduplication, and silent-hours suppression.
 */

import { PrismaClient } from '@prisma/client';
import { createDecipheriv } from 'crypto';
import { logger } from './logger.js';

const BASE_URL = 'https://open.feishu.cn/open-apis';

let prisma: PrismaClient;

interface SignalRule {
  patterns: string[];
  type: string;
  severity: string;
}

// ---------- Rules ----------

let rules: SignalRule[] = [];

const FALLBACK_RULES: SignalRule[] = [
  // RISK — 项目/业务风险
  { patterns: ['CRITICAL', '严重', '崩溃', '宕机', '故障', '事故'], type: 'RISK', severity: 'CRITICAL' },
  { patterns: ['报警', '异常', '风险', '警告', '告警'], type: 'RISK', severity: 'HIGH' },
  // BLOCKER — 进度阻塞
  { patterns: ['延期', '卡住', '阻塞', '等待审批', '搞不定', '无法推进'], type: 'BLOCKER', severity: 'MEDIUM' },
  // ESCALATION — 需上级关注
  { patterns: ['紧急', '急需', '尽快处理', '升级处理'], type: 'ESCALATION', severity: 'HIGH' },
];

export async function loadRules(): Promise<void> {
  if (!prisma) { rules = FALLBACK_RULES; return; }
  try {
    const dbRules = await prisma.alertRule.findMany({ where: { isEnabled: true } });
    if (dbRules.length === 0) { rules = FALLBACK_RULES; return; }
    // Group by type+severity to combine patterns
    const grouped = new Map<string, string[]>();
    for (const r of dbRules) {
      const key = `${r.signalType}:${r.severity}`;
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key)!.push(r.keyword);
    }
    rules = Array.from(grouped.entries()).map(([key, patterns]) => {
      const [type, severity] = key.split(':');
      return { patterns, type, severity };
    });
    logger.info(`[Signal] Loaded ${dbRules.length} alert rules (${rules.length} groups)`);
  } catch (err: any) {
    logger.error(`[Signal] Failed to load rules from DB, using fallback: ${err.message}`);
    rules = FALLBACK_RULES;
  }
}

// ---------- Whitelists ----------

let whitelistedChatIds = new Set<string>();
let whitelistedSenderIds = new Set<string>();

async function loadWhitelists(): Promise<void> {
  if (!prisma) return;
  try {
    const [chats, senders] = await Promise.all([
      prisma.feishuChat.findMany({ where: { isWhitelisted: true }, select: { chatId: true } }),
      prisma.alertSenderWhitelist.findMany({ select: { senderId: true } }),
    ]);
    whitelistedChatIds = new Set(chats.map((c: any) => c.chatId));
    whitelistedSenderIds = new Set(senders.map((s: any) => s.senderId));
  } catch { /* ignore, use empty sets */ }
}

export async function reloadConfig(): Promise<void> {
  await Promise.all([loadRules(), loadWhitelists()]);
}

// ---------- Init ----------

export function initSignalDetector(prismaClient: PrismaClient) {
  prisma = prismaClient;
  reloadConfig();
  setInterval(() => reloadConfig(), 5 * 60_000);
}

// ---------- Detection ----------

interface MessageInfo {
  messageId: string;
  chatId: string;
  senderId: string;
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

  // Skip messages sent by our own bot to prevent infinite alert loops
  // (bot sends "🔴 运营信号 [RISK/CRITICAL]" which itself contains "CRITICAL")
  if (msg.content.includes('运营信号 [')) return;

  // Whitelist checks
  if (whitelistedChatIds.has(msg.chatId)) return;
  if (msg.senderId && whitelistedSenderIds.has(msg.senderId)) return;

  const contentLower = msg.content.toLowerCase();

  for (const rule of rules) {
    const matched = rule.patterns.some(p => contentLower.includes(p.toLowerCase()));
    if (!matched) continue;

    const matchedPattern = rule.patterns.find(p => contentLower.includes(p.toLowerCase())) || '';
    const preview = msg.content.length > 80 ? msg.content.substring(0, 80) + '...' : msg.content;

    try {
      // Cooldown check — skip if same signal type fired recently in this chat
      const cooldownMinutes = parseInt((await getConfig('alert.cooldownMinutes')) || '30');
      const cooldownSince = new Date(Date.now() - cooldownMinutes * 60_000);
      const recentSignal = await prisma.chatSignal.findFirst({
        where: { chatId: msg.chatId, signalType: rule.type, createdAt: { gte: cooldownSince } },
      });
      if (recentSignal) {
        logger.info(`[Signal] Skipped ${rule.type} in ${msg.chatId} (cooldown)`);
        break;
      }

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

      // Notify COO if severity meets threshold and outside silent hours
      if (await shouldNotify(rule.severity)) {
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

// ---------- Notification logic ----------

async function shouldNotify(severity: string): Promise<boolean> {
  const minSeverity = (await getConfig('alert.minNotifySeverity')) || 'HIGH';
  const levels = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
  if (levels.indexOf(severity) < levels.indexOf(minSeverity)) return false;

  // Silent hours check
  const silentStart = (await getConfig('alert.silentStart')) || '22:00';
  const silentEnd = (await getConfig('alert.silentEnd')) || '08:00';
  const now = new Date();
  const currentTime = now.getHours() * 60 + now.getMinutes();
  const [startH, startM] = silentStart.split(':').map(Number);
  const [endH, endM] = silentEnd.split(':').map(Number);
  const startTime = startH * 60 + startM;
  const endTime = endH * 60 + endM;

  if (startTime > endTime) {
    // Overnight range (e.g. 22:00 – 08:00)
    if (currentTime >= startTime || currentTime < endTime) return false;
  } else {
    if (currentTime >= startTime && currentTime < endTime) return false;
  }
  return true;
}

// ---------- Helpers ----------

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
