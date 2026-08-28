import { AsyncEntry, findCredentialsAsync } from '@napi-rs/keyring'
import { normalizeAccountJid } from '../shared/jid'
import { MAER_ACCOUNT_DOMAIN } from '../shared/service-config'

const SERVICE = 'MAER Chat XMPP'

export interface CredentialBackend {
  get(account: string): Promise<string | undefined>
  set(account: string, value: string): Promise<void>
  delete(account: string): Promise<boolean>
  listAccounts(): Promise<string[]>
}

/**
 * Credential backend reserved for automated E2E runs.
 *
 * It deliberately neither reads nor writes the operating-system keyring. This
 * keeps a temporary smoke profile from observing, replacing, or deleting a
 * real MAER Chat credential, even if a future test accidentally requests
 * persistence.
 */
class E2eCredentialBackend implements CredentialBackend {
  async get(_account: string): Promise<undefined> {
    return undefined
  }

  async set(_account: string, _value: string): Promise<void> {}

  async delete(_account: string): Promise<boolean> {
    return false
  }

  async listAccounts(): Promise<string[]> {
    return []
  }
}

export interface StoredCredential {
  version: 1
  authKind: 'password' | 'oauth'
  secret: string
  deviceId?: string
  expiresAt?: string
}

function parseStoredCredential(value: string): StoredCredential {
  let parsed: unknown
  try {
    parsed = JSON.parse(value)
  } catch {
    throw new Error('Identifiant Windows invalide')
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('Identifiant Windows invalide')
  }
  const data = parsed as Record<string, unknown>
  if (
    data.version !== 1 ||
    (data.authKind !== 'password' && data.authKind !== 'oauth') ||
    typeof data.secret !== 'string' ||
    data.secret.length === 0
  ) {
    throw new Error('Identifiant Windows invalide')
  }
  if (
    data.deviceId !== undefined &&
    (typeof data.deviceId !== 'string' || data.deviceId.length === 0)
  ) {
    throw new Error('Identifiant Windows invalide')
  }
  if (
    data.expiresAt !== undefined &&
    (typeof data.expiresAt !== 'string' || Number.isNaN(Date.parse(data.expiresAt)))
  ) {
    throw new Error('Identifiant Windows invalide')
  }
  return {
    version: 1,
    authKind: data.authKind,
    secret: data.secret,
    ...(typeof data.deviceId === 'string' ? { deviceId: data.deviceId } : {}),
    ...(typeof data.expiresAt === 'string' ? { expiresAt: data.expiresAt } : {}),
  }
}

function validateCredential(credential: StoredCredential): StoredCredential {
  return parseStoredCredential(JSON.stringify(credential))
}

export class CredentialStore {
  constructor(private readonly backend: CredentialBackend) {}

  async save(jid: string, credential: StoredCredential): Promise<void> {
    const account = normalizeAccountJid(jid, MAER_ACCOUNT_DOMAIN)
    await this.backend.set(account, JSON.stringify(validateCredential(credential)))
  }

  async load(jid: string): Promise<StoredCredential | undefined> {
    const account = normalizeAccountJid(jid, MAER_ACCOUNT_DOMAIN)
    const value = await this.backend.get(account)
    return value === undefined ? undefined : parseStoredCredential(value)
  }

  async delete(jid: string): Promise<boolean> {
    const account = normalizeAccountJid(jid, MAER_ACCOUNT_DOMAIN)
    return this.backend.delete(account)
  }

  async listAccounts(): Promise<string[]> {
    const accounts = await this.backend.listAccounts()
    const validAccounts = accounts.flatMap((account) => {
      try {
        return [normalizeAccountJid(account, MAER_ACCOUNT_DOMAIN)]
      } catch {
        return []
      }
    })
    return [...new Set(validAccounts)]
      .sort((left, right) => left.localeCompare(right))
  }
}

export class WindowsCredentialBackend implements CredentialBackend {
  async get(account: string): Promise<string | undefined> {
    return new AsyncEntry(SERVICE, account).getPassword()
  }

  async set(account: string, value: string): Promise<void> {
    await new AsyncEntry(SERVICE, account).setPassword(value)
  }

  async delete(account: string): Promise<boolean> {
    return new AsyncEntry(SERVICE, account).deleteCredential()
  }

  async listAccounts(): Promise<string[]> {
    const credentials = await findCredentialsAsync(SERVICE)
    return credentials.map(({ account }) => account)
  }
}

export function createRuntimeCredentialStore(e2eMode: boolean): CredentialStore {
  return new CredentialStore(
    e2eMode ? new E2eCredentialBackend() : new WindowsCredentialBackend(),
  )
}
