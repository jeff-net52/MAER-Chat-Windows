import { describe, expect, it } from 'vitest'
import {
  parsePasswordVaultRequest,
  parsePasswordVaultResponse,
} from '../src/plugins/password-vault/shared/contract'

const REQUEST_ID = '77ed591b-cb1e-4bb0-9f3d-c99e99b6ff42'
const ENTRY_ID = 'AQIDBAUGBwgJCgsMDQ4PEA=='

describe('Password Vault strict contract', () => {
  it('accepts and normalizes bounded add, update and search requests', () => {
    expect(
      parsePasswordVaultRequest({
        version: 1,
        requestId: REQUEST_ID.toUpperCase(),
        action: 'add',
        entry: {
          title: 'Compte MAER',
          username: 'alice',
          url: 'https://example.test',
          password: 'secret',
        },
      }),
    ).toEqual({
      version: 1,
      requestId: REQUEST_ID,
      action: 'add',
      entry: {
        title: 'Compte MAER',
        username: 'alice',
        url: 'https://example.test/',
        password: 'secret',
      },
    })
    expect(
      parsePasswordVaultRequest({
        version: 1,
        requestId: REQUEST_ID,
        action: 'update',
        entry: {
          id: ENTRY_ID,
          title: 'Compte MAER',
          username: 'alice',
          url: 'https://example.test',
          password: { mode: 'keep' },
        },
      }),
    ).toMatchObject({ action: 'update', entry: { id: ENTRY_ID } })
    expect(
      parsePasswordVaultRequest({
        version: 1,
        requestId: REQUEST_ID,
        action: 'search',
        query: '  maer  ',
      }),
    ).toMatchObject({ action: 'search', query: 'maer' })
  })

  it('rejects unknown, missing and legacy fields', () => {
    expect(() =>
      parsePasswordVaultRequest({
        version: 1,
        requestId: REQUEST_ID,
        action: 'status',
        secret: 'must-not-cross',
      }),
    ).toThrow(/champ inconnu/i)
    expect(() =>
      parsePasswordVaultRequest({ version: 1, requestId: REQUEST_ID }),
    ).toThrow(/action/i)
    expect(() =>
      parsePasswordVaultRequest({
        version: 1,
        requestId: REQUEST_ID,
        action: 'reveal',
        entryId: ENTRY_ID,
      }),
    ).toThrow(/action/i)
    expect(() =>
      parsePasswordVaultRequest({
        version: 1,
        requestId: REQUEST_ID,
        action: 'open-extension-folder',
        path: 'C:\\Windows',
      }),
    ).toThrow(/champ inconnu/i)
  })

  it('accepts only path-free browser-extension actions and correlated acknowledgements', () => {
    expect(
      parsePasswordVaultRequest({
        version: 1,
        requestId: REQUEST_ID,
        action: 'open-extension-folder',
      }),
    ).toEqual({
      version: 1,
      requestId: REQUEST_ID,
      action: 'open-extension-folder',
    })
    expect(
      parsePasswordVaultResponse({
        version: 1,
        requestId: REQUEST_ID,
        ok: true,
        action: 'open-extension-guide',
        result: { target: 'guide', opened: true },
      }),
    ).toMatchObject({
      ok: true,
      action: 'open-extension-guide',
      result: { target: 'guide', opened: true },
    })
    expect(() =>
      parsePasswordVaultResponse({
        version: 1,
        requestId: REQUEST_ID,
        ok: true,
        action: 'open-extension-guide',
        result: { target: 'folder', opened: true },
      }),
    ).toThrow(/invalide/i)
  })

  it.each([
    'http://example.test',
    'https://alice:secret@example.test',
    'not-a-url',
  ])('rejects unsafe URL %j', (url) => {
    expect(() =>
      parsePasswordVaultRequest({
        version: 1,
        requestId: REQUEST_ID,
        action: 'add',
        entry: {
          title: 'Compte',
          username: '',
          url,
          password: 'secret',
        },
      }),
    ).toThrow(/url/i)
  })

  it('requires non-empty bounded secrets and generator lengths', () => {
    expect(() =>
      parsePasswordVaultRequest({
        version: 1,
        requestId: REQUEST_ID,
        action: 'add',
        entry: {
          title: 'Compte',
          username: 'alice',
          url: 'https://example.test',
          password: '',
        },
      }),
    ).toThrow(/mot de passe/i)
    expect(() =>
      parsePasswordVaultRequest({
        version: 1,
        requestId: REQUEST_ID,
        action: 'generate',
        length: 8,
      }),
    ).toThrow(/longueur/i)
    expect(() =>
      parsePasswordVaultRequest({
        version: 1,
        requestId: REQUEST_ID,
        action: 'update',
        entry: {
          id: ENTRY_ID,
          title: 'Compte',
          username: 'alice',
          url: 'https://example.test',
          password: { mode: 'replace', value: '' },
        },
      }),
    ).toThrow(/mot de passe/i)
  })

  it('accepts secret-free lists and clipboard acknowledgements', () => {
    expect(
      parsePasswordVaultResponse({
        version: 1,
        requestId: REQUEST_ID,
        ok: true,
        action: 'list',
        result: [
          {
            id: ENTRY_ID,
            title: 'Compte',
            username: 'alice',
            url: 'https://example.test/',
            updatedAt: '2026-08-27T12:00:00.000Z',
          },
        ],
      }),
    ).toMatchObject({ ok: true, action: 'list' })
    expect(
      parsePasswordVaultResponse({
        version: 1,
        requestId: REQUEST_ID,
        ok: true,
        action: 'copy',
        result: { entryId: ENTRY_ID, copied: true, clearAfterSeconds: 30 },
      }),
    ).toMatchObject({ ok: true, action: 'copy' })
  })

  it('rejects a secret smuggled into status, list or copy responses', () => {
    expect(() =>
      parsePasswordVaultResponse({
        version: 1,
        requestId: REQUEST_ID,
        ok: true,
        action: 'status',
        result: { state: 'locked', entryCount: null, password: 'secret' },
      }),
    ).toThrow(/champ inconnu/i)
    expect(() =>
      parsePasswordVaultResponse({
        version: 1,
        requestId: REQUEST_ID,
        ok: true,
        action: 'list',
        result: [
          {
            id: ENTRY_ID,
            title: 'Compte',
            username: 'alice',
            url: 'https://example.test/',
            updatedAt: '2026-08-27T12:00:00.000Z',
            password: 'secret',
          },
        ],
      }),
    ).toThrow(/champ inconnu/i)
    expect(() =>
      parsePasswordVaultResponse({
        version: 1,
        requestId: REQUEST_ID,
        ok: true,
        action: 'copy',
        result: {
          entryId: ENTRY_ID,
          copied: true,
          clearAfterSeconds: 30,
          password: 'secret',
        },
      }),
    ).toThrow(/champ inconnu/i)
  })

  it('does not expose entry counts while locked', () => {
    expect(() =>
      parsePasswordVaultResponse({
        version: 1,
        requestId: REQUEST_ID,
        ok: true,
        action: 'status',
        result: { state: 'locked', entryCount: 3 },
      }),
    ).toThrow(/verrouillage/i)
    expect(() =>
      parsePasswordVaultResponse({
        version: 1,
        requestId: REQUEST_ID,
        ok: true,
        action: 'status',
        result: { state: 'unlocked', entryCount: null },
      }),
    ).toThrow(/verrouillage/i)
  })

  it('rejects non-plain request objects and malformed errors', () => {
    expect(() => parsePasswordVaultRequest(new Date())).toThrow(/objet simple/i)
    expect(() =>
      parsePasswordVaultResponse({
        version: 1,
        requestId: REQUEST_ID,
        ok: false,
        error: { code: 'unknown', message: 'Nope' },
      }),
    ).toThrow(/code d.erreur/i)
  })
})
