import { constants as fileConstants, type Stats } from 'node:fs'
import {
  lstat,
  open,
  realpath,
  rename,
  unlink,
  type FileHandle,
} from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import type { Kdbx } from 'kdbxweb'
import {
  PASSWORD_VAULT_FILE_LIMIT,
  loadPasswordVaultDatabase,
  savePasswordVaultDatabase,
  wipePasswordVaultDatabase,
} from './kdbx-vault'

export interface VaultDatabaseCodec<T> {
  encode(value: T): Promise<ArrayBuffer>
  decode(data: ArrayBuffer, secret: Uint8Array): Promise<T>
  dispose?(value: T): void
}

export interface VaultFileSystem {
  lstat(path: string): Promise<Stats>
  realpath(path: string): Promise<string>
  open(path: string, flags: string | number, mode?: number): Promise<FileHandle>
  rename(source: string, destination: string): Promise<void>
  unlink(path: string): Promise<void>
}

const NODE_FILE_SYSTEM: VaultFileSystem = {
  lstat,
  realpath,
  open,
  rename,
  unlink,
}

export const KDBX_VAULT_CODEC: VaultDatabaseCodec<Kdbx> = {
  encode: savePasswordVaultDatabase,
  decode: loadPasswordVaultDatabase,
  dispose: wipePasswordVaultDatabase,
}

export class PasswordVaultStorageError extends Error {
  constructor(
    message: string,
    readonly kind: 'unsafe-path' | 'corrupt' | 'io',
    options?: ErrorOptions,
  ) {
    super(message, options)
    this.name = 'PasswordVaultStorageError'
  }
}

interface Candidate<T> {
  path: string
  value?: T
  error?: unknown
}

function errorCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null || !('code' in error)) return undefined
  return typeof error.code === 'string' ? error.code : undefined
}

function samePath(left: string, right: string): boolean {
  const normalize = (value: string): string => {
    const canonical = resolve(value).replace(/^\\\\\?\\/u, '')
    return process.platform === 'win32' ? canonical.toLocaleLowerCase('en-US') : canonical
  }
  return normalize(left) === normalize(right)
}

function sameFile(left: Stats, right: Stats): boolean {
  return left.dev === right.dev && left.ino === right.ino
}

function assertRegularVaultFile(path: string, stats: Stats): void {
  if (stats.isSymbolicLink() || !stats.isFile()) {
    throw new PasswordVaultStorageError(
      `Le chemin du coffre n’est pas un fichier régulier sûr : ${path}.`,
      'unsafe-path',
    )
  }
  if (stats.nlink > 1) {
    throw new PasswordVaultStorageError(
      `Le fichier du coffre possède plusieurs liens : ${path}.`,
      'unsafe-path',
    )
  }
  if (stats.size < 0 || stats.size > PASSWORD_VAULT_FILE_LIMIT) {
    throw new PasswordVaultStorageError(
      `La taille du fichier du coffre est refusée : ${path}.`,
      'unsafe-path',
    )
  }
}

function exactArrayBuffer(value: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(value.byteLength)
  copy.set(value)
  return copy.buffer
}

export class AtomicVaultStorage<T = Kdbx> {
  readonly primaryPath: string
  readonly newPath: string
  readonly backupPath: string
  readonly directoryPath: string

  constructor(
    vaultPath: string,
    private readonly codec: VaultDatabaseCodec<T> = KDBX_VAULT_CODEC as VaultDatabaseCodec<T>,
    private readonly fileSystem: VaultFileSystem = NODE_FILE_SYSTEM,
  ) {
    this.primaryPath = resolve(vaultPath)
    this.newPath = `${this.primaryPath}.new`
    this.backupPath = `${this.primaryPath}.bak`
    this.directoryPath = dirname(this.primaryPath)
  }

  async hasArtifacts(): Promise<boolean> {
    await this.assertSafeDirectory()
    const stats = await Promise.all(
      this.paths().map(async (path) => ({ path, stats: await this.optionalLstat(path) })),
    )
    for (const candidate of stats) {
      if (candidate.stats) assertRegularVaultFile(candidate.path, candidate.stats)
    }
    return stats.some((candidate) => candidate.stats !== undefined)
  }

  async reset(): Promise<void> {
    await this.assertSafeDirectory()
    const existing = await this.preflightCandidates()
    for (const path of this.paths()) {
      if (existing.has(path)) await this.removeChecked(path)
    }
  }

