import WebSocket from 'ws';
import { extractPacketSid, buildAckFrame, decodeMessage } from './decoder.js';
import { handleMessage, getMessageCount } from './message-handler.js';
import { logger } from './logger.js';
import { writeFileSync } from 'fs';
import { join } from 'path';

const STATUS_FILE = join(process.cwd(), '.status');
const MAX_RECONNECT_DELAY = 60_000; // 60s max
const INITIAL_RECONNECT_DELAY = 1_000; // 1s initial

interface WSOptions {
  wsUrl: string;
  onDisconnect?: () => void;
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

export function connect(options: WSOptions): void {
  const { wsUrl, onDisconnect } = options;

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
  });

  ws.on('message', async (rawData: WebSocket.RawData) => {
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

function scheduleReconnect(options: WSOptions): void {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
  }

  logger.info(`Reconnecting in ${reconnectDelay / 1000}s...`);

  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connect(options);
  }, reconnectDelay);

  // Exponential backoff
  reconnectDelay = Math.min(reconnectDelay * 2, MAX_RECONNECT_DELAY);
}

export function disconnect(): void {
  shouldReconnect = false;
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
