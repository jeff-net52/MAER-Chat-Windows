import { normalizeLoginJid } from '../shared/jid'
import {
  createCancelProofPayload,
  createPollProofPayload,
  parsePairingSession,
  type PairingSessionResponse,
} from '../shared/pairing-protocol'

export interface PairingSigner {
  publicKeyBase64: string
  sign(payload: string): Promise<string>
}

export type PairingPollResult =
  | { status: 'pending'; expiresAt: string }
  | {
      status: 'approved'
      jid: string
      accessToken: string
      tokenExpiresAt: string
      deviceId: string
    }
  | { status: 'rejected' | 'expired' }

type FetchLike = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>

function record(value: unknown, message: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(message)
  }
  return value as Record<string, unknown>
}

function requiredString(
  value: unknown,
  field: string,
  pattern?: RegExp,
): string {
  if (typeof value !== 'string' || value.length === 0 || (pattern && !pattern.test(value))) {
    throw new Error(`Champ d’association invalide : ${field}`)
  }
  return value
}

function requiredDate(value: unknown, field: string): string {
  const text = requiredString(value, field)
  if (Number.isNaN(Date.parse(text))) {
    throw new Error(`Date d’association invalide : ${field}`)
  }
  return text
}

export class PairingApiClient {
  readonly #baseUrl: URL
  readonly #fetcher: FetchLike
  readonly #now: () => Date

  constructor(
    baseUrl: string,
    fetcher: FetchLike = fetch,
    now: () => Date = () => new Date(),
  ) {
    const parsed = new URL(baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`)
    if (parsed.protocol !== 'https:') {
      throw new Error('L’association exige une adresse HTTPS')
    }
    if (parsed.username || parsed.password) {
      throw new Error('Les identifiants ne doivent pas figurer dans l’adresse HTTPS')
    }
    this.#baseUrl = parsed
    this.#fetcher = fetcher
    this.#now = now
  }

  async createSession(
    signer: PairingSigner,
    deviceName: string,
    appVersion: string,
  ): Promise<PairingSessionResponse> {
    const response = await this.#post('sessions', {
      protocol_version: 1,
      client_public_key: requiredString(signer.publicKeyBase64, 'client_public_key'),
      device_name: requiredString(deviceName.trim(), 'device_name'),
      platform: 'windows',
      app_version: requiredString(appVersion, 'app_version'),
    })

    return parsePairingSession({
      version: response.version,
      sessionId: response.session_id,
      verificationCode: response.verification_code,
      expiresAt: response.expires_at,
      pollNonce: response.poll_nonce,
    })
  }

  async poll(
    signer: PairingSigner,
    sessionId: string,
    pollNonce: string,
  ): Promise<PairingPollResult> {
    const timestamp = this.#now().toISOString()
    const payload = createPollProofPayload(sessionId, pollNonce, timestamp)
    const signature = await signer.sign(payload)
    const response = await this.#post(`sessions/${encodeURIComponent(sessionId)}/poll`, {
      nonce: pollNonce,
      timestamp,
      signature: requiredString(signature, 'signature'),
    })
    const status = requiredString(response.status, 'status')

    if (status === 'pending') {
      return { status, expiresAt: requiredDate(response.expires_at, 'expires_at') }
    }
    if (status === 'rejected' || status === 'expired') {
      return { status }
    }
    if (status !== 'approved') {
      throw new Error('État d’association inconnu')
    }

    const jid = normalizeLoginJid(
      requiredString(response.jid, 'jid'),
      true,
      'contacts.chaumont.me',
    )
    return {
      status,
      jid,
      accessToken: requiredString(response.access_token, 'access_token'),
      tokenExpiresAt: requiredDate(response.token_expires_at, 'token_expires_at'),
      deviceId: requiredString(response.device_id, 'device_id', /^[A-Za-z0-9_-]{8,128}$/u),
    }
  }

  async cancel(
    signer: PairingSigner,
    sessionId: string,
    pollNonce: string,
  ): Promise<void> {
    const timestamp = this.#now().toISOString()
    const signature = await signer.sign(
      createCancelProofPayload(sessionId, pollNonce, timestamp),
    )
    const response = await this.#post(`sessions/${encodeURIComponent(sessionId)}/cancel`, {
      nonce: pollNonce,
      timestamp,
      signature: requiredString(signature, 'signature'),
    })
    if (response.status !== 'cancelled') {
      throw new Error('Le service n’a pas confirmé l’annulation de l’association.')
    }
  }

  async #post(path: string, body: Record<string, unknown>): Promise<Record<string, unknown>> {
    const response = await this.#fetcher(new URL(path, this.#baseUrl), {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
      redirect: 'error',
      cache: 'no-store',
      credentials: 'omit',
    })
    if (!response.ok) {
      throw new Error(`Le service d’association a répondu ${response.status}`)
    }
    const contentType = response.headers.get('content-type') ?? ''
    if (!contentType.toLowerCase().includes('application/json')) {
      throw new Error('Le service d’association a renvoyé un format inattendu')
    }
    return record(await response.json(), 'Réponse du service d’association invalide')
  }
}
