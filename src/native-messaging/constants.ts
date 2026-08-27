export const NATIVE_VAULT_PROTOCOL = 'maer.password-vault' as const
export const NATIVE_VAULT_PROTOCOL_VERSION = 1 as const
export const NATIVE_VAULT_HOST_NAME = 'fr.maer.password_vault' as const

export const NATIVE_VAULT_MAX_FRAME_BYTES = 65_536
export const NATIVE_VAULT_REQUEST_TIMEOUT_MS = 4_250
export const NATIVE_VAULT_CONNECT_TIMEOUT_MS = 1_500
export const NATIVE_VAULT_HANDSHAKE_TIMEOUT_MS = 1_500
export const NATIVE_VAULT_SHIM_CONNECT_TIMEOUT_MS = 5_000

export const NATIVE_VAULT_CHROMIUM_EXTENSION_ID =
  'afjfndaggdofghcpakcemfkckhiaplkn' as const
export const NATIVE_VAULT_CHROMIUM_ORIGIN =
  `chrome-extension://${NATIVE_VAULT_CHROMIUM_EXTENSION_ID}/` as const
export const NATIVE_VAULT_FIREFOX_EXTENSION_ID = 'password-vault@maer.fr' as const

export const NATIVE_VAULT_LIMITS = Object.freeze({
  origin: 512,
  username: 320,
  password: 4_096,
  label: 256,
  formSignature: 256,
  credentialId: 128,
  suggestions: 50,
  requestId: 64,
  capability: 64,
  capabilities: 16,
})

export const NATIVE_VAULT_REQUEST_TYPES = [
  'vault.status',
  'vault.lookup',
  'vault.reveal',
  'vault.save',
  'vault.generate',
  'vault.lock',
] as const

export const NATIVE_VAULT_ERROR_CODES = [
  'LOCKED',
  'NOT_FOUND',
  'DENIED',
  'INVALID_REQUEST',
  'BUSY',
  'INTERNAL',
] as const
