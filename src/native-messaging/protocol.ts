import {
  NATIVE_VAULT_ERROR_CODES,
  NATIVE_VAULT_LIMITS,
  NATIVE_VAULT_PROTOCOL,
  NATIVE_VAULT_PROTOCOL_VERSION,
  NATIVE_VAULT_REQUEST_TYPES,
} from './constants'
import type { NativeVaultOperations } from './operations'

export type NativeVaultRequestType = (typeof NATIVE_VAULT_REQUEST_TYPES)[number]
export type NativeVaultErrorCode = (typeof NATIVE_VAULT_ERROR_CODES)[number]

export interface NativeVaultGeneratePolicy {
  length: number
  lowercase: boolean
  uppercase: boolean
  digits: boolean
  symbols: boolean
}

interface NativeVaultRequestBase<TType extends NativeVaultRequestType, TPayload> {
  protocol: typeof NATIVE_VAULT_PROTOCOL
  version: typeof NATIVE_VAULT_PROTOCOL_VERSION
  id: string
  type: TType
  origin: string
  sentAt: number
  payload: TPayload
}

export type NativeVaultRequest =
  | NativeVaultRequestBase<'vault.status' | 'vault.lock', Record<never, never>>
  | NativeVaultRequestBase<
      'vault.lookup',
      { usernameHint: string; formSignature: string }
    >
  | NativeVaultRequestBase<'vault.reveal', { credentialId: string }>
  | NativeVaultRequestBase<
      'vault.save',
      { credentialId: string; username: string; password: string; label: string }
    >
  | NativeVaultRequestBase<'vault.generate', { policy: NativeVaultGeneratePolicy }>

export interface NativeVaultCredentialSummary {
  credentialId: string
  username: string
  label: string
  updatedAt: number
}

export type NativeVaultSuccessPayload =
  | { state: 'ready' | 'locked'; capabilities: readonly string[] }
  | { entries: readonly NativeVaultCredentialSummary[] }
  | { credentialId: string; username: string; password: string }
  | { password: string }
  | Record<never, never>

export interface NativeVaultSuccessResponse {
  protocol: typeof NATIVE_VAULT_PROTOCOL
  version: typeof NATIVE_VAULT_PROTOCOL_VERSION
  id: string
  type: 'response'
  origin: string
  ok: true
  payload: NativeVaultSuccessPayload
}

export interface NativeVaultFailureResponse {
  protocol: typeof NATIVE_VAULT_PROTOCOL
  version: typeof NATIVE_VAULT_PROTOCOL_VERSION
  id: string
  type: 'response'
  origin: string
  ok: false
  error: { code: NativeVaultErrorCode }
}

export type NativeVaultResponse = NativeVaultSuccessResponse | NativeVaultFailureResponse

export class NativeVaultProtocolError extends Error {
  constructor(
    readonly code: NativeVaultErrorCode = 'INVALID_REQUEST',
    readonly correlation?: Readonly<{ id: string; origin: string }>,
  ) {
    super('Native vault protocol violation')
    this.name = 'NativeVaultProtocolError'
  }
}

function plainRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new NativeVaultProtocolError()
  }
  const prototype = Object.getPrototypeOf(value)
  if (prototype !== Object.prototype && prototype !== null) {
    throw new NativeVaultProtocolError()
  }
  return value as Record<string, unknown>
}

function exactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
  correlation?: Readonly<{ id: string; origin: string }>,
): void {
  const expectedSet = new Set(expected)
  if (
    Object.keys(value).length !== expected.length ||
    Object.keys(value).some((key) => !expectedSet.has(key)) ||
    expected.some((key) => !Object.hasOwn(value, key))
  ) {
    throw new NativeVaultProtocolError('INVALID_REQUEST', correlation)
  }
}

function boundedString(
  value: unknown,
  maximum: number,
  allowEmpty = false,
  correlation?: Readonly<{ id: string; origin: string }>,
): string {
  if (
    typeof value !== 'string' ||
    value.length > maximum ||
    (!allowEmpty && value.length === 0) ||
    value.includes('\0')
  ) {
    throw new NativeVaultProtocolError('INVALID_REQUEST', correlation)
  }
  return value
}

function requestId(value: unknown): string {
  const parsed = boundedString(value, NATIVE_VAULT_LIMITS.requestId)
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{7,63}$/u.test(parsed)) {
    throw new NativeVaultProtocolError()
  }
  return parsed
}

