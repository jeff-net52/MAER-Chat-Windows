import { describe, expect, it } from 'vitest'
import {
  createApprovalUri,
  createPollProofPayload,
  parsePairingSession,
  type PairingSessionResponse,
} from '../src/shared/pairing-protocol'

const response: PairingSessionResponse = {
  version: 1,
  sessionId: 'S1M4g7D8u2kL9pQ3xY6w',
  verificationCode: '482913',
  expiresAt: '2026-08-24T19:12:00.000Z',
  pollNonce: 'eS2M0j5Yh9T4w8Qv',
}

describe('pairing protocol', () => {
  it('creates a password-free QR URI bound to the MAER host', () => {
    const uri = createApprovalUri(response, 'contacts.chaumont.me')

    expect(uri).toBe(
      'maerchat://pair?code=482913&host=contacts.chaumont.me&sid=S1M4g7D8u2kL9pQ3xY6w&v=1',
    )
    expect(uri).not.toContain('password')
    expect(uri).not.toContain('token')
  })

  it('canonicalizes the signed poll payload', () => {
    expect(
      createPollProofPayload(
        response.sessionId,
        response.pollNonce,
        '2026-08-24T19:10:30.000Z',
      ),
    ).toBe(
      'MAER-PAIR-POLL\n1\nS1M4g7D8u2kL9pQ3xY6w\neS2M0j5Yh9T4w8Qv\n2026-08-24T19:10:30.000Z',
    )
  })

  it('validates a server response before displaying its QR code', () => {
    expect(parsePairingSession(response)).toEqual(response)
    expect(() =>
      parsePairingSession({ ...response, verificationCode: '123' }),
    ).toThrow(/v.rification/i)
    expect(() => parsePairingSession({ ...response, version: 2 })).toThrow(/version/i)
  })
})
