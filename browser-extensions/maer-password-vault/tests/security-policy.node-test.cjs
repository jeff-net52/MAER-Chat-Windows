'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { extensionRoot } = require('./helpers.cjs');

function sourceFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    return entry.isDirectory() ? sourceFiles(target) : [target];
  });
}

const sources = sourceFiles(path.join(extensionRoot, 'src'))
  .filter((file) => ['.js', '.html'].includes(path.extname(file)))
  .map((file) => ({ file, source: fs.readFileSync(file, 'utf8') }));

test('runtime code contains no persistence, logging, dynamic code or network fallback', () => {
  const forbidden = [
    /\bconsole\s*\./,
    /\blocalStorage\b/,
    /\bsessionStorage\b/,
    /\bindexedDB\b/,
    /\bfetch\s*\(/,
    /\bXMLHttpRequest\b/,
    /\bWebSocket\b/,
    /\bEventSource\b/,
    /\beval\s*\(/,
    /\bnew\s+Function\b/,
    /\b(?:chrome|browser)\.storage\b/
  ];
  for (const { file, source } of sources) {
    for (const expression of forbidden) {
      assert.equal(expression.test(source), false, `${expression} found in ${file}`);
    }
  }
});

test('user gestures gate lookup, reveal, generate and save', () => {
  const content = fs.readFileSync(path.join(extensionRoot, 'src', 'content', 'content-script.js'), 'utf8');
  assert.match(content, /launcher\.addEventListener\('click',[\s\S]*?lookup\(\)/);
  assert.match(content, /button\.addEventListener\('click', \(\) => revealAndFill\(entry\)\)/);
  assert.match(content, /generateButton\.addEventListener\('click', generatePassword\)/);
  assert.match(content, /saveButton\.addEventListener\('click'/);
  assert.match(content, /submit'[\s\S]*?proposeSave/);
  assert.doesNotMatch(content, /DOMContentLoaded[\s\S]*?lookup\(/);
  assert.match(content, /credentialId:\s*selectedCredentialId/);
  assert.match(content, /response\.payload\.credentialId[\s\S]*?selectedCredentialId\s*=/);
  assert.match(content, /event\.key === 'Escape'[\s\S]*?setPanelOpen\(false, true\)/);
});

test('the only external bridge is the exact native host', () => {
  const constants = fs.readFileSync(path.join(extensionRoot, 'src', 'common', 'constants.js'), 'utf8');
  const client = fs.readFileSync(path.join(extensionRoot, 'src', 'background', 'native-client.js'), 'utf8');
  assert.match(constants, /HOST_NAME: 'fr\.maer\.password_vault'/);
  assert.match(client, /connectNative\(C\.HOST_NAME\)/);
});
