import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Kdbx } from 'kdbxweb'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  LocalPasswordVaultOperations,
  PasswordVaultBackupError,
} from '../src/plugins/password-vault/main/plugin'
import {
  AtomicVaultStorage,
  PasswordVaultStorageError,
} from '../src/plugins/password-vault/main/atomic-vault-storage'
import {
  decryptVaultBackup,
  encryptVaultBackup,
} from '../src/plugins/password-vault/main/vault-backup'
import {
  KDBX_VAULT_LIFECYCLE,
  VaultSession,
  type VaultSessionKeyStore,
  type VaultSessionStorage,
} from '../src/plugins/password-vault/main/vault-session'

const temporaryDirectories: string[] = []
const PASSPHRASE = 'correct horse battery staple'

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  )
})

function powerMonitor() {
  return {
    on: vi.fn(),
    removeListener: vi.fn(),
  }
}

function memoryKeyStore(): VaultSessionKeyStore {
  let retained: Uint8Array | undefined
  return {
    async load() {
      return retained ? Uint8Array.from(retained) : undefined
    },
    async create() {
      retained = new Uint8Array(32).fill(0x4d)
      return Uint8Array.from(retained)
    },
    async delete() {
      retained?.fill(0)
      retained = undefined
      return true
    },
  }
}

class FailingStorage implements VaultSessionStorage<Kdbx> {
  failNextWrite = false

  constructor(private readonly storage: AtomicVaultStorage<Kdbx>) {}

  hasArtifacts() {
    return this.storage.hasArtifacts()
  }

  recover(secret: Uint8Array) {
    return this.storage.recover(secret)
  }

  reset() {
    return this.storage.reset()
  }

  async write(database: Kdbx, secret: Uint8Array) {
    if (this.failNextWrite) {
      this.failNextWrite = false
      throw new PasswordVaultStorageError('Échec injecté après la préparation de l’import.', 'io')
    }
    await this.storage.write(database, secret)
  }
}

describe('encrypted Password Vault backups', () => {
  it('round-trips authenticated entries and rejects a wrong phrase or tampering', async () => {
    const entries = [{
      title: 'Portail',
      username: 'alice',
      url: 'https://example.test/login',
      password: 'Secret-123!',
    }]
    const encrypted = await encryptVaultBackup(entries, PASSPHRASE)

    await expect(decryptVaultBackup(encrypted, PASSPHRASE)).resolves.toEqual([
      { ...entries[0], url: 'https://example.test/login' },
    ])
    await expect(decryptVaultBackup(encrypted, 'another long passphrase')).rejects.toThrow(
      /incorrecte|endommagée/i,
    )

    const tampered = Uint8Array.from(encrypted)
    const tamperedIndex = tampered.length - 12
    tampered[tamperedIndex] = (tampered[tamperedIndex] ?? 0) ^ 0x01
    await expect(decryptVaultBackup(tampered, PASSPHRASE)).rejects.toThrow()
    encrypted.fill(0)
    tampered.fill(0)
  })

  it('keeps the previous durable vault recoverable when replacement persistence fails', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'maer-vault-import-'))
    temporaryDirectories.push(directory)
    const path = join(directory, 'passwords.kdbx')
    const storage = new FailingStorage(new AtomicVaultStorage<Kdbx>(path))
    const monitor = powerMonitor()
    const session = new VaultSession<Kdbx>({
      keyStore: memoryKeyStore(),
      storage,
      lifecycle: KDBX_VAULT_LIFECYCLE,
      powerMonitor: monitor,
    })
    const backup = await encryptVaultBackup([{
      title: 'Nouveau compte',
      username: 'bob',
      url: 'https://new.example.test/',
      password: 'New-Secret-456!',
    }], PASSPHRASE)
    const operations = new LocalPasswordVaultOperations(
      path,
      monitor,
      { readText: () => '', writeText: vi.fn(), clear: vi.fn() },
      undefined,
      { save: vi.fn(async () => true), load: vi.fn(async () => Uint8Array.from(backup)) },
      { openUrl: vi.fn(async () => undefined) },
      session,
    )

    await operations.initialize()
    await operations.add({
      title: 'Compte existant',
      username: 'alice',
      url: 'https://old.example.test/',
      password: 'Old-Secret-123!',
    })
    storage.failNextWrite = true

    await expect(operations.importBackup(PASSPHRASE)).rejects.toBeInstanceOf(
      PasswordVaultStorageError,
    )
    await expect(operations.unlock()).resolves.toMatchObject({ state: 'unlocked', entryCount: 1 })
    await expect(operations.list()).resolves.toMatchObject([
      { title: 'Compte existant', username: 'alice', url: 'https://old.example.test/' },
    ])

    backup.fill(0)
    await operations.dispose()
  })

  it('classifies an invalid export phrase as validation, before any file IO', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'maer-vault-export-'))
    temporaryDirectories.push(directory)
    const path = join(directory, 'passwords.kdbx')
    const save = vi.fn(async () => true)
    const monitor = powerMonitor()
    const session = new VaultSession<Kdbx>({
      keyStore: memoryKeyStore(),
      storage: new AtomicVaultStorage<Kdbx>(path),
      lifecycle: KDBX_VAULT_LIFECYCLE,
      powerMonitor: monitor,
    })
    const operations = new LocalPasswordVaultOperations(
      path,
      monitor,
      { readText: () => '', writeText: vi.fn(), clear: vi.fn() },
      undefined,
      { save, load: vi.fn(async () => undefined) },
      undefined,
      session,
    )
    await operations.initialize()

    const error = await operations.exportBackup('trop court').catch((reason) => reason)
    expect(error).toBeInstanceOf(PasswordVaultBackupError)
    expect(error).toMatchObject({ kind: 'invalid' })
    expect(save).not.toHaveBeenCalled()

    await operations.dispose()
  })
})
