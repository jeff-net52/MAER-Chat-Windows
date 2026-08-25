import { createPublicKey, verify } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { createEphemeralPairingSigner } from '../src/main/pairing-signer'

describe('createEphemeralPairingSigner', () => {
  it('signs poll proofs with an Ed25519 key represented as SPKI DER', async () => {
    const signer = createEphemeralPairingSigner()
    const payload = 'MAER-PAIR-POLL\n1\nsession\nnonce\n2026-08-24T19:10:30.000Z'
    const signature = await signer.sign(payload)
    const publicKey = createPublicKey({
      key: Buffer.from(signer.publicKeyBase64, 'base64'),
      type: 'spki',
      format: 'der',
    })

    expect(publicKey.asymmetricKeyType).toBe('ed25519')
    expect(
      verify(null, Buffer.from(payload, 'utf8'), publicKey, Buffer.from(signature, 'base64')),
    ).toBe(true)
    expect(
      verify(null, Buffer.from(`${payload}!`, 'utf8'), publicKey, Buffer.from(signature, 'base64')),
    ).toBe(false)
  })

  it('creates a fresh key for each pairing attempt', () => {
    expect(createEphemeralPairingSigner().publicKeyBase64).not.toBe(
      createEphemeralPairingSigner().publicKeyBase64,
    )
  })
})
