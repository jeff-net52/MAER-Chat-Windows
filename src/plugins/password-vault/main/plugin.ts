import type { Kdbx } from 'kdbxweb'
import type { MainPluginDefinition } from '../../core/main/plugin-host'
import { PASSWORD_VAULT_MANIFEST } from '../manifest'
import {
  PASSWORD_VAULT_CLIPBOARD_CLEAR_SECONDS,
  PASSWORD_VAULT_PROTOCOL_VERSION,
  parsePasswordVaultRequest,
  parsePasswordVaultResponse,
  type PasswordVaultCopyResult,
  type PasswordVaultBackupResult,
  type PasswordVaultDeleteResult,
  type PasswordVaultEntrySummary,
  type PasswordVaultEntryUpdate,
  type PasswordVaultErrorCode,
  type PasswordVaultNewEntry,
  type PasswordVaultRequest,
  type PasswordVaultResponse,
  type PasswordVaultStatus,
  type PasswordVaultSuccessResult,
  type PasswordVaultUsernameCopyResult,
  type PasswordVaultRevealResult,
  type PasswordVaultOpenUrlResult,
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
  generatePasswordForPolicy,
  type PasswordVaultClipboard,
  type SecureRandomIndex,
} from './password-tools'
import type {
  NativeVaultCredentialSummary,
  NativeVaultGateway,
  NativeVaultGeneratePolicy,
  NativeVaultLookupInput,
  NativeVaultRevealInput,
  NativeVaultRevealedCredential,
  NativeVaultSaveInput,
  NativeVaultSavedCredential,
  NativeVaultStatus,
} from './native-vault-gateway'
import {
  createWindowsPasswordVaultSession,
  PasswordVaultSessionError,
  type VaultPowerLockSource,
  type VaultSession,
  type VaultSessionSnapshot,
} from './vault-session'
import { decryptVaultBackup, encryptVaultBackup } from './vault-backup'

export class PasswordVaultBackupError extends Error {
  constructor(
    message: string,
    readonly kind: 'invalid' | 'io',
  ) {
    super(message)
    this.name = 'PasswordVaultBackupError'
  }
}

class PasswordVaultRevealCancelledError extends Error {
  constructor() {
    super('Affichage du mot de passe annulé.')
    this.name = 'PasswordVaultRevealCancelledError'
  }
}

function status(snapshot: VaultSessionSnapshot): PasswordVaultStatus {
  return Object.freeze({ state: snapshot.state, entryCount: snapshot.entryCount })
}

