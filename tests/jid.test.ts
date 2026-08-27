import { describe, expect, it } from 'vitest'
import { normalizeAccountJid, normalizeLoginJid } from '../src/shared/jid'

describe('normalizeLoginJid', () => {
  it('appends the MAER domain to a local username', () => {
    expect(normalizeLoginJid('  emilien  ', 'xmpp.maer.fr')).toBe(
      'emilien@xmpp.maer.fr',
    )
  })

  it.each([
    'alice@xmpp.maer.fr',
    'alice/device',
    'alice@legacy.example',
    '',
    '   ',
  ])(
    'rejects non-local login input %j',
    (value) => {
      expect(() => normalizeLoginJid(value, 'xmpp.maer.fr')).toThrow()
    },
  )
})

describe('normalizeAccountJid', () => {
  it('accepts only a bare account on the MAER domain', () => {
    expect(normalizeAccountJid('alice@XMPP.MAER.FR', 'xmpp.maer.fr')).toBe(
      'alice@xmpp.maer.fr',
    )
  })

  it.each([
    'alice',
    '@xmpp.maer.fr',
    'alice@xmpp.maer.fr/desktop',
    'alice@@xmpp.maer.fr',
    'alice@legacy.example',
    'alice@example.org',
  ])(
    'rejects a non-MAER or non-bare account %j',
    (value) => {
      expect(() => normalizeAccountJid(value, 'xmpp.maer.fr')).toThrow()
    },
  )
})
