'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { loadProtocol } = require('./helpers.cjs');

const { Constants, Protocol } = loadProtocol();

test('creates a bounded, versioned request with an exact origin', () => {
  const request = Protocol.makeRequest({
    id: '12345678-test',
    type: 'vault.lookup',
    origin: 'https://example.org',
    sentAt: 1234,
    payload: { usernameHint: 'alice', formSignature: 'post:text,password' }
  });
  assert.equal(request.protocol, 'maer.password-vault');
  assert.equal(request.version, 1);
  assert.equal(request.origin, 'https://example.org');
  assert.deepEqual(request.payload, { usernameHint: 'alice', formSignature: 'post:text,password' });
  assert.ok(Protocol.serializedSize(request) < Constants.MAX_NATIVE_MESSAGE_BYTES);
});

test('derives only canonical HTTP(S) origins', () => {
  assert.equal(Protocol.originFromUrl('https://example.org/login?q=1'), 'https://example.org');
  assert.equal(Protocol.originFromUrl('http://localhost:8080/sign-in'), 'http://localhost:8080');
  for (const rejected of [
    'https://example.org/',
    'HTTPS://example.org',
    'file:///tmp/secret',
    'data:text/plain,hello',
    'https://example.org/path'
  ]) {
    assert.throws(() => Protocol.canonicalOrigin(rejected), Protocol.ProtocolViolation);
  }
});

test('rejects unknown fields and out-of-range secrets', () => {
  assert.throws(() => Protocol.makeRequest({
    id: '12345678-test',
    type: 'vault.save',
    origin: 'https://example.org',
    payload: { username: 'alice', password: 'ok', label: 'Example', injected: true }
  }), Protocol.ProtocolViolation);

  assert.throws(() => Protocol.makeRequest({
    id: '12345678-test',
    type: 'vault.save',
    origin: 'https://example.org',
    payload: { username: 'alice', password: 'x'.repeat(Constants.MAX_PASSWORD_LENGTH + 1), label: 'Example' }
  }), Protocol.ProtocolViolation);
});

test('correlates native responses by request id and exact origin', () => {
  const expected = { id: '12345678-test', origin: 'https://example.org', type: 'vault.lookup' };
  const response = Protocol.validateResponse({
    protocol: 'maer.password-vault',
    version: 1,
    id: expected.id,
    type: 'response',
    origin: expected.origin,
    ok: true,
    payload: {
      entries: [{ credentialId: 'credential-0001', username: 'alice', label: 'Example', updatedAt: 123 }]
    }
  }, expected);
  assert.equal(response.payload.entries[0].username, 'alice');
  assert.throws(() => Protocol.validateResponse({
    protocol: 'maer.password-vault',
    version: 1,
    id: expected.id,
    type: 'response',
    origin: 'https://attacker.example',
    ok: true,
    payload: { entries: [] }
  }, expected), Protocol.ProtocolViolation);
});

test('accepts and returns the credential id selected by save deduplication', () => {
  const expected = { id: '12345678-test', origin: 'https://example.org', type: 'vault.save' };
  const response = Protocol.validateResponse({
    protocol: 'maer.password-vault',
    version: 1,
    id: expected.id,
    type: 'response',
    origin: expected.origin,
    ok: true,
    payload: { credentialId: 'credential-0001' }
  }, expected);
  assert.equal(response.payload.credentialId, 'credential-0001');
  assert.throws(() => Protocol.validateResponse({
    protocol: 'maer.password-vault',
    version: 1,
    id: expected.id,
    type: 'response',
    origin: expected.origin,
    ok: true,
    payload: {}
  }, expected), Protocol.ProtocolViolation);
});

test('never accepts a password in lookup metadata', () => {
  assert.throws(() => Protocol.validateResponse({
    protocol: 'maer.password-vault',
    version: 1,
    id: '12345678-test',
    type: 'response',
    origin: 'https://example.org',
    ok: true,
    payload: {
      entries: [{
        credentialId: 'credential-0001', username: 'alice', label: 'Example', updatedAt: 123, password: 'leak'
      }]
    }
  }, { id: '12345678-test', origin: 'https://example.org', type: 'vault.lookup' }), Protocol.ProtocolViolation);
});

test('scrubs nested password and secret properties best-effort', () => {
  const value = { payload: { password: 'one', nested: [{ secret: 'two' }] } };
  Protocol.scrubSensitive(value);
  assert.equal(value.payload.password, '');
  assert.equal(value.payload.nested[0].secret, '');
});
