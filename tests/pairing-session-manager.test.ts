import { describe, expect, it, vi } from 'vitest'
import {
  PairingSessionManager,
  type PairingClient,
} from '../src/main/pairing-session-manager'
import type { PairingSigner } from '../src/main/pairing-api'

function signer(): PairingSigner {
  return {
    publicKeyBase64: 'public-key',
    sign: vi.fn(async () => 'signature'),
  }
}

describe('PairingSessionManager', () => {
  it('keeps the private signer in main memory and exposes only public QR fields', async () => {
    const client: PairingClient = {
      createSession: vi.fn(async () => ({
        session: {
          version: 1 as const,
          sessionId: 'session_1234567890abcdef',
          verificationCode: '804261',
          expiresAt: '2026-08-24T22:12:00.000Z',
          pollNonce: 'nonce_1234567890abcdef',
        },
        approvalUri: 'xmpp:pair-session?session=session_1234567890abcdef',
      })),
      poll: vi.fn(),
      cancel: vi.fn(),
    }
    const manager = new PairingSessionManager(() => client, signer)

    const result = await manager.begin('PC Atelier')

    expect(result).toEqual({
      sessionId: 'session_1234567890abcdef',
      approvalUri: 'xmpp:pair-session?session=session_1234567890abcdef',
      verificationCode: '804261',
      expiresAt: '2026-08-24T22:12:00.000Z',
    })
    expect(JSON.stringify(result)).not.toMatch(/private|signature|nonce/i)
  })

  it('returns an approved credential once and destroys the ephemeral session', async () => {
    const client: PairingClient = {
      createSession: vi.fn(async () => ({
        session: {
          version: 1 as const,
          sessionId: 'session_1234567890abcdef',
          verificationCode: '804261',
          expiresAt: '2026-08-24T22:12:00.000Z',
          pollNonce: 'nonce_1234567890abcdef',
        },
        approvalUri: 'xmpp:pair-session?session=session_1234567890abcdef',
      })),
      poll: vi.fn(async () => ({
        status: 'approved' as const,
        jid: 'alice@contacts.chaumont.me',
        accessToken: 'opaque-device-token',
        deviceId: 'device-42',
        tokenExpiresAt: '2026-09-24T22:12:00.000Z',
      })),
      cancel: vi.fn(),
    }
    const manager = new PairingSessionManager(() => client, signer)
    await manager.begin('PC Atelier')

    await expect(manager.poll('session_1234567890abcdef')).resolves.toMatchObject({
      status: 'approved',
      credential: {
        version: 1,
        authKind: 'oauth',
        secret: 'opaque-device-token',
        deviceId: 'device-42',
      },
    })
    await expect(manager.poll('session_1234567890abcdef')).rejects.toThrow(/session/i)
  })

  it('invalidates sessions when the renderer cancels pairing', async () => {
    const client: PairingClient = {
      createSession: vi.fn(async () => ({
        session: {
          version: 1 as const,
          sessionId: 'session_1234567890abcdef',
          verificationCode: '804261',
          expiresAt: '2026-08-24T22:12:00.000Z',
          pollNonce: 'nonce_1234567890abcdef',
        },
        approvalUri: 'xmpp:pair-session?session=session_1234567890abcdef',
      })),
      poll: vi.fn(),
      cancel: vi.fn(async () => undefined),
    }
    const manager = new PairingSessionManager(() => client, signer)
    await manager.begin('PC Atelier')

    await manager.cancel('session_1234567890abcdef')

    expect(client.cancel).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: 'session_1234567890abcdef' }),
    )
    await expect(manager.poll('session_1234567890abcdef')).rejects.toThrow(/session/i)
  })
})
