import { AsyncEntry, findCredentialsAsync } from '@napi-rs/keyring'
import { normalizeLoginJid } from '../shared/jid'

const SERVICE = 'MAER Chat XMPP'

export interface CredentialBackend {
  get(account: string): Promise<string | undefined>
  set(account: string, value: string): Promise<void>
  delete(account: string): Promise<boolean>
  listAccounts(): Promise<string[]>
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
    const account = normalizeLoginJid(jid, true, 'contacts.chaumont.me')
    await this.backend.set(account, JSON.stringify(validateCredential(credential)))
  }

  async load(jid: string): Promise<StoredCredential | undefined> {
    const account = normalizeLoginJid(jid, true, 'contacts.chaumont.me')
    const value = await this.backend.get(account)
    return value === undefined ? undefined : parseStoredCredential(value)
  }

  async delete(jid: string): Promise<boolean> {
    const account = normalizeLoginJid(jid, true, 'contacts.chaumont.me')
    return this.backend.delete(account)
  }

  async listAccounts(): Promise<string[]> {
    const accounts = await this.backend.listAccounts()
    return [...new Set(accounts)].sort((left, right) => left.localeCompare(right))
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
