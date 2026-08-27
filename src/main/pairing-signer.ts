import { generateKeyPairSync, sign } from 'node:crypto'
import type { PairingSigner } from './pairing-api'

export function createEphemeralPairingSigner(): PairingSigner {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519')
  const publicKeyBase64 = publicKey
    .export({ type: 'spki', format: 'der' })
    .toString('base64')

  return {
    publicKeyBase64,
    async sign(payload: string): Promise<string> {
      return sign(null, Buffer.from(payload, 'utf8'), privateKey).toString('base64')
    },
  }
}
