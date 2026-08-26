import { describe, expect, it } from 'vitest'
import {
  CredentialStore,
  type CredentialBackend,
  type StoredCredential,
} from '../src/main/credential-store'

class MemoryBackend implements CredentialBackend {
  readonly values = new Map<string, string>()

  async get(account: string): Promise<string | undefined> {
    return this.values.get(account)
  }

  async set(account: string, value: string): Promise<void> {
    this.values.set(account, value)
  }

  async delete(account: string): Promise<boolean> {
    return this.values.delete(account)
  }

  async listAccounts(): Promise<string[]> {
    return [...this.values.keys()]
  }
}

const oauthCredential: StoredCredential = {
  version: 1,
  authKind: 'oauth',
  secret: 'opaque-token',
  deviceId: 'dev_2o9R3x8T1q4W',
  expiresAt: '2027-02-20T19:12:00.000Z',
}

describe('CredentialStore', () => {
  it('stores and loads an OAuth credential under its bare JID', async () => {
    const backend = new MemoryBackend()
    const store = new CredentialStore(backend)

    await store.save('emilien@xmpp.maer.fr', oauthCredential)

    await expect(store.load('emilien@xmpp.maer.fr')).resolves.toEqual(
      oauthCredential,
    )
    expect(backend.values.get('emilien@xmpp.maer.fr')).not.toBe('opaque-token')
  })

  it('lists only current-domain accounts without deleting legacy credentials', async () => {
    const backend = new MemoryBackend()
    const store = new CredentialStore(backend)

    await store.save('alice@xmpp.maer.fr', {
      version: 1,
      authKind: 'password',
      secret: 'correct horse battery staple',
    })
    backend.values.set(
      'legacy@contacts.chaumont.me',
      JSON.stringify({
        version: 1,
        authKind: 'password',
        secret: 'legacy-secret',
      }),
    )

    await expect(store.listAccounts()).resolves.toEqual(['alice@xmpp.maer.fr'])
    expect(JSON.stringify(await store.listAccounts())).not.toContain('correct horse')
    expect(backend.values.has('legacy@contacts.chaumont.me')).toBe(true)
  })

  it('fails closed for malformed stored data', async () => {
    const backend = new MemoryBackend()
    backend.values.set('alice@example.org', '{"version":1,"authKind":"oauth"}')
    const store = new CredentialStore(backend)

    await expect(store.load('alice@example.org')).rejects.toThrow(/invalide/i)
  })

  it('deletes a credential from the operating-system backend', async () => {
    const backend = new MemoryBackend()
    const store = new CredentialStore(backend)
    await store.save('alice@example.org', {
      version: 1,
      authKind: 'password',
      secret: 'temporary',
    })

    await expect(store.delete('alice@example.org')).resolves.toBe(true)
    await expect(store.load('alice@example.org')).resolves.toBeUndefined()
  })
})
