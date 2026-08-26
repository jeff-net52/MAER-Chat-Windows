import { describe, expect, it, vi } from 'vitest'
import { PairingApiClient, type PairingSigner } from '../src/main/pairing-api'

const signer: PairingSigner = {
  publicKeyBase64: 'MCowBQYDK2VwAyEATestPublicKey0000000000000000000000=',
  sign: vi.fn(async () => 'signed-proof-base64'),
}

describe('PairingApiClient', () => {
  it('creates a short-lived session without sending credentials', async () => {
    const fetcher = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      expect(init?.method).toBe('POST')
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>
      expect(body).toMatchObject({
        protocol_version: 1,
        client_public_key: signer.publicKeyBase64,
        device_name: 'PC Atelier',
        platform: 'windows',
      })
      expect(JSON.stringify(body)).not.toMatch(/password|access_token/i)
      return new Response(
        JSON.stringify({
          version: 1,
          session_id: 'S1M4g7D8u2kL9pQ3xY6w',
          verification_code: '482913',
          expires_at: '2026-08-24T19:12:00.000Z',
          poll_nonce: 'eS2M0j5Yh9T4w8Qv',
        }),
        { status: 201, headers: { 'content-type': 'application/json' } },
      )
    })
    const client = new PairingApiClient(
      'https://xmpp.maer.fr/maer-pairing/v1',
      fetcher,
    )

    const session = await client.createSession(signer, 'PC Atelier', '1.0.0')

    expect(session.sessionId).toBe('S1M4g7D8u2kL9pQ3xY6w')
    expect(fetcher).toHaveBeenCalledOnce()
  })

  it('signs every poll and returns a revocable OAuth credential', async () => {
    const fetcher = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>
      expect(body.signature).toBe('signed-proof-base64')
      expect(body.nonce).toBe('eS2M0j5Yh9T4w8Qv')
      return new Response(
        JSON.stringify({
          status: 'approved',
          jid: 'emilien@xmpp.maer.fr',
          access_token: 'opaque-oauth-token',
          token_expires_at: '2027-02-20T19:12:00.000Z',
          device_id: 'dev_2o9R3x8T1q4W',
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      )
    })
    const client = new PairingApiClient(
      'https://xmpp.maer.fr/maer-pairing/v1',
      fetcher,
      () => new Date('2026-08-24T19:10:30.000Z'),
    )

    const result = await client.poll(
      signer,
      'S1M4g7D8u2kL9pQ3xY6w',
      'eS2M0j5Yh9T4w8Qv',
    )

    expect(result).toEqual({
      status: 'approved',
      jid: 'emilien@xmpp.maer.fr',
      accessToken: 'opaque-oauth-token',
      tokenExpiresAt: '2027-02-20T19:12:00.000Z',
      deviceId: 'dev_2o9R3x8T1q4W',
    })
    expect(signer.sign).toHaveBeenCalledWith(
      'MAER-PAIR-POLL\n1\nS1M4g7D8u2kL9pQ3xY6w\neS2M0j5Yh9T4w8Qv\n2026-08-24T19:10:30.000Z',
    )
  })

  it('rejects a QR approval for an account on an old domain', async () => {
    const fetcher = vi.fn(async () =>
      new Response(
        JSON.stringify({
          status: 'approved',
          jid: 'emilien@legacy.example',
          access_token: 'opaque-oauth-token',
          token_expires_at: '2027-02-20T19:12:00.000Z',
          device_id: 'dev_2o9R3x8T1q4W',
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    )
    const client = new PairingApiClient(
      'https://xmpp.maer.fr/maer-pairing/v1',
      fetcher,
    )

    await expect(
      client.poll(signer, 'S1M4g7D8u2kL9pQ3xY6w', 'eS2M0j5Yh9T4w8Qv'),
    ).rejects.toThrow(/domaine/i)
  })

  it('keeps pending responses free of credentials', async () => {
    const fetcher = vi.fn(async () =>
      new Response(
        JSON.stringify({
          status: 'pending',
          expires_at: '2026-08-24T19:12:00.000Z',
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    )
    const client = new PairingApiClient(
      'https://xmpp.maer.fr/maer-pairing/v1',
      fetcher,
    )

    await expect(
      client.poll(signer, 'S1M4g7D8u2kL9pQ3xY6w', 'eS2M0j5Yh9T4w8Qv'),
    ).resolves.toEqual({
      status: 'pending',
      expiresAt: '2026-08-24T19:12:00.000Z',
    })
  })

  it('cancels a session with a signed proof', async () => {
    const fetcher = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      expect(String(url)).toContain('/sessions/S1M4g7D8u2kL9pQ3xY6w/cancel')
      expect(init?.method).toBe('POST')
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>
      expect(body).toMatchObject({
        nonce: 'eS2M0j5Yh9T4w8Qv',
        timestamp: '2026-08-24T19:10:30.000Z',
        signature: 'signed-proof-base64',
      })
      return new Response(JSON.stringify({ status: 'cancelled' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    })
    const client = new PairingApiClient(
      'https://xmpp.maer.fr/maer-pairing/v1',
      fetcher,
      () => new Date('2026-08-24T19:10:30.000Z'),
    )

    await client.cancel(signer, 'S1M4g7D8u2kL9pQ3xY6w', 'eS2M0j5Yh9T4w8Qv')

    expect(signer.sign).toHaveBeenCalledWith(
      'MAER-PAIR-CANCEL\n1\nS1M4g7D8u2kL9pQ3xY6w\neS2M0j5Yh9T4w8Qv\n2026-08-24T19:10:30.000Z',
    )
  })

  it('fails closed on a non-HTTPS endpoint', () => {
    expect(
      () => new PairingApiClient('http://xmpp.maer.fr/maer-pairing/v1'),
    ).toThrow(/HTTPS/i)
  })
})
