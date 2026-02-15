import { PrismaClient } from '@prisma/client';
import { DecodedMessage } from './decoder.js';
import { logger } from './logger.js';
import {
  resolveNames,
  recordUserName,
  getCachedUserName,
} from './name-resolver.js';
import {
  registerMentionMapping,
  getNameByNumericId,
} from './open-api.js';
import { detectSignals } from './signal-detector.js';
import { processMessage } from './bot-agent.js';
import { sendReply } from './bot-reply.js';

let prisma: PrismaClient;

/** In-memory blacklist cache — avoids a DB query per message */
const blacklistedChatIds = new Set<string>();

/** In-memory cache of user-assigned names (Assignee.feishuUserId → name) */
const assigneeNameCache = new Map<string, string>();

/** Cached bot name from config — avoids a DB query per message */
let cachedBotName: string | null = null;
let botNameFetchedAt = 0;

async function getBotName(): Promise<string> {
  const now = Date.now();
  if (cachedBotName && now - botNameFetchedAt < 60000) return cachedBotName;
  try {
    const cfg = await prisma?.config.findUnique({ where: { key: 'feishu.botName' } });
    cachedBotName = cfg?.value || 'POA';
    botNameFetchedAt = now;
  } catch {
    cachedBotName = 'POA';
  }
  return cachedBotName;
}

export async function refreshAssigneeNames(): Promise<void> {
  const assignees = await prisma.assignee.findMany({
    where: { feishuUserId: { not: null } },
    select: { feishuUserId: true, name: true },
  });
  assigneeNameCache.clear();
  for (const a of assignees) {
    if (a.feishuUserId) {
      assigneeNameCache.set(a.feishuUserId, a.name);
    }
  }
  logger.debug(`Assignee name cache refreshed: ${assigneeNameCache.size} entries`);
}

export async function refreshBlacklist(): Promise<void> {
  const chats = await prisma.feishuChat.findMany({
    where: { isBlacklisted: true },
    select: { chatId: true },
  });
  blacklistedChatIds.clear();
  for (const c of chats) {
    blacklistedChatIds.add(c.chatId);
  }
  logger.debug(`Blacklist refreshed: ${blacklistedChatIds.size} chats`);
}

export function initMessageHandler(prismaClient?: PrismaClient) {
  prisma = prismaClient || new PrismaClient();
  logger.info('Message handler initialized (Prisma connected)');
  // Load caches on startup
  refreshBlacklist().catch((err) =>
    logger.error('Failed to load blacklist on startup:', err)
  );
  refreshAssigneeNames().catch((err) =>
    logger.error('Failed to load assignee names on startup:', err)
  );
  return prisma;
}

export async function shutdownMessageHandler() {
  if (prisma) {
    await prisma.$disconnect();
    logger.info('Prisma disconnected');
  }
}

/** Track processed messages for stats */
let messageCount = 0;
export function getMessageCount(): number {
  return messageCount;
}

/**
 * Process a decoded message:
 * 1. Learn user names from @mentions
 * 2. Resolve sender name from cache/API
 * 3. Upsert FeishuChat (create if new, update lastMessage time)
 * 4. Create FeishuMessage (skip duplicates via messageId unique constraint)
 */
export async function handleMessage(msg: DecodedMessage): Promise<void> {
  try {
    // Learn user names from @mentions in this message
    if (msg.mentions) {
      for (const mention of msg.mentions) {
        recordUserName(mention.userId, mention.displayName);
        // Also register with Open API module for cross-referencing
        registerMentionMapping(mention.userId, mention.displayName);
      }
    }

    // Resolve sender name from multiple sources (priority order)
    if (!msg.senderName && msg.senderId) {
      // 1. User-assigned name via Assignee table (highest priority)
      msg.senderName = assigneeNameCache.get(msg.senderId) || '';
    }
    if (!msg.senderName && msg.senderId) {
      // 2. Open API mapping
      msg.senderName = getNameByNumericId(msg.senderId);
    }
    if (!msg.senderName && msg.senderId) {
      // Try legacy name resolver cache
      msg.senderName = getCachedUserName(msg.senderId);
    }
    if (!msg.senderName) {
      // Try to resolve unknown names via API (best-effort)
      await resolveNames([msg]);
    }

    const displayName = msg.senderName || msg.senderId;

    // Upsert chat
    await prisma.feishuChat.upsert({
      where: { chatId: msg.chatId },
      create: {
        chatId: msg.chatId,
        chatType: msg.chatType,
        name: msg.chatType === 'private' ? displayName || null : null,
        lastMessage: msg.timestamp,
      },
      update: {
        lastMessage: msg.timestamp,
        // Don't auto-update name here — respect manual renames (isRenamed flag)
      },
    });

    // Skip blacklisted chats — still upsert chat metadata above so
    // the chat record stays current if the user un-blacklists later
    if (blacklistedChatIds.has(msg.chatId)) {
      logger.debug(`Skipping blacklisted chat: ${msg.chatId}`);
      return;
    }

    // Create message (skip if duplicate messageId)
    await prisma.feishuMessage.create({
      data: {
        messageId: msg.messageId,
        chatId: msg.chatId,
        senderId: msg.senderId,
        senderName: displayName,
        content: msg.content,
        msgType: msg.msgType,
        rawData: msg.rawData || null,
        timestamp: msg.timestamp,
      },
    });

    messageCount++;

    // Detect real-time operational signals (fire-and-forget)
    detectSignals({
      messageId: msg.messageId,
      chatId: msg.chatId,
      senderName: displayName,
      content: msg.content,
      chatType: msg.chatType,
    });

    // Bot message detection (fire-and-forget)
    const botName = await getBotName();
    const isBotDirected = msg.chatType === 'private' ||
      (msg.content && (
        msg.content.toLowerCase().includes(`@${botName.toLowerCase()}`) ||
        msg.content.includes('@POA') ||
        msg.content.includes('@poa')
      ));

    if (isBotDirected && msg.content) {
      const cleanContent = msg.content
        .replace(new RegExp(`@${botName}\\s*`, 'gi'), '')
        .replace(/@POA\s*/gi, '')
        .trim();
      if (cleanContent) {
        processMessage(msg.chatId, cleanContent)
          .then(reply => sendReply(msg.chatId, reply))
          .catch(err => logger.error(`[Bot] Error: ${err.message}`));
      }
    }

    logger.info(
      `Message saved: [${msg.chatType}] ${displayName}: ${msg.content.substring(0, 50)}${msg.content.length > 50 ? '...' : ''}`
    );
  } catch (error: any) {
    // P2002 = unique constraint violation (duplicate message)
    if (error?.code === 'P2002') {
      logger.debug(`Duplicate message skipped: ${msg.messageId}`);
      return;
    }
    logger.error('Failed to save message:', error);
  }
}
