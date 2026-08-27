import { deflateSync } from 'node:zlib';

const crcTable = new Uint32Array(256);
for (let index = 0; index < 256; index += 1) {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = (value >>> 1) ^ ((value & 1) ? 0xedb88320 : 0);
  }
  crcTable[index] = value >>> 0;
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc = (crc >>> 8) ^ crcTable[(crc ^ byte) & 0xff];
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuffer = Buffer.from(type, 'ascii');
  const output = Buffer.alloc(data.length + 12);
  output.writeUInt32BE(data.length, 0);
  typeBuffer.copy(output, 4);
  data.copy(output, 8);
  output.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), data.length + 8);
  return output;
}

function roundedRectangleContains(x, y, size) {
  const center = size / 2;
  const half = (size - 1) / 2;
  const radius = size * 0.27;
  const qx = Math.abs(x - center) - (half - radius);
  const qy = Math.abs(y - center) - (half - radius);
  const distance = Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - radius;
  return distance <= 0;
}

function segmentDistance(x, y, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lengthSquared = (dx * dx) + (dy * dy);
  const ratio = Math.max(0, Math.min(1, (((x - x1) * dx) + ((y - y1) * dy)) / lengthSquared));
  return Math.hypot(x - (x1 + (ratio * dx)), y - (y1 + (ratio * dy)));
}

function markContains(x, y, size) {
  const normalizedX = x / size;
  const normalizedY = y / size;
  const width = 0.075;
  return segmentDistance(normalizedX, normalizedY, 0.29, 0.72, 0.29, 0.3) <= width ||
    segmentDistance(normalizedX, normalizedY, 0.71, 0.72, 0.71, 0.3) <= width ||
    segmentDistance(normalizedX, normalizedY, 0.29, 0.31, 0.5, 0.56) <= width ||
    segmentDistance(normalizedX, normalizedY, 0.71, 0.31, 0.5, 0.56) <= width;
}

export function generateIconPng(size) {
  if (!Number.isInteger(size) || size < 16 || size > 512) {
    throw new Error('Icon size must be an integer between 16 and 512');
  }
  const stride = 1 + (size * 4);
  const raw = Buffer.alloc(stride * size);
  const samples = [[0.2, 0.2], [0.8, 0.2], [0.2, 0.8], [0.8, 0.8]];
  for (let y = 0; y < size; y += 1) {
    const row = y * stride;
    raw[row] = 0;
    for (let x = 0; x < size; x += 1) {
      let backgroundCoverage = 0;
      let markCoverage = 0;
      for (const [offsetX, offsetY] of samples) {
        const sampleX = x + offsetX;
        const sampleY = y + offsetY;
        if (roundedRectangleContains(sampleX, sampleY, size)) {
          backgroundCoverage += 1;
          if (markContains(sampleX, sampleY, size)) {
            markCoverage += 1;
          }
        }
      }
      const index = row + 1 + (x * 4);
      const gradient = Math.max(0, Math.min(1, (x + y) / (2 * (size - 1))));
      const green = [81, 245, 154];
      const cyan = [77, 225, 255];
      const background = green.map((channel, channelIndex) => Math.round(channel + ((cyan[channelIndex] - channel) * gradient)));
      const markBlend = backgroundCoverage ? markCoverage / backgroundCoverage : 0;
      raw[index] = Math.round(background[0] + ((7 - background[0]) * markBlend));
      raw[index + 1] = Math.round(background[1] + ((20 - background[1]) * markBlend));
      raw[index + 2] = Math.round(background[2] + ((25 - background[2]) * markBlend));
      raw[index + 3] = Math.round((backgroundCoverage / samples.length) * 255);
    }
  }

  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8;
  header[9] = 6;
  header[10] = 0;
  header[11] = 0;
  header[12] = 0;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
}