export function canonicalNativeVaultOrigin(value: unknown): string {
  const parsed = boundedString(value, NATIVE_VAULT_LIMITS.origin)
  let url: URL
  try {
    url = new URL(parsed)
  } catch {
    throw new NativeVaultProtocolError()
  }
  if (
    (url.protocol !== 'https:' && url.protocol !== 'http:') ||
    url.origin === 'null' ||
    url.origin !== parsed ||
    url.username !== '' ||
    url.password !== '' ||
    url.pathname !== '/' ||
    url.search !== '' ||
    url.hash !== ''
  ) {
    throw new NativeVaultProtocolError()
  }
  return parsed
}

function safeCorrelation(input: Record<string, unknown>): Readonly<{
  id: string
  origin: string
}> {
  const id = requestId(input.id)
  const origin = canonicalNativeVaultOrigin(input.origin)
  return Object.seal({ id, origin })
}

function optionalBoundedString(
  value: unknown,
  maximum: number,
  correlation: Readonly<{ id: string; origin: string }>,
): string {
  return boundedString(value, maximum, true, correlation)
}

function parseGeneratePolicy(
  value: unknown,
  correlation: Readonly<{ id: string; origin: string }>,
): NativeVaultGeneratePolicy {
  const input = plainRecord(value)
  exactKeys(
    input,
    ['length', 'lowercase', 'uppercase', 'digits', 'symbols'],
    correlation,
  )
  if (
    !Number.isSafeInteger(input.length) ||
    (input.length as number) < 12 ||
    (input.length as number) > 128
  ) {
    throw new NativeVaultProtocolError('INVALID_REQUEST', correlation)
  }
  const flags = ['lowercase', 'uppercase', 'digits', 'symbols'] as const
  if (flags.some((flag) => typeof input[flag] !== 'boolean')) {
    throw new NativeVaultProtocolError('INVALID_REQUEST', correlation)
  }
  if (flags.every((flag) => input[flag] === false)) {
    throw new NativeVaultProtocolError('INVALID_REQUEST', correlation)
  }
  return Object.seal({
    length: input.length as number,
    lowercase: input.lowercase as boolean,
    uppercase: input.uppercase as boolean,
    digits: input.digits as boolean,
    symbols: input.symbols as boolean,
  })
}

function parsePayload(
  type: NativeVaultRequestType,
  value: unknown,
  correlation: Readonly<{ id: string; origin: string }>,
): NativeVaultRequest['payload'] {
  const input = plainRecord(value)
  switch (type) {
    case 'vault.status':
    case 'vault.lock':
      exactKeys(input, [], correlation)
      return Object.seal({})
    case 'vault.lookup':
      exactKeys(input, ['usernameHint', 'formSignature'], correlation)
      return Object.seal({
        usernameHint: optionalBoundedString(
          input.usernameHint,
          NATIVE_VAULT_LIMITS.username,
          correlation,
        ),
        formSignature: optionalBoundedString(
          input.formSignature,
          NATIVE_VAULT_LIMITS.formSignature,
          correlation,
        ),
      })
    case 'vault.reveal':
      exactKeys(input, ['credentialId'], correlation)
      return Object.seal({
        credentialId: boundedString(
          input.credentialId,
          NATIVE_VAULT_LIMITS.credentialId,
          false,
          correlation,
        ),
      })
    case 'vault.save':
      exactKeys(input, ['credentialId', 'username', 'password', 'label'], correlation)
      return Object.seal({
        credentialId: optionalBoundedString(
          input.credentialId,
          NATIVE_VAULT_LIMITS.credentialId,
          correlation,
        ),
        username: optionalBoundedString(
          input.username,
          NATIVE_VAULT_LIMITS.username,
          correlation,
        ),
        password: boundedString(
          input.password,
          NATIVE_VAULT_LIMITS.password,
          false,
          correlation,
        ),
        label: optionalBoundedString(
          input.label,
          NATIVE_VAULT_LIMITS.label,
          correlation,
        ),
      })
    case 'vault.generate':
      exactKeys(input, ['policy'], correlation)
      return Object.seal({ policy: parseGeneratePolicy(input.policy, correlation) })
  }
}

