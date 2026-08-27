import { describe, expect, it } from 'vitest'
import {
  assertGenericExternalUrlAllowed,
  isReservedMeetingOrigin,
} from '../src/main/external-url-policy'

describe('generic external URL policy', () => {
  it.each([
    'https://meet.jit.si/team-room',
    'https://meet.jit.si/MAER-1234567890123456',
    'https://meet.jit.si/MAER-1234567890123456?team=1',
    'https://meet.jit.si/MAER-1234567890123456#fragment',
    'https://meet.jit.si:443/MAER-1234567890123456',
  ])('reserves the entire exact Jitsi origin: %s', (url) => {
    expect(isReservedMeetingOrigin(url)).toBe(true)
    expect(() => assertGenericExternalUrlAllowed(url)).toThrow(/meeting window/i)
  })

  it.each([
    'https://meet.jit.si.evil.example/team-room',
    'https://meet.jit.si:444/team-room',
    'https://example.test/',
    'mailto:help@example.test',
  ])('does not confuse a different origin with Jitsi: %s', (url) => {
    expect(isReservedMeetingOrigin(url)).toBe(false)
  })
})
