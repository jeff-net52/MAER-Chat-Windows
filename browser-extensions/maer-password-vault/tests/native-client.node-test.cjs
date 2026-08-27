'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { loadNativeClient } = require('./helpers.cjs');

const { NativeClient } = loadNativeClient();

class Signal {
  constructor() {
    this.listeners = new Set();
  }

  addListener(listener) {
    this.listeners.add(listener);
  }

  removeListener(listener) {
    this.listeners.delete(listener);
  }

  emit(value) {
    for (const listener of Array.from(this.listeners)) {
      listener(value);
    }
  }
}

class FakePort {
  constructor() {
    this.onMessage = new Signal();
    this.onDisconnect = new Signal();
    this.messages = [];
    this.disconnected = false;
  }

  postMessage(message) {
    this.messages.push(structuredClone(message));
  }

  disconnect() {
    this.disconnected = true;
    this.onDisconnect.emit();
  }
}

function responseFor(request, payload) {
  return {
    protocol: 'maer.password-vault',
    version: 1,
    id: request.id,
    type: 'response',
    origin: request.origin,
    ok: true,
    payload
  };
}

function fixture(options = {}) {
  const ports = [new FakePort(), new FakePort()];
  let connections = 0;
  let lastErrorReads = 0;
  const timers = [];
  const runtime = {
    connectNative(hostName) {
      assert.equal(hostName, 'fr.maer.password_vault');
      const selected = ports[Math.min(connections, ports.length - 1)];
      connections += 1;
      return selected;
    }
  };
  Object.defineProperty(runtime, 'lastError', {
    get() {
      lastErrorReads += 1;
      return null;
    }
  });
  const client = new NativeClient.NativeVaultClient(runtime, {
    idFactory: () => options.id || '12345678-test',
    now: () => 1234,
    timeoutMs: 50,
    reconnectBaseMs: 10,
    reconnectMaxMs: 40,
    setTimer(handler, delay) {
      const timer = { handler, delay, cleared: false };
      timers.push(timer);
      return timer;
    },
    clearTimer(timer) {
      timer.cleared = true;
    }
  });
  return { client, ports, timers, connections: () => connections, lastErrorReads: () => lastErrorReads };
}

test('uses only the named native host and resolves a correlated response', async () => {
  const { client, ports } = fixture();
  const pending = client.request('vault.status', 'https://example.org', {});
  assert.equal(ports[0].messages.length, 1);
  const request = ports[0].messages[0];
  assert.equal(request.type, 'vault.status');
  ports[0].onMessage.emit(responseFor(request, { state: 'ready', capabilities: ['lookup'] }));
  assert.deepEqual(await pending, { state: 'ready', capabilities: ['lookup'] });
  client.dispose();
});

test('transmits save data but does not retain it in the pending request record', async () => {
  const { client, ports } = fixture();
  const pending = client.request('vault.save', 'https://example.org', {
    username: 'alice', password: 'transient-secret', label: 'Example'
  });
  const request = ports[0].messages[0];
  assert.equal(request.payload.password, 'transient-secret');
  assert.equal(Object.prototype.hasOwnProperty.call(client.pending.get(request.id), 'payload'), false);
  ports[0].onMessage.emit(responseFor(request, {}));
  await pending;
  client.dispose();
});

test('rejects and disconnects on a mismatched origin', async () => {
  const { client, ports } = fixture();
  const pending = client.request('vault.status', 'https://example.org', {});
  const request = ports[0].messages[0];
  const response = responseFor(request, { state: 'ready', capabilities: [] });
  response.origin = 'https://attacker.example';
  ports[0].onMessage.emit(response);
  await assert.rejects(pending, (error) => error.code === 'VAULT_UNAVAILABLE');
  assert.equal(ports[0].disconnected, true);
  client.dispose();
});

test('times out, returns a generic failure and schedules bounded reconnection', async () => {
  const { client, timers, ports } = fixture();
  const pending = client.request('vault.status', 'https://example.org', {});
  assert.equal(timers[0].delay, 50);
  timers[0].handler();
  await assert.rejects(pending, (error) => error.code === 'VAULT_TIMEOUT' && !error.message.includes('example.org'));
  assert.equal(ports[0].disconnected, true);
  const reconnect = timers.find((timer) => !timer.cleared && timer.delay === 10);
  assert.ok(reconnect);
  client.dispose();
});

test('consumes the browser disconnect error and reconnects through Native Messaging', async () => {
  const { client, ports, timers, connections, lastErrorReads } = fixture();
  const pending = client.request('vault.status', 'https://example.org', {});
  const request = ports[0].messages[0];
  ports[0].onMessage.emit(responseFor(request, { state: 'ready', capabilities: [] }));
  await pending;
  ports[0].onDisconnect.emit();
  assert.equal(lastErrorReads(), 1);
  const reconnect = timers.find((timer) => !timer.cleared && timer.delay === 10);
  assert.ok(reconnect);
  reconnect.handler();
  assert.equal(connections(), 2);
  client.dispose();
});
