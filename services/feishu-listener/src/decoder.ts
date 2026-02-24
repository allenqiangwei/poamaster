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
        PostBody: {
          fields: {
            locale: { type: 'string', id: 1 },
            title: { type: 'string', id: 2 },
            richText: { type: 'RichText', id: 3 },
          },
        },
        RichText: {
          fields: {
            elementIds: { rule: 'repeated', type: 'string', id: 1 },
            innerText: { type: 'string', id: 2 },
            elements: { type: 'ElementsMap', id: 3 },
            imageIds: { rule: 'repeated', type: 'string', id: 5 },
            atIds: { rule: 'repeated', type: 'string', id: 6 },
            anchorIds: { rule: 'repeated', type: 'string', id: 7 },
            i18nIds: { rule: 'repeated', type: 'string', id: 8 },
            mediaIds: { rule: 'repeated', type: 'string', id: 9 },
            docsIds: { rule: 'repeated', type: 'string', id: 10 },
            interactiveIds: { rule: 'repeated', type: 'string', id: 11 },
            mentionIds: { rule: 'repeated', type: 'string', id: 12 },
            version: { type: 'int32', id: 13 },
          },
        },
        ElementsMap: {
          fields: {
            dictionary: {
              keyType: 'string',
              type: 'RichTextElement',
              id: 1,
            },
            // field 2 = styleRefs, field 3 = styles — declared to prevent misparse
            styleRefs: { keyType: 'string', type: 'StyleRefs', id: 2 },
            styles: { rule: 'repeated', type: 'StyleEntry', id: 3 },
          },
        },
        StyleRefs: {
          fields: {
            styleIds: { rule: 'repeated', type: 'int32', id: 1 },
          },
        },
        StyleEntry: {
          fields: {
            name: { type: 'string', id: 1 },
            value: { type: 'string', id: 2 },
          },
        },
        RichTextElement: {
          fields: {
            tag: { type: 'int32', id: 1 },
            style: { keyType: 'string', type: 'string', id: 2 },
            property: { type: 'bytes', id: 3 },
            childIds: { rule: 'repeated', type: 'string', id: 4 },
            styleKeys: { rule: 'repeated', type: 'string', id: 5 },
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
        AnchorProperty: {
          fields: {
            url: { type: 'string', id: 1 },
            displayText: { type: 'string', id: 2 },
            token: { type: 'string', id: 4 },
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
let AnchorPropertyType: protobuf.Type;

export function initDecoder() {
  root = protobuf.Root.fromJSON(protoJSON);
  FrameType = root.lookupType('feishu.Frame');
  PacketType = root.lookupType('feishu.Packet');
  PushMessagesRequestType = root.lookupType('feishu.PushMessagesRequest');
  TextContentType = root.lookupType('feishu.TextContent');
  TextPropertyType = root.lookupType('feishu.TextProperty');
  AtMentionPropertyType = root.lookupType('feishu.AtMentionProperty');
  AnchorPropertyType = root.lookupType('feishu.AnchorProperty');
  logger.info('Protobuf decoder initialized');
}

/** Extract the raw bytes of a specific field number from a protobuf buffer */
function extractProtobufField(buf: Uint8Array, targetField: number): Uint8Array | null {
  const results = extractAllProtobufFields(buf, targetField);
  return results.length > 0 ? results[0] : null;
}

/** Extract ALL occurrences of a specific field number from a protobuf buffer */
function extractAllProtobufFields(buf: Uint8Array, targetField: number): Uint8Array[] {
  const results: Uint8Array[] = [];
  let pos = 0;
  while (pos < buf.length) {
    let tag = 0;
    let shift = 0;
    while (pos < buf.length) {
      const b = buf[pos++];
      tag |= (b & 0x7f) << shift;
      if ((b & 0x80) === 0) break;
      shift += 7;
    }
    const fieldNum = tag >>> 3;
    const wireType = tag & 0x07;

    if (wireType === 2) { // length-delimited
      let length = 0;
      shift = 0;
      while (pos < buf.length) {
        const b = buf[pos++];
        length |= (b & 0x7f) << shift;
        if ((b & 0x80) === 0) break;
        shift += 7;
      }
      if (fieldNum === targetField) {
        results.push(buf.slice(pos, pos + length));
      }
      pos += length;
    } else if (wireType === 0) { // varint
      while (pos < buf.length && (buf[pos++] & 0x80) !== 0) {}
    } else if (wireType === 1) { // 64-bit
      pos += 8;
    } else if (wireType === 5) { // 32-bit
      pos += 4;
    } else {
      break; // unknown wire type, stop
    }
  }
  return results;
}

/** List all field numbers present in a protobuf buffer (for debugging) */
function listProtobufFields(buf: Uint8Array): string[] {
  const fields: string[] = [];
  let pos = 0;
  while (pos < buf.length) {
    let tag = 0;
    let shift = 0;
    while (pos < buf.length) {
      const b = buf[pos++];
      tag |= (b & 0x7f) << shift;
      if ((b & 0x80) === 0) break;
      shift += 7;
    }
    const fieldNum = tag >>> 3;
    const wireType = tag & 0x07;
    if (wireType === 2) {
      let length = 0;
      shift = 0;
      while (pos < buf.length) {
        const b = buf[pos++];
        length |= (b & 0x7f) << shift;
        if ((b & 0x80) === 0) break;
        shift += 7;
      }
      fields.push(`${fieldNum}:LD(${length})`);
      pos += length;
    } else if (wireType === 0) {
      let val = 0;
      shift = 0;
      while (pos < buf.length) {
        const b = buf[pos++];
        val |= (b & 0x7f) << shift;
        if ((b & 0x80) === 0) break;
        shift += 7;
      }
      fields.push(`${fieldNum}:V(${val})`);
    } else if (wireType === 1) {
      fields.push(`${fieldNum}:64`);
      pos += 8;
    } else if (wireType === 5) {
      fields.push(`${fieldNum}:32`);
      pos += 4;
    } else {
      fields.push(`${fieldNum}:WT${wireType}`);
      break;
    }
  }
  return fields;
}

/** Recursively extract all string values from protobuf bytes (brute-force fallback) */
function extractAllStringsFromProtobuf(buf: Uint8Array, result: string[], depth = 0): void {
  if (depth > 5) return; // prevent infinite recursion
  let pos = 0;
  while (pos < buf.length) {
    let tag = 0;
    let shift = 0;
    while (pos < buf.length) {
      const b = buf[pos++];
      tag |= (b & 0x7f) << shift;
      if ((b & 0x80) === 0) break;
      shift += 7;
    }
    const wireType = tag & 0x07;
    if (wireType === 2) {
      let length = 0;
      shift = 0;
      while (pos < buf.length) {
        const b = buf[pos++];
        length |= (b & 0x7f) << shift;
        if ((b & 0x80) === 0) break;
        shift += 7;
      }
      if (length > 0 && length <= buf.length - pos) {
        const data = buf.slice(pos, pos + length);
        // Try as UTF-8 string
        try {
          const str = Buffer.from(data).toString('utf-8');
          // Check if it looks like valid text (no control chars except newline)
          if (str.length > 0 && /^[\p{L}\p{N}\p{P}\p{S}\p{Z}\n\r]+$/u.test(str)) {
            result.push(str);
          } else {
            // Try as nested protobuf
            extractAllStringsFromProtobuf(data, result, depth + 1);
          }
        } catch {
          // Not valid UTF-8
        }
        pos += length;
      } else {
        break;
      }
    } else if (wireType === 0) {
      while (pos < buf.length && (buf[pos++] & 0x80) !== 0) {}
    } else if (wireType === 1) {
      pos += 8;
    } else if (wireType === 5) {
      pos += 4;
    } else {
      break;
    }
  }
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

// Rich text element tag types (from proto.proto RichTextElement.Tag enum)
const TAG_TEXT = 1;
const TAG_IMG = 2;
const TAG_P = 3;       // Paragraph container (has childIds)
const TAG_AT = 5;      // @mention
const TAG_A = 6;       // Link/anchor

/** Decode protobuf bytes field (may be Uint8Array or base64 string from protobufjs) */
function toBuffer(data: any): Uint8Array {
  if (typeof data === 'string') return Buffer.from(data, 'base64');
  return data;
}

/** Decode a single rich text element, returning its text and any @mention info.
 *
 * Real Feishu tag values vary across post structures (e.g. 1=text, 3=P,
 * 5=AT, 6=A in some posts, but 1=text, 22/26/28=containers in others).
 * We handle this by:
 *   1) Treating ANY element with childIds as a container (not just TAG_P=3)
 *   2) Trying multiple property decoders for elements with property bytes
 */
function decodeElement(
  elem: any,
  dict: Record<string, any>,
  mentions: MentionInfo[]
): string {
  const tag = elem.tag || 0;
  const childIds: string[] = elem.childIds || [];

  // Any element with children → container element — recurse into children
  if (childIds.length > 0) {
    let paraText = '';
    for (const childId of childIds) {
      const child = dict[childId];
      if (child) {
        try {
          paraText += decodeElement(child, dict, mentions);
        } catch (e: any) {
          logger.debug(`Failed to decode child ${childId} (tag=${child.tag}): ${e.message}`);
        }
      }
    }
    // Also decode own property if present (some containers carry text too)
    const propBytes = elem.property;
    if (propBytes && propBytes.length > 0) {
      try {
        const propBuf = toBuffer(propBytes);
        const prop = TextPropertyType.decode(propBuf) as any;
        if (prop.content) paraText += prop.content;
      } catch { /* ignore — container's own property is optional */ }
    }
    return paraText ? paraText + '\n' : '\n';
  }

  // Leaf element — decode property bytes
  const propBytes = elem.property;
  if (!propBytes || propBytes.length === 0) return '';

  try {
    const propBuf = toBuffer(propBytes);

    // Try @mention first (field 1=userId, field 2=displayName)
    if (tag === TAG_AT) {
      const mention = AtMentionPropertyType.decode(propBuf) as any;
      const displayName = mention.displayName || '';
      const userId = mention.userId || '';
      if (userId && displayName) {
        mentions.push({ userId, displayName });
      }
      return displayName || `@${userId || 'unknown'}`;
    }

    // Try anchor/link (field 1=url, field 2=displayText)
    if (tag === TAG_A) {
      try {
        const anchor = AnchorPropertyType.decode(propBuf) as any;
        const text = anchor.displayText || anchor.url || '';
        if (text) return text;
      } catch { /* fallthrough to TextProperty */ }
    }

    // Default: try TextProperty (field 1=content) — works for most element types
    const prop = TextPropertyType.decode(propBuf) as any;
    if (prop.content) return prop.content;

    // If TextProperty returned empty, try AnchorProperty as fallback
    // (for elements with non-standard tags that are actually links)
    try {
      const anchor = AnchorPropertyType.decode(propBuf) as any;
      if (anchor.displayText || anchor.url) {
        return anchor.displayText || anchor.url || '';
      }
    } catch { /* not an anchor */ }

    // Try AtMention as last resort
    try {
      const mention = AtMentionPropertyType.decode(propBuf) as any;
      if (mention.displayName) {
        if (mention.userId && mention.displayName) {
          mentions.push({ userId: mention.userId, displayName: mention.displayName });
        }
        return mention.displayName;
      }
    } catch { /* not a mention */ }

    return '';
  } catch {
    return '';
  }
}

/** Extract text content from rich text elements, collecting @mention info */
function decodeRichTextContent(textContent: any): { text: string; mentions: MentionInfo[] } {
  const mentions: MentionInfo[] = [];

  // Try simple text first (no rich text → no @mentions possible)
  if (textContent.text && !textContent.richText) return { text: textContent.text, mentions };

  if (!textContent.richText) return { text: '', mentions };

  // Prefer element-by-element decoding when elements exist,
  // because innerText contains raw userIds where @mentions should be
  const dict = textContent.richText.elements?.dictionary;
  if (!dict) {
    // No elements — use innerText or simple text as fallback
    return { text: textContent.richText.innerText || textContent.text || '', mentions };
  }

  // Collect all child IDs referenced by container elements so we skip them at top level.
  // Any element with childIds is a container (not just TAG_P=3, real tags vary: 22, 26, 28, etc.)
  const childIdSet = new Set<string>();
  for (const elem of Object.values(dict) as any[]) {
    if (elem.childIds && elem.childIds.length > 0) {
      for (const cid of elem.childIds) childIdSet.add(cid);
    }
  }

  // Use elementIds order if available, otherwise sort by key
  const elementIds: string[] = textContent.richText.elementIds || [];
  const orderedIds = elementIds.length > 0
    ? elementIds
    : Object.keys(dict).sort((a, b) => parseInt(a) - parseInt(b));

  let content = '';
  for (const id of orderedIds) {
    // Skip child elements — they're decoded recursively inside their parent P
    if (childIdSet.has(id)) continue;
    const elem = dict[id];
    if (!elem) continue;
    try {
      content += decodeElement(elem, dict, mentions);
    } catch (e: any) {
      logger.debug(`Failed to decode element ${id} (tag=${elem.tag}): ${e.message}`);
    }
  }

  // Strip null bytes — PostgreSQL rejects 0x00 in UTF-8 text columns
  return { text: content.replace(/\0/g, '').trimEnd(), mentions };
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

    // Pre-extract raw map entries — protobufjs drops undeclared PushMessage fields,
    // which may contain content for large post messages
    const rawMapEntries = extractAllProtobufFields(payloadBuf, 1);
    const rawPushMsgByKey = new Map<string, Uint8Array>();
    for (const entry of rawMapEntries) {
      const keyBytes = extractProtobufField(entry, 1);
      const valueBytes = extractProtobufField(entry, 2);
      if (keyBytes && valueBytes) {
        rawPushMsgByKey.set(Buffer.from(keyBytes).toString('utf-8'), valueBytes);
      }
    }

    const messages = pushReq.messages;
    for (const [key, msg] of Object.entries(messages) as [string, any][]) {
      try {
        if (!msg) continue;
        const msgType = msg.type || 0;

        // Log every message for debugging (temporary)
        logger.info(`MSG key=${key} type=${msgType} chatId=${msg.chatId || 'none'} contentLen=${msg.content?.length || 0}`);

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

        // Decode text content (type=4) using TextContent protobuf
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

        // For type 2 posts with empty content, try recovering from raw PushMessage fields.
        // protobufjs silently drops undeclared fields — large posts may use field numbers
        // not in our PushMessage schema (we only declare 1-5, 8-10, 46).
        if (msgType === 2 && (!msg.content || msg.content.length === 0)) {
          const rawMsg = rawPushMsgByKey.get(key);
          if (rawMsg) {
            const rawFields = listProtobufFields(rawMsg);
            logger.info(`Post with empty content (msgId=${messageId}), raw PushMessage fields: [${rawFields.join(', ')}]`);

            // Find candidate LD (length-delimited) fields that could contain content
            const knownNonContent = new Set([1, 2, 3, 4, 8, 9, 10, 46]);
            for (const rf of rawFields) {
              const m = rf.match(/^(\d+):LD\((\d+)\)$/);
              if (m) {
                const fieldNum = parseInt(m[1]);
                const fieldLen = parseInt(m[2]);
                if (!knownNonContent.has(fieldNum) && fieldLen > 10) {
                  const data = extractProtobufField(rawMsg, fieldNum);
                  if (data && data.length > 10) {
                    msg.content = data;
                    logger.info(`Recovered content from raw PushMessage field ${fieldNum} (${data.length} bytes)`);
                    break;
                  }
                }
              }
            }

            // If no suitable LD field found, try brute-force string extraction
            if (!msg.content || msg.content.length === 0) {
              const allStrings: string[] = [];
              extractAllStringsFromProtobuf(rawMsg, allStrings);
              const useful = allStrings.filter(s => s.length > 5 && !/^[a-f0-9-]+$/i.test(s));
              if (useful.length > 0) {
                content = useful.join('\n').replace(/\0/g, '').trim();
                logger.info(`Post content from raw PushMessage string extraction: ${content.length} chars`);
              } else {
                // Log raw hex for future debugging
                logger.info(`Post decode: no content found in raw PushMessage. Hex (first 500): ${Buffer.from(rawMsg.slice(0, 500)).toString('hex')}`);
              }
            }
          }
        }

        // Decode post content (type=2)
        // Post structure: Content[field 6] → PostBody[field 1=locale, 2=title, 3=ElementsMap]
        // Some posts have multiple field 6 entries (one per locale).
        // We extract fields manually to avoid unknown-field decode errors in protobufjs.
        if (msgType === 2 && msg.content && msg.content.length > 0) {
          try {
            const contentBuf = toBuffer(msg.content);
            // Always log post structure for debugging
            const allFields = listProtobufFields(contentBuf);
            logger.info(`Post Content: fields=[${allFields.join(', ')}], len=${contentBuf.length}, hex=${Buffer.from(contentBuf.slice(0, 200)).toString('hex')}`);
            // Extract ALL PostBody entries (field 6 of Content) — one per locale
            const allPostBodies = extractAllProtobufFields(contentBuf, 6);

            if (allPostBodies.length > 0) {
              // Try each locale body until we get text (prefer first/zh_cn)
              for (const postBodyBytes of allPostBodies) {
                const bodyFields = listProtobufFields(postBodyBytes);
                logger.debug(`PostBody fields: [${bodyFields.join(', ')}]`);

                const titleBytes = extractProtobufField(postBodyBytes, 2);
                const title = titleBytes && titleBytes.length > 0
                  ? Buffer.from(titleBytes).toString('utf-8')
                  : '';
                const richTextBytes = extractProtobufField(postBodyBytes, 3);

                if (richTextBytes && richTextBytes.length > 0) {
                  try {
                    const ElementsMapType = root.lookupType('feishu.ElementsMap');
                    const elementsMap = ElementsMapType.decode(richTextBytes) as any;
                    const decoded = decodeRichTextContent({
                      richText: { elements: elementsMap }
                    });
                    const bodyText = decoded.text;
                    messageMentions = decoded.mentions;
                    content = (title && bodyText ? `${title}\n${bodyText}` : title || bodyText)
                      .replace(/\0/g, '');
                  } catch (e: any) {
                    logger.debug('Failed to decode post ElementsMap for one locale:', e.message);
                    // Try decoding field 3 as RichText instead of ElementsMap
                    try {
                      const RichTextType = root.lookupType('feishu.RichText');
                      const richText = RichTextType.decode(richTextBytes) as any;
                      const decoded = decodeRichTextContent({ richText });
                      if (decoded.text) {
                        content = (title && decoded.text ? `${title}\n${decoded.text}` : title || decoded.text)
                          .replace(/\0/g, '');
                        messageMentions = decoded.mentions;
                      }
                    } catch {
                      content = (title || '').replace(/\0/g, '');
                    }
                  }
                } else {
                  content = (title || '').replace(/\0/g, '');
                }

                if (content) {
                  logger.debug(`Post decoded: title="${title}", body=${content.length} chars`);
                  break; // Got text from one locale, done
                }
              }
            }

            // Fallback A: try decoding as TextContent (some "post" type messages are structured as text)
            if (!content) {
              try {
                const textContent = TextContentType.decode(contentBuf) as any;
                const decoded = decodeRichTextContent(textContent);
                if (decoded.text) {
                  content = decoded.text;
                  messageMentions = decoded.mentions;
                  logger.debug(`Post decoded via TextContent fallback: ${content.length} chars`);
                }
              } catch {
                // Not a TextContent structure
              }
            }

            // Fallback B: try other field numbers for PostBody (some variants use field 7, 8, etc.)
            if (!content) {
              for (const fieldNum of [7, 8, 4, 5]) {
                const altBody = extractProtobufField(contentBuf, fieldNum);
                if (altBody && altBody.length > 10) {
                  // Try to find title/richtext within this field
                  const tBytes = extractProtobufField(altBody, 2);
                  const t = tBytes ? Buffer.from(tBytes).toString('utf-8') : '';
                  const rtBytes = extractProtobufField(altBody, 3);
                  if (rtBytes && rtBytes.length > 0) {
                    try {
                      const ElementsMapType = root.lookupType('feishu.ElementsMap');
                      const elementsMap = ElementsMapType.decode(rtBytes) as any;
                      const decoded = decodeRichTextContent({ richText: { elements: elementsMap } });
                      if (decoded.text) {
                        content = (t && decoded.text ? `${t}\n${decoded.text}` : t || decoded.text).replace(/\0/g, '');
                        messageMentions = decoded.mentions;
                        logger.debug(`Post decoded via alt field ${fieldNum}: ${content.length} chars`);
                        break;
                      }
                    } catch { /* skip */ }
                  } else if (t) {
                    content = t.replace(/\0/g, '');
                    logger.debug(`Post decoded title-only via alt field ${fieldNum}`);
                    break;
                  }
                }
              }
            }

            // Fallback C: extract innerText from RichText (field 2) — plain-text representation
            if (!content) {
              for (const postBodyBytes of extractAllProtobufFields(contentBuf, 6)) {
                const richTextBytes = extractProtobufField(postBodyBytes, 3);
                if (richTextBytes) {
                  // innerText is field 2 of ElementsMap/RichText-like structure
                  const innerTextBytes = extractProtobufField(richTextBytes, 2);
                  if (innerTextBytes && innerTextBytes.length > 0) {
                    content = Buffer.from(innerTextBytes).toString('utf-8').replace(/\0/g, '').trim();
                    if (content) {
                      // Also prepend title if available
                      const titleBytes = extractProtobufField(postBodyBytes, 2);
                      const title = titleBytes ? Buffer.from(titleBytes).toString('utf-8') : '';
                      if (title) content = `${title}\n${content}`;
                      logger.info(`Post decoded via innerText fallback: ${content.length} chars`);
                      break;
                    }
                  }
                }
              }
            }

            // Fallback D: brute-force extract all UTF-8 strings from content bytes
            if (!content) {
              const allStrings: string[] = [];
              extractAllStringsFromProtobuf(contentBuf, allStrings);
              const useful = allStrings.filter(s => s.length > 2 && !/^[a-f0-9-]+$/i.test(s));
              if (useful.length > 0) {
                content = useful.join(' ').replace(/\0/g, '').trim();
                logger.info(`Post decoded via string extraction: ${content.length} chars from ${useful.length} strings`);
              }
            }

            // Log failed decode for future debugging
            if (!content) {
              const fields = listProtobufFields(contentBuf);
              logger.info(`Post decode FAILED, Content fields: [${fields.join(', ')}], hex=${Buffer.from(contentBuf.slice(0, 200)).toString('hex')}`);
            }
          } catch (e: any) {
            logger.error('Failed to decode post content:', e.message);
          }
        }

        // For other non-decodable message types, use a type label
        if (!content && msgType !== 4 && msgType !== 2) {
          content = `[${msgTypeStr}]`;
        }
        // If post/text decoding failed, fall back to type label
        if (!content && (msgType === 2 || msgType === 4)) {
          content = `[${msgTypeStr}]`;
        }

        if (!content) continue;

        // Skip messages without chatId (orphan notifications)
        if (!chatId) continue;

        // Build rawData — for post messages, include content hex for debugging
        const rawDataObj: Record<string, any> = {
          type: msgType,
          chatType: msg.chatType,
          key,
        };
        if (msgType === 2 && msg.content && msg.content.length > 0) {
          const hexBytes = toBuffer(msg.content);
          rawDataObj.contentHex = Buffer.from(hexBytes).toString('hex');
        }

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
          rawData: JSON.stringify(rawDataObj),
        });
      } catch (e) {
        logger.info('Failed to decode individual message:', e);
      }
    }
  } catch (e) {
    logger.info('Failed to decode frame:', e);
  }

  if (results.length > 0) {
    logger.info(`Decoded ${results.length} message(s)`);
  }

  return results;
}
