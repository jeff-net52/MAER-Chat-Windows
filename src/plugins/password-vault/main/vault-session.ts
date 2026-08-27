import type { Kdbx } from 'kdbxweb'
import type { PasswordVaultState } from '../shared/contract'
import {
  createPasswordVaultDatabase,
  passwordVaultEntryCount,
  wipePasswordVaultDatabase,
} from './kdbx-vault'
import { AtomicVaultStorage } from './atomic-vault-storage'
import { createWindowsVaultKeyStore } from './vault-key-store'

export const PASSWORD_VAULT_IDLE_TIMEOUT_MS = 5 * 60 * 1_000

export interface VaultSessionSnapshot {
  state: PasswordVaultState
  entryCount: number | null
  epoch: number
}

export interface VaultSessionKeyStore {
  load(): Promise<Uint8Array | undefined>
  create(): Promise<Uint8Array>
  delete?(): Promise<boolean>
}

export interface VaultSessionStorage<T> {
  hasArtifacts(): Promise<boolean>
  recover(secret: Uint8Array): Promise<T | undefined>
  write(value: T, secret: Uint8Array): Promise<void>
  reset?(): Promise<void>
}

export interface VaultDatabaseLifecycle<T> {
  create(secret: Uint8Array): Promise<T>
  entryCount(value: T): number
  dispose(value: T): void
}

export interface VaultPowerLockSource {
  on(event: 'lock-screen' | 'suspend', listener: () => void): unknown
  removeListener(event: 'lock-screen' | 'suspend', listener: () => void): unknown
}

export type VaultTimerHandle = ReturnType<typeof setTimeout>

export interface VaultSessionClock {
  now(): number
  setTimeout(callback: () => void, delayMs: number): VaultTimerHandle
  clearTimeout(handle: VaultTimerHandle): void
}

const SYSTEM_CLOCK: VaultSessionClock = {
  now: Date.now,
  setTimeout: (callback, delayMs) => setTimeout(callback, delayMs),
  clearTimeout: (handle) => clearTimeout(handle),
}

export const KDBX_VAULT_LIFECYCLE: VaultDatabaseLifecycle<Kdbx> = {
  create: createPasswordVaultDatabase,
  entryCount: passwordVaultEntryCount,
  dispose: wipePasswordVaultDatabase,
}

export class PasswordVaultSessionError extends Error {
  constructor(
    message: string,
    readonly code:
      | 'disposed'
      | 'locked'
      | 'stale-epoch'
      | 'uninitialized'
      | 'recovery-required'
      | 'already-initialized',
    options?: ErrorOptions,
  ) {
    super(message, options)
    this.name = 'PasswordVaultSessionError'
  }
}

export interface VaultSessionOptions<T> {
  keyStore: VaultSessionKeyStore
  storage: VaultSessionStorage<T>
  lifecycle: VaultDatabaseLifecycle<T>
  powerMonitor: VaultPowerLockSource
  clock?: VaultSessionClock
  idleTimeoutMs?: number
}

export class VaultSession<T = Kdbx> {
  private readonly keyStore: VaultSessionKeyStore
  private readonly storage: VaultSessionStorage<T>
  private readonly lifecycle: VaultDatabaseLifecycle<T>
  private readonly powerMonitor: VaultPowerLockSource
  private readonly clock: VaultSessionClock
  private readonly idleTimeoutMs: number
  private state: PasswordVaultState = 'locked'
  private epoch = 0
  private secret: Uint8Array | undefined
  private database: T | undefined
  private lastActivityAt = 0
  private timer: VaultTimerHandle | undefined
  private tail: Promise<void> = Promise.resolve()
  private disposed = false
  private lockRequested = false

  private readonly onPowerLock = (): void => {
    this.lockRequested = true
    void this.enqueue(async () => {
      this.lockInternal('locked')
    }).catch(() => undefined)
  }

  constructor(options: VaultSessionOptions<T>) {
    this.keyStore = options.keyStore
    this.storage = options.storage
    this.lifecycle = options.lifecycle
    this.powerMonitor = options.powerMonitor
    this.clock = options.clock ?? SYSTEM_CLOCK
    this.idleTimeoutMs = options.idleTimeoutMs ?? PASSWORD_VAULT_IDLE_TIMEOUT_MS
    if (!Number.isSafeInteger(this.idleTimeoutMs) || this.idleTimeoutMs < 1) {
      throw new Error('Le délai de verrouillage du coffre est invalide.')
    }
    this.powerMonitor.on('lock-screen', this.onPowerLock)
    this.powerMonitor.on('suspend', this.onPowerLock)
  }

