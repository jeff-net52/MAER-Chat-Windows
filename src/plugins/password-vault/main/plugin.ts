import type { Kdbx } from 'kdbxweb'
import type { MainPluginDefinition } from '../../core/main/plugin-host'
import { PASSWORD_VAULT_MANIFEST } from '../manifest'
import {
  PASSWORD_VAULT_CLIPBOARD_CLEAR_SECONDS,
  PASSWORD_VAULT_PROTOCOL_VERSION,
  parsePasswordVaultRequest,
  parsePasswordVaultResponse,
  type PasswordVaultCopyResult,
  type PasswordVaultDeleteResult,
  type PasswordVaultEntrySummary,
  type PasswordVaultEntryUpdate,
  type PasswordVaultErrorCode,
  type PasswordVaultNewEntry,
  type PasswordVaultRequest,
  type PasswordVaultResponse,
  type PasswordVaultStatus,
  type PasswordVaultSuccessResult,
} from '../shared/contract'
import { PasswordVaultStorageError } from './atomic-vault-storage'
import {
  addPasswordVaultEntry,
  deletePasswordVaultEntry,
  listPasswordVaultEntries,
  passwordForClipboard,
  PasswordVaultEntryError,
  searchPasswordVaultEntries,
  updatePasswordVaultEntry,
} from './vault-entries'
import {
  ClipboardLease,
  generatePassword,
  type PasswordVaultClipboard,
  type SecureRandomIndex,
} from './password-tools'
import {
  createWindowsPasswordVaultSession,
  PasswordVaultSessionError,
  type VaultPowerLockSource,
  type VaultSession,
  type VaultSessionSnapshot,
} from './vault-session'

function status(snapshot: VaultSessionSnapshot): PasswordVaultStatus {
  return Object.freeze({ state: snapshot.state, entryCount: snapshot.entryCount })
}

function safeFailure(error: unknown): {
  code: PasswordVaultErrorCode
  message: string
} {
  if (error instanceof PasswordVaultSessionError) {
    switch (error.code) {
      case 'uninitialized':
        return { code: 'uninitialized', message: 'Le coffre local doit être créé.' }
      case 'recovery-required':
        return {
          code: 'recovery-required',
          message: 'Le coffre nécessite une récupération locale.',
        }
      case 'locked':
      case 'stale-epoch':
        return { code: 'locked', message: 'Le coffre est verrouillé.' }
      case 'already-initialized':
        return { code: 'locked', message: 'Le coffre existe déjà.' }
      case 'disposed':
        return { code: 'internal', message: 'Le coffre est indisponible.' }
    }
  }
  if (error instanceof PasswordVaultEntryError) {
    if (error.code === 'not-found') {
      return { code: 'not-found', message: "L’entrée demandée est introuvable." }
    }
    if (error.code === 'invalid-entry') {
      return { code: 'corrupt-vault', message: 'Une entrée du coffre est invalide.' }
    }
    return { code: 'storage-unavailable', message: 'Le coffre a atteint sa capacité maximale.' }
  }
  if (error instanceof PasswordVaultStorageError) {
    return error.kind === 'corrupt'
      ? { code: 'corrupt-vault', message: 'Le coffre local ne peut pas être authentifié.' }
      : { code: 'storage-unavailable', message: 'Le stockage sécurisé local est indisponible.' }
  }
  return { code: 'internal', message: 'Le coffre est temporairement indisponible.' }
}

function success(
  request: PasswordVaultRequest,
  result: PasswordVaultSuccessResult,
): PasswordVaultResponse {
  return parsePasswordVaultResponse({
    version: PASSWORD_VAULT_PROTOCOL_VERSION,
    requestId: request.requestId,
    ok: true,
    action: request.action,
    result,
  })
}

function failure(request: PasswordVaultRequest, error: unknown): PasswordVaultResponse {
  return parsePasswordVaultResponse({
    version: PASSWORD_VAULT_PROTOCOL_VERSION,
    requestId: request.requestId,
    ok: false,
    error: safeFailure(error),
  })
}

/**
 * Secret-free application port used by IPC today and a future local Native Messaging adapter.
 * Implementations keep VaultSession and clipboard plaintext entirely behind this boundary.
 */
export interface PasswordVaultOperations {
  status(): Promise<PasswordVaultStatus>
  initialize(): Promise<PasswordVaultStatus>
  unlock(): Promise<PasswordVaultStatus>
  lock(): Promise<PasswordVaultStatus>
  list(): Promise<readonly PasswordVaultEntrySummary[]>
  search(query: string): Promise<readonly PasswordVaultEntrySummary[]>
  add(entry: PasswordVaultNewEntry): Promise<PasswordVaultEntrySummary>
  update(entry: PasswordVaultEntryUpdate): Promise<PasswordVaultEntrySummary>
  delete(entryId: string): Promise<PasswordVaultDeleteResult>
  generate(length: number): Promise<string>
  copy(entryId: string): Promise<PasswordVaultCopyResult>
  dispose(): Promise<void>
}

export class PasswordVaultController {
  private tail: Promise<void> = Promise.resolve()
  private disposed = false

  constructor(private readonly operations: PasswordVaultOperations) {}

  handle(value: unknown): Promise<PasswordVaultResponse> {
    let request: PasswordVaultRequest
    try {
      request = parsePasswordVaultRequest(value)
    } catch (error) {
      return Promise.reject(error)
    }
    return this.enqueue(async () => {
      if (this.disposed) {
        return failure(
          request,
          new PasswordVaultSessionError('Le coffre est arrêté.', 'disposed'),
        )
      }
      try {
        return await this.dispatch(request)
      } catch (error) {
        return failure(request, error)
      }
    })
  }

