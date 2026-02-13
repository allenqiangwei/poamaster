/**
 * Name Resolver — Fetches and caches user/chat display names from Feishu's internal API.
 *
 * Sources:
 * 1. Feishu feed API (chat list with names)
 * 2. Feishu contact/chatter API (user name by ID)
 * 3. @mention data extracted from incoming messages
 */

import { PrismaClient } from '@prisma/client';
import { logger } from './logger.js';

const FEED_URL = 'https://internal-api-lark-api.feishu.cn/im/v2/feed/list_feed_cards';
const CHATTER_URL = 'https://internal-api-lark-api.feishu.cn/im/v1/chatters/batch_get';
const CHAT_INFO_URL = 'https://internal-api-lark-api.feishu.cn/im/v1/chats';

// In-memory caches
const userNameCache = new Map<string, string>();
const chatNameCache = new Map<string, string>();

let cookieStr = '';
let csrfToken = '';
let prisma: PrismaClient;

function apiHeaders() {
  return {
    'accept': 'application/json, text/plain, */*',
    'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8',
    'content-type': 'application/json',
    'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    'x-app-id': '12',
    'x-api-version': '1.0.8',
    'x-csrf-token': csrfToken,
    'x-device-info': 'platform=websdk',
    'x-lgw-os-type': '1',
    'x-lgw-terminal-type': '2',
    'x-terminal-type': '2',
    'sec-ch-ua': '"Chromium";v="126", "Google Chrome";v="126", "Not=A?Brand";v="8"',
    'sec-fetch-dest': 'empty',
    'sec-fetch-mode': 'cors',
    'sec-fetch-site': 'same-site',
    'origin': 'https://open-dev.feishu.cn',
    'referer': 'https://open-dev.feishu.cn/',
    'cookie': cookieStr,
  };
}

export function initNameResolver(cookie: string, csrf: string, prismaClient: PrismaClient) {
  cookieStr = cookie;
  csrfToken = csrf;
  prisma = prismaClient;
}

/**
 * Record a userId → name mapping from @mention data.
 */
export function recordUserName(userId: string, name: string) {
  if (!userId || !name) return;
  // Strip leading @ if present
  const cleanName = name.startsWith('@') ? name.substring(1) : name;
  if (cleanName && !userNameCache.has(userId)) {
    userNameCache.set(userId, cleanName);
    logger.info(`Learned user name: ${userId} → ${cleanName}`);
  }
}

/**
 * Get cached user name, or return empty string.
 */
export function getCachedUserName(userId: string): string {
  return userNameCache.get(userId) || '';
}

/**
 * Get cached chat name, or return empty string.
 */
export function getCachedChatName(chatId: string): string {
  return chatNameCache.get(chatId) || '';
}

/**
 * Fetch chat feed from Feishu to get chat names.
 * Called once at startup and periodically.
 */
export async function fetchChatFeed(): Promise<void> {
  try {
    const resp = await fetch(FEED_URL, {
      method: 'POST',
      headers: apiHeaders(),
      body: JSON.stringify({
        feed_type: 0,
        count: 200,
        pull_type: 0,
      }),
    });

    const text = await resp.text();
    if (!text.startsWith('{')) {
      logger.debug(`Feed API returned non-JSON (status ${resp.status}), skipping`);
      return;
    }

    const data = JSON.parse(text);
    const feeds = data?.data?.feed_cards || data?.data?.feeds || [];

    let count = 0;
    for (const feed of feeds) {
      const chatId = feed.chat_id || feed.id || '';
      const name = feed.name || feed.display_name || feed.chat_name || '';
      const avatar = feed.avatar_url || feed.avatar || '';

      if (chatId && name) {
        chatNameCache.set(chatId, name);
        count++;

        // Update DB (skip manually renamed chats)
        try {
          await prisma.feishuChat.updateMany({
            where: { chatId, isRenamed: false },
            data: {
              name,
              ...(avatar ? { avatar } : {}),
            },
          });
        } catch {
          // Chat may not exist in DB yet
        }
      }
    }

    logger.info(`Feed API: loaded ${count} chat names from ${feeds.length} feeds`);
  } catch (e: any) {
    logger.warn(`Feed API failed: ${e.message}`);
  }
}

/**
 * Fetch user names by their IDs from Feishu contact API.
 */
