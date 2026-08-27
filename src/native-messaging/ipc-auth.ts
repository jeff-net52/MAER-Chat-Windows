import {
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto'
import {
  NATIVE_VAULT_HANDSHAKE_TIMEOUT_MS,
} from './constants'
import { FramedJsonChannel } from './framed-json-channel'

export const NATIVE_VAULT_IPC_PROTOCOL = 'maer.password-vault.ipc' as const
export const NATIVE_VAULT_IPC_VERSION = 1 as const
const NONCE_BYTES = 32
const ENCODED_BYTES_PATTERN = /^[A-Za-z0-9_-]{43}$/u

export interface NativeVaultClientHello {
  protocol: typeof NATIVE_VAULT_IPC_PROTOCOL
  version: typeof NATIVE_VAULT_IPC_VERSION
  type: 'client-hello'
  clientNonce: string
}

export interface NativeVaultServerHello {
  protocol: typeof NATIVE_VAULT_IPC_PROTOCOL
  version: typeof NATIVE_VAULT_IPC_VERSION
  type: 'server-hello'
  clientNonce: string
  serverNonce: string
  proof: string
}

export interface NativeVaultClientProof {
  protocol: typeof NATIVE_VAULT_IPC_PROTOCOL
  version: typeof NATIVE_VAULT_IPC_VERSION
  type: 'client-proof'
  clientNonce: string
  serverNonce: string
  proof: string
}

export interface NativeVaultReady {
  protocol: typeof NATIVE_VAULT_IPC_PROTOCOL
  version: typeof NATIVE_VAULT_IPC_VERSION
  type: 'ready'
  clientNonce: string
  serverNonce: string
  proof: string
}

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('Invalid native vault IPC handshake')
  }
  const prototype = Object.getPrototypeOf(value)
  if (prototype !== Object.prototype && prototype !== null) {
    throw new Error('Invalid native vault IPC handshake')
  }
  return value as Record<string, unknown>
}

function exact(value: Record<string, unknown>, keys: readonly string[]): void {
  const allowed = new Set(keys)
  if (
    Object.keys(value).length !== keys.length ||
    Object.keys(value).some((key) => !allowed.has(key)) ||
    keys.some((key) => !Object.hasOwn(value, key))
  ) {
    throw new Error('Invalid native vault IPC handshake')
  }
}

function encodedBytes(value: unknown): string {
  if (typeof value !== 'string' || !ENCODED_BYTES_PATTERN.test(value)) {
    throw new Error('Invalid native vault IPC handshake')
  }
  return value
}

function header(
  value: Record<string, unknown>,
  type: NativeVaultClientHello['type'] | NativeVaultServerHello['type'] |
    NativeVaultClientProof['type'] | NativeVaultReady['type'],
): void {
  if (
    value.protocol !== NATIVE_VAULT_IPC_PROTOCOL ||
    value.version !== NATIVE_VAULT_IPC_VERSION ||
    value.type !== type
  ) {
    throw new Error('Invalid native vault IPC handshake')
  }
}

function nonce(generate: (length: number) => Uint8Array): string {
  const value = generate(NONCE_BYTES)
  try {
    if (value.byteLength !== NONCE_BYTES) {
      throw new Error('Invalid native vault IPC randomness')
    }
    return Buffer.from(value.buffer, value.byteOffset, value.byteLength).toString('base64url')
  } finally {
    value.fill(0)
  }
}

function proof(
  secret: Uint8Array,
  role: 'server' | 'client' | 'ready',
  clientNonce: string,
  serverNonce: string,
): string {
  if (secret.byteLength !== 32) throw new Error('Invalid native vault IPC credential')
  return createHmac('sha256', secret)
    .update(`${NATIVE_VAULT_IPC_PROTOCOL}\0${role}\0${clientNonce}\0${serverNonce}`, 'utf8')
    .digest('base64url')
}

function verifyProof(actual: string, expected: string): void {
  const actualBytes = Buffer.from(encodedBytes(actual), 'base64url')
  const expectedBytes = Buffer.from(encodedBytes(expected), 'base64url')
  try {
    if (
      actualBytes.byteLength !== expectedBytes.byteLength ||
      !timingSafeEqual(actualBytes, expectedBytes)
    ) {
      throw new Error('Invalid native vault IPC proof')
    }
  } finally {
    actualBytes.fill(0)
    expectedBytes.fill(0)
  }
}

export function createClientHello(
  generate: (length: number) => Uint8Array = randomBytes,
): NativeVaultClientHello {
  return Object.freeze({
    protocol: NATIVE_VAULT_IPC_PROTOCOL,
    version: NATIVE_VAULT_IPC_VERSION,
    type: 'client-hello',
    clientNonce: nonce(generate),
  })
}

export function parseClientHello(value: unknown): NativeVaultClientHello {
  const input = record(value)
  exact(input, ['protocol', 'version', 'type', 'clientNonce'])
  header(input, 'client-hello')
  return Object.freeze({
    protocol: NATIVE_VAULT_IPC_PROTOCOL,
    version: NATIVE_VAULT_IPC_VERSION,
    type: 'client-hello',
    clientNonce: encodedBytes(input.clientNonce),
  })
}

export function createServerHello(
  secret: Uint8Array,
  hello: NativeVaultClientHello,
  generate: (length: number) => Uint8Array = randomBytes,
): NativeVaultServerHello {
  const serverNonce = nonce(generate)
  return Object.freeze({
    protocol: NATIVE_VAULT_IPC_PROTOCOL,
    version: NATIVE_VAULT_IPC_VERSION,
    type: 'server-hello',
    clientNonce: hello.clientNonce,
    serverNonce,
    proof: proof(secret, 'server', hello.clientNonce, serverNonce),
  })
}

