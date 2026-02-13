// Decode raw protobuf bytes to see actual field structure
function decodeRawProtobuf(buf: Buffer, depth = 0): void {
  let offset = 0;
  const indent = '  '.repeat(depth);

  while (offset < buf.length) {
    const startOff = offset;
    // Read tag
    let tag = 0;
    let shift = 0;
    while (offset < buf.length) {
      const b = buf[offset++];
      tag |= (b & 0x7f) << shift;
      shift += 7;
      if ((b & 0x80) === 0) break;
    }

    const fieldNumber = tag >> 3;
    const wireType = tag & 0x7;

    if (wireType === 0) {
      // Varint
      let value = BigInt(0);
      let s = BigInt(0);
      while (offset < buf.length) {
        const b = buf[offset++];
        value |= BigInt(b & 0x7f) << s;
        s += BigInt(7);
        if ((b & 0x80) === 0) break;
      }
      console.log(`${indent}field ${fieldNumber} (varint): ${value}`);
    } else if (wireType === 2) {
      // Length-delimited
      let length = 0;
      let s = 0;
      while (offset < buf.length) {
        const b = buf[offset++];
        length |= (b & 0x7f) << s;
        s += 7;
        if ((b & 0x80) === 0) break;
      }
      const data = buf.subarray(offset, offset + length);
      offset += length;

      // Try to interpret as string
      const isAscii = data.every(b => b >= 0x20 && b < 0x7f);
      if (isAscii && length > 0 && length < 200) {
        console.log(`${indent}field ${fieldNumber} (string, ${length}b): "${data.toString('utf8')}"`);
      } else {
        console.log(`${indent}field ${fieldNumber} (bytes, ${length}b): ${data.subarray(0, 30).toString('hex')}${length > 30 ? '...' : ''}`);
        // Try recursive decode
        if (length > 2) {
          try {
            console.log(`${indent}  [nested:]`);
            decodeRawProtobuf(data, depth + 2);
          } catch {
            // Not a valid protobuf
          }
        }
      }
    } else if (wireType === 5) {
      // 32-bit
      const val = buf.readUInt32LE(offset);
      offset += 4;
      console.log(`${indent}field ${fieldNumber} (fixed32): ${val}`);
    } else if (wireType === 1) {
      // 64-bit
      const val = buf.readBigUInt64LE(offset);
      offset += 8;
      console.log(`${indent}field ${fieldNumber} (fixed64): ${val}`);
    } else {
      console.log(`${indent}field ${fieldNumber} (wire ${wireType}): unknown at offset ${startOff}`);
      break;
    }
  }
}

// cmd=6 payload (504 bytes, first 100 hex)
const hex6 = '0ae7020a133736303631383435353637353137363837383912cf020a133736303631383435353637353137363837383910041a1337353239333431373734393339373137363531208eb1bacc062a2f0a001a2b0a013312001a220a200a0133121b08011a';
console.log('=== Packet payload (cmd=6) ===');
decodeRawProtobuf(Buffer.from(hex6, 'hex'));
