import { describe, expect, it } from 'vitest'
import {
  parseAccountInput,
  parsePrepareLoginInput,
  parseSaveCredentialInput,
} from '../src/shared/desktop-contract'

describe('desktop IPC contract', () => {
  it('normalizes password-login input and keeps the password ephemeral', () => {
    expect(
      parsePrepareLoginInput({
        identifier: ' emilien ',
        password: 'not-logged-or-trimmed ',
        remember: true,
      }),
    ).toEqual({
      jid: 'emilien@xmpp.maer.fr',
      password: 'not-logged-or-trimmed ',
      remember: true,
    })
  })

  it('rejects unexpected login shapes', () => {
    expect(() => parsePrepareLoginInput(null)).toThrow(/invalide/i)
    expect(() =>
      parsePrepareLoginInput({ identifier: 'alice', password: '', remember: false }),
    ).toThrow(/mot de passe/i)
  })

  it('rejects the removed advanced-JID IPC field', () => {
    expect(() =>
      parsePrepareLoginInput({
        identifier: 'alice',
        password: 'secret',
        remember: false,
        advanced: false,
      }),
    ).toThrow(/champ non autorisé/i)
  })

  it.each([
    'alice@xmpp.maer.fr',
    'alice/desktop',
    'alice@legacy.example',
  ])('rejects non-local password-login identifier %j', (identifier) => {
    expect(() =>
      parsePrepareLoginInput({
        identifier,
        password: 'secret',
        remember: false,
      }),
    ).toThrow(/identifiant local/i)
  })

  it('accepts only known credential kinds for validated storage', () => {
    expect(
      parseSaveCredentialInput({
        jid: 'alice@xmpp.maer.fr',
        remember: true,
        credential: { version: 1, authKind: 'password', secret: 'abc' },
      }),
    ).toEqual({
      jid: 'alice@xmpp.maer.fr',
      remember: true,
      credential: { version: 1, authKind: 'password', secret: 'abc' },
    })
    expect(() =>
      parseSaveCredentialInput({
        jid: 'alice@xmpp.maer.fr',
        remember: true,
        credential: { version: 1, authKind: 'unknown', secret: 'abc' },
      }),
    ).toThrow(/invalide/i)
  })

  it('accepts only bare accounts on the current MAER domain', () => {
    expect(parseAccountInput('alice@xmpp.maer.fr')).toBe('alice@xmpp.maer.fr')
    expect(() => parseAccountInput('alice@xmpp.maer.fr/desktop')).toThrow()
    expect(() => parseAccountInput('alice@legacy.example')).toThrow(/domaine/i)
    expect(() => parseAccountInput('alice@example.org')).toThrow(/domaine/i)
  })
})