export function parseServerHello(value: unknown): NativeVaultServerHello {
  const input = record(value)
  exact(input, [
    'protocol',
    'version',
    'type',
    'clientNonce',
    'serverNonce',
    'proof',
  ])
  header(input, 'server-hello')
  return Object.freeze({
    protocol: NATIVE_VAULT_IPC_PROTOCOL,
    version: NATIVE_VAULT_IPC_VERSION,
    type: 'server-hello',
    clientNonce: encodedBytes(input.clientNonce),
    serverNonce: encodedBytes(input.serverNonce),
    proof: encodedBytes(input.proof),
  })
}

export function createClientProof(
  secret: Uint8Array,
  clientHello: NativeVaultClientHello,
  serverHello: NativeVaultServerHello,
): NativeVaultClientProof {
  if (serverHello.clientNonce !== clientHello.clientNonce) {
    throw new Error('Invalid native vault IPC handshake')
  }
  verifyProof(
    serverHello.proof,
    proof(secret, 'server', clientHello.clientNonce, serverHello.serverNonce),
  )
  return Object.freeze({
    protocol: NATIVE_VAULT_IPC_PROTOCOL,
    version: NATIVE_VAULT_IPC_VERSION,
    type: 'client-proof',
    clientNonce: clientHello.clientNonce,
    serverNonce: serverHello.serverNonce,
    proof: proof(secret, 'client', clientHello.clientNonce, serverHello.serverNonce),
  })
}

export function parseClientProof(value: unknown): NativeVaultClientProof {
  const input = record(value)
  exact(input, [
    'protocol',
    'version',
    'type',
    'clientNonce',
    'serverNonce',
    'proof',
  ])
  header(input, 'client-proof')
  return Object.freeze({
    protocol: NATIVE_VAULT_IPC_PROTOCOL,
    version: NATIVE_VAULT_IPC_VERSION,
    type: 'client-proof',
    clientNonce: encodedBytes(input.clientNonce),
    serverNonce: encodedBytes(input.serverNonce),
    proof: encodedBytes(input.proof),
  })
}

export function createReady(
  secret: Uint8Array,
  serverHello: NativeVaultServerHello,
  clientProof: NativeVaultClientProof,
): NativeVaultReady {
  if (
    clientProof.clientNonce !== serverHello.clientNonce ||
    clientProof.serverNonce !== serverHello.serverNonce
  ) {
    throw new Error('Invalid native vault IPC handshake')
  }
  verifyProof(
    clientProof.proof,
    proof(secret, 'client', serverHello.clientNonce, serverHello.serverNonce),
  )
  return Object.freeze({
    protocol: NATIVE_VAULT_IPC_PROTOCOL,
    version: NATIVE_VAULT_IPC_VERSION,
    type: 'ready',
    clientNonce: serverHello.clientNonce,
    serverNonce: serverHello.serverNonce,
    proof: proof(secret, 'ready', serverHello.clientNonce, serverHello.serverNonce),
  })
}

export function verifyReady(
  secret: Uint8Array,
  clientHello: NativeVaultClientHello,
  serverHello: NativeVaultServerHello,
  value: unknown,
): void {
  const input = record(value)
  exact(input, [
    'protocol',
    'version',
    'type',
    'clientNonce',
    'serverNonce',
    'proof',
  ])
  header(input, 'ready')
  const clientNonce = encodedBytes(input.clientNonce)
  const serverNonce = encodedBytes(input.serverNonce)
  if (clientNonce !== clientHello.clientNonce || serverNonce !== serverHello.serverNonce) {
    throw new Error('Invalid native vault IPC handshake')
  }
  verifyProof(
    encodedBytes(input.proof),
    proof(secret, 'ready', clientNonce, serverNonce),
  )
}

export async function authenticateNativeVaultClient(
  channel: FramedJsonChannel,
  secret: Uint8Array,
  generate: (length: number) => Uint8Array = randomBytes,
): Promise<void> {
  const clientHello = createClientHello(generate)
  await channel.write(clientHello, NATIVE_VAULT_HANDSHAKE_TIMEOUT_MS)
  const serverHello = parseServerHello(
    await channel.read(NATIVE_VAULT_HANDSHAKE_TIMEOUT_MS),
  )
  const clientProof = createClientProof(secret, clientHello, serverHello)
  await channel.write(clientProof, NATIVE_VAULT_HANDSHAKE_TIMEOUT_MS)
  verifyReady(
    secret,
    clientHello,
    serverHello,
    await channel.read(NATIVE_VAULT_HANDSHAKE_TIMEOUT_MS),
  )
}

export async function authenticateNativeVaultServer(
  channel: FramedJsonChannel,
  secret: Uint8Array,
  generate: (length: number) => Uint8Array = randomBytes,
): Promise<void> {
  const clientHello = parseClientHello(
    await channel.read(NATIVE_VAULT_HANDSHAKE_TIMEOUT_MS),
  )
  const serverHello = createServerHello(secret, clientHello, generate)
  await channel.write(serverHello, NATIVE_VAULT_HANDSHAKE_TIMEOUT_MS)
  const clientProof = parseClientProof(
    await channel.read(NATIVE_VAULT_HANDSHAKE_TIMEOUT_MS),
  )
  await channel.write(
    createReady(secret, serverHello, clientProof),
    NATIVE_VAULT_HANDSHAKE_TIMEOUT_MS,
  )
}
