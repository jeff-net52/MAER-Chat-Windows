export interface PairingSessionResponse {
  version: 1
  sessionId: string
  verificationCode: string
  expiresAt: string
  pollNonce: string
}

const OPAQUE_ID = /^[A-Za-z0-9_-]{16,128}$/u
const VERIFICATION_CODE = /^\d{6}$/u
const HOST = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/iu

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function parsePairingSession(value: unknown): PairingSessionResponse {
  if (!isRecord(value)) {
    throw new Error('Réponse d’association invalide')
  }
  if (value.version !== 1) {
    throw new Error('Version du protocole d’association non prise en charge')
  }
  if (typeof value.sessionId !== 'string' || !OPAQUE_ID.test(value.sessionId)) {
    throw new Error('Identifiant de session invalide')
  }
  if (
    typeof value.verificationCode !== 'string' ||
    !VERIFICATION_CODE.test(value.verificationCode)
  ) {
    throw new Error('Code de vérification invalide')
  }
  if (typeof value.pollNonce !== 'string' || !OPAQUE_ID.test(value.pollNonce)) {
    throw new Error('Nonce de consultation invalide')
  }
  if (
    typeof value.expiresAt !== 'string' ||
    Number.isNaN(Date.parse(value.expiresAt))
  ) {
    throw new Error('Expiration de session invalide')
  }

  return {
    version: 1,
    sessionId: value.sessionId,
    verificationCode: value.verificationCode,
    expiresAt: value.expiresAt,
    pollNonce: value.pollNonce,
  }
}

export function createApprovalUri(
  session: PairingSessionResponse,
  host: string,
): string {
  const normalizedHost = host.trim().toLowerCase()
  if (!HOST.test(normalizedHost)) {
    throw new Error('Hôte d’association invalide')
  }
  const params = new URLSearchParams()
  params.set('code', session.verificationCode)
  params.set('host', normalizedHost)
  params.set('sid', session.sessionId)
  params.set('v', String(session.version))
  return `maerchat://pair?${params.toString()}`
}

function createProofPayload(
  action: 'POLL' | 'CANCEL',
  sessionId: string,
  pollNonce: string,
  timestamp: string,
): string {
  if (!OPAQUE_ID.test(sessionId) || !OPAQUE_ID.test(pollNonce)) {
    throw new Error('Preuve d’association invalide')
  }
  if (Number.isNaN(Date.parse(timestamp))) {
    throw new Error('Horodatage de preuve invalide')
  }
  return [`MAER-PAIR-${action}`, '1', sessionId, pollNonce, timestamp].join('\n')
}

export function createPollProofPayload(
  sessionId: string,
  pollNonce: string,
  timestamp: string,
): string {
  return createProofPayload('POLL', sessionId, pollNonce, timestamp)
}

export function createCancelProofPayload(
  sessionId: string,
  pollNonce: string,
  timestamp: string,
): string {
  return createProofPayload('CANCEL', sessionId, pollNonce, timestamp)
}
