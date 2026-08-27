import {
  lstat,
  mkdtemp,
  open,
  readFile,
  realpath,
  rename,
  rm,
  unlink,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  AtomicVaultStorage,
  PasswordVaultStorageError,
  type VaultDatabaseCodec,
  type VaultFileSystem,
} from '../src/plugins/password-vault/main/atomic-vault-storage'
import { PASSWORD_VAULT_FILE_LIMIT } from '../src/plugins/password-vault/main/kdbx-vault'

interface FakeDatabase {
  revision: number
  keyByte: number
  disposed?: boolean
}

const REAL_FILE_SYSTEM: VaultFileSystem = {
  lstat,
  realpath,
  open,
  rename,
  unlink,
}

class AuthenticatedFakeCodec implements VaultDatabaseCodec<FakeDatabase> {
  async encode(value: FakeDatabase): Promise<ArrayBuffer> {
    return new TextEncoder().encode(
      JSON.stringify({ magic: 'MAER-KDBX-TEST', revision: value.revision, keyByte: value.keyByte }),
    ).buffer
  }

  async decode(data: ArrayBuffer, secret: Uint8Array): Promise<FakeDatabase> {
    let value: unknown
    try {
      value = JSON.parse(new TextDecoder().decode(data))
    } catch {
      throw new Error('invalid authenticated payload')
    }
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      throw new Error('invalid authenticated payload')
    }
    const record = value as Record<string, unknown>
    if (
      Object.keys(record).length !== 3 ||
      record.magic !== 'MAER-KDBX-TEST' ||
      !Number.isSafeInteger(record.revision) ||
      !Number.isSafeInteger(record.keyByte) ||
      record.keyByte !== secret[0]
    ) {
      throw new Error('invalid authenticated payload')
    }
    return { revision: record.revision as number, keyByte: record.keyByte as number }
  }

  dispose(value: FakeDatabase): void {
    value.disposed = true
  }
}

function exactBuffer(value: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(value.byteLength)
  copy.set(value)
  return copy.buffer
}