export function parseNativeVaultRequest(value: unknown): NativeVaultRequest {
  const input = plainRecord(value)
  const correlation = safeCorrelation(input)
  exactKeys(
    input,
    ['protocol', 'version', 'id', 'type', 'origin', 'sentAt', 'payload'],
    correlation,
  )
  if (
    input.protocol !== NATIVE_VAULT_PROTOCOL ||
    input.version !== NATIVE_VAULT_PROTOCOL_VERSION ||
    typeof input.type !== 'string' ||
    !NATIVE_VAULT_REQUEST_TYPES.includes(input.type as NativeVaultRequestType) ||
    !Number.isSafeInteger(input.sentAt) ||
    (input.sentAt as number) <= 0
  ) {
    throw new NativeVaultProtocolError('INVALID_REQUEST', correlation)
  }
  const type = input.type as NativeVaultRequestType
  return Object.seal({
    protocol: NATIVE_VAULT_PROTOCOL,
    version: NATIVE_VAULT_PROTOCOL_VERSION,
    id: correlation.id,
    type,
    origin: correlation.origin,
    sentAt: input.sentAt as number,
    payload: parsePayload(type, input.payload, correlation),
  }) as NativeVaultRequest
}

function checkedSummary(value: unknown): NativeVaultCredentialSummary {
  const input = plainRecord(value)
  exactKeys(input, ['credentialId', 'username', 'label', 'updatedAt'])
  if (!Number.isSafeInteger(input.updatedAt) || (input.updatedAt as number) < 0) {
    throw new NativeVaultProtocolError('INTERNAL')
  }
  return Object.seal({
    credentialId: boundedString(input.credentialId, NATIVE_VAULT_LIMITS.credentialId),
    username: boundedString(input.username, NATIVE_VAULT_LIMITS.username, true),
    label: boundedString(input.label, NATIVE_VAULT_LIMITS.label, true),
    updatedAt: input.updatedAt as number,
  })
}

function success(
  request: NativeVaultRequest,
  payload: NativeVaultSuccessPayload,
): NativeVaultSuccessResponse {
  return Object.seal({
    protocol: NATIVE_VAULT_PROTOCOL,
    version: NATIVE_VAULT_PROTOCOL_VERSION,
    id: request.id,
    type: 'response',
    origin: request.origin,
    ok: true,
    payload,
  })
}

export function nativeVaultFailure(
  correlation: Readonly<{ id: string; origin: string }>,
  code: NativeVaultErrorCode,
): NativeVaultFailureResponse {
  return Object.seal({
    protocol: NATIVE_VAULT_PROTOCOL,
    version: NATIVE_VAULT_PROTOCOL_VERSION,
    id: correlation.id,
    type: 'response',
    origin: correlation.origin,
    ok: false,
    error: Object.seal({ code }),
  })
}

function parseSuccessPayload(
  request: NativeVaultRequest,
  value: unknown,
): NativeVaultSuccessPayload {
  const input = plainRecord(value)
  switch (request.type) {
    case 'vault.status': {
      exactKeys(input, ['state', 'capabilities'], request)
      if (input.state !== 'ready' && input.state !== 'locked') {
        throw new NativeVaultProtocolError('INTERNAL')
      }
      if (
        !Array.isArray(input.capabilities) ||
        input.capabilities.length > NATIVE_VAULT_LIMITS.capabilities
      ) {
        throw new NativeVaultProtocolError('INTERNAL')
      }
      return Object.seal({
        state: input.state,
        capabilities: Object.seal(
          input.capabilities.map((entry) =>
            boundedString(entry, NATIVE_VAULT_LIMITS.capability),
          ),
        ),
      })
    }
    case 'vault.lookup': {
      exactKeys(input, ['entries'], request)
      if (
        !Array.isArray(input.entries) ||
        input.entries.length > NATIVE_VAULT_LIMITS.suggestions
      ) {
        throw new NativeVaultProtocolError('INTERNAL')
      }
      return Object.seal({ entries: Object.seal(input.entries.map(checkedSummary)) })
    }
    case 'vault.reveal': {
      exactKeys(input, ['credentialId', 'username', 'password'], request)
      const credentialId = boundedString(
        input.credentialId,
        NATIVE_VAULT_LIMITS.credentialId,
      )
      if (credentialId !== request.payload.credentialId) {
        throw new NativeVaultProtocolError('INTERNAL')
      }
      return Object.seal({
        credentialId,
        username: boundedString(input.username, NATIVE_VAULT_LIMITS.username, true),
        password: boundedString(input.password, NATIVE_VAULT_LIMITS.password),
      })
    }
    case 'vault.generate':
      exactKeys(input, ['password'], request)
      return Object.seal({
        password: boundedString(input.password, NATIVE_VAULT_LIMITS.password),
      })
    case 'vault.save':
    case 'vault.lock':
      exactKeys(input, [], request)
      return Object.seal({})
  }
}