  snapshot(): Promise<VaultSessionSnapshot> {
    return this.enqueue(async () => {
      this.assertNotDisposed()
      return this.snapshotInternal()
    })
  }

  initialize(): Promise<VaultSessionSnapshot> {
    return this.enqueue(async () => {
      this.assertNotDisposed()
      if (this.database) {
        throw new PasswordVaultSessionError(
          'Le coffre est déjà initialisé et déverrouillé.',
          'already-initialized',
        )
      }
      const existingKey = await this.keyStore.load()
      let hasArtifacts: boolean
      try {
        hasArtifacts = await this.storage.hasArtifacts()
      } catch (error) {
        existingKey?.fill(0)
        throw error
      }
      if (existingKey) {
        existingKey.fill(0)
        this.transitionLocked(hasArtifacts ? 'locked' : 'recovery-required')
        throw new PasswordVaultSessionError(
          'Une clé du coffre existe déjà dans Windows.',
          hasArtifacts ? 'already-initialized' : 'recovery-required',
        )
      }
      if (hasArtifacts) {
        this.transitionLocked('recovery-required')
        throw new PasswordVaultSessionError(
          'Des fichiers du coffre existent sans clé Windows.',
          'recovery-required',
        )
      }

      let secret: Uint8Array | undefined
      let database: T | undefined
      try {
        secret = await this.keyStore.create()
        database = await this.lifecycle.create(secret)
        await this.storage.write(database, secret)
        this.activate(database, secret)
        database = undefined
        secret = undefined
        return this.snapshotInternal()
      } catch (error) {
        if (database) this.lifecycle.dispose(database)
        secret?.fill(0)
        this.lockInternal('locked')
        throw error
      }
    })
  }

  unlock(): Promise<VaultSessionSnapshot> {
    return this.enqueue(async () => {
      this.assertNotDisposed()
      if (this.database && this.secret) {
        this.touch()
        return this.snapshotInternal()
      }

      let secret: Uint8Array | undefined
      try {
        secret = await this.keyStore.load()
        if (!secret) {
          const state = (await this.storage.hasArtifacts())
            ? 'recovery-required'
            : 'uninitialized'
          this.transitionLocked(state)
          throw new PasswordVaultSessionError(
            state === 'uninitialized'
              ? 'Le coffre local n’est pas initialisé.'
              : 'La clé Windows du coffre est absente.',
            state,
          )
        }
        const database = await this.storage.recover(secret)
        if (!database) {
          secret.fill(0)
          secret = undefined
          this.transitionLocked('recovery-required')
          throw new PasswordVaultSessionError(
            'La clé Windows existe mais le fichier du coffre est absent.',
            'recovery-required',
          )
        }
        this.activate(database, secret)
        secret = undefined
        return this.snapshotInternal()
      } catch (error) {
        secret?.fill(0)
        if (!(error instanceof PasswordVaultSessionError)) {
          this.lockInternal('recovery-required')
        }
        throw error
      }
    })
  }

  lock(): Promise<VaultSessionSnapshot> {
    return this.enqueue(async () => {
      this.assertNotDisposed()
      this.lockInternal('locked')
      return this.snapshotInternal()
    })
  }

  reset(): Promise<VaultSessionSnapshot> {
    return this.enqueue(async () => {
      this.assertNotDisposed()
      if (!this.storage.reset || !this.keyStore.delete) {
        throw new Error('La réinitialisation sécurisée du coffre est indisponible.')
      }
      this.lockInternal('locked')
      await this.storage.reset()
      await this.keyStore.delete()
      this.transitionLocked('uninitialized')
      return this.snapshotInternal()
    })
  }

  inspect<R>(epoch: number, operation: (database: Readonly<T>) => R | Promise<R>): Promise<R> {
    return this.enqueue(async () => {
      this.assertNotDisposed()
      const database = this.assertUnlocked(epoch)
      const result = await operation(database)
      this.assertOperationCanFinish(epoch)
      this.touch()
      return result
    })
  }

