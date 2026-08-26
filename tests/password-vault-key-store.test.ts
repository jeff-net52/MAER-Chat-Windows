import { describe, expect, it, vi } from 'vitest'
import {
  PASSWORD_VAULT_KEYRING_ACCOUNT,
  PASSWORD_VAULT_KEYRING_SERVICE,
  VaultKeyStore,
  WindowsVaultKeyBackend,
  type VaultKeyBackend,
  type VaultKeyringEntry,
} from '../src/plugins/password-vault/main/vault-key-store'

class MemoryKeyBackend implements VaultKeyBackend {
  value: Uint8Array | undefined
  lastLoaded: Uint8Array | undefined
  lastSaved: Uint8Array | undefined
  failSave = false

  async load(): Promise<Uint8Array | undefined> {
    this.lastLoaded = this.value?.slice()
    return this.lastLoaded
  }

  async save(value: Uint8Array): Promise<void> {
    this.lastSaved = value
    if (this.failSave) throw new Error('keyring unavailable')
    this.value = value.slice()
  }

  async delete(): Promise<boolean> {
    const existed = this.value !== undefined
    this.value = undefined
    return existed
  }
}

describe('Password Vault Windows key store', () => {
  it('uses the dedicated service and account with binary keyring methods', async () => {
    const getSecret = vi.fn(async () => new Uint8Array(32).fill(0x11))
    const setSecret = vi.fn(async () => undefined)
    const deleteCredential = vi.fn(async () => true)
    const entry: VaultKeyringEntry = { getSecret, setSecret, deleteCredential }
    const createEntry = vi.fn(() => entry)
    const backend = new WindowsVaultKeyBackend(createEntry)

    await expect(backend.load()).resolves.toEqual(new Uint8Array(32).fill(0x11))
    await backend.save(new Uint8Array(32).fill(0x22))
    await expect(backend.delete()).resolves.toBe(true)

    expect(createEntry).toHaveBeenCalledWith(
      PASSWORD_VAULT_KEYRING_SERVICE,
      PASSWORD_VAULT_KEYRING_ACCOUNT,
    )
    expect(PASSWORD_VAULT_KEYRING_SERVICE).toBe('MAER Chat Password Vault')
    expect(PASSWORD_VAULT_KEYRING_ACCOUNT).toBe('local-vault-v1')
    expect(setSecret).toHaveBeenCalledWith(new Uint8Array(32).fill(0x22))
  })

  it('creates, stores and verifies exactly 32 random binary bytes', async () => {
    const backend = new MemoryKeyBackend()
    const random = new Uint8Array(32).fill(0x5a)
    const store = new VaultKeyStore(backend, () => random)

    const key = await store.create()

    expect(key).toEqual(new Uint8Array(32).fill(0x5a))
    expect(backend.value).toEqual(key)
    expect(random).toEqual(new Uint8Array(32))
    expect(backend.lastSaved).toEqual(new Uint8Array(32))
    expect(backend.lastLoaded).toEqual(new Uint8Array(32))
  })

  it('fails closed for malformed stored data and zeroes the transferred value', async () => {
    const backend = new MemoryKeyBackend()
    backend.value = new Uint8Array(31).fill(0x44)
    const store = new VaultKeyStore(backend)

    await expect(store.load()).rejects.toThrow(/32 octets binaires/i)
    expect(backend.lastLoaded).toEqual(new Uint8Array(31))
  })

  it('never overwrites an existing key', async () => {
    const backend = new MemoryKeyBackend()
    backend.value = new Uint8Array(32).fill(0x33)
    const generator = vi.fn(() => new Uint8Array(32).fill(0x77))
    const store = new VaultKeyStore(backend, generator)

    await expect(store.create()).rejects.toThrow(/existe déjà/i)
    expect(generator).not.toHaveBeenCalled()
    expect(backend.value).toEqual(new Uint8Array(32).fill(0x33))
    expect(backend.lastLoaded).toEqual(new Uint8Array(32))
  })

  it('zeroes transient keys when the operating-system backend fails', async () => {
    const backend = new MemoryKeyBackend()
    backend.failSave = true
    const random = new Uint8Array(32).fill(0x66)
    const store = new VaultKeyStore(backend, () => random)

    await expect(store.create()).rejects.toThrow(/keyring unavailable/i)
    expect(random).toEqual(new Uint8Array(32))
    expect(backend.lastSaved).toEqual(new Uint8Array(32))
  })
})