export function parseNativeVaultResponse(
  value: unknown,
  request: NativeVaultRequest,
): NativeVaultResponse {
  const input = plainRecord(value)
  const baseKeys = ['protocol', 'version', 'id', 'type', 'origin', 'ok'] as const
  if (
    input.protocol !== NATIVE_VAULT_PROTOCOL ||
    input.version !== NATIVE_VAULT_PROTOCOL_VERSION ||
    input.id !== request.id ||
    input.type !== 'response' ||
    input.origin !== request.origin ||
    typeof input.ok !== 'boolean'
  ) {
    throw new NativeVaultProtocolError('INTERNAL')
  }
  if (input.ok) {
    exactKeys(input, [...baseKeys, 'payload'], request)
    return success(request, parseSuccessPayload(request, input.payload))
  }
  exactKeys(input, [...baseKeys, 'error'], request)
  const error = plainRecord(input.error)
  exactKeys(error, ['code'], request)
  if (!NATIVE_VAULT_ERROR_CODES.includes(error.code as NativeVaultErrorCode)) {
    throw new NativeVaultProtocolError('INTERNAL')
  }
  return nativeVaultFailure(request, error.code as NativeVaultErrorCode)
}

function publicOperationError(error: unknown): NativeVaultErrorCode {
  if (!error || typeof error !== 'object' || !('code' in error)) return 'INTERNAL'
  const code = (error as { code?: unknown }).code
  switch (code) {
    case 'LOCKED':
    case 'NOT_FOUND':
    case 'DENIED':
    case 'BUSY':
      return code
    case 'locked':
    case 'stale-epoch':
    case 'uninitialized':
    case 'recovery-required':
      return 'LOCKED'
    case 'not-found':
      return 'NOT_FOUND'
    default:
      return 'INTERNAL'
  }
}

export async function dispatchNativeVaultRequest(
  operations: NativeVaultOperations,
  request: NativeVaultRequest,
): Promise<NativeVaultResponse> {
  try {
    switch (request.type) {
      case 'vault.status': {
        const status = await operations.status()
        if (status.state !== 'ready' && status.state !== 'locked') {
          throw new NativeVaultProtocolError('INTERNAL')
        }
        return success(
          request,
          Object.seal({
            state: status.state,
            capabilities: Object.seal([
              'lookup',
              'reveal',
              'save',
              'generate',
              'lock',
            ]),
          }),
        )
      }
      case 'vault.lookup': {
        const result = await operations.lookup({
          origin: request.origin,
          usernameHint: request.payload.usernameHint,
          formSignature: request.payload.formSignature,
        })
        if (!Array.isArray(result) || result.length > NATIVE_VAULT_LIMITS.suggestions) {
          throw new NativeVaultProtocolError('INTERNAL')
        }
        return success(
          request,
          Object.seal({ entries: Object.seal(result.map(checkedSummary)) }),
        )
      }
      case 'vault.reveal': {
        const revealed = await operations.reveal({
          origin: request.origin,
          credentialId: request.payload.credentialId,
        })
        const credentialId = boundedString(
          revealed.credentialId,
          NATIVE_VAULT_LIMITS.credentialId,
        )
        if (credentialId !== request.payload.credentialId) {
          throw new NativeVaultProtocolError('INTERNAL')
        }
        return success(
          request,
          Object.seal({
            credentialId,
            username: boundedString(
              revealed.username,
              NATIVE_VAULT_LIMITS.username,
              true,
            ),
            password: boundedString(
              revealed.password,
              NATIVE_VAULT_LIMITS.password,
            ),
          }),
        )
      }
      case 'vault.save':
        await operations.save({ origin: request.origin, ...request.payload })
        return success(request, Object.seal({}))
      case 'vault.generate': {
        const password = await operations.generate(request.payload.policy)
        return success(
          request,
          Object.seal({
            password: boundedString(password, NATIVE_VAULT_LIMITS.password),
          }),
        )
      }
      case 'vault.lock':
        await operations.lock()
        return success(request, Object.seal({}))
    }
  } catch (error) {
    return nativeVaultFailure(request, publicOperationError(error))
  }
}

export function scrubNativeVaultSecrets(value: unknown): void {
  if (typeof value !== 'object' || value === null) return
  if (Array.isArray(value)) {
    for (const item of value) scrubNativeVaultSecrets(item)
    return
  }
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if ((key === 'password' || key === 'secret') && typeof entry === 'string') {
      ;(value as Record<string, unknown>)[key] = ''
    } else {
      scrubNativeVaultSecrets(entry)
    }
  }
}
