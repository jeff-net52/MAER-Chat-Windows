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
        advanced: false,
        remember: true,
      }),
    ).toEqual({
      jid: 'emilien@contacts.chaumont.me',
      password: 'not-logged-or-trimmed ',
      remember: true,
    })
  })

  it('rejects unexpected login shapes', () => {
    expect(() => parsePrepareLoginInput(null)).toThrow(/invalide/i)
    expect(() =>
      parsePrepareLoginInput({ identifier: 'alice', password: '', advanced: false }),
    ).toThrow(/mot de passe/i)
  })

  it('accepts only known credential kinds for validated storage', () => {
    expect(
      parseSaveCredentialInput({
        jid: 'alice@example.org',
        remember: true,
        credential: { version: 1, authKind: 'password', secret: 'abc' },
      }),
    ).toEqual({
      jid: 'alice@example.org',
      remember: true,
      credential: { version: 1, authKind: 'password', secret: 'abc' },
    })
    expect(() =>
      parseSaveCredentialInput({
        jid: 'alice@example.org',
        remember: true,
        credential: { version: 1, authKind: 'unknown', secret: 'abc' },
      }),
    ).toThrow(/invalide/i)
  })

  it('rejects XMPP resources in account-only calls', () => {
    expect(parseAccountInput('alice@example.org')).toBe('alice@example.org')
    expect(() => parseAccountInput('alice@example.org/desktop')).toThrow()
  })
})
