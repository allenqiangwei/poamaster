import WebSocket from 'ws';
import { extractPacketSid, buildAckFrame, decodeMessage } from './decoder.js';
import { handleMessage, getMessageCount } from './message-handler.js';
import { logger } from './logger.js';
import { writeFileSync } from 'fs';
import { join, dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const LISTENER_DIR = resolve(__dirname, '..');
const STATUS_FILE = join(LISTENER_DIR, '.status');
const MAX_RECONNECT_DELAY = 60_000; // 60s max
const INITIAL_RECONNECT_DELAY = 1_000; // 1s initial
const MAX_REAUTH_RETRIES = 5; // Max re-auth retries before giving up and using stale URL
const PING_INTERVAL = 30_000; // Send ping every 30s
const PONG_TIMEOUT = 10_000; // Expect pong within 10s
const DATA_TIMEOUT = 120_000; // Force reconnect if no data for 2 minutes

interface WSOptions {
  wsUrl: string;
  onDisconnect?: () => void;
  onNeedReauth?: () => Promise<string>; // Returns new wsUrl after re-authentication
}

const RECONNECT_ALERT_THRESHOLD = 5; // Alert after 5 consecutive failures

let ws: WebSocket | null = null;
let reconnectDelay = INITIAL_RECONNECT_DELAY;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let connectedAt: Date | null = null;
let shouldReconnect = true;
let consecutiveFailures = 0;
let alertSent = false;
let onReconnectFailure: ((failures: number) => Promise<void>) | null = null;

// Heartbeat state
let pingTimer: ReturnType<typeof setInterval> | null = null;
let pongTimer: ReturnType<typeof setTimeout> | null = null;
let lastDataAt: number = 0;
let currentOptions: WSOptions | null = null;

/** Register a callback for persistent reconnection failures */
export function setReconnectFailureCallback(cb: (failures: number) => Promise<void>) {
  onReconnectFailure = cb;
}

function updateStatusFile() {
  try {
    writeFileSync(STATUS_FILE, JSON.stringify({
      connectedAt: connectedAt?.toISOString(),
      messageCount: getMessageCount(),
      updatedAt: new Date().toISOString(),
    }));
  } catch {
    // Non-critical
  }
}

/** Stop heartbeat timers */
function stopHeartbeat(): void {
  if (pingTimer) { clearInterval(pingTimer); pingTimer = null; }
  if (pongTimer) { clearTimeout(pongTimer); pongTimer = null; }
}

/** Start heartbeat: periodic ping + data timeout check */
function startHeartbeat(options: WSOptions): void {
  stopHeartbeat();
  lastDataAt = Date.now();

  pingTimer = setInterval(() => {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;

    // Check data timeout — no data at all for DATA_TIMEOUT → connection is dead
    const silentMs = Date.now() - lastDataAt;
    if (silentMs > DATA_TIMEOUT) {
      logger.warn(`No data received for ${Math.round(silentMs / 1000)}s, forcing reconnect`);
      forceReconnect(options);
      return;
    }

    // Send ping
    try {
      ws.ping();
      // Set pong timeout
      if (pongTimer) clearTimeout(pongTimer);
      pongTimer = setTimeout(() => {
        logger.warn(`Pong timeout (${PONG_TIMEOUT / 1000}s), forcing reconnect`);
        forceReconnect(options);
      }, PONG_TIMEOUT);
    } catch {
      logger.warn('Ping failed, forcing reconnect');
      forceReconnect(options);
    }
  }, PING_INTERVAL);
}

/** Force-close a dead connection and trigger reconnect */
function forceReconnect(options: WSOptions): void {
  stopHeartbeat();
  if (ws) {
    ws.removeAllListeners();
    try { ws.terminate(); } catch { /* ignore */ }
    ws = null;
  }
  connectedAt = null;
  consecutiveFailures++;
  updateStatusFile();

  if (shouldReconnect) {
    scheduleReconnect(options);
  }
}

export function connect(options: WSOptions): void {
  const { wsUrl, onDisconnect } = options;
  currentOptions = options;

  stopHeartbeat();
  if (ws) {
    ws.removeAllListeners();
    ws.close();
    ws = null;
  }

  logger.info('Connecting to Feishu WebSocket...');

  ws = new WebSocket(wsUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    },
  });

  ws.binaryType = 'arraybuffer';

  ws.on('open', () => {
    logger.info('WebSocket connected');
    connectedAt = new Date();
    reconnectDelay = INITIAL_RECONNECT_DELAY;
    consecutiveFailures = 0;
    alertSent = false;
    updateStatusFile();
    startHeartbeat(options);
  });

  ws.on('pong', () => {
    // Pong received — connection is alive (clears pong timeout only)
    // NOTE: Do NOT reset lastDataAt here — pong only proves TCP is alive,
    // not that Feishu is actually pushing messages. DATA_TIMEOUT should
    // trigger when no real data frames arrive (zombie connection detection).
    if (pongTimer) { clearTimeout(pongTimer); pongTimer = null; }
  });

  ws.on('message', async (rawData: WebSocket.RawData) => {
    lastDataAt = Date.now();
    try {
      let buffer: Buffer;
      if (rawData instanceof ArrayBuffer) {
        buffer = Buffer.from(rawData);
      } else if (Array.isArray(rawData)) {
        buffer = Buffer.concat(rawData);
      } else {
        buffer = rawData as Buffer;
      }

      // Check if data is gzip compressed (starts with 1f 8b)
      let decoded = buffer;
      if (buffer[0] === 0x1f && buffer[1] === 0x8b) {
        const zlib = await import('zlib');
        decoded = zlib.gunzipSync(buffer);
      }

      // Send ACK first
      try {
        const sid = extractPacketSid(decoded);
        if (sid && ws?.readyState === WebSocket.OPEN) {
          const ackFrame = buildAckFrame(sid);
          ws.send(ackFrame);
        }
      } catch {
        // ACK not needed for all frames
      }

      // Decode messages
      const messages = decodeMessage(decoded);
      if (messages.length === 0 && decoded.length > 50) {
        logger.info(`WS frame yielded 0 messages (raw=${buffer.length}b decoded=${decoded.length}b gzip=${buffer[0] === 0x1f})`);
      }
      for (const msg of messages) {
        await handleMessage(msg);
      }

      if (messages.length > 0) {
        updateStatusFile();
      }
    } catch (error) {
      logger.error('Error processing WebSocket message:', error);
    }
  });

  ws.on('close', (code, reason) => {
    logger.warn(`WebSocket closed: code=${code} reason=${reason.toString()}`);
    stopHeartbeat();
    ws = null;
    connectedAt = null;
    consecutiveFailures++;
    updateStatusFile();

    // Send alert after threshold consecutive failures (only once)
    if (consecutiveFailures >= RECONNECT_ALERT_THRESHOLD && !alertSent && onReconnectFailure) {
      alertSent = true;
      onReconnectFailure(consecutiveFailures).catch(() => {});
    }

    if (shouldReconnect) {
      scheduleReconnect(options);
    }

    onDisconnect?.();
  });

  ws.on('error', (error) => {
    logger.error('WebSocket error:', error.message);
  });
}