  async recover(secret: Uint8Array): Promise<T | undefined> {
    await this.assertSafeDirectory()
    const existing = await this.preflightCandidates()
    if (existing.size === 0) return undefined

    const pending = await this.tryDecodeCandidate(this.newPath, existing, secret)
    if (pending.value !== undefined) {
      this.codec.dispose?.(pending.value)
      await this.promoteNewFile(existing)
      return this.decodeRequired(this.primaryPath, secret)
    }

    const primary = await this.tryDecodeCandidate(this.primaryPath, existing, secret)
    if (primary.value !== undefined) {
      if (existing.has(this.newPath)) {
        await this.removeChecked(this.newPath)
        await this.syncDirectory()
      }
      return primary.value
    }

    const backup = await this.tryDecodeCandidate(this.backupPath, existing, secret)
    if (backup.value !== undefined) {
      this.codec.dispose?.(backup.value)
      if (existing.has(this.newPath)) await this.removeChecked(this.newPath)
      if (existing.has(this.primaryPath)) await this.removeChecked(this.primaryPath)
      await this.renameChecked(this.backupPath, this.primaryPath)
      await this.syncDirectory()
      return this.decodeRequired(this.primaryPath, secret)
    }

    throw new PasswordVaultStorageError(
      'Aucun fichier KDBX du coffre n’a pu être authentifié.',
      'corrupt',
      { cause: pending.error ?? primary.error ?? backup.error },
    )
  }

  async write(value: T, secret: Uint8Array): Promise<void> {
    await this.assertSafeDirectory()
    const existing = await this.preflightCandidates()
    if (existing.has(this.newPath)) {
      throw new PasswordVaultStorageError(
        'Une écriture précédente du coffre doit être récupérée avant toute mutation.',
        'io',
      )
    }
    if (!existing.has(this.primaryPath) && existing.has(this.backupPath)) {
      throw new PasswordVaultStorageError(
        'La sauvegarde du coffre doit être récupérée avant toute mutation.',
        'io',
      )
    }
    if (existing.has(this.primaryPath)) {
      const current = await this.decodeRequired(this.primaryPath, secret)
      this.codec.dispose?.(current)
    }

    const encoded = await this.codec.encode(value)
    if (!(encoded instanceof ArrayBuffer) || encoded.byteLength < 1 || encoded.byteLength > PASSWORD_VAULT_FILE_LIMIT) {
      throw new PasswordVaultStorageError(
        'La taille du nouveau coffre KDBX est invalide.',
        'io',
      )
    }

    await this.writeExclusiveAndSync(this.newPath, new Uint8Array(encoded))
    await this.syncDirectory()
    const staged = await this.decodeRequired(this.newPath, secret)
    this.codec.dispose?.(staged)

    if (existing.has(this.primaryPath)) {
      if (existing.has(this.backupPath)) await this.removeChecked(this.backupPath)
      await this.renameChecked(this.primaryPath, this.backupPath)
      await this.syncDirectory()
    }
    await this.renameChecked(this.newPath, this.primaryPath)
    await this.syncDirectory()

    const committed = await this.decodeRequired(this.primaryPath, secret)
    this.codec.dispose?.(committed)
  }

  private paths(): readonly string[] {
    return [this.primaryPath, this.newPath, this.backupPath]
  }

  private async assertSafeDirectory(): Promise<void> {
    let stats: Stats
    try {
      stats = await this.fileSystem.lstat(this.directoryPath)
    } catch (error) {
      throw new PasswordVaultStorageError(
        'Le répertoire du coffre est indisponible.',
        'unsafe-path',
        { cause: error },
      )
    }
    if (stats.isSymbolicLink() || !stats.isDirectory()) {
      throw new PasswordVaultStorageError(
        'Le répertoire du coffre est un lien symbolique ou un point de réanalyse.',
        'unsafe-path',
      )
    }
    const canonical = await this.fileSystem.realpath(this.directoryPath)
    if (!samePath(canonical, this.directoryPath)) {
      throw new PasswordVaultStorageError(
        'Le répertoire du coffre traverse un lien symbolique ou un point de réanalyse.',
        'unsafe-path',
      )
    }
  }

  private async optionalLstat(path: string): Promise<Stats | undefined> {
    try {
      return await this.fileSystem.lstat(path)
    } catch (error) {
      if (errorCode(error) === 'ENOENT') return undefined
      throw new PasswordVaultStorageError(
        `Le fichier du coffre ne peut pas être inspecté : ${path}.`,
        'io',
        { cause: error },
      )
    }
  }

