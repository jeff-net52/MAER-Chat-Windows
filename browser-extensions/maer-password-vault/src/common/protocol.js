(function initializeProtocol(root) {
  'use strict';

  const namespace = root.MaerVault = root.MaerVault || {};
  const C = namespace.Constants;

  if (!C) {
    throw new Error('MAER vault constants are required');
  }

  class ProtocolViolation extends Error {
    constructor(message) {
      super(message);
      this.name = 'ProtocolViolation';
      this.code = 'PROTOCOL_ERROR';
    }
  }

  function assertPlainObject(value, label) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new ProtocolViolation(`${label} must be an object`);
    }
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new ProtocolViolation(`${label} must be a plain object`);
    }
    return value;
  }

  function boundedString(value, label, maximum, options) {
    const settings = options || {};
    if (typeof value !== 'string') {
      throw new ProtocolViolation(`${label} must be a string`);
    }
    if (!settings.allowEmpty && value.length === 0) {
      throw new ProtocolViolation(`${label} must not be empty`);
    }
    if (value.length > maximum) {
      throw new ProtocolViolation(`${label} is too long`);
    }
    if (/\u0000/.test(value)) {
      throw new ProtocolViolation(`${label} contains a null character`);
    }
    return value;
  }

  function canonicalOrigin(value) {
    const raw = boundedString(value, 'origin', C.MAX_ORIGIN_LENGTH);
    let parsed;
    try {
      parsed = new URL(raw);
    } catch (_error) {
      throw new ProtocolViolation('origin is invalid');
    }
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      throw new ProtocolViolation('origin scheme is not allowed');
    }
    if (parsed.origin === 'null' || parsed.origin !== raw) {
      throw new ProtocolViolation('origin must be exact and canonical');
    }
    return parsed.origin;
  }

  function originFromUrl(value) {
    const raw = boundedString(value, 'url', 8192);
    let parsed;
    try {
      parsed = new URL(raw);
    } catch (_error) {
      throw new ProtocolViolation('url is invalid');
    }
    return canonicalOrigin(parsed.origin);
  }

  function validateRequestId(value) {
    const id = boundedString(value, 'id', C.MAX_ID_LENGTH);
    if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{7,63}$/.test(id)) {
      throw new ProtocolViolation('id has an invalid format');
    }
    return id;
  }

  function optionalString(value, label, maximum) {
    if (value === undefined || value === null || value === '') {
      return '';
    }
    return boundedString(value, label, maximum, { allowEmpty: true });
  }

  function assertOnlyKeys(value, allowed, label) {
    const keys = Object.keys(value);
    for (const key of keys) {
      if (!allowed.includes(key)) {
        throw new ProtocolViolation(`${label} contains an unknown field`);
      }
    }
  }

  function validateGeneratePolicy(value) {
    const policy = value === undefined ? {} : assertPlainObject(value, 'policy');
    assertOnlyKeys(policy, ['length', 'lowercase', 'uppercase', 'digits', 'symbols'], 'policy');
    const length = policy.length === undefined ? 20 : policy.length;
    if (!Number.isInteger(length) || length < 12 || length > 128) {
      throw new ProtocolViolation('policy.length is outside the allowed range');
    }
    const normalized = { length };
    for (const key of ['lowercase', 'uppercase', 'digits', 'symbols']) {
      const entry = policy[key] === undefined ? true : policy[key];
      if (typeof entry !== 'boolean') {
        throw new ProtocolViolation(`policy.${key} must be boolean`);
      }
      normalized[key] = entry;
    }
    if (!normalized.lowercase && !normalized.uppercase && !normalized.digits && !normalized.symbols) {
      throw new ProtocolViolation('policy must enable at least one alphabet');
    }
    return normalized;
  }

  function validateRequestPayload(type, payloadValue) {
    const payload = payloadValue === undefined ? {} : assertPlainObject(payloadValue, 'payload');

    if (type === 'vault.status' || type === 'vault.lock') {
      assertOnlyKeys(payload, [], 'payload');
      return {};
    }

    if (type === 'vault.lookup') {
      assertOnlyKeys(payload, ['usernameHint', 'formSignature'], 'payload');
      return {
        usernameHint: optionalString(payload.usernameHint, 'usernameHint', C.MAX_USERNAME_LENGTH),
        formSignature: optionalString(payload.formSignature, 'formSignature', C.MAX_FORM_SIGNATURE_LENGTH)
      };
    }

    if (type === 'vault.reveal') {
      assertOnlyKeys(payload, ['credentialId'], 'payload');
      return {
        credentialId: boundedString(payload.credentialId, 'credentialId', C.MAX_CREDENTIAL_ID_LENGTH)
      };
    }

    if (type === 'vault.save') {
      assertOnlyKeys(payload, ['credentialId', 'username', 'password', 'label'], 'payload');
      return {
        credentialId: optionalString(payload.credentialId, 'credentialId', C.MAX_CREDENTIAL_ID_LENGTH),
        username: optionalString(payload.username, 'username', C.MAX_USERNAME_LENGTH),
        password: boundedString(payload.password, 'password', C.MAX_PASSWORD_LENGTH),
        label: optionalString(payload.label, 'label', C.MAX_LABEL_LENGTH)
      };
    }

    if (type === 'vault.generate') {
      assertOnlyKeys(payload, ['policy'], 'payload');
      return { policy: validateGeneratePolicy(payload.policy) };
    }

    throw new ProtocolViolation('request type is not allowed');
  }

  function makeRequest(input) {
    const source = assertPlainObject(input, 'request input');
    const type = boundedString(source.type, 'type', C.MAX_TYPE_LENGTH);
    if (!C.ALLOWED_REQUEST_TYPES.includes(type)) {
      throw new ProtocolViolation('request type is not allowed');
    }
    const sentAt = source.sentAt === undefined ? Date.now() : source.sentAt;
    if (!Number.isSafeInteger(sentAt) || sentAt < 0) {
      throw new ProtocolViolation('sentAt is invalid');
    }
    return {
      protocol: C.PROTOCOL,
      version: C.VERSION,
      id: validateRequestId(source.id),
      type,
      origin: canonicalOrigin(source.origin),
      sentAt,
      payload: validateRequestPayload(type, source.payload)
    };
  }

  function validateCredentialSummaries(value) {
    if (!Array.isArray(value) || value.length > C.MAX_ENTRIES) {
      throw new ProtocolViolation('entries is invalid');
    }
    return value.map((item) => {
      const entry = assertPlainObject(item, 'entry');
      assertOnlyKeys(entry, ['credentialId', 'username', 'label', 'updatedAt'], 'entry');
      const updatedAt = entry.updatedAt === undefined ? 0 : entry.updatedAt;
      if (!Number.isSafeInteger(updatedAt) || updatedAt < 0) {
        throw new ProtocolViolation('entry.updatedAt is invalid');
      }
      return {
        credentialId: boundedString(entry.credentialId, 'entry.credentialId', C.MAX_CREDENTIAL_ID_LENGTH),
        username: optionalString(entry.username, 'entry.username', C.MAX_USERNAME_LENGTH),
        label: optionalString(entry.label, 'entry.label', C.MAX_LABEL_LENGTH),
        updatedAt
      };
    });
  }

  function validateSuccessPayload(requestType, value) {
    const payload = value === undefined ? {} : assertPlainObject(value, 'response payload');
    if (requestType === 'vault.status') {
      assertOnlyKeys(payload, ['state', 'capabilities'], 'response payload');
      if (payload.state !== 'locked' && payload.state !== 'ready') {
        throw new ProtocolViolation('response state is invalid');
      }
      const capabilities = payload.capabilities === undefined ? [] : payload.capabilities;
      if (!Array.isArray(capabilities) || capabilities.length > 16) {
        throw new ProtocolViolation('response capabilities is invalid');
      }
      return {
        state: payload.state,
        capabilities: capabilities.map((item) => boundedString(item, 'capability', 64))
      };
    }
    if (requestType === 'vault.lookup') {
      assertOnlyKeys(payload, ['entries'], 'response payload');
      return { entries: validateCredentialSummaries(payload.entries) };
    }
    if (requestType === 'vault.reveal') {
      assertOnlyKeys(payload, ['credentialId', 'username', 'password'], 'response payload');
      return {
        credentialId: boundedString(payload.credentialId, 'credentialId', C.MAX_CREDENTIAL_ID_LENGTH),
        username: optionalString(payload.username, 'username', C.MAX_USERNAME_LENGTH),
        password: boundedString(payload.password, 'password', C.MAX_PASSWORD_LENGTH)
      };
    }
    if (requestType === 'vault.generate') {
      assertOnlyKeys(payload, ['password'], 'response payload');
      return { password: boundedString(payload.password, 'password', C.MAX_PASSWORD_LENGTH) };
    }
    if (requestType === 'vault.save' || requestType === 'vault.lock') {
      assertOnlyKeys(payload, [], 'response payload');
      return {};
    }
    throw new ProtocolViolation('response type is not allowed');
  }

  function validateResponse(value, expected) {
    const response = assertPlainObject(value, 'response');
    assertOnlyKeys(response, ['protocol', 'version', 'id', 'type', 'origin', 'ok', 'payload', 'error'], 'response');
    if (response.protocol !== C.PROTOCOL || response.version !== C.VERSION || response.type !== 'response') {
      throw new ProtocolViolation('response envelope is invalid');
    }
    const id = validateRequestId(response.id);
    const origin = canonicalOrigin(response.origin);
    if (expected && (id !== expected.id || origin !== expected.origin)) {
      throw new ProtocolViolation('response correlation failed');
    }
    if (typeof response.ok !== 'boolean') {
      throw new ProtocolViolation('response ok flag is invalid');
    }
    if (!response.ok) {
      const error = assertPlainObject(response.error, 'response error');
      assertOnlyKeys(error, ['code'], 'response error');
      return {
        protocol: C.PROTOCOL,
        version: C.VERSION,
        id,
        type: 'response',
        origin,
        ok: false,
        error: { code: boundedString(error.code, 'error.code', 64) }
      };
    }
    if (!expected || !expected.type) {
      throw new ProtocolViolation('expected request type is required');
    }
    return {
      protocol: C.PROTOCOL,
      version: C.VERSION,
      id,
      type: 'response',
      origin,
      ok: true,
      payload: validateSuccessPayload(expected.type, response.payload)
    };
  }

  function serializedSize(value) {
    const serialized = JSON.stringify(value);
    if (typeof TextEncoder === 'function') {
      return new TextEncoder().encode(serialized).byteLength;
    }
    return unescape(encodeURIComponent(serialized)).length;
  }

  function assertMessageSize(value) {
    if (serializedSize(value) > C.MAX_NATIVE_MESSAGE_BYTES) {
      throw new ProtocolViolation('native message is too large');
    }
    return value;
  }

  function scrubSensitive(value) {
    if (!value || typeof value !== 'object') {
      return;
    }
    for (const key of Object.keys(value)) {
      if (key === 'password' || key === 'secret') {
        value[key] = '';
      } else {
        scrubSensitive(value[key]);
      }
    }
  }

  namespace.Protocol = Object.freeze({
    ProtocolViolation,
    assertMessageSize,
    canonicalOrigin,
    makeRequest,
    originFromUrl,
    scrubSensitive,
    serializedSize,
    validateResponse
  });
})(globalThis);
