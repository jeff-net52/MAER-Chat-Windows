'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const { pathToFileURL } = require('node:url');
const { extensionRoot } = require('./helpers.cjs');

test('generates deterministic RGBA PNG icons without external dependencies', async () => {
  const moduleUrl = pathToFileURL(path.join(extensionRoot, 'scripts', 'generate-icons.mjs')).href;
  const { generateIconPng } = await import(moduleUrl);
  for (const size of [16, 32, 48, 128]) {
    const first = generateIconPng(size);
    const second = generateIconPng(size);
    assert.equal(first.equals(second), true);
    assert.deepEqual(Array.from(first.subarray(0, 8)), [137, 80, 78, 71, 13, 10, 26, 10]);
    assert.equal(first.readUInt32BE(16), size);
    assert.equal(first.readUInt32BE(20), size);
    assert.equal(first[24], 8);
    assert.equal(first[25], 6);
  }
});
