/**
 * Feishu WebSocket Protobuf Decoder
 *
 * The protocol uses a layered protobuf structure:
 *   Frame → Packet → PushMessagesRequest → Message → TextContent → RichText → TextProperty
 *
 * We use protobufjs to define the minimal schema needed for decoding.
 */

import protobuf from 'protobufjs';
import { logger } from './logger.js';

// Define minimal protobuf schema matching LarkAgentX's proto.proto
const protoJSON = {
  nested: {
    feishu: {
      nested: {
        ExtendedEntry: {
          fields: {
            key: { type: 'string', id: 1 },
            value: { type: 'string', id: 2 },
          },
        },
        Frame: {
          fields: {
            seqid: { type: 'uint64', id: 1 },
            logid: { type: 'uint64', id: 2 },
            service: { type: 'int32', id: 3 },
            method: { type: 'int32', id: 4 },
            headers: { rule: 'repeated', type: 'ExtendedEntry', id: 5 },
            payloadEncoding: { type: 'string', id: 6 },
            payloadType: { type: 'string', id: 7 },
            payload: { type: 'bytes', id: 8 },
          },
        },
        Packet: {
          fields: {
            sid: { type: 'string', id: 1 },
            payloadType: { type: 'int32', id: 2 },
            cmd: { type: 'int32', id: 3 },
            status: { type: 'uint32', id: 4 },
            payload: { type: 'bytes', id: 5 },
            cid: { type: 'string', id: 6 },
          },
        },
        PushMessagesRequest: {
          fields: {
            messages: {
              keyType: 'string',
              type: 'PushMessage',
              id: 1,
            },
          },
        },
        PushMessage: {
          fields: {
            id: { type: 'string', id: 1 },
            type: { type: 'int32', id: 2 },
            fromId: { type: 'string', id: 3 },
            createTime: { type: 'int64', id: 4 },
            content: { type: 'bytes', id: 5 },
            rootId: { type: 'string', id: 8 },
            parentId: { type: 'string', id: 9 },
            chatId: { type: 'string', id: 10 },
            chatType: { type: 'int32', id: 46 },
          },
        },
        TextContent: {
          fields: {
            text: { type: 'string', id: 1 },
            richText: { type: 'RichText', id: 3 },
          },
        },
        RichText: {
          fields: {
            elementIds: { rule: 'repeated', type: 'string', id: 1 },
            innerText: { type: 'string', id: 2 },
            elements: { type: 'ElementsMap', id: 3 },
          },
        },
        ElementsMap: {
          fields: {
            dictionary: {
              keyType: 'string',
              type: 'RichTextElement',
              id: 1,
            },
          },
        },
        RichTextElement: {
          fields: {
            tag: { type: 'int32', id: 1 },
            property2: { type: 'bytes', id: 2 },
            property: { type: 'bytes', id: 3 },
          },
        },
        TextProperty: {
          fields: {
            content: { type: 'string', id: 1 },
          },
        },
        AtMentionProperty: {
          fields: {
            userId: { type: 'string', id: 1 },
            displayName: { type: 'string', id: 2 },
          },
        },
      },
    },
  },
};

export interface MentionInfo {
  userId: string;
  displayName: string;
}

export interface DecodedMessage {
  messageId: string;
  chatId: string;
  senderId: string;
  senderName: string;
  content: string;
  msgType: string;
  timestamp: Date;
  chatType: 'group' | 'private';
  rawData?: string;
  mentions?: MentionInfo[];
}

let root: protobuf.Root;
let FrameType: protobuf.Type;
let PacketType: protobuf.Type;
let PushMessagesRequestType: protobuf.Type;
let TextContentType: protobuf.Type;
let TextPropertyType: protobuf.Type;
let AtMentionPropertyType: protobuf.Type;

export function initDecoder() {
  root = protobuf.Root.fromJSON(protoJSON);
  FrameType = root.lookupType('feishu.Frame');
  PacketType = root.lookupType('feishu.Packet');
  PushMessagesRequestType = root.lookupType('feishu.PushMessagesRequest');
  TextContentType = root.lookupType('feishu.TextContent');
  TextPropertyType = root.lookupType('feishu.TextProperty');
  AtMentionPropertyType = root.lookupType('feishu.AtMentionProperty');
  logger.info('Protobuf decoder initialized');
}

/** Extract packet SID for ACK */
export function extractPacketSid(data: Buffer): string {
  const frame = FrameType.decode(data) as any;
  if (!frame.payload || frame.payload.length === 0) return '';
  const packet = PacketType.decode(frame.payload) as any;
  return packet.sid || '';
}

/** Build ACK frame for a received packet */
export function buildAckFrame(packetSid: string): Uint8Array {
  const now = Date.now();

  const ackPacket = PacketType.create({
    cmd: 1,
    payloadType: 1,
    sid: packetSid,
  });
  const packetPayload = PacketType.encode(ackPacket).finish();

  const ackFrame = FrameType.create({
    seqid: now,
    logid: now,
    service: 1,
    method: 1,
    headers: [{ key: 'x-request-time', value: `${now}000` }],
    payloadType: 'pb',
    payload: packetPayload,
  });

  return FrameType.encode(ackFrame).finish();
}

// Rich text element tag types
const TAG_TEXT = 1;
const TAG_LINK = 2;
const TAG_LINEBREAK = 3;
const TAG_AT_MENTION = 5;

/** Decode protobuf bytes field (may be Uint8Array or base64 string from protobufjs) */
function toBuffer(data: any): Uint8Array {
  if (typeof data === 'string') return Buffer.from(data, 'base64');
  return data;
}

