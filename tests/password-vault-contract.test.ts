import { describe, expect, it } from 'vitest'
import {
  parsePasswordVaultRequest,
  parsePasswordVaultResponse,
} from '../src/plugins/password-vault/shared/contract'

const REQUEST_ID = '77ed591b-cb1e-4bb0-9f3d-c99e99b6ff42'
const ENTRY_ID = 'AQIDBAUGBwgJCgsMDQ4PEA=='

describe('Password Vault strict contract', () => {
  it('accepts and normalizes a bounded HTTPS entry request', () => {
    expect(
      parsePasswordVaultRequest({
        version: 1,
        requestId: REQUEST_ID.toUpperCase(),
        action: 'upsert',
        entry: {
          id: ENTRY_ID,
          title: 'Compte MAER',
          username: 'alice',
          url: 'https://example.test',
          password: { mode: 'replace', value: 'secret' },
        },
      }),
    ).toEqual({
      version: 1,
      requestId: REQUEST_ID,
      action: 'upsert',
      entry: {
        id: ENTRY_ID,
        title: 'Compte MAER',
        username: 'alice',
        url: 'https://example.test/',
        password: { mode: 'replace', value: 'secret' },
      },
    })
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
        action: 'upsert',
        entry: {
          id: null,
          title: 'Compte',
          username: '',
          url,
          password: { mode: 'replace', value: 'secret' },
        },
      }),
    ).toThrow(/url/i)
  })

  it('requires an explicit password replacement for new values', () => {
    expect(() =>
      parsePasswordVaultRequest({
        version: 1,
        requestId: REQUEST_ID,
        action: 'upsert',
        entry: {
          id: null,
          title: 'Compte',
          username: 'alice',
          url: 'https://example.test',
          password: { mode: 'replace', value: '' },
        },
      }),
    ).toThrow(/mot de passe/i)
    expect(() =>
      parsePasswordVaultRequest({
        version: 1,
        requestId: REQUEST_ID,
        action: 'upsert',
        entry: {
          id: null,
          title: 'Compte',
          username: 'alice',
          url: 'https://example.test',
          password: { mode: 'keep' },
        },
      }),
    ).toThrow(/nouvelle entrée/i)
  })

  it('accepts summaries without a secret', () => {
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
  })

  it('rejects a secret smuggled into status or list responses', () => {
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

  it('rejects non-plain request objects', () => {
    expect(() => parsePasswordVaultRequest(new Date())).toThrow(/objet simple/i)
  })

  it('rejects malformed error envelopes', () => {
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
