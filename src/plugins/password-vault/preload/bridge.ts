import { pluginIpcChannel } from '../../core/shared/plugin-contract'
import { PASSWORD_VAULT_PLUGIN_ID } from '../manifest'
import {
  PASSWORD_VAULT_PROTOCOL_VERSION,
  parsePasswordVaultRequest,
  parsePasswordVaultResponse,
  type PasswordVaultAction,
  type PasswordVaultBrowserExtensionOpenResult,
  type PasswordVaultBackupResult,
  type PasswordVaultCopyResult,
  type PasswordVaultDeleteResult,
  type PasswordVaultEntrySummary,
  type PasswordVaultEntryUpdate,
  type PasswordVaultErrorCode,
  type PasswordVaultGeneratedPassword,
  type PasswordVaultOpenUrlResult,
  type PasswordVaultRevealResult,
  type PasswordVaultUsernameCopyResult,
  type PasswordVaultNewEntry,
  type PasswordVaultRequest,
  type PasswordVaultStatus,
  type PasswordVaultSuccessResponse,
} from '../shared/contract'

export class PasswordVaultBridgeError extends Error {
  constructor(
    message: string,
    readonly code: PasswordVaultErrorCode,
  ) {
    super(message)
    this.name = 'PasswordVaultBridgeError'
  }
}

export interface PasswordVaultBridge {
  status(): Promise<PasswordVaultStatus>
  initialize(): Promise<PasswordVaultStatus>
  unlock(): Promise<PasswordVaultStatus>
  lock(): Promise<PasswordVaultStatus>
  list(): Promise<readonly PasswordVaultEntrySummary[]>
  search(query: string): Promise<readonly PasswordVaultEntrySummary[]>
  add(entry: PasswordVaultNewEntry): Promise<PasswordVaultEntrySummary>
  update(entry: PasswordVaultEntryUpdate): Promise<PasswordVaultEntrySummary>
  delete(entryId: string): Promise<PasswordVaultDeleteResult>
  generate(length?: number): Promise<string>
  copy(entryId: string): Promise<PasswordVaultCopyResult>
  copyUsername(entryId: string): Promise<PasswordVaultUsernameCopyResult>
  reveal(entryId: string): Promise<PasswordVaultRevealResult>
  openUrl(entryId: string): Promise<PasswordVaultOpenUrlResult>
  exportBackup(passphrase: string): Promise<PasswordVaultBackupResult>
  importBackup(passphrase: string): Promise<PasswordVaultBackupResult>
  reset(): Promise<PasswordVaultStatus>
  openExtensionFolder(): Promise<PasswordVaultBrowserExtensionOpenResult>
  openExtensionGuide(): Promise<PasswordVaultBrowserExtensionOpenResult>
}

export type PluginIpcInvoker = (channel: string, request: unknown) => Promise<unknown>
export type RequestIdFactory = () => string

function defaultRequestId(): string {
  return globalThis.crypto.randomUUID()
}

function base(action: PasswordVaultAction, requestId: string) {
  return {
    version: PASSWORD_VAULT_PROTOCOL_VERSION,
    requestId,
    action,
  } as const
}