/** Extract text content from rich text elements, collecting @mention info */
function decodeRichTextContent(textContent: any): { text: string; mentions: MentionInfo[] } {
  const mentions: MentionInfo[] = [];

  // Try simple text first
  if (textContent.text) return { text: textContent.text, mentions };

  if (!textContent.richText) return { text: '', mentions };

  // Try innerText shortcut
  if (textContent.richText.innerText) return { text: textContent.richText.innerText, mentions };

  // Fall back to assembling from elements dictionary
  const dict = textContent.richText.elements?.dictionary;
  if (!dict) return { text: '', mentions };

  const entries = Object.entries(dict);
  // Use elementIds order if available, otherwise sort by key
  const elementIds: string[] = textContent.richText.elementIds || [];
  const orderedEntries = elementIds.length > 0
    ? elementIds.map(id => [id, dict[id]] as [string, any]).filter(([, v]) => v)
    : entries.sort(([a], [b]) => parseInt(a) - parseInt(b));

  let content = '';
  for (const [, elem] of orderedEntries as [string, any][]) {
    const tag = elem.tag || 0;
    const propBytes = elem.property;

    if (tag === TAG_LINEBREAK) {
      content += '\n';
      continue;
    }

    if (!propBytes || propBytes.length === 0) continue;

    try {
      const propBuf = toBuffer(propBytes);

      if (tag === TAG_AT_MENTION) {
        const mention = AtMentionPropertyType.decode(propBuf) as any;
        const displayName = mention.displayName || '';
        const userId = mention.userId || '';
        if (userId && displayName) {
          mentions.push({ userId, displayName });
        }
        content += displayName || `@${userId || 'unknown'}`;
      } else {
        // tag=1 (text), tag=2 (link), and others: use TextProperty
        const prop = TextPropertyType.decode(propBuf) as any;
        if (prop.content) content += prop.content;
      }
    } catch {
      // Skip elements that can't be decoded
    }
  }

  return { text: content, mentions };
}

/** Decode a received WebSocket message into structured data */
export function decodeMessage(data: Buffer): DecodedMessage[] {
  const results: DecodedMessage[] = [];

  try {
    const frame = FrameType.decode(data) as any;
    if (!frame.payload || frame.payload.length === 0) return results;

    const packet = PacketType.decode(frame.payload) as any;
    logger.debug(`Packet: cmd=${packet.cmd} sid=${packet.sid} payloadLen=${packet.payload?.length || 0}`);
    if (!packet.payload || packet.payload.length === 0) return results;

    // Decompress gzip payload if needed
    let payloadBuf = packet.payload;
    if (payloadBuf[0] === 0x1f && payloadBuf[1] === 0x8b) {
      const zlib = require('zlib');
      payloadBuf = zlib.gunzipSync(Buffer.from(payloadBuf));
    }

    const pushReq = PushMessagesRequestType.decode(payloadBuf) as any;
    if (!pushReq.messages) return results;

    const messages = pushReq.messages;
    for (const [key, msg] of Object.entries(messages) as [string, any][]) {
      try {
        const msgType = msg.type || 0;

        // Skip type 0 (system/notification events with no useful content)
        if (msgType === 0) continue;

        const chatId = String(msg.chatId || '');
        const senderId = String(msg.fromId || '');
        const chatType = msg.chatType === 2 ? 'group' : 'private';
        const rawTime = msg.createTime?.toNumber?.() || Number(msg.createTime) || 0;
        // Feishu timestamps are in seconds; convert to milliseconds
        const createTimeMs = rawTime > 0 && rawTime < 10000000000 ? rawTime * 1000 : rawTime || Date.now();
        const messageId = msg.id || key;

        let content = '';

        // Known message type names
        const msgTypeMap: Record<number, string> = {
          2: 'post',
          4: 'text',
          5: 'image',
          6: 'file',
          15: 'sticker',
          19: 'audio',
          21: 'media',
          26: 'card',
        };
        const msgTypeStr = msgTypeMap[msgType] || `type_${msgType}`;

        let messageMentions: MentionInfo[] = [];

        // Decode text content for text messages (type=4)
        if (msgType === 4 && msg.content && msg.content.length > 0) {
          try {
            const contentBuf = toBuffer(msg.content);
            const textContent = TextContentType.decode(contentBuf) as any;
            const decoded = decodeRichTextContent(textContent);
            content = decoded.text;
            messageMentions = decoded.mentions;
          } catch (e: any) {
            logger.error('Failed to decode text content:', e.message);
          }
        }

        // For non-text messages, use a type label
        if (msgType !== 4) {
          content = `[${msgTypeStr}]`;
        }

        if (!content) continue;

        // Skip messages without chatId (orphan notifications)
        if (!chatId) continue;

        results.push({
          messageId,
          chatId,
          senderId,
          senderName: '',
          content,
          msgType: msgTypeStr,
          timestamp: new Date(createTimeMs),
          chatType,
          mentions: messageMentions.length > 0 ? messageMentions : undefined,
          rawData: JSON.stringify({
            type: msgType,
            chatType: msg.chatType,
            key,
          }),
        });
      } catch (e) {
        logger.debug('Failed to decode individual message:', e);
      }
    }
  } catch (e) {
    logger.debug('Failed to decode frame:', e);
  }

  if (results.length > 0) {
    logger.info(`Decoded ${results.length} message(s)`);
  }

  return results;
}
