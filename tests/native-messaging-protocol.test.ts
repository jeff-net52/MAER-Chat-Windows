import { describe, expect, it, vi } from 'vitest'
import type { NativeVaultOperations } from '../src/native-messaging/operations'
import {
  dispatchNativeVaultRequest,
  NativeVaultProtocolError,
  parseNativeVaultRequest,
  parseNativeVaultResponse,
  type NativeVaultRequest,
} from '../src/native-messaging/protocol'

function request(
  type: NativeVaultRequest['type'] = 'vault.status',
  payload: unknown = {},
): Record<string, unknown> {
  return {
    protocol: 'maer.password-vault',
    version: 1,
    id: 'request-0001',
    type,
    origin: 'https://example.test',
    sentAt: 1_787_838_000_000,
    payload,
  }
}

function operations(overrides: Partial<NativeVaultOperations> = {}): NativeVaultOperations {
  return {
    status: vi.fn(async () => ({ state: 'ready' as const })),
    lookup: vi.fn(async () => []),
    reveal: vi.fn(async (input) => ({
      credentialId: input.credentialId,
      username: 'alice',
      password: 'secret',
    })),
    save: vi.fn(async () => undefined),
    generate: vi.fn(async () => 'generated-secret'),
    lock: vi.fn(async () => undefined),
    ...overrides,
  }
}

describe('MAER Password Vault Native Messaging protocol', () => {
  it('accepts the closed canonical status envelope', () => {
    expect(parseNativeVaultRequest(request())).toMatchObject({
      id: 'request-0001',
      type: 'vault.status',
      origin: 'https://example.test',
      payload: {},
    })
  })

  it.each([
    { ...request(), unknown: true },
    { ...request(), origin: 'https://example.test/' },
    { ...request(), origin: 'HTTPS://example.test' },
    { ...request(), sentAt: 0 },
    request('vault.lookup', { usernameHint: '', formSignature: '', extra: true }),
    request('vault.reveal', { credentialId: 'bad\0id' }),
    request('vault.generate', {
      policy: {
        length: 20,
        lowercase: false,
        uppercase: false,
        digits: false,
        symbols: false,
      },
    }),
  ])('rejects malformed or open schemas', (value) => {
    expect(() => parseNativeVaultRequest(value)).toThrow(NativeVaultProtocolError)
  })

  it('retains a safe correlation only after id and exact origin validate', () => {
    try {
      parseNativeVaultRequest({ ...request(), version: 2 })
      throw new Error('expected protocol rejection')
    } catch (error) {
      expect(error).toBeInstanceOf(NativeVaultProtocolError)
      expect((error as NativeVaultProtocolError).correlation).toEqual({
        id: 'request-0001',
        origin: 'https://example.test',
      })
    }
    try {
      parseNativeVaultRequest({ ...request(), origin: 'file:///secret' })
      throw new Error('expected protocol rejection')
    } catch (error) {
      expect((error as NativeVaultProtocolError).correlation).toBeUndefined()
    }
  })

  it('passes exact origin metadata to lookup and never returns a password', async () => {
    const lookup = vi.fn(async () => [
      {
        credentialId: 'opaque-local-id',
        username: 'alice',
        label: 'Example',
        updatedAt: 1_787_838_000_000,
      },
    ])
    const parsed = parseNativeVaultRequest(
      request('vault.lookup', {
        usernameHint: 'alice',
        formSignature: 'post:text/username,password/current-password',
      }),
    )
    const response = await dispatchNativeVaultRequest(operations({ lookup }), parsed)
    expect(lookup).toHaveBeenCalledWith({
      origin: 'https://example.test',
      usernameHint: 'alice',
      formSignature: 'post:text/username,password/current-password',
    })
    expect(response).toMatchObject({ ok: true, payload: { entries: expect.any(Array) } })
    expect((response as { payload: Record<string, unknown> }).payload).not.toHaveProperty(
      'password',
    )
    expect(parseNativeVaultResponse(response, parsed)).toEqual(response)
  })

  it('binds reveal correlation and maps cross-origin denial without details', async () => {
    const parsed = parseNativeVaultRequest(
      request('vault.reveal', { credentialId: 'opaque-local-id' }),
    )
    const mismatch = await dispatchNativeVaultRequest(
      operations({
        reveal: vi.fn(async () => ({
          credentialId: 'different-id',
          username: 'alice',
          password: 'secret',
        })),
      }),
      parsed,
    )
    expect(mismatch).toMatchObject({ ok: false, error: { code: 'INTERNAL' } })
    expect(JSON.stringify(mismatch)).not.toContain('secret')

    const denial = Object.assign(new Error('must not cross origins'), { code: 'DENIED' })
    const denied = await dispatchNativeVaultRequest(
      operations({ reveal: vi.fn(async () => Promise.reject(denial)) }),
      parsed,
    )
    expect(denied).toEqual({
      protocol: 'maer.password-vault',
      version: 1,
      id: 'request-0001',
      type: 'response',
      origin: 'https://example.test',
      ok: false,
      error: { code: 'DENIED' },
    })
  })

  it('validates generated password policy and bounded response', async () => {
    const policy = {
      length: 24,
      lowercase: true,
      uppercase: false,
      digits: true,
      symbols: false,
    }
    const parsed = parseNativeVaultRequest(request('vault.generate', { policy }))
    const generate = vi.fn(async () => 'safe-generated-value')
    const response = await dispatchNativeVaultRequest(operations({ generate }), parsed)
    expect(generate).toHaveBeenCalledWith(policy)
    expect(response).toMatchObject({
      ok: true,
      payload: { password: 'safe-generated-value' },
    })
  })
})