function safeFailure(error: unknown): {
  code: PasswordVaultErrorCode
  message: string
} {
  if (error instanceof PasswordVaultRevealCancelledError) {
    return { code: 'cancelled', message: error.message }
  }
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
  if (error instanceof PasswordVaultBackupError) {
    return error.kind === 'invalid'
      ? { code: 'corrupt-vault', message: error.message }
      : { code: 'storage-unavailable', message: error.message }
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
  copyUsername(entryId: string): Promise<PasswordVaultUsernameCopyResult>
  reveal(entryId: string): Promise<PasswordVaultRevealResult>
  openUrl(entryId: string): Promise<PasswordVaultOpenUrlResult>
  exportBackup(passphrase: string): Promise<PasswordVaultBackupResult>
  importBackup(passphrase: string): Promise<PasswordVaultBackupResult>
  reset(): Promise<PasswordVaultStatus>
  dispose(): Promise<void>
}

export interface PasswordVaultBrowserExtensionResources {
  openFolder(): Promise<void>
  openGuide(): Promise<void>
}

export interface PasswordVaultBackupFiles {
  save(data: Uint8Array): Promise<boolean>
  load(): Promise<Uint8Array | undefined>
}

export interface PasswordVaultExternalResources {
  openUrl(url: string): Promise<void>
}

const unavailableBackupFiles: PasswordVaultBackupFiles = Object.freeze({
  async save() { throw new Error('Backup resources unavailable') },
  async load() { throw new Error('Backup resources unavailable') },
})

const unavailableExternalResources: PasswordVaultExternalResources = Object.freeze({
  async openUrl() { throw new Error('External resources unavailable') },
})

const unavailableBrowserExtensionResources: PasswordVaultBrowserExtensionResources =
  Object.freeze({
    async openFolder() {
      throw new Error('Browser extension resources unavailable')
    },
    async openGuide() {
      throw new Error('Browser extension resources unavailable')
    },
  })

export class PasswordVaultController {
  private tail: Promise<void> = Promise.resolve()
  private disposed = false

  constructor(
    private readonly operations: PasswordVaultOperations,
    private readonly browserExtensions: PasswordVaultBrowserExtensionResources =
      unavailableBrowserExtensionResources,
    private readonly confirmReveal: (entryId: string) => Promise<boolean> = async () => false,
  ) {}

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
      case 'copy-username':
        return success(request, await this.operations.copyUsername(request.entryId))
      case 'reveal':
        if (!(await this.confirmReveal(request.entryId))) {
          throw new PasswordVaultRevealCancelledError()
        }
        return success(request, await this.operations.reveal(request.entryId))
      case 'open-url':
        return success(request, await this.operations.openUrl(request.entryId))
      case 'export-backup':
        return success(request, await this.operations.exportBackup(request.passphrase))
      case 'import-backup':
        return success(request, await this.operations.importBackup(request.passphrase))
      case 'reset':
        return success(request, await this.operations.reset())
      case 'open-extension-folder':
        await this.browserExtensions.openFolder()
        return success(request, { target: 'folder', opened: true })
      case 'open-extension-guide':
        await this.browserExtensions.openGuide()
        return success(request, { target: 'guide', opened: true })
    }
  }
}

class NativeVaultGatewayError extends Error {
  constructor(readonly code: 'DENIED' | 'NOT_FOUND' | 'LOCKED') {
    super('Native password vault operation failed')
    this.name = 'NativeVaultGatewayError'
  }
}

function nativeBoundedString(
  value: unknown,
  maximum: number,
  allowEmpty = false,
): string {
  if (
    typeof value !== 'string' ||
    value.length > maximum ||
    (!allowEmpty && value.length === 0) ||
    value.includes('\0')
  ) {
    throw new NativeVaultGatewayError('DENIED')
  }
  return value
}

function exactSecureNativeOrigin(value: unknown): URL {
  const raw = nativeBoundedString(value, 512)
  let origin: URL
  try {
    origin = new URL(raw)
  } catch {
    throw new NativeVaultGatewayError('DENIED')
  }
  if (
    origin.protocol !== 'https:' ||
    origin.origin !== raw ||
    origin.username ||
    origin.password ||
    origin.pathname !== '/' ||
    origin.search ||
    origin.hash
  ) {
    throw new NativeVaultGatewayError('DENIED')
  }
  return origin
}

function entryBelongsToOrigin(entry: PasswordVaultEntrySummary, origin: string): boolean {
  try {
    return new URL(entry.url).origin === origin
  } catch {
    return false
  }
}

function nativeSummary(entry: PasswordVaultEntrySummary): NativeVaultCredentialSummary {
  const updatedAt = Date.parse(entry.updatedAt)
  if (!Number.isSafeInteger(updatedAt) || updatedAt < 0) {
    throw new PasswordVaultEntryError(
      "La date de l’entrée est invalide.",
      'invalid-entry',
    )
  }
  return Object.freeze({
    credentialId: entry.id,
    username: entry.username,
    label: entry.title,
    updatedAt,
  })
}

export class LocalPasswordVaultOperations implements PasswordVaultOperations {
  private readonly session: VaultSession<Kdbx>
  private readonly clipboardLease: ClipboardLease

