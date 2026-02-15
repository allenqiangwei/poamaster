/**
 * Feishu Listener Service — Entry Point
 *
 * Reads the feishu.cookie from the database, authenticates with Feishu,
 * connects to WebSocket, and starts listening for messages.
 */

import { PrismaClient } from '@prisma/client';
import { createDecipheriv } from 'crypto';
import { writeFileSync, unlinkSync, existsSync, readFileSync } from 'fs';
import { join, resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { authenticate } from './auth.js';
import { initDecoder } from './decoder.js';
import { initMessageHandler, shutdownMessageHandler, refreshBlacklist, refreshAssigneeNames } from './message-handler.js';
import { initNameResolver, fetchChatFeed, backfillNames } from './name-resolver.js';
import { initOpenApi, buildNameDirectory, refreshNames } from './open-api.js';
import { connect, disconnect, setReconnectFailureCallback } from './websocket.js';
import { logger } from './logger.js';
import { initNotifier, sendCookieExpiryAlert, checkAndSendDailyBriefing } from './notifier.js';
import { initSignalDetector } from './signal-detector.js';

// Resolve paths relative to source file, not cwd (cwd varies by how we're started)
const __dirname = dirname(fileURLToPath(import.meta.url));
export const LISTENER_DIR = resolve(__dirname, '..');  // services/feishu-listener/
const ROOT_DIR = resolve(LISTENER_DIR, '../..');        // project root

const envPath = join(ROOT_DIR, '.env');
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf-8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx > 0) {
      const key = trimmed.slice(0, eqIdx).trim();
      let val = trimmed.slice(eqIdx + 1).trim();
      // Strip surrounding quotes
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (!process.env[key]) {
        process.env[key] = val;
      }
    }
  }
  logger.info(`Loaded env from ${envPath}`);
}

const PID_FILE = join(LISTENER_DIR, '.pid');

// Single-instance lock: check if another listener is already running
if (existsSync(PID_FILE)) {
  const existingPid = parseInt(readFileSync(PID_FILE, 'utf-8').trim(), 10);
  if (existingPid && existingPid !== process.pid) {
    try {
      process.kill(existingPid, 0); // Check if process exists (signal 0 = no-op)
      logger.error(`Another listener is already running (PID ${existingPid}). Exiting.`);
      process.exit(1);
    } catch {
      // Process doesn't exist — stale PID file, safe to continue
      logger.info(`Stale PID file found (PID ${existingPid} not running), taking over`);
    }
  }
}

// Write PID file for process management
writeFileSync(PID_FILE, String(process.pid));

/** Decrypt AES-256-GCM encrypted value (same as lib/crypto.ts) */
function decryptValue(encryptedText: string): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error('SESSION_SECRET not found in environment');

  const key = Buffer.from(secret.padEnd(32, '0').slice(0, 32));
  const parts = encryptedText.split(':');
  if (parts.length !== 3) {
    // Not encrypted, return as-is
    return encryptedText;
  }

  const [ivHex, tagHex, encrypted] = parts;
  const iv = Buffer.from(ivHex, 'hex');
  const tag = Buffer.from(tagHex, 'hex');
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

interface FeishuConfig {
  cookie: string;
  appId: string;
  appSecret: string;
}

async function getFeishuConfig(): Promise<FeishuConfig> {
  const prisma = new PrismaClient();
  try {
    const cookieCfg = await prisma.config.findUnique({ where: { key: 'feishu.cookie' } });
    if (!cookieCfg?.value) {
      throw new Error('feishu.cookie not configured. Please set it in POA Master settings.');
    }

    const appIdCfg = await prisma.config.findUnique({ where: { key: 'feishu.appId' } });
    const appSecretCfg = await prisma.config.findUnique({ where: { key: 'feishu.appSecret' } });

    return {
      cookie: decryptValue(cookieCfg.value),
      appId: appIdCfg?.value || '',
      appSecret: appSecretCfg?.value ? decryptValue(appSecretCfg.value) : '',
    };
  } finally {
    await prisma.$disconnect();
  }
}

async function main() {
  logger.info('Feishu Listener starting...');
  logger.info(`PID: ${process.pid}`);

  // Initialize components
  initDecoder();
  const prisma = initMessageHandler();
  initNotifier(prisma);
  initSignalDetector(prisma);

  // Get config from database
  const config = await getFeishuConfig();
  logger.info('Cookie loaded from database');

  // Authenticate with Feishu
  let credentials;
  try {
    credentials = await authenticate(config.cookie);
  } catch (authError: any) {
    logger.error('Authentication failed:', authError.message);
    await sendCookieExpiryAlert(authError.message);
    throw authError;
  }
  logger.info(`Authenticated as user: ${credentials.userId}`);

  // Initialize name resolver with auth credentials
  const cookieHeader = Object.entries(credentials.cookie).map(([k, v]) => `${k}=${v}`).join('; ');
  initNameResolver(cookieHeader, credentials.csrfToken, prisma);

  // Initialize Open API for name resolution (if credentials available)
  if (config.appId && config.appSecret) {
    initOpenApi(config.appId, config.appSecret, prisma);
    logger.info('Building name directory from Open API...');
    await buildNameDirectory();
  } else {
    logger.info('Open API credentials not configured, skipping name directory');
  }

  // Fetch chat names from legacy feed API (best-effort)
  await fetchChatFeed();
  await backfillNames();

  // Send alert after too many consecutive reconnection failures
  setReconnectFailureCallback(async (consecutiveFailures) => {
    await sendCookieExpiryAlert(
      `WebSocket 连续 ${consecutiveFailures} 次重连失败，Cookie 可能已失效`
    );
  });

  // Connect WebSocket
  connect({
    wsUrl: credentials.wsUrl,
    onDisconnect: () => {
      logger.warn('Disconnected from Feishu WebSocket');
    },
  });

  // Periodically refresh names and blacklist (every 5 minutes)
  setInterval(async () => {
    try {
      await refreshNames();
      await fetchChatFeed();
      await backfillNames();
      await refreshBlacklist();
      await refreshAssigneeNames();
      await checkAndSendDailyBriefing();
    } catch {
      // Non-critical
    }
  }, 5 * 60 * 1000);

  logger.info('Listener is running. Press Ctrl+C to stop.');
}

// Graceful shutdown
async function shutdown(signal: string) {
  logger.info(`Received ${signal}, shutting down...`);
  disconnect();
  await shutdownMessageHandler();

  try {
    unlinkSync(PID_FILE);
  } catch {
    // PID file may already be gone
  }

  process.exit(0);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

main().catch((error) => {
  logger.error('Fatal error:', error);
  process.exit(1);
});
