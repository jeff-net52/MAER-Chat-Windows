import { describe, expect, it } from 'vitest'
import { normalizeLoginJid } from '../src/shared/jid'

describe('normalizeLoginJid', () => {
  it('appends the MAER domain to a local username', () => {
    expect(normalizeLoginJid('  emilien  ', false, 'contacts.chaumont.me')).toBe(
      'emilien@contacts.chaumont.me',
    )
  })

  it('accepts a complete bare JID only in advanced mode', () => {
    expect(normalizeLoginJid('alice@example.org', true, 'contacts.chaumont.me')).toBe(
      'alice@example.org',
    )
  })

  it.each(['alice@example.org', 'alice/device', '', '   '])(
    'rejects invalid local-only input %j',
    (value) => {
      expect(() => normalizeLoginJid(value, false, 'contacts.chaumont.me')).toThrow()
    },
  )

  it.each(['alice', '@example.org', 'alice@example.org/device', 'alice@@example.org']) (
    'rejects invalid complete JID %j',
    (value) => {
      expect(() => normalizeLoginJid(value, true, 'contacts.chaumont.me')).toThrow()
    },
  )
})
