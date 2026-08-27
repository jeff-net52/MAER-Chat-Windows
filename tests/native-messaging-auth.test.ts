import { describe, expect, it } from 'vitest'
import {
  createClientHello,
  createClientProof,
  createReady,
  createServerHello,
  parseClientHello,
  parseClientProof,
  parseServerHello,
  verifyReady,
} from '../src/native-messaging/ipc-auth'
import {
  NativeVaultIpcKeyStore,
  WindowsNativeVaultIpcKeyBackend,
  type NativeVaultIpcKeyBackend,
} from '../src/native-messaging/ipc-key-store'

function deterministic(byte: number): (length: number) => Uint8Array {
  return (length) => new Uint8Array(length).fill(byte)
}

class MemoryBackend implements NativeVaultIpcKeyBackend {
  value: Uint8Array | undefined

  async load(): Promise<Uint8Array | undefined> {
    return this.value?.slice()
  }

  async save(value: Uint8Array): Promise<void> {
    this.value = value.slice()
  }

  async delete(): Promise<boolean> {
    const present = Boolean(this.value)
    this.value?.fill(0)
    this.value = undefined
    return present
  }
}

describe('authenticated native vault IPC', () => {
  it('normalizes a missing Windows Credential Manager entry to undefined', async () => {
    const backend = new WindowsNativeVaultIpcKeyBackend(() => ({
      getSecret: async () => null,
      setSecret: async () => undefined,
      deleteCredential: async () => false,
    }))
    await expect(backend.load()).resolves.toBeUndefined()
  })

  it('performs a nonce-bound mutual HMAC handshake', () => {
    const secret = new Uint8Array(32).fill(7)
    const clientHello = parseClientHello(createClientHello(deterministic(1)))
    const serverHello = parseServerHello(
      createServerHello(secret, clientHello, deterministic(2)),
    )
    const clientProof = parseClientProof(
      createClientProof(secret, clientHello, serverHello),
    )
    const ready = createReady(secret, serverHello, clientProof)
    expect(() => verifyReady(secret, clientHello, serverHello, ready)).not.toThrow()
    secret.fill(0)
  })

  it('rejects tampering, replayed nonces, unknown fields, and wrong keys', () => {
    const secret = new Uint8Array(32).fill(7)
    const wrong = new Uint8Array(32).fill(8)
    const hello = createClientHello(deterministic(1))
    const server = createServerHello(secret, hello, deterministic(2))
    expect(() => createClientProof(wrong, hello, server)).toThrow()
    expect(() =>
      createClientProof(secret, createClientHello(deterministic(3)), server),
    ).toThrow()
    expect(() => parseClientHello({ ...hello, extra: true })).toThrow()
    secret.fill(0)
    wrong.fill(0)
  })

  it('creates and verifies a 32-byte Credential Manager value server-side only', async () => {
    const backend = new MemoryBackend()
    const store = new NativeVaultIpcKeyStore(backend, deterministic(9))
    expect(await store.load()).toBeUndefined()
    await store.ensure()
    expect(backend.value).toHaveLength(32)
    const loaded = await store.load()
    expect(loaded).toEqual(new Uint8Array(32).fill(9))
    loaded?.fill(0)
    await store.ensure()
    expect(backend.value).toEqual(new Uint8Array(32).fill(9))
  })

  it('normalizes the number[] shape returned by the Windows keyring binding', async () => {
    const transferred = new Array<number>(32).fill(0x5c)
    const backend: NativeVaultIpcKeyBackend = {
      load: async () => transferred,
      save: async () => undefined,
      delete: async () => false,
    }
    const store = new NativeVaultIpcKeyStore(backend)
    const loaded = await store.load()
    expect(loaded).toEqual(new Uint8Array(32).fill(0x5c))
    expect(transferred).toEqual(new Array<number>(32).fill(0))
    loaded?.fill(0)
  })

  it('fails closed on malformed persisted credentials', async () => {
    const backend = new MemoryBackend()
    backend.value = new Uint8Array(31)
    const store = new NativeVaultIpcKeyStore(backend)
    await expect(store.load()).rejects.toThrow()
    await expect(store.ensure()).rejects.toThrow()
  })

  it('rejects sparse and out-of-range number[] credentials', async () => {
    for (const malformed of [
      new Array<number>(32),
      [...new Array<number>(31).fill(1), 256],
    ]) {
      const backend: NativeVaultIpcKeyBackend = {
        load: async () => malformed,
        save: async () => undefined,
        delete: async () => false,
      }
      await expect(new NativeVaultIpcKeyStore(backend).load()).rejects.toThrow()
    }
  })
})
