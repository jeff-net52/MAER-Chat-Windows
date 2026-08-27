'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { pathToFileURL } = require('node:url');
const { extensionRoot } = require('./helpers.cjs');

test('ZIP output is byte-for-byte reproducible and ordered', async () => {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'maer-vault-zip-test-'));
  try {
    const source = path.join(temporary, 'source');
    await fs.mkdir(path.join(source, 'nested'), { recursive: true });
    await fs.writeFile(path.join(source, 'z.txt'), 'last\n');
    await fs.writeFile(path.join(source, 'nested', 'a.txt'), 'first\n');
    const moduleUrl = pathToFileURL(path.join(extensionRoot, 'scripts', 'zip.mjs')).href;
    const { createDeterministicZip } = await import(moduleUrl);
    const first = path.join(temporary, 'first.zip');
    const second = path.join(temporary, 'second.zip');
    const firstResult = await createDeterministicZip(source, first);
    const secondResult = await createDeterministicZip(source, second);
    assert.deepEqual(firstResult.entries, ['nested/a.txt', 'z.txt']);
    const firstDigest = crypto.createHash('sha256').update(await fs.readFile(first)).digest('hex');
    const secondDigest = crypto.createHash('sha256').update(await fs.readFile(second)).digest('hex');
    assert.equal(firstDigest, secondDigest);
  } finally {
    await fs.rm(temporary, { recursive: true, force: true });
  }
});
