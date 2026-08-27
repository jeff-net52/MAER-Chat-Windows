import {
  NATIVE_VAULT_IPC_PROTOCOL,
  NATIVE_VAULT_IPC_VERSION,
} from './ipc-auth'
import {
  parseNativeVaultRequest,
  parseNativeVaultResponse,
  type NativeVaultRequest,
  type NativeVaultResponse,
} from './protocol'

export interface NativeVaultPipeRequest {
  protocol: typeof NATIVE_VAULT_IPC_PROTOCOL
  version: typeof NATIVE_VAULT_IPC_VERSION
  type: 'request'
  sequence: number
  request: NativeVaultRequest
}

export interface NativeVaultPipeResponse {
  protocol: typeof NATIVE_VAULT_IPC_PROTOCOL
  version: typeof NATIVE_VAULT_IPC_VERSION
  type: 'response'
  sequence: number
  response: NativeVaultResponse
}

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('Invalid native vault pipe message')
  }
  const prototype = Object.getPrototypeOf(value)
  if (prototype !== Object.prototype && prototype !== null) {
    throw new Error('Invalid native vault pipe message')
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
    throw new Error('Invalid native vault pipe message')
  }
}

function sequence(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 1) {
    throw new Error('Invalid native vault pipe sequence')
  }
  return value as number
}

function header(
  input: Record<string, unknown>,
  type: NativeVaultPipeRequest['type'] | NativeVaultPipeResponse['type'],
): void {
  if (
    input.protocol !== NATIVE_VAULT_IPC_PROTOCOL ||
    input.version !== NATIVE_VAULT_IPC_VERSION ||
    input.type !== type
  ) {
    throw new Error('Invalid native vault pipe message')
  }
}

export function createNativeVaultPipeRequest(
  request: NativeVaultRequest,
  requestSequence: number,
): NativeVaultPipeRequest {
  return Object.seal({
    protocol: NATIVE_VAULT_IPC_PROTOCOL,
    version: NATIVE_VAULT_IPC_VERSION,
    type: 'request',
    sequence: sequence(requestSequence),
    request,
  })
}

export function parseNativeVaultPipeRequest(value: unknown): NativeVaultPipeRequest {
  const input = record(value)
  exact(input, ['protocol', 'version', 'type', 'sequence', 'request'])
  header(input, 'request')
  return Object.seal({
    protocol: NATIVE_VAULT_IPC_PROTOCOL,
    version: NATIVE_VAULT_IPC_VERSION,
    type: 'request',
    sequence: sequence(input.sequence),
    request: parseNativeVaultRequest(input.request),
  })
}

export function createNativeVaultPipeResponse(
  response: NativeVaultResponse,
  responseSequence: number,
): NativeVaultPipeResponse {
  return Object.seal({
    protocol: NATIVE_VAULT_IPC_PROTOCOL,
    version: NATIVE_VAULT_IPC_VERSION,
    type: 'response',
    sequence: sequence(responseSequence),
    response,
  })
}

export function parseNativeVaultPipeResponse(
  value: unknown,
  expectedSequence: number,
  request: NativeVaultRequest,
): NativeVaultPipeResponse {
  const input = record(value)
  exact(input, ['protocol', 'version', 'type', 'sequence', 'response'])
  header(input, 'response')
  const parsedSequence = sequence(input.sequence)
  if (parsedSequence !== expectedSequence) {
    throw new Error('Invalid native vault pipe correlation')
  }
  return Object.seal({
    protocol: NATIVE_VAULT_IPC_PROTOCOL,
    version: NATIVE_VAULT_IPC_VERSION,
    type: 'response',
    sequence: parsedSequence,
    response: parseNativeVaultResponse(input.response, request),
  })
}