  constructor(
    vaultPath: string,
    powerMonitor: VaultPowerLockSource,
    clipboard: PasswordVaultClipboard,
    private readonly randomIndex?: SecureRandomIndex,
    private readonly backupFiles: PasswordVaultBackupFiles = unavailableBackupFiles,
    private readonly externalResources: PasswordVaultExternalResources = unavailableExternalResources,
    session?: VaultSession<Kdbx>,
  ) {
    this.session = session ?? createWindowsPasswordVaultSession(vaultPath, powerMonitor)
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

  async copyUsername(entryId: string): Promise<PasswordVaultUsernameCopyResult> {
    const { epoch } = await this.unlockedSnapshot()
    const username = await this.session.inspect(epoch, (database) => {
      const entry = listPasswordVaultEntries(database as Kdbx).find((candidate) => candidate.id === entryId)
      if (!entry) throw new PasswordVaultEntryError("L’entrée demandée est introuvable.", 'not-found')
      return entry.username
    })
    this.clipboardLease.copy(username)
    return Object.freeze({
      entryId,
      usernameCopied: true,
      clearAfterSeconds: PASSWORD_VAULT_CLIPBOARD_CLEAR_SECONDS,
    })
  }

  async reveal(entryId: string): Promise<PasswordVaultRevealResult> {
    const { epoch } = await this.unlockedSnapshot()
    const password = await this.session.inspect(epoch, (database) =>
      passwordForClipboard(database as Kdbx, entryId),
    )
    return Object.freeze({ entryId, password })
  }

  async openUrl(entryId: string): Promise<PasswordVaultOpenUrlResult> {
    const { epoch } = await this.unlockedSnapshot()
    const url = await this.session.inspect(epoch, (database) => {
      const entry = listPasswordVaultEntries(database as Kdbx).find((candidate) => candidate.id === entryId)
      if (!entry) throw new PasswordVaultEntryError("L’entrée demandée est introuvable.", 'not-found')
      return entry.url
    })
    await this.externalResources.openUrl(url)
    return Object.freeze({ entryId, opened: true })
  }

  async exportBackup(passphrase: string): Promise<PasswordVaultBackupResult> {
    const { epoch } = await this.unlockedSnapshot()
    const entries = await this.session.inspect(epoch, (database) =>
      listPasswordVaultEntries(database as Kdbx).map((entry) => ({
        title: entry.title,
        username: entry.username,
        url: entry.url,
        password: passwordForClipboard(database as Kdbx, entry.id),
      })),
    )
    let encrypted: Uint8Array
    try {
      encrypted = await encryptVaultBackup(entries, passphrase)
    } catch (error) {
      throw new PasswordVaultBackupError('La phrase secrète ou le contenu du coffre est invalide.', 'invalid')
    }
    try {
      const completed = await this.backupFiles.save(encrypted)
      return Object.freeze({ operation: 'export', completed, entryCount: completed ? entries.length : 0 })
    } catch (error) {
      throw new PasswordVaultBackupError('Impossible d’enregistrer la sauvegarde chiffrée.', 'io')
    } finally {
      encrypted.fill(0)
    }
  }

  async importBackup(passphrase: string): Promise<PasswordVaultBackupResult> {
    let encrypted: Uint8Array | undefined
    try {
      encrypted = await this.backupFiles.load()
    } catch (error) {
      throw new PasswordVaultBackupError('Impossible de lire la sauvegarde chiffrée.', 'io')
    }
    if (!encrypted) return Object.freeze({ operation: 'import', completed: false, entryCount: 0 })

    let entries: readonly PasswordVaultNewEntry[]
    try {
      entries = await decryptVaultBackup(encrypted, passphrase)
    } catch (error) {
      throw new PasswordVaultBackupError('Phrase secrète incorrecte ou sauvegarde endommagée.', 'invalid')
    } finally {
      encrypted.fill(0)
    }

    const current = await this.session.snapshot()
    if (current.state === 'unlocked') {
      // A single VaultSession mutation keeps the existing KDBX/key until the
      // replacement has been encoded, authenticated and atomically committed.
      // If either population or storage fails, VaultSession wipes the modified
      // in-memory database and the previous authenticated file remains recoverable.
      await this.session.mutate(current.epoch, (database) => {
        const vault = database as Kdbx
        for (const existing of listPasswordVaultEntries(vault)) {
          deletePasswordVaultEntry(vault, existing.id)
        }
        for (const entry of entries) addPasswordVaultEntry(vault, entry)
      })
    } else {
      // Recovery mode has no usable Windows key, so the old artifacts cannot be
      // authenticated. The selected encrypted backup remains untouched and can
      // always be retried if creating the fresh local vault fails.
      await this.session.reset()
      const initialized = await this.session.initialize()
      await this.session.mutate(initialized.epoch, (database) => {
        for (const entry of entries) addPasswordVaultEntry(database as Kdbx, entry)
      })
    }
    return Object.freeze({ operation: 'import', completed: true, entryCount: entries.length })
  }

  async reset(): Promise<PasswordVaultStatus> {
    return status(await this.session.reset())
  }

  async nativeStatus(): Promise<NativeVaultStatus> {
    const snapshot = await this.session.snapshot()
    return Object.freeze({ state: snapshot.state === 'unlocked' ? 'ready' : 'locked' })
  }

  async nativeLookup(
    input: NativeVaultLookupInput,
  ): Promise<readonly NativeVaultCredentialSummary[]> {
    const origin = exactSecureNativeOrigin(input.origin).origin
    const usernameHint = nativeBoundedString(input.usernameHint, 320, true)
    nativeBoundedString(input.formSignature, 256, true)
    const { epoch } = await this.unlockedSnapshot()
    return this.session.inspect(epoch, (database) => {
      const matching = listPasswordVaultEntries(database as Kdbx)
        .filter((entry) => entryBelongsToOrigin(entry, origin))
        .slice(0, 50)
      if (usernameHint) {
        matching.sort((left, right) => {
          const leftMatch = left.username === usernameHint ? 0 : 1
          const rightMatch = right.username === usernameHint ? 0 : 1
          return leftMatch - rightMatch
        })
      }
      return Object.freeze(matching.map(nativeSummary))
    })
  }

  async nativeReveal(
    input: NativeVaultRevealInput,
  ): Promise<NativeVaultRevealedCredential> {
    const origin = exactSecureNativeOrigin(input.origin).origin
    const credentialId = nativeBoundedString(input.credentialId, 128)
    const { epoch } = await this.unlockedSnapshot()
    return this.session.inspect(epoch, (database) => {
      const entry = listPasswordVaultEntries(database as Kdbx).find(
        (candidate) => candidate.id === credentialId,
      )
      if (!entry) throw new NativeVaultGatewayError('NOT_FOUND')
      if (!entryBelongsToOrigin(entry, origin)) {
        throw new NativeVaultGatewayError('DENIED')
      }
      return {
        credentialId,
        username: entry.username,
        password: passwordForClipboard(database as Kdbx, credentialId),
      }
    })
  }

  async nativeSave(input: NativeVaultSaveInput): Promise<NativeVaultSavedCredential> {
    const originUrl = exactSecureNativeOrigin(input.origin)
    const credentialId = nativeBoundedString(input.credentialId, 128, true)
    const username = nativeBoundedString(input.username, 320, true)
    const password = nativeBoundedString(input.password, 4_096)
    const label = nativeBoundedString(input.label, 256, true)
    const { epoch } = await this.unlockedSnapshot()
    const savedCredentialId = await this.session.mutate(epoch, (database) => {
      if (!credentialId) {
        const duplicate = listPasswordVaultEntries(database as Kdbx).find(
          (entry) =>
            entryBelongsToOrigin(entry, originUrl.origin) &&
            entry.username.localeCompare(username, undefined, { sensitivity: 'base' }) === 0,
        )
        if (duplicate) {
          updatePasswordVaultEntry(database as Kdbx, {
            id: duplicate.id,
            title: label || duplicate.title,
            username,
            url: duplicate.url,
            password: { mode: 'replace', value: password },
          })
          return duplicate.id
        }
        return addPasswordVaultEntry(database as Kdbx, {
          title: label || originUrl.hostname,
          username,
          password,
          url: `${originUrl.origin}/`,
        }).id
      }
      const existing = listPasswordVaultEntries(database as Kdbx).find(
        (entry) => entry.id === credentialId,
      )
      if (!existing) throw new NativeVaultGatewayError('NOT_FOUND')
      if (!entryBelongsToOrigin(existing, originUrl.origin)) {
        throw new NativeVaultGatewayError('DENIED')
      }
      updatePasswordVaultEntry(database as Kdbx, {
        id: credentialId,
        title: label || existing.title,
        username,
        url: existing.url,
        password: { mode: 'replace', value: password },
      })
      return credentialId
    })
    return Object.freeze({ credentialId: savedCredentialId })
  }

  async nativeGenerate(policy: NativeVaultGeneratePolicy): Promise<string> {
    const { epoch } = await this.unlockedSnapshot()
    return this.session.inspect(epoch, () =>
      generatePasswordForPolicy(policy, this.randomIndex),
    )
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

class LocalNativeVaultGateway implements NativeVaultGateway {
  constructor(private readonly operations: LocalPasswordVaultOperations) {}

  status(): Promise<NativeVaultStatus> {
    return this.operations.nativeStatus()
  }

  lookup(input: NativeVaultLookupInput): Promise<readonly NativeVaultCredentialSummary[]> {
    return this.operations.nativeLookup(input)
  }

  reveal(input: NativeVaultRevealInput): Promise<NativeVaultRevealedCredential> {
    return this.operations.nativeReveal(input)
  }

  save(input: NativeVaultSaveInput): Promise<NativeVaultSavedCredential> {
    return this.operations.nativeSave(input)
  }

  generate(policy: NativeVaultGeneratePolicy): Promise<string> {
    return this.operations.nativeGenerate(policy)
  }

  async lock(): Promise<void> {
    await this.operations.lock()
  }
}

export interface PasswordVaultControllerOptions {
  vaultPath: string
  powerMonitor: VaultPowerLockSource
  clipboard: PasswordVaultClipboard
  randomIndex?: SecureRandomIndex
  backupFiles?: PasswordVaultBackupFiles
  externalResources?: PasswordVaultExternalResources
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
      options.backupFiles,
      options.externalResources,
    ),
  )
}

export interface PasswordVaultMainPluginOptions extends PasswordVaultControllerOptions {
  browserExtensions: PasswordVaultBrowserExtensionResources
  confirmReveal?(entryId: string): Promise<boolean>
  publishNativeGateway?(gateway: NativeVaultGateway | undefined): void
}

export function createPasswordVaultMainPlugin(
  options: PasswordVaultMainPluginOptions,
): MainPluginDefinition {
  return {
    manifest: PASSWORD_VAULT_MANIFEST,
    activate(context) {
      const operations = new LocalPasswordVaultOperations(
        options.vaultPath,
        options.powerMonitor,
        options.clipboard,
        options.randomIndex,
        options.backupFiles,
        options.externalResources,
      )
      const controller = new PasswordVaultController(
        operations,
        options.browserExtensions,
        options.confirmReveal,
      )
      const gateway = new LocalNativeVaultGateway(operations)
      context.ipc.handle('request', (value: unknown) => controller.handle(value))
      try {
        options.publishNativeGateway?.(gateway)
      } catch (error) {
        void controller.dispose()
        throw error
      }
      return async () => {
        try {
          options.publishNativeGateway?.(undefined)
        } finally {
          await controller.dispose()
        }
      }
    },
  }
}
