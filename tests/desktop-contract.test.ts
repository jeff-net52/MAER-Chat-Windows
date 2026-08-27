import { describe, expect, it } from 'vitest'
import {
  parseAccountInput,
  parseMeetingInput,
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

  it('allows only opaque MAER rooms on the configured HTTPS meeting origin', () => {
    const issuedAt = new Date(Date.now() - 60_000).toISOString()
    const expiresAt = new Date(Date.parse(issuedAt) + 2 * 60 * 60 * 1_000).toISOString()
    const room = 'MAER-1234567890abcdef'
    expect(
      parseMeetingInput({
        url: `https://meet.jit.si/${room}#config.startWithVideoMuted=true`,
        mode: 'screen',
        issuedAt,
        expiresAt,
        room,
      }),
    ).toMatchObject({ mode: 'screen' })

    for (const url of [
      `http://meet.jit.si/${room}`,
      `https://evil.example/${room}`,
      'https://meet.jit.si/not-a-maer-room',
      `https://alice:secret@meet.jit.si/${room}`,
      `https://meet.jit.si:443/${room}`,
      `https://meet.jit.si/${room}?team=1`,
      `https://meet.jit.si/${room}/extra`,
      `https://meet.jit.si/${room}#config.startWithVideoMuted=true`,
    ]) {
      expect(() => parseMeetingInput({ url, mode: 'video', issuedAt, expiresAt, room })).toThrow(/réunion/i)
    }
    expect(() =>
      parseMeetingInput({
        url: `https://meet.jit.si/${room}`,
        mode: 'video',
        issuedAt,
        expiresAt,
        room,
        unsafe: true,
      }),
    ).toThrow(/champ non autorisé/i)

    for (const tampered of [
      { issuedAt: issuedAt.replace(/\.\d{3}Z$/u, 'Z') },
      { expiresAt: new Date(Date.parse(expiresAt) + 1).toISOString() },
      { room: 'MAER-aaaaaaaaaaaaaaaa' },
      { mode: 'audio', url: `https://meet.jit.si/${room}` },
    ]) {
      expect(() => parseMeetingInput({
        url: `https://meet.jit.si/${room}`,
        mode: 'video',
        issuedAt,
        expiresAt,
        room,
        ...tampered,
      })).toThrow(/réunion/i)
    }
  })
})
