(function initializeNativeClient(root) {
  'use strict';

  const namespace = root.MaerVault = root.MaerVault || {};
  const C = namespace.Constants;
  const P = namespace.Protocol;

  if (!C || !P) {
    throw new Error('MAER vault protocol is required');
  }

  class VaultClientError extends Error {
    constructor(code) {
      super('MAER password vault is unavailable');
      this.name = 'VaultClientError';
      this.code = code || 'VAULT_UNAVAILABLE';
    }
  }

  function secureRequestId() {
    const cryptoApi = root.crypto;
    if (cryptoApi && typeof cryptoApi.randomUUID === 'function') {
      return cryptoApi.randomUUID();
    }
    if (!cryptoApi || typeof cryptoApi.getRandomValues !== 'function') {
      throw new VaultClientError('VAULT_UNAVAILABLE');
    }
    const bytes = new Uint8Array(16);
    cryptoApi.getRandomValues(bytes);
    return Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('');
  }

  class NativeVaultClient {
    constructor(runtimeApi, options) {
      if (!runtimeApi || typeof runtimeApi.connectNative !== 'function') {
        throw new VaultClientError('VAULT_UNAVAILABLE');
      }
      const settings = options || {};
      this.runtimeApi = runtimeApi;
      this.timeoutMs = settings.timeoutMs || C.REQUEST_TIMEOUT_MS;
      this.reconnectBaseMs = settings.reconnectBaseMs || C.RECONNECT_BASE_MS;
      this.reconnectMaxMs = settings.reconnectMaxMs || C.RECONNECT_MAX_MS;
      this.idFactory = settings.idFactory || secureRequestId;
      this.now = settings.now || (() => Date.now());
      this.setTimer = settings.setTimer || ((handler, delay) => root.setTimeout(handler, delay));
      this.clearTimer = settings.clearTimer || ((timer) => root.clearTimeout(timer));
      this.port = null;
      this.pending = new Map();
      this.reconnectTimer = null;
      this.reconnectAttempts = 0;
      this.disposed = false;
      this.boundMessage = (message) => this.handleNativeMessage(message);
      this.boundDisconnect = () => this.handleDisconnect();
    }

    request(type, origin, payload) {
      if (this.disposed) {
        return Promise.reject(new VaultClientError('VAULT_UNAVAILABLE'));
      }

      let request;
      try {
        request = P.assertMessageSize(P.makeRequest({
          id: this.idFactory(),
          type,
          origin,
          sentAt: this.now(),
          payload
        }));
      } catch (_error) {
        return Promise.reject(new VaultClientError('REQUEST_REJECTED'));
      }

      let port;
      try {
        port = this.ensurePort();
      } catch (_error) {
        P.scrubSensitive(request);
        return Promise.reject(new VaultClientError('VAULT_UNAVAILABLE'));
      }

      return new Promise((resolve, reject) => {
        const timer = this.setTimer(() => {
          this.pending.delete(request.id);
          reject(new VaultClientError('VAULT_TIMEOUT'));
          this.dropPort(true);
        }, this.timeoutMs);

        this.pending.set(request.id, {
          id: request.id,
          origin: request.origin,
          type: request.type,
          resolve,
          reject,
          timer
        });

        try {
          port.postMessage(request);
        } catch (_error) {
          this.clearPending(request.id, new VaultClientError('VAULT_UNAVAILABLE'));
          this.dropPort(true);
        } finally {
          P.scrubSensitive(request);
        }
      });
    }

    ensurePort() {
      if (this.port) {
        return this.port;
      }
      if (this.reconnectTimer) {
        this.clearTimer(this.reconnectTimer);
        this.reconnectTimer = null;
      }
      const port = this.runtimeApi.connectNative(C.HOST_NAME);
      if (!port || !port.onMessage || !port.onDisconnect || typeof port.postMessage !== 'function') {
        throw new VaultClientError('VAULT_UNAVAILABLE');
      }
      port.onMessage.addListener(this.boundMessage);
      port.onDisconnect.addListener(this.boundDisconnect);
      this.port = port;
      return port;
    }

    handleNativeMessage(rawMessage) {
      let pending;
      try {
        P.assertMessageSize(rawMessage);
        const rawId = rawMessage && typeof rawMessage.id === 'string' ? rawMessage.id : '';
        pending = this.pending.get(rawId);
        if (!pending) {
          throw new P.ProtocolViolation('response has no pending request');
        }
        const response = P.validateResponse(rawMessage, pending);
        this.pending.delete(pending.id);
        this.clearTimer(pending.timer);
        this.reconnectAttempts = 0;
        if (!response.ok) {
          pending.reject(new VaultClientError('VAULT_ACTION_FAILED'));
        } else {
          pending.resolve(response.payload);
        }
      } catch (_error) {
        if (pending) {
          this.clearPending(pending.id, new VaultClientError('VAULT_UNAVAILABLE'));
        }
        this.dropPort(true);
      } finally {
        P.scrubSensitive(rawMessage);
      }
    }

    handleDisconnect() {
      // Reading lastError prevents Chromium from emitting an automatic
      // "Unchecked runtime.lastError" diagnostic when the native host is absent.
      void this.runtimeApi.lastError;
      this.dropPort(true);
    }

    clearPending(id, error) {
      const pending = this.pending.get(id);
      if (!pending) {
        return;
      }
      this.pending.delete(id);
      this.clearTimer(pending.timer);
      pending.reject(error || new VaultClientError('VAULT_UNAVAILABLE'));
    }

    rejectAll(error) {
      for (const id of Array.from(this.pending.keys())) {
        this.clearPending(id, error);
      }
    }

    detachPort(port) {
      if (!port) {
        return;
      }
      try {
        port.onMessage.removeListener(this.boundMessage);
        port.onDisconnect.removeListener(this.boundDisconnect);
      } catch (_error) {
        // Removing a listener is best-effort and never changes the locked state.
      }
    }

    dropPort(reconnect) {
      const previous = this.port;
      this.port = null;
      this.detachPort(previous);
      if (previous && typeof previous.disconnect === 'function') {
        try {
          previous.disconnect();
        } catch (_error) {
          // The browser may already have closed the native port.
        }
      }
      this.rejectAll(new VaultClientError('VAULT_UNAVAILABLE'));
      if (reconnect) {
        this.scheduleReconnect();
      }
    }

    scheduleReconnect() {
      if (this.disposed || this.reconnectTimer) {
        return;
      }
      const exponent = Math.min(this.reconnectAttempts, 5);
      const delay = Math.min(this.reconnectMaxMs, this.reconnectBaseMs * (2 ** exponent));
      this.reconnectAttempts += 1;
      this.reconnectTimer = this.setTimer(() => {
        this.reconnectTimer = null;
        if (this.disposed || this.port) {
          return;
        }
        try {
          this.ensurePort();
        } catch (_error) {
          this.scheduleReconnect();
        }
      }, delay);
    }

    dispose() {
      this.disposed = true;
      if (this.reconnectTimer) {
        this.clearTimer(this.reconnectTimer);
        this.reconnectTimer = null;
      }
      this.dropPort(false);
    }
  }

  namespace.NativeClient = Object.freeze({
    NativeVaultClient,
    VaultClientError,
    secureRequestId
  });
})(globalThis);