export async function fetchUserNames(userIds: string[]): Promise<void> {
  // Filter out already cached
  const unknown = userIds.filter(id => id && !userNameCache.has(id));
  if (unknown.length === 0) return;

  try {
    const resp = await fetch(CHATTER_URL, {
      method: 'POST',
      headers: apiHeaders(),
      body: JSON.stringify({
        chatter_ids: unknown,
      }),
    });

    const text = await resp.text();
    if (!text.startsWith('{')) {
      logger.debug(`Chatter API returned non-JSON (status ${resp.status})`);
      // Try alternative endpoint
      await fetchUserNamesAlt(unknown);
      return;
    }

    const data = JSON.parse(text);
    const chatters = data?.data?.chatters || data?.data?.items || {};

    let count = 0;
    if (Array.isArray(chatters)) {
      for (const c of chatters) {
        const id = c.id || c.user_id || c.open_id || '';
        const name = c.name || c.display_name || '';
        if (id && name) {
          userNameCache.set(id, name);
          count++;
        }
      }
    } else {
      for (const [id, info] of Object.entries(chatters) as [string, any][]) {
        const name = info?.name || info?.display_name || '';
        if (name) {
          userNameCache.set(id, name);
          count++;
        }
      }
    }

    logger.info(`Chatter API: resolved ${count}/${unknown.length} user names`);
  } catch (e: any) {
    logger.debug(`Chatter API failed: ${e.message}`);
    await fetchUserNamesAlt(unknown);
  }
}

/**
 * Alternative: fetch user names from chat info API (gets members with names).
 */
async function fetchUserNamesAlt(userIds: string[]): Promise<void> {
  // Try fetching from individual user profile endpoint
  for (const userId of userIds.slice(0, 10)) {
    try {
      const resp = await fetch(
        `https://internal-api-lark-api.feishu.cn/contact/v1/user/get_user_info?user_id=${userId}`,
        { headers: apiHeaders() }
      );
      const text = await resp.text();
      if (!text.startsWith('{')) continue;

      const data = JSON.parse(text);
      const name = data?.data?.user?.name || data?.data?.name || '';
      if (name) {
        userNameCache.set(userId, name);
        logger.info(`User profile API: ${userId} → ${name}`);
      }
    } catch {
      // Skip individual failures
    }
  }
}

/**
 * Fetch info for a specific chat (name, member count, etc.)
 */
export async function fetchChatInfo(chatId: string): Promise<void> {
  if (!chatId || chatNameCache.has(chatId)) return;

  try {
    const resp = await fetch(`${CHAT_INFO_URL}/${chatId}`, {
      headers: apiHeaders(),
    });

    const text = await resp.text();
    if (!text.startsWith('{')) return;

    const data = JSON.parse(text);
    const chat = data?.data?.chat || data?.data || {};
    const name = chat.name || chat.display_name || '';
    const memberCount = chat.member_count || chat.user_count || null;
    const avatar = chat.avatar?.avatar_origin || chat.avatar_url || '';

    if (name) {
      chatNameCache.set(chatId, name);

      // Skip manually renamed chats
      await prisma.feishuChat.updateMany({
        where: { chatId, isRenamed: false },
        data: {
          name,
          ...(memberCount ? { memberCount } : {}),
          ...(avatar ? { avatar } : {}),
        },
      });

      logger.info(`Chat info API: ${chatId} → ${name}`);
    }
  } catch (e: any) {
    logger.debug(`Chat info API failed for ${chatId}: ${e.message}`);
  }
}

/**
 * Resolve names for a batch of messages.
 * Updates senderName in each message and resolves unknown chat/user IDs.
 */
export async function resolveNames(messages: Array<{
  chatId: string;
  senderId: string;
  senderName: string;
}>): Promise<void> {
  const unknownChatIds = new Set<string>();
  const unknownUserIds = new Set<string>();

  for (const msg of messages) {
    // Set sender name from cache
    if (msg.senderId && !msg.senderName) {
      msg.senderName = userNameCache.get(msg.senderId) || '';
    }

    // Collect unknowns for batch fetch
    if (msg.chatId && !chatNameCache.has(msg.chatId)) {
      unknownChatIds.add(msg.chatId);
    }
    if (msg.senderId && !userNameCache.has(msg.senderId)) {
      unknownUserIds.add(msg.senderId);
    }
  }

  // Batch fetch unknown names (non-blocking)
  const fetches: Promise<void>[] = [];
  if (unknownUserIds.size > 0) {
    fetches.push(fetchUserNames([...unknownUserIds]));
  }
  for (const chatId of unknownChatIds) {
    fetches.push(fetchChatInfo(chatId));
  }

  if (fetches.length > 0) {
    await Promise.allSettled(fetches);

    // Retry setting sender names after fetch
    for (const msg of messages) {
      if (msg.senderId && !msg.senderName) {
        msg.senderName = userNameCache.get(msg.senderId) || '';
      }
    }
  }
}

/**
 * Update all existing DB records that have missing names.
 */
export async function backfillNames(): Promise<void> {
  // Update messages with sender names from cache
  for (const [userId, name] of userNameCache) {
    try {
      await prisma.feishuMessage.updateMany({
        where: { senderId: userId, senderName: userId },
        data: { senderName: name },
      });
    } catch {
      // ignore
    }
  }

  // Update chats with names from cache (skip manually renamed)
  for (const [chatId, name] of chatNameCache) {
    try {
      await prisma.feishuChat.updateMany({
        where: { chatId, name: null, isRenamed: false },
        data: { name },
      });
    } catch {
      // ignore
    }
  }

  logger.info(`Backfill complete: ${userNameCache.size} users, ${chatNameCache.size} chats cached`);
}