export function createPasswordVaultBridge(
  invoke: PluginIpcInvoker,
  createRequestId: RequestIdFactory = defaultRequestId,
): PasswordVaultBridge {
  const channel = pluginIpcChannel(PASSWORD_VAULT_PLUGIN_ID, 'request')

  async function request(value: unknown): Promise<PasswordVaultSuccessResponse> {
    const parsedRequest = parsePasswordVaultRequest(value)
    const response = parsePasswordVaultResponse(await invoke(channel, parsedRequest))
    if (response.requestId !== parsedRequest.requestId) {
      throw new Error('La réponse du coffre ne correspond pas à la requête.')
    }
    if (!response.ok) {
      throw new PasswordVaultBridgeError(response.error.message, response.error.code)
    }
    if (response.action !== parsedRequest.action) {
      throw new Error('La réponse du coffre contient une action inattendue.')
    }
    return response
  }

  function simple(
    action:
      | 'status'
      | 'initialize'
      | 'unlock'
      | 'lock'
      | 'list'
      | 'open-extension-folder'
      | 'open-extension-guide',
  ): PasswordVaultRequest {
    return parsePasswordVaultRequest(base(action, createRequestId()))
  }

  async function statusAction(
    action: 'status' | 'initialize' | 'unlock' | 'lock',
  ): Promise<PasswordVaultStatus> {
    return (await request(simple(action))).result as PasswordVaultStatus
  }

  return Object.freeze({
    status: () => statusAction('status'),
    initialize: () => statusAction('initialize'),
    unlock: () => statusAction('unlock'),
    lock: () => statusAction('lock'),
    async list() {
      return (await request(simple('list'))).result as readonly PasswordVaultEntrySummary[]
    },
    async search(query: string) {
      const value = parsePasswordVaultRequest({
        ...base('search', createRequestId()),
        query,
      })
      return (await request(value)).result as readonly PasswordVaultEntrySummary[]
    },
    async add(entry: PasswordVaultNewEntry) {
      const value = parsePasswordVaultRequest({
        ...base('add', createRequestId()),
        entry,
      })
      return (await request(value)).result as PasswordVaultEntrySummary
    },
    async update(entry: PasswordVaultEntryUpdate) {
      const value = parsePasswordVaultRequest({
        ...base('update', createRequestId()),
        entry,
      })
      return (await request(value)).result as PasswordVaultEntrySummary
    },
    async delete(entryId: string) {
      const value = parsePasswordVaultRequest({
        ...base('delete', createRequestId()),
        entryId,
      })
      return (await request(value)).result as PasswordVaultDeleteResult
    },
    async generate(length = 20) {
      const value = parsePasswordVaultRequest({
        ...base('generate', createRequestId()),
        length,
      })
      return ((await request(value)).result as PasswordVaultGeneratedPassword).password
    },
    async copy(entryId: string) {
      const value = parsePasswordVaultRequest({
        ...base('copy', createRequestId()),
        entryId,
      })
      return (await request(value)).result as PasswordVaultCopyResult
    },
    async copyUsername(entryId: string) {
      const value = parsePasswordVaultRequest({
        ...base('copy-username', createRequestId()),
        entryId,
      })
      return (await request(value)).result as PasswordVaultUsernameCopyResult
    },
    async reveal(entryId: string) {
      const value = parsePasswordVaultRequest({ ...base('reveal', createRequestId()), entryId })
      return (await request(value)).result as PasswordVaultRevealResult
    },
    async openUrl(entryId: string) {
      const value = parsePasswordVaultRequest({ ...base('open-url', createRequestId()), entryId })
      return (await request(value)).result as PasswordVaultOpenUrlResult
    },
    async exportBackup(passphrase: string) {
      const value = parsePasswordVaultRequest({
        ...base('export-backup', createRequestId()),
        passphrase,
      })
      return (await request(value)).result as PasswordVaultBackupResult
    },
    async importBackup(passphrase: string) {
      const value = parsePasswordVaultRequest({
        ...base('import-backup', createRequestId()),
        passphrase,
        confirm: 'REPLACE',
      })
      return (await request(value)).result as PasswordVaultBackupResult
    },
    async reset() {
      const value = parsePasswordVaultRequest({
        ...base('reset', createRequestId()),
        confirm: 'RESET',
      })
      return (await request(value)).result as PasswordVaultStatus
    },
    async openExtensionFolder() {
      return (await request(simple('open-extension-folder')))
        .result as PasswordVaultBrowserExtensionOpenResult
    },
    async openExtensionGuide() {
      return (await request(simple('open-extension-guide')))
        .result as PasswordVaultBrowserExtensionOpenResult
    },
  })
}