function scheduleReconnect(options: WSOptions, reauthRetry = 0): void {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
  }

  logger.info(`Reconnecting in ${reconnectDelay / 1000}s...`);

  reconnectTimer = setTimeout(async () => {
    reconnectTimer = null;

    // Re-authenticate to get fresh ticket before reconnecting
    if (options.onNeedReauth) {
      try {
        logger.info('Re-authenticating before reconnect...');
        const newWsUrl = await options.onNeedReauth();
        connect({ ...options, wsUrl: newWsUrl });
      } catch (error: any) {
        logger.error('Re-authentication failed:', error.message);
        if (reauthRetry < MAX_REAUTH_RETRIES) {
          // Retry re-auth with backoff instead of connecting with stale ticket
          logger.info(`Retrying re-auth (attempt ${reauthRetry + 1}/${MAX_REAUTH_RETRIES})...`);
          reconnectDelay = Math.min(reconnectDelay * 2, MAX_RECONNECT_DELAY);
          scheduleReconnect(options, reauthRetry + 1);
        } else {
          // Exhausted retries — connect with stale URL as last resort
          logger.warn(`Re-auth failed after ${MAX_REAUTH_RETRIES} retries, connecting with stale ticket (may be zombie)`);
          connect(options);
        }
      }
    } else {
      connect(options);
    }
  }, reconnectDelay);

  // Exponential backoff
  reconnectDelay = Math.min(reconnectDelay * 2, MAX_RECONNECT_DELAY);
}

export function disconnect(): void {
  shouldReconnect = false;
  stopHeartbeat();
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  if (ws) {
    ws.close();
    ws = null;
  }
  connectedAt = null;
  updateStatusFile();
}
