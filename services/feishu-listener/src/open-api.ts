/**
 * Feishu Open API integration — uses app_id + app_secret to get
 * tenant_access_token and fetch user/chat names via official API.
 *
 * This complements the WebSocket listener by providing name resolution:
 * - List all chats the bot is in → chat names
 * - Get chat members → user names
 * - Cross-reference with @mention data to map WebSocket numeric IDs → names
 */

import { PrismaClient } from '@prisma/client';
import { logger } from './logger.js';

const BASE_URL = 'https://open.feishu.cn/open-apis';

let appId = '';
let appSecret = '';
let tenantToken = '';
let tokenExpiry = 0;
let prisma: PrismaClient;

// Maps: open_id (ou_xxx) → name, and name → [open_ids]
const openIdToName = new Map<string, string>();
const nameToOpenIds = new Map<string, string[]>();

// Maps: oc_xxx chat_id → { name, members }
const chatDirectory = new Map<string, { name: string; memberCount: number }>();

// The key mapping: WebSocket numeric ID → name (built from multiple sources)
const numericIdToName = new Map<string, string>();

export function initOpenApi(
  id: string,
  secret: string,
  prismaClient: PrismaClient
) {
  appId = id;
  appSecret = secret;
  prisma = prismaClient;
  logger.info('Open API initialized');
}

/** Get or refresh tenant_access_token */
async function getToken(): Promise<string> {
  if (tenantToken && Date.now() < tokenExpiry) {
    return tenantToken;
  }

  const resp = await fetch(`${BASE_URL}/auth/v3/tenant_access_token/internal`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ app_id: appId, app_secret: appSecret }),
  });

  const data = (await resp.json()) as any;
  if (data.code !== 0) {
    logger.error(`Failed to get tenant token: ${data.msg}`);
    return '';
  }

  tenantToken = data.tenant_access_token;
  // Refresh 5 min before expiry
  tokenExpiry = Date.now() + (data.expire - 300) * 1000;
  logger.info('Tenant access token obtained');
  return tenantToken;
}

/** API helper */
async function apiGet(path: string, params?: Record<string, string>): Promise<any> {
  const token = await getToken();
  if (!token) return null;

  const url = new URL(`${BASE_URL}${path}`);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, v);
    }
  }

  const resp = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
  });

  const data = (await resp.json()) as any;
  if (data.code !== 0) {
    logger.debug(`API ${path} error: ${data.msg} (code ${data.code})`);
    return null;
  }
  return data.data;
}

/**
 * Fetch all chats the bot is a member of.
 * Returns chat list with oc_xxx IDs and names.
 */
async function fetchBotChats(): Promise<void> {
  let pageToken = '';
  let totalChats = 0;

  do {
    const params: Record<string, string> = { page_size: '100' };
    if (pageToken) params.page_token = pageToken;

    const data = await apiGet('/im/v1/chats', params);
    if (!data) break;

    const items = data.items || [];
    for (const chat of items) {
      const chatId = chat.chat_id;
      const name = chat.name || '';
      if (chatId && name) {
        chatDirectory.set(chatId, {
          name,
          memberCount: parseInt(chat.user_count || '0'),
        });
        totalChats++;
      }
    }

    pageToken = data.page_token || '';
  } while (pageToken);

  logger.info(`Open API: found ${totalChats} chats bot is in`);
}

/**
 * Fetch all members of a specific chat.
 * Returns member list with open_id and name.
 */
async function fetchChatMembers(chatId: string): Promise<Array<{ openId: string; name: string }>> {
  const members: Array<{ openId: string; name: string }> = [];
  let pageToken = '';

  do {
    const params: Record<string, string> = {
      member_id_type: 'open_id',
      page_size: '100',
    };
    if (pageToken) params.page_token = pageToken;

    const data = await apiGet(`/im/v1/chats/${chatId}/members`, params);
    if (!data) break;

    const items = data.items || [];
    for (const member of items) {
      const openId = member.member_id || '';
      const name = member.name || '';
      if (openId && name) {
        members.push({ openId, name });

        // Build name directory
        openIdToName.set(openId, name);
        const existing = nameToOpenIds.get(name) || [];
        if (!existing.includes(openId)) {
          existing.push(openId);
          nameToOpenIds.set(name, existing);
        }
      }
    }

    pageToken = data.page_token || '';
  } while (pageToken);

  return members;
}

/**
 * Build a complete name directory from all chats the bot is in.
 * This is the main initialization function.
 */
