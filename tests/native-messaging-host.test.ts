import { PassThrough } from 'node:stream'
import { describe, expect, it, vi } from 'vitest'
import { encodeNativeMessage, NativeMessageFrameDecoder, parseNativeMessageJson } from '../src/native-messaging/framing'
import { runNativeMessagingHost } from '../src/native-messaging/native-host'
import type { NativeVaultOperations } from '../src/native-messaging/operations'
import type { NativeVaultRequestTransport } from '../src/native-messaging/pipe-client'
import {
  dispatchNativeVaultRequest,
  type NativeVaultRequest,
} from '../src/native-messaging/protocol'

function rawRequest(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    protocol: 'maer.password-vault',
    version: 1,
    id: 'status-0001',
    type: 'vault.status',
    origin: 'https://example.test',
    sentAt: Date.now(),
    payload: {},
    ...overrides,
  }
}

function transport(): NativeVaultRequestTransport {
  const operations: NativeVaultOperations = {
    status: vi.fn(async () => ({ state: 'ready' as const })),
    lookup: vi.fn(async () => []),
    reveal: vi.fn(async (input) => ({
      credentialId: input.credentialId,
      username: '',
      password: 'secret',
    })),
    save: vi.fn(async () => undefined),
    generate: vi.fn(async () => 'generated'),
    lock: vi.fn(async () => undefined),
  }
  return {
    request: (request: NativeVaultRequest) =>
      dispatchNativeVaultRequest(operations, request),
    close: vi.fn(),
  }
}

async function run(raw: unknown, connected = transport()): Promise<Buffer> {
  const input = new PassThrough()
  const output = new PassThrough()
  const chunks: Buffer[] = []
  output.on('data', (chunk: Buffer) => chunks.push(Buffer.from(chunk)))
  input.end(encodeNativeMessage(raw))
  await runNativeMessagingHost({
    input,
    output,
    connect: vi.fn(async () => connected),
  })
  return Buffer.concat(chunks)
}

function responses(output: Buffer): unknown[] {
  const decoder = new NativeMessageFrameDecoder()
  const messages = decoder.push(output)
  decoder.finish()
  return messages.map((message) => {
    try {
      return parseNativeMessageJson(message)
    } finally {
      message.fill(0)
    }
  })
}

describe('Native Messaging stdio host', () => {
  it('connects before processing and emits only correlated frames', async () => {
    const output = await run(rawRequest())
    expect(responses(output)).toEqual([
      {
        protocol: 'maer.password-vault',
        version: 1,
        id: 'status-0001',
        type: 'response',
        origin: 'https://example.test',
        ok: true,
        payload: {
          state: 'ready',
          capabilities: ['lookup', 'reveal', 'save', 'generate', 'lock'],
        },
      },
    ])
    output.fill(0)
  })

  it('returns a detail-free INVALID_REQUEST only with safe correlation', async () => {
    const output = await run(rawRequest({ version: 2 }))
    expect(responses(output)).toEqual([
      {
        protocol: 'maer.password-vault',
        version: 1,
        id: 'status-0001',
        type: 'response',
        origin: 'https://example.test',
        ok: false,
        error: { code: 'INVALID_REQUEST' },
      },
    ])
    expect(output.toString('utf8')).not.toContain('NativeVault')
    output.fill(0)
  })

  it('fails closed without reading or writing when the GUI pipe is unavailable', async () => {
    const input = new PassThrough()
    const output = new PassThrough()
    input.end(encodeNativeMessage(rawRequest()))
    await expect(
      runNativeMessagingHost({
        input,
        output,
        connect: vi.fn(async () => Promise.reject(new Error('unavailable'))),
      }),
    ).rejects.toThrow()
    expect(output.readableLength).toBe(0)
  })

  it('closes without output for an uncorrelatable origin', async () => {
    await expect(run(rawRequest({ origin: 'file:///private' }))).rejects.toThrow()
  })
})
