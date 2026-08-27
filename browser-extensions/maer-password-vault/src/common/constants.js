(function initializeConstants(root) {
  'use strict';

  const namespace = root.MaerVault = root.MaerVault || {};

  namespace.Constants = Object.freeze({
    PROTOCOL: 'maer.password-vault',
    VERSION: 1,
    HOST_NAME: 'fr.maer.password_vault',
    REQUEST_TIMEOUT_MS: 5000,
    RECONNECT_BASE_MS: 400,
    RECONNECT_MAX_MS: 8000,
    MAX_NATIVE_MESSAGE_BYTES: 64 * 1024,
    MAX_ORIGIN_LENGTH: 512,
    MAX_ID_LENGTH: 64,
    MAX_TYPE_LENGTH: 64,
    MAX_USERNAME_LENGTH: 320,
    MAX_PASSWORD_LENGTH: 4096,
    MAX_LABEL_LENGTH: 256,
    MAX_CREDENTIAL_ID_LENGTH: 128,
    MAX_FORM_SIGNATURE_LENGTH: 256,
    MAX_ENTRIES: 50,
    ALLOWED_REQUEST_TYPES: Object.freeze([
      'vault.status',
      'vault.lookup',
      'vault.reveal',
      'vault.save',
      'vault.generate',
      'vault.lock'
    ])
  });
})(globalThis);
