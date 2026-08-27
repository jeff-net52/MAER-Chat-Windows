import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Kdbx } from 'kdbxweb'
import {
  createPasswordVaultDatabase,
  wipePasswordVaultDatabase,
} from '../src/plugins/password-vault/main/kdbx-vault'
import {
  addPasswordVaultEntry,
  deletePasswordVaultEntry,
  listPasswordVaultEntries,
  passwordForClipboard,
  searchPasswordVaultEntries,
  updatePasswordVaultEntry,
} from '../src/plugins/password-vault/main/vault-entries'

describe('Password Vault KDBX entries', () => {
  let database: Kdbx

  beforeEach(async () => {
    database = await createPasswordVaultDatabase(new Uint8Array(32).fill(0x31))
  })

  afterEach(() => {
    wipePasswordVaultDatabase(database)
  })

  it('adds, lists and searches summaries without exposing passwords', () => {
    const added = addPasswordVaultEntry(database, {
      title: 'Firefox',
      username: 'alice@example.test',
      url: 'https://accounts.example.test/',
      password: 'First-Secret-234',
    })
    addPasswordVaultEntry(database, {
      title: 'MAER',
      username: 'bob',
      url: 'https://xmpp.maer.fr/',
      password: 'Second-Secret-567',
    })

    expect(added).not.toHaveProperty('password')
    expect(listPasswordVaultEntries(database).map((entry) => entry.title)).toEqual([
      'Firefox',
      'MAER',
    ])
    expect(searchPasswordVaultEntries(database, 'ALICE')).toMatchObject([
      { id: added.id, title: 'Firefox' },
    ])
    expect(searchPasswordVaultEntries(database, 'maer.fr')).toMatchObject([
      { title: 'MAER' },
    ])
  })

  it('updates metadata, optionally replaces a password and deletes to the recycle bin', () => {
    const added = addPasswordVaultEntry(database, {
      title: 'Compte',
      username: 'alice',
      url: 'https://example.test/',
      password: 'Original-Secret-1',
    })

    const kept = updatePasswordVaultEntry(database, {
      id: added.id,
      title: 'Compte principal',
      username: 'alice@example.test',
      url: 'https://example.test/login',
      password: { mode: 'keep' },
    })
    expect(kept.title).toBe('Compte principal')
    expect(passwordForClipboard(database, added.id)).toBe('Original-Secret-1')

    updatePasswordVaultEntry(database, {
      id: added.id,
      title: kept.title,
      username: kept.username,
      url: kept.url,
      password: { mode: 'replace', value: 'Replacement-Secret-2' },
    })
    expect(passwordForClipboard(database, added.id)).toBe('Replacement-Secret-2')

    deletePasswordVaultEntry(database, added.id)
    expect(listPasswordVaultEntries(database)).toEqual([])
    expect(() => passwordForClipboard(database, added.id)).toThrow(/introuvable/i)
  })

  it('rejects unknown ids without mutating the database', () => {
    expect(() => deletePasswordVaultEntry(database, 'AQIDBAUGBwgJCgsMDQ4PEA==')).toThrow(
      /introuvable/i,
    )
    expect(listPasswordVaultEntries(database)).toEqual([])
  })
})