  mutate<R>(epoch: number, operation: (database: T) => R | Promise<R>): Promise<R> {
    return this.enqueue(async () => {
      this.assertNotDisposed()
      const database = this.assertUnlocked(epoch)
      try {
        const result = await operation(database)
        this.assertOperationCanFinish(epoch)
        const secret = this.secret
        if (!secret) {
          throw new PasswordVaultSessionError('Le coffre est verrouillé.', 'locked')
        }
        await this.storage.write(database, secret)
        this.assertOperationCanFinish(epoch)
        this.touch()
        return result
      } catch (error) {
        this.lockInternal('locked')
        throw error
      }
    })
  }

  dispose(): Promise<void> {
    if (!this.disposed) {
      this.disposed = true
      this.lockRequested = true
      this.powerMonitor.removeListener('lock-screen', this.onPowerLock)
      this.powerMonitor.removeListener('suspend', this.onPowerLock)
    }
    return this.enqueue(async () => {
      this.lockInternal('locked')
    })
  }

  private enqueue<R>(operation: () => Promise<R>): Promise<R> {
    const result = this.tail.then(operation, operation)
    this.tail = result.then(
      () => undefined,
      () => undefined,
    )
    return result
  }

  private assertNotDisposed(): void {
    if (this.disposed) {
      throw new PasswordVaultSessionError('La session du coffre est arrêtée.', 'disposed')
    }
  }

  private assertUnlocked(epoch: number): T {
    if (!Number.isSafeInteger(epoch) || epoch !== this.epoch) {
      throw new PasswordVaultSessionError('L’époque du coffre est périmée.', 'stale-epoch')
    }
    if (this.state !== 'unlocked' || !this.database || !this.secret) {
      throw new PasswordVaultSessionError('Le coffre est verrouillé.', 'locked')
    }
    return this.database
  }

  private assertOperationCanFinish(epoch: number): void {
    if (
      this.lockRequested ||
      epoch !== this.epoch ||
      this.clock.now() - this.lastActivityAt >= this.idleTimeoutMs
    ) {
      this.lockInternal('locked')
      throw new PasswordVaultSessionError(
        'Le coffre a été verrouillé pendant l’opération.',
        'locked',
      )
    }
  }

  private activate(database: T, secret: Uint8Array): void {
    this.lockInternal('locked')
    this.database = database
    this.secret = secret
    this.state = 'unlocked'
    this.epoch += 1
    this.lockRequested = false
    this.touch()
  }

  private touch(): void {
    if (this.state !== 'unlocked') return
    this.lastActivityAt = this.clock.now()
    if (this.timer) this.clock.clearTimeout(this.timer)
    const expectedEpoch = this.epoch
    this.timer = this.clock.setTimeout(() => {
      void this.enqueue(async () => {
        if (
          this.state === 'unlocked' &&
          this.epoch === expectedEpoch &&
          this.clock.now() - this.lastActivityAt >= this.idleTimeoutMs
        ) {
          this.lockInternal('locked')
        }
      }).catch(() => undefined)
    }, this.idleTimeoutMs)
  }

  private transitionLocked(state: Exclude<PasswordVaultState, 'unlocked'>): void {
    this.lockInternal(state)
  }

  private lockInternal(state: Exclude<PasswordVaultState, 'unlocked'>): void {
    if (this.timer) {
      this.clock.clearTimeout(this.timer)
      this.timer = undefined
    }
    const database = this.database
    const secret = this.secret
    const changed = this.state !== state || database !== undefined || secret !== undefined
    this.database = undefined
    this.secret = undefined
    this.lastActivityAt = 0
    this.state = state
    this.lockRequested = false
    if (secret) secret.fill(0)
    if (database) this.lifecycle.dispose(database)
    if (changed) this.epoch += 1
  }

  private snapshotInternal(): VaultSessionSnapshot {
    return Object.freeze({
      state: this.state,
      entryCount:
        this.state === 'unlocked' && this.database
          ? this.lifecycle.entryCount(this.database)
          : null,
      epoch: this.epoch,
    })
  }
}

export function createWindowsPasswordVaultSession(
  vaultPath: string,
  powerMonitor: VaultPowerLockSource,
): VaultSession<Kdbx> {
  return new VaultSession({
    keyStore: createWindowsVaultKeyStore(),
    storage: new AtomicVaultStorage(vaultPath),
    lifecycle: KDBX_VAULT_LIFECYCLE,
    powerMonitor,
  })
}
