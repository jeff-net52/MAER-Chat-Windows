import { randomUUID } from 'node:crypto'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { vi, describe, expect, it } from 'vitest'
import type { NativeVaultIpcKeyStore } from '../src/native-messaging/ipc-key-store'
import type { NativeVaultOperations } from '../src/native-messaging/operations'
import { connectAuthenticatedNativeVaultPipe } from '../src/native-messaging/pipe-client'
import { NativeVaultPipeServer } from '../src/native-messaging/pipe-server'
import { parseNativeVaultRequest } from '../src/native-messaging/protocol'

function pipePath(): string {
  return process.platform === 'win32'
    ? `\\\\.\\pipe\\maer-vault-test-${randomUUID()}`
    : join(tmpdir(), `maer-vault-test-${randomUUID()}.sock`)
}

function keyStore(secretByte: number): NativeVaultIpcKeyStore {
  return {
    ensure: vi.fn(async () => undefined),
    load: vi.fn(async () => new Uint8Array(32).fill(secretByte)),
  } as unknown as NativeVaultIpcKeyStore
}

function operations(
  overrides: Partial<NativeVaultOperations> = {},
): NativeVaultOperations {
  return {
    status: vi.fn(async () => ({ state: 'ready' as const })),
    lookup: vi.fn(async () => []),
    reveal: vi.fn(async (input) => ({
      credentialId: input.credentialId,
      username: 'alice',
      password: 'transient-secret',
    })),
    save: vi.fn(async (input) => ({ credentialId: input.credentialId || 'opaque-saved-id' })),
    generate: vi.fn(async () => 'generated-secret'),
    lock: vi.fn(async () => undefined),
    ...overrides,
  }
}

function request(type: 'vault.status' | 'vault.reveal' = 'vault.status') {
  return parseNativeVaultRequest({
    protocol: 'maer.password-vault',
    version: 1,
    id: type === 'vault.status' ? 'status-0001' : 'reveal-0001',
    type,
    origin: 'https://example.test',
    sentAt: Date.now(),
    payload: type === 'vault.status' ? {} : { credentialId: 'opaque-local-id' },
  })
}

describe('Native Messaging authenticated named pipe', () => {
  it('round-trips bounded messages after mutual authentication', async () => {
    const path = pipePath()
    const server = new NativeVaultPipeServer({
      operations: operations(),
      pipePath: path,
      keyStore: keyStore(7),
    })
    await server.start()
    try {
      const client = await connectAuthenticatedNativeVaultPipe({
        pipePath: path,
        keyStore: keyStore(7),
      })
      try {
        await expect(client.request(request())).resolves.toMatchObject({
          ok: true,
          payload: { state: 'ready' },
        })
        await expect(client.request(request('vault.reveal'))).resolves.toMatchObject({
          ok: true,
          origin: 'https://example.test',
          payload: {
            credentialId: 'opaque-local-id',
            username: 'alice',
            password: 'transient-secret',
          },
        })
      } finally {
        client.close()
      }
    } finally {
      await server.stop()
    }
  })

  it('rejects a client that cannot prove the per-user credential', async () => {
    const path = pipePath()
    const server = new NativeVaultPipeServer({
      operations: operations(),
      pipePath: path,
      keyStore: keyStore(7),
    })
    await server.start()
    try {
      await expect(
        connectAuthenticatedNativeVaultPipe({
          pipePath: path,
          keyStore: keyStore(8),
          connectTimeoutMs: 500,
        }),
      ).rejects.toThrow()
    } finally {
      await server.stop()
    }
  })

  it('passes origin to the main-only gateway for every reveal', async () => {
    const reveal = vi.fn(async (input: { origin: string; credentialId: string }) => ({
      credentialId: input.credentialId,
      username: 'alice',
      password: 'transient-secret',
    }))
    const path = pipePath()
    const server = new NativeVaultPipeServer({
      operations: operations({ reveal }),
      pipePath: path,
      keyStore: keyStore(7),
    })
    await server.start()
    try {
      const client = await connectAuthenticatedNativeVaultPipe({
        pipePath: path,
        keyStore: keyStore(7),
      })
      try {
        await client.request(request('vault.reveal'))
      } finally {
        client.close()
      }
      expect(reveal).toHaveBeenCalledWith({
        origin: 'https://example.test',
        credentialId: 'opaque-local-id',
      })
    } finally {
      await server.stop()
    }
  })
})
