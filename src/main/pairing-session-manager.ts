import type { DesktopCredential } from '../shared/desktop-contract'
import type {
  PairingPollResult,
  PairingSigner,
} from './pairing-api'
import type { PairingSessionResponse } from '../shared/pairing-protocol'
import { createEphemeralPairingSigner } from './pairing-signer'

export interface PairingClient {
  createSession(deviceName: string): Promise<{
    session: PairingSessionResponse
    approvalUri: string
  }>
  poll(session: PairingSessionResponse): Promise<PairingPollResult>
  cancel(session: PairingSessionResponse): Promise<void>
}

export interface RendererPairingSession {
  sessionId: string
  approvalUri: string
  verificationCode: string
  expiresAt: string
}

export type RendererPairingPollResult =
  | { status: 'pending'; expiresAt?: string }
  | { status: 'rejected' | 'expired' }
  | { status: 'approved'; jid: string; credential: DesktopCredential }

interface ActiveSession {
  client: PairingClient
  session: PairingSessionResponse
}

export class PairingSessionManager {
  private readonly active = new Map<string, ActiveSession>()

  constructor(
    private readonly makeClient: (signer: PairingSigner) => PairingClient,
    private readonly makeSigner: () => PairingSigner = createEphemeralPairingSigner,
  ) {}

  async begin(deviceName: string): Promise<RendererPairingSession> {
    const cleanDeviceName = deviceName.trim().slice(0, 80)
    if (!cleanDeviceName) {
      throw new Error('Le nom de l’appareil est obligatoire.')
    }

    const signer = this.makeSigner()
    const client = this.makeClient(signer)
    const created = await client.createSession(cleanDeviceName)
    this.active.set(created.session.sessionId, {
      client,
      session: created.session,
    })

    return {
      sessionId: created.session.sessionId,
      approvalUri: created.approvalUri,
      verificationCode: created.session.verificationCode,
      expiresAt: created.session.expiresAt,
    }
  }

  async poll(sessionId: string): Promise<RendererPairingPollResult> {
    const active = this.active.get(sessionId)
    if (!active) {
      throw new Error('Session d’association inconnue ou expirée.')
    }

    const result = await active.client.poll(active.session)
    if (result.status === 'pending') {
      return {
        status: 'pending',
        expiresAt: result.expiresAt,
      }
    }

    this.active.delete(sessionId)
    if (result.status === 'approved') {
      return {
        status: 'approved',
        jid: result.jid,
        credential: {
          version: 1,
          authKind: 'oauth',
          secret: result.accessToken,
          deviceId: result.deviceId,
          expiresAt: result.tokenExpiresAt,
        },
      }
    }
    return { status: result.status }
  }

  async cancel(sessionId: string): Promise<void> {
    const active = this.active.get(sessionId)
    if (!active) return
    this.active.delete(sessionId)
    await active.client.cancel(active.session)
  }

  async cancelAll(): Promise<void> {
    const ids = [...this.active.keys()]
    await Promise.allSettled(ids.map((id) => this.cancel(id)))
  }
}