  private async preflightCandidates(): Promise<Map<string, Stats>> {
    const result = new Map<string, Stats>()
    for (const path of this.paths()) {
      const stats = await this.optionalLstat(path)
      if (!stats) continue
      assertRegularVaultFile(path, stats)
      result.set(path, stats)
    }
    return result
  }

  private async readChecked(path: string): Promise<ArrayBuffer> {
    const before = await this.fileSystem.lstat(path)
    assertRegularVaultFile(path, before)
    const noFollow = fileConstants.O_NOFOLLOW ?? 0
    let handle: FileHandle | undefined
    try {
      handle = await this.fileSystem.open(path, fileConstants.O_RDONLY | noFollow)
      const after = await handle.stat()
      assertRegularVaultFile(path, after)
      if (!sameFile(before, after) || before.size !== after.size) {
        throw new PasswordVaultStorageError(
          `Le fichier du coffre a changé pendant sa lecture : ${path}.`,
          'unsafe-path',
        )
      }
      const data = await handle.readFile()
      if (data.byteLength !== after.size) {
        throw new PasswordVaultStorageError(
          `La lecture du fichier du coffre est incomplète : ${path}.`,
          'io',
        )
      }
      return exactArrayBuffer(data)
    } finally {
      await handle?.close()
    }
  }

  private async tryDecodeCandidate(
    path: string,
    existing: ReadonlyMap<string, Stats>,
    secret: Uint8Array,
  ): Promise<Candidate<T>> {
    if (!existing.has(path)) return { path }
    const data = await this.readChecked(path)
    try {
      return { path, value: await this.codec.decode(data, secret) }
    } catch (error) {
      return { path, error }
    }
  }

  private async decodeRequired(path: string, secret: Uint8Array): Promise<T> {
    const data = await this.readChecked(path)
    try {
      return await this.codec.decode(data, secret)
    } catch (error) {
      throw new PasswordVaultStorageError(
        `Le fichier KDBX n’a pas pu être authentifié : ${path}.`,
        'corrupt',
        { cause: error },
      )
    }
  }

  private async promoteNewFile(existing: ReadonlyMap<string, Stats>): Promise<void> {
    if (existing.has(this.primaryPath)) {
      if (existing.has(this.backupPath)) await this.removeChecked(this.backupPath)
      await this.renameChecked(this.primaryPath, this.backupPath)
      await this.syncDirectory()
    }
    await this.renameChecked(this.newPath, this.primaryPath)
    await this.syncDirectory()
  }

  private async writeExclusiveAndSync(path: string, data: Uint8Array): Promise<void> {
    const noFollow = fileConstants.O_NOFOLLOW ?? 0
    const flags =
      fileConstants.O_WRONLY |
      fileConstants.O_CREAT |
      fileConstants.O_EXCL |
      noFollow
    let handle: FileHandle | undefined
    try {
      handle = await this.fileSystem.open(path, flags, 0o600)
      await handle.writeFile(data)
      await handle.sync()
    } catch (error) {
      throw new PasswordVaultStorageError(
        'Le fichier temporaire du coffre n’a pas pu être écrit et synchronisé.',
        'io',
        { cause: error },
      )
    } finally {
      await handle?.close()
    }
  }

  private async removeChecked(path: string): Promise<void> {
    const stats = await this.fileSystem.lstat(path)
    assertRegularVaultFile(path, stats)
    await this.fileSystem.unlink(path)
  }

  private async renameChecked(source: string, destination: string): Promise<void> {
    const sourceStats = await this.fileSystem.lstat(source)
    assertRegularVaultFile(source, sourceStats)
    if (await this.optionalLstat(destination)) {
      throw new PasswordVaultStorageError(
        `La destination atomique existe déjà : ${destination}.`,
        'unsafe-path',
      )
    }
    await this.fileSystem.rename(source, destination)
    const destinationStats = await this.fileSystem.lstat(destination)
    assertRegularVaultFile(destination, destinationStats)
  }

  private async syncDirectory(): Promise<void> {
    let handle: FileHandle | undefined
    try {
      handle = await this.fileSystem.open(this.directoryPath, fileConstants.O_RDONLY)
      await handle.sync()
    } catch (error) {
      const unsupportedOnWindows =
        process.platform === 'win32' &&
        ['EPERM', 'EINVAL', 'EISDIR'].includes(errorCode(error) ?? '')
      if (!unsupportedOnWindows) {
        throw new PasswordVaultStorageError(
          'Le répertoire du coffre n’a pas pu être synchronisé.',
          'io',
          { cause: error },
        )
      }
    } finally {
      await handle?.close()
    }
  }
}
