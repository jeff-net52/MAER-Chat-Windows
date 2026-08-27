import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { dirname, join, relative, sep } from 'node:path';

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

async function collectFiles(root, current = root) {
  const collected = [];
  const entries = await readdir(current, { withFileTypes: true });
  entries.sort((left, right) => left.name.localeCompare(right.name, 'en'));
  for (const entry of entries) {
    const absolute = join(current, entry.name);
    if (entry.isDirectory()) {
      collected.push(...await collectFiles(root, absolute));
    } else if (entry.isFile()) {
      const path = relative(root, absolute).split(sep).join('/');
      collected.push({ absolute, path });
    } else {
      throw new Error(`Unsupported package entry: ${absolute}`);
    }
  }
  return collected;
}

function localHeader(name, data, crc) {
  const header = Buffer.alloc(30);
  header.writeUInt32LE(0x04034b50, 0);
  header.writeUInt16LE(20, 4);
  header.writeUInt16LE(0x0800, 6);
  header.writeUInt16LE(0, 8);
  header.writeUInt16LE(0, 10);
  header.writeUInt16LE(33, 12);
  header.writeUInt32LE(crc, 14);
  header.writeUInt32LE(data.length, 18);
  header.writeUInt32LE(data.length, 22);
  header.writeUInt16LE(name.length, 26);
  header.writeUInt16LE(0, 28);
  return header;
}

function centralHeader(name, data, crc, offset) {
  const header = Buffer.alloc(46);
  header.writeUInt32LE(0x02014b50, 0);
  header.writeUInt16LE(0x0314, 4);
  header.writeUInt16LE(20, 6);
  header.writeUInt16LE(0x0800, 8);
  header.writeUInt16LE(0, 10);
  header.writeUInt16LE(0, 12);
  header.writeUInt16LE(33, 14);
  header.writeUInt32LE(crc, 16);
  header.writeUInt32LE(data.length, 20);
  header.writeUInt32LE(data.length, 24);
  header.writeUInt16LE(name.length, 28);
  header.writeUInt16LE(0, 30);
  header.writeUInt16LE(0, 32);
  header.writeUInt16LE(0, 34);
  header.writeUInt16LE(0, 36);
  header.writeUInt32LE((0o100644 << 16) >>> 0, 38);
  header.writeUInt32LE(offset, 42);
  return header;
}

export async function createDeterministicZip(sourceDirectory, outputPath) {
  const sourceInfo = await stat(sourceDirectory);
  if (!sourceInfo.isDirectory()) {
    throw new Error('ZIP source must be a directory');
  }
  const entries = await collectFiles(sourceDirectory);
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  for (const entry of entries) {
    const data = await readFile(entry.absolute);
    const name = Buffer.from(entry.path, 'utf8');
    const crc = crc32(data);
    const local = localHeader(name, data, crc);
    localParts.push(local, name, data);
    centralParts.push(centralHeader(name, data, crc, offset), name);
    offset += local.length + name.length + data.length;
  }

  const centralSize = centralParts.reduce((total, part) => total + part.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);

  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, Buffer.concat([...localParts, ...centralParts, end]));
  return { outputPath, entries: entries.map((entry) => entry.path) };
}