describe('atomic Password Vault storage', () => {
  let directory: string
  let vaultPath: string
  let codec: AuthenticatedFakeCodec
  const secret = new Uint8Array(32).fill(0x42)

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'maer-vault-storage-'))
    vaultPath = join(directory, 'passwords.kdbx')
    codec = new AuthenticatedFakeCodec()
  })

  afterEach(async () => {
    const safePrefix = join(tmpdir(), 'maer-vault-storage-')
    if (directory.startsWith(safePrefix)) {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('commits through .new, keeps .bak and authenticates every committed file', async () => {
    const storage = new AtomicVaultStorage(vaultPath, codec)
    await storage.write({ revision: 1, keyByte: secret[0] ?? 0 }, secret)
    await storage.write({ revision: 2, keyByte: secret[0] ?? 0 }, secret)

    await expect(lstat(`${vaultPath}.new`)).rejects.toMatchObject({ code: 'ENOENT' })
    await expect(lstat(vaultPath)).resolves.toMatchObject({ size: expect.any(Number) })
    await expect(lstat(`${vaultPath}.bak`)).resolves.toMatchObject({ size: expect.any(Number) })
    await expect(storage.recover(secret)).resolves.toMatchObject({ revision: 2 })
    await expect(
      codec.decode(exactBuffer(await readFile(`${vaultPath}.bak`)), secret),
    ).resolves.toMatchObject({ revision: 1 })
  })

  it('rolls a valid .new file forward before the primary and preserves the old primary', async () => {
    const storage = new AtomicVaultStorage(vaultPath, codec)
    await storage.write({ revision: 1, keyByte: secret[0] ?? 0 }, secret)
    await writeFile(
      `${vaultPath}.new`,
      new Uint8Array(await codec.encode({ revision: 2, keyByte: secret[0] ?? 0 })),
      { flag: 'wx' },
    )

    await expect(storage.recover(secret)).resolves.toMatchObject({ revision: 2 })
    await expect(
      codec.decode(exactBuffer(await readFile(`${vaultPath}.bak`)), secret),
    ).resolves.toMatchObject({ revision: 1 })
  })

  it('restores the authenticated backup when the primary is altered', async () => {
    const storage = new AtomicVaultStorage(vaultPath, codec)
    await storage.write({ revision: 1, keyByte: secret[0] ?? 0 }, secret)
    await storage.write({ revision: 2, keyByte: secret[0] ?? 0 }, secret)
    await writeFile(vaultPath, 'tampered')

    await expect(storage.recover(secret)).resolves.toMatchObject({ revision: 1 })
    await expect(lstat(`${vaultPath}.bak`)).rejects.toMatchObject({ code: 'ENOENT' })
    await expect(
      codec.decode(exactBuffer(await readFile(vaultPath)), secret),
    ).resolves.toMatchObject({ revision: 1 })
  })

  it('removes an unauthenticated .new file only after authenticating the primary', async () => {
    const storage = new AtomicVaultStorage(vaultPath, codec)
    await storage.write({ revision: 1, keyByte: secret[0] ?? 0 }, secret)
    await writeFile(`${vaultPath}.new`, 'incomplete', { flag: 'wx' })

    await expect(storage.recover(secret)).resolves.toMatchObject({ revision: 1 })
    await expect(lstat(`${vaultPath}.new`)).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('leaves all candidates untouched when none authenticates', async () => {
    const storage = new AtomicVaultStorage(vaultPath, codec)
    await storage.write({ revision: 1, keyByte: secret[0] ?? 0 }, secret)
    const wrongSecret = new Uint8Array(32).fill(0x24)

    await expect(storage.recover(wrongSecret)).rejects.toMatchObject({
      kind: 'corrupt',
    })
    await expect(lstat(vaultPath)).resolves.toBeDefined()
  })

  it('recovers deterministically after a failed final rename', async () => {
    let failFinalRename = true
    const failingFileSystem: VaultFileSystem = {
      ...REAL_FILE_SYSTEM,
      async rename(source, destination) {
        if (failFinalRename && source === `${vaultPath}.new` && destination === vaultPath) {
          failFinalRename = false
          throw Object.assign(new Error('simulated crash'), { code: 'EIO' })
        }
        await rename(source, destination)
      },
    }
    const failingStorage = new AtomicVaultStorage(vaultPath, codec, failingFileSystem)

    await expect(
      failingStorage.write({ revision: 7, keyByte: secret[0] ?? 0 }, secret),
    ).rejects.toThrow(/simulated crash/i)
    const recoveredStorage = new AtomicVaultStorage(vaultPath, codec)
    await expect(recoveredStorage.recover(secret)).resolves.toMatchObject({ revision: 7 })
  })

  it('refuses symbolic-link or reparse candidates before reading them', async () => {
    await writeFile(vaultPath, 'placeholder')
    const unsafeFileSystem: VaultFileSystem = {
      ...REAL_FILE_SYSTEM,
      async lstat(path) {
        const stats = await lstat(path)
        if (path !== vaultPath) return stats
        return {
          ...stats,
          isFile: () => false,
          isSymbolicLink: () => true,
        } as typeof stats
      },
    }
    const storage = new AtomicVaultStorage(vaultPath, codec, unsafeFileSystem)

    await expect(storage.recover(secret)).rejects.toMatchObject({
      kind: 'unsafe-path',
    })
  })

  it('refuses files larger than 16 MiB before opening them', async () => {
    await writeFile(vaultPath, 'placeholder')
    const oversizedFileSystem: VaultFileSystem = {
      ...REAL_FILE_SYSTEM,
      async lstat(path) {
        const stats = await lstat(path)
        if (path !== vaultPath) return stats
        return new Proxy(stats, {
          get(target, property, receiver) {
            if (property === 'size') return PASSWORD_VAULT_FILE_LIMIT + 1
            const value = Reflect.get(target, property, receiver)
            return typeof value === 'function' ? value.bind(target) : value
          },
        })
      },
    }
    const storage = new AtomicVaultStorage(vaultPath, codec, oversizedFileSystem)

    await expect(storage.recover(secret)).rejects.toMatchObject({
      kind: 'unsafe-path',
    })
  })

  it('refuses a parent path whose canonical location reveals a reparse traversal', async () => {
    const unsafeFileSystem: VaultFileSystem = {
      ...REAL_FILE_SYSTEM,
      async realpath() {
        return join(directory, 'different-target')
      },
    }
    const storage = new AtomicVaultStorage(vaultPath, codec, unsafeFileSystem)

    await expect(storage.hasArtifacts()).rejects.toBeInstanceOf(PasswordVaultStorageError)
    await expect(storage.hasArtifacts()).rejects.toMatchObject({ kind: 'unsafe-path' })
  })
})