export async function buildNameDirectory(): Promise<void> {
  if (!appId || !appSecret) {
    logger.debug('Open API credentials not configured, skipping name directory');
    return;
  }

  try {
    await fetchBotChats();

    let totalMembers = 0;
    for (const [chatId, info] of chatDirectory) {
      const members = await fetchChatMembers(chatId);
      totalMembers += members.length;
      logger.info(`Chat "${info.name}" (${chatId}): ${members.length} members`);
    }

    logger.info(
      `Name directory built: ${openIdToName.size} unique users from ${chatDirectory.size} chats`
    );

    // Now apply names to DB records
    await applyNamesToDb();
  } catch (e: any) {
    logger.error(`Failed to build name directory: ${e.message}`);
  }
}

/**
 * Register a name mapping from @mention data.
 * When a WebSocket message contains @name with a numeric userId,
 * and we find that name in our Open API directory, we can map:
 * numericId → name (confirmed)
 */
export function registerMentionMapping(numericUserId: string, mentionName: string) {
  if (!numericUserId || !mentionName) return;

  // Strip leading @ from display name
  const cleanName = mentionName.startsWith('@') ? mentionName.substring(1) : mentionName;
  if (!cleanName) return;

  // Already known?
  if (numericIdToName.has(numericUserId)) return;

  // Store the mapping
  numericIdToName.set(numericUserId, cleanName);
  logger.info(`ID mapping: ${numericUserId} → ${cleanName} (from @mention)`);
}

/**
 * Get display name for a numeric WebSocket user ID.
 * Sources (in priority order):
 * 1. Direct numeric→name mapping (from @mentions)
 * 2. Fallback to empty string (unknown)
 */
export function getNameByNumericId(numericId: string): string {
  return numericIdToName.get(numericId) || '';
}

/**
 * Get all known numeric→name mappings.
 */
export function getAllNameMappings(): Map<string, string> {
  return new Map(numericIdToName);
}

/**
 * Apply known names to database records that are still using numeric IDs.
 */
async function applyNamesToDb(): Promise<void> {
  let updatedMessages = 0;
  let updatedChats = 0;

  // Update messages where senderName equals senderId (numeric, not resolved)
  for (const [numericId, name] of numericIdToName) {
    try {
      const result = await prisma.feishuMessage.updateMany({
        where: { senderId: numericId, senderName: numericId },
        data: { senderName: name },
      });
      updatedMessages += result.count;
    } catch {
      // ignore
    }
  }

  // Update chat names from Open API directory
  // Match by: check if any DB chat's members match an Open API chat's members
  // For now, just log what we know
  if (updatedMessages > 0) {
    logger.info(`Updated ${updatedMessages} message sender names from ID mappings`);
  }

  // Update private chats: if we know the sender name, use it as chat name (skip manually renamed)
  for (const [numericId, name] of numericIdToName) {
    try {
      const result = await prisma.feishuChat.updateMany({
        where: {
          chatType: 'private',
          name: null,
          isRenamed: false,
          messages: { some: { senderId: numericId } },
        },
        data: { name },
      });
      updatedChats += result.count;
    } catch {
      // ignore
    }
  }

  if (updatedChats > 0) {
    logger.info(`Updated ${updatedChats} private chat names from ID mappings`);
  }
}

/**
 * Periodic refresh: re-fetch names and apply to new DB records.
 */
export async function refreshNames(): Promise<void> {
  if (!appId || !appSecret) return;

  try {
    // Re-build directory (picks up new chats/members)
    await fetchBotChats();
    for (const [chatId] of chatDirectory) {
      await fetchChatMembers(chatId);
    }

    // Apply to DB
    await applyNamesToDb();
  } catch (e: any) {
    logger.debug(`Name refresh failed: ${e.message}`);
  }
}

/**
 * Get the complete user name directory for the web UI.
 * Returns all known user names from Open API + @mention mappings.
 */
export function getNameDirectory(): {
  openApiUsers: Array<{ openId: string; name: string }>;
  numericMappings: Array<{ numericId: string; name: string }>;
  chatNames: Array<{ chatId: string; name: string }>;
} {
  return {
    openApiUsers: Array.from(openIdToName.entries()).map(([openId, name]) => ({
      openId,
      name,
    })),
    numericMappings: Array.from(numericIdToName.entries()).map(
      ([numericId, name]) => ({ numericId, name })
    ),
    chatNames: Array.from(chatDirectory.entries()).map(([chatId, info]) => ({
      chatId,
      name: info.name,
    })),
  };
}