  async dispose(): Promise<void> {
    if (this.disposed) return
    this.disposed = true
    await this.tail
    await this.operations.dispose()
  }

  private enqueue<R>(operation: () => Promise<R>): Promise<R> {
    const result = this.tail.then(operation, operation)
    this.tail = result.then(
      () => undefined,
      () => undefined,
    )
    return result
  }

  private async dispatch(request: PasswordVaultRequest): Promise<PasswordVaultResponse> {
    switch (request.action) {
      case 'status':
        return success(request, await this.operations.status())
      case 'initialize':
        return success(request, await this.operations.initialize())
      case 'unlock':
        return success(request, await this.operations.unlock())
      case 'lock':
        return success(request, await this.operations.lock())
      case 'list':
        return success(request, await this.operations.list())
      case 'search':
        return success(request, await this.operations.search(request.query))
      case 'add':
        return success(request, await this.operations.add(request.entry))
      case 'update':
        return success(request, await this.operations.update(request.entry))
      case 'delete':
        return success(request, await this.operations.delete(request.entryId))
      case 'generate':
        return success(request, { password: await this.operations.generate(request.length) })
      case 'copy':
        return success(request, await this.operations.copy(request.entryId))
    }
  }
}

class LocalPasswordVaultOperations implements PasswordVaultOperations {
  private readonly session: VaultSession<Kdbx>
  private readonly clipboardLease: ClipboardLease

  constructor(
    vaultPath: string,
    powerMonitor: VaultPowerLockSource,
    clipboard: PasswordVaultClipboard,
    private readonly randomIndex?: SecureRandomIndex,
  ) {
    this.session = createWindowsPasswordVaultSession(vaultPath, powerMonitor)
    this.clipboardLease = new ClipboardLease(clipboard)
  }

  async status(): Promise<PasswordVaultStatus> {
    return status(await this.session.snapshot())
  }

  async initialize(): Promise<PasswordVaultStatus> {
    return status(await this.session.initialize())
  }

  async unlock(): Promise<PasswordVaultStatus> {
    return status(await this.session.unlock())
  }

  async lock(): Promise<PasswordVaultStatus> {
    return status(await this.session.lock())
  }

  async list(): Promise<readonly PasswordVaultEntrySummary[]> {
    const { epoch } = await this.unlockedSnapshot()
    return this.session.inspect(epoch, (database) =>
      listPasswordVaultEntries(database as Kdbx),
    )
  }

  async search(query: string): Promise<readonly PasswordVaultEntrySummary[]> {
    const { epoch } = await this.unlockedSnapshot()
    return this.session.inspect(epoch, (database) =>
      searchPasswordVaultEntries(database as Kdbx, query),
    )
  }

  async add(entry: PasswordVaultNewEntry): Promise<PasswordVaultEntrySummary> {
    const { epoch } = await this.unlockedSnapshot()
    return this.session.mutate(epoch, (database) =>
      addPasswordVaultEntry(database, entry),
    )
  }

  async update(entry: PasswordVaultEntryUpdate): Promise<PasswordVaultEntrySummary> {
    const { epoch } = await this.unlockedSnapshot()
    return this.session.mutate(epoch, (database) =>
      updatePasswordVaultEntry(database, entry),
    )
  }

  async delete(entryId: string): Promise<PasswordVaultDeleteResult> {
    const { epoch } = await this.unlockedSnapshot()
    await this.session.mutate(epoch, (database) =>
      deletePasswordVaultEntry(database, entryId),
    )
    return Object.freeze({ entryId, deleted: true })
  }

  async generate(length: number): Promise<string> {
    const { epoch } = await this.unlockedSnapshot()
    return this.session.inspect(epoch, () => generatePassword(length, this.randomIndex))
  }

  async copy(entryId: string): Promise<PasswordVaultCopyResult> {
    const { epoch } = await this.unlockedSnapshot()
    const password = await this.session.inspect(epoch, (database) =>
      passwordForClipboard(database as Kdbx, entryId),
    )
    this.clipboardLease.copy(password)
    return Object.freeze({
      entryId,
      copied: true,
      clearAfterSeconds: PASSWORD_VAULT_CLIPBOARD_CLEAR_SECONDS,
    })
  }

  async dispose(): Promise<void> {
    this.clipboardLease.dispose()
    await this.session.dispose()
  }

  private async unlockedSnapshot(): Promise<VaultSessionSnapshot> {
    const snapshot = await this.session.snapshot()
    if (snapshot.state !== 'unlocked') {
      throw new PasswordVaultSessionError('Le coffre est verrouillé.', 'locked')
    }
    return snapshot
  }
}

export interface PasswordVaultControllerOptions {
  vaultPath: string
  powerMonitor: VaultPowerLockSource
  clipboard: PasswordVaultClipboard
  randomIndex?: SecureRandomIndex
}

/** Creates a reusable local controller without importing Electron or exposing VaultSession. */
export function createPasswordVaultController(
  options: PasswordVaultControllerOptions,
): PasswordVaultController {
  return new PasswordVaultController(
    new LocalPasswordVaultOperations(
      options.vaultPath,
      options.powerMonitor,
      options.clipboard,
      options.randomIndex,
    ),
  )
}

export type PasswordVaultMainPluginOptions = PasswordVaultControllerOptions

export function createPasswordVaultMainPlugin(
  options: PasswordVaultMainPluginOptions,
): MainPluginDefinition {
  return {
    manifest: PASSWORD_VAULT_MANIFEST,
    activate(context) {
      const controller = createPasswordVaultController(options)
      context.ipc.handle('request', (value: unknown) => controller.handle(value))
      return () => controller.dispose()
    },
  }
}
