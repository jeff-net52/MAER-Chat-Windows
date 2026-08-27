(function initializeBackground(root) {
  'use strict';

  if ((!root.MaerVault || !root.MaerVault.NativeClient) && typeof root.importScripts === 'function') {
    root.importScripts('../common/constants.js', '../common/protocol.js', './native-client.js');
  }

  const namespace = root.MaerVault;
  const P = namespace && namespace.Protocol;
  const NativeVaultClient = namespace && namespace.NativeClient && namespace.NativeClient.NativeVaultClient;
  const extensionApi = root.browser || root.chrome;

  if (!P || !NativeVaultClient || !extensionApi || !extensionApi.runtime) {
    throw new Error('MAER vault background cannot start');
  }

  const nativeClient = new NativeVaultClient(extensionApi.runtime);
  const allowedActions = new Set([
    'vault.status',
    'vault.lookup',
    'vault.reveal',
    'vault.save',
    'vault.generate',
    'vault.lock'
  ]);

  function publicFailure() {
    return Object.freeze({
      ok: false,
      error: Object.freeze({
        code: 'VAULT_LOCKED',
        message: 'Coffre MAER indisponible ou verrouillé.'
      })
    });
  }

  function queryActiveTab() {
    if (root.browser && root.browser.tabs) {
      return root.browser.tabs.query({ active: true, currentWindow: true }).then((tabs) => tabs && tabs[0]);
    }
    return new Promise((resolve, reject) => {
      try {
        extensionApi.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          const runtimeError = extensionApi.runtime.lastError;
          if (runtimeError) {
            reject(new Error('active tab unavailable'));
            return;
          }
          resolve(tabs && tabs[0]);
        });
      } catch (_error) {
        reject(new Error('active tab unavailable'));
      }
    });
  }

  async function exactSenderOrigin(sender) {
    if (!sender || sender.id !== extensionApi.runtime.id) {
      throw new Error('sender rejected');
    }
    if (sender.tab && sender.tab.url && sender.url) {
      const frameOrigin = P.originFromUrl(sender.url);
      const tabOrigin = P.originFromUrl(sender.tab.url);
      if (frameOrigin !== tabOrigin) {
        throw new Error('cross-origin frame rejected');
      }
      return frameOrigin;
    }
    const tab = await queryActiveTab();
    if (!tab || !tab.url) {
      throw new Error('active origin unavailable');
    }
    return P.originFromUrl(tab.url);
  }

  function normalizeAction(message) {
    if (!message || typeof message !== 'object' || Array.isArray(message)) {
      throw new Error('message rejected');
    }
    const keys = Object.keys(message);
    if (keys.some((key) => key !== 'channel' && key !== 'action' && key !== 'payload')) {
      throw new Error('message rejected');
    }
    if (message.channel !== 'maer-password-vault' || !allowedActions.has(message.action)) {
      throw new Error('message rejected');
    }
    const payload = message.payload === undefined ? {} : message.payload;
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      throw new Error('message rejected');
    }
    return { action: message.action, payload };
  }

  async function handleExtensionMessage(message, sender) {
    try {
      const action = normalizeAction(message);
      const origin = await exactSenderOrigin(sender);
      const payload = await nativeClient.request(action.action, origin, action.payload);
      return { ok: true, payload };
    } catch (_error) {
      return publicFailure();
    }
  }

  extensionApi.runtime.onMessage.addListener((message, sender, sendResponse) => {
    handleExtensionMessage(message, sender).then((response) => {
      sendResponse(response);
      P.scrubSensitive(response);
    }, () => {
      sendResponse(publicFailure());
    });
    return true;
  });
})(globalThis);
