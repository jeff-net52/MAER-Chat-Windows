import { normalizeAccountJid, normalizeLoginJid } from './jid'
import { MAER_ACCOUNT_DOMAIN, MAER_MEETING_ORIGIN } from './service-config'

export type DesktopMeetingMode = 'audio' | 'video' | 'screen'

export interface DesktopMeetingRequest {
  url: string
  mode: DesktopMeetingMode
  issuedAt: string
  expiresAt: string
  room: string
}

const MEETING_TTL_MS = 2 * 60 * 60 * 1_000
const MEETING_CLOCK_SKEW_MS = 5 * 60 * 1_000

export interface DesktopCredential {
  version: 1
  authKind: 'password' | 'oauth'
  secret: string
  deviceId?: string
  expiresAt?: string
}

export interface PreparedPasswordLogin {
  jid: string
  password: string
  remember: boolean
}

export interface SaveCredentialInput {
  jid: string
  remember: boolean
  credential: DesktopCredential
}

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('Requête du client invalide')
  }
  return value as Record<string, unknown>
}

function requiredBoolean(value: unknown, field: string): boolean {
  if (typeof value !== 'boolean') {
    throw new Error(`Champ invalide : ${field}`)
  }
  return value
}

function requireOnlyKeys(
  input: Record<string, unknown>,
  allowedKeys: readonly string[],
): void {
  const allowed = new Set(allowedKeys)
  if (Object.keys(input).some((key) => !allowed.has(key))) {
    throw new Error('La requête contient un champ non autorisé')
  }
}

export function parseAccountInput(value: unknown): string {
  if (typeof value !== 'string') {
    throw new Error('Compte XMPP invalide')
  }
  return normalizeAccountJid(value, MAER_ACCOUNT_DOMAIN)
}

export function parsePrepareLoginInput(value: unknown): PreparedPasswordLogin {
  const input = asRecord(value)
  requireOnlyKeys(input, ['identifier', 'password', 'remember'])
  if (
    typeof input.identifier !== 'string' ||
    typeof input.password !== 'string' ||
    input.password.length === 0
  ) {
    throw new Error('Identifiant ou mot de passe invalide')
  }
  const remember = requiredBoolean(input.remember, 'remember')
  return {
    jid: normalizeLoginJid(input.identifier, MAER_ACCOUNT_DOMAIN),
    password: input.password,
    remember,
  }
}

function parseCredential(value: unknown): DesktopCredential {
  const credential = asRecord(value)
  if (
    credential.version !== 1 ||
    (credential.authKind !== 'password' && credential.authKind !== 'oauth') ||
    typeof credential.secret !== 'string' ||
    credential.secret.length === 0
  ) {
    throw new Error('Identifiant sécurisé invalide')
  }

  if (credential.authKind === 'oauth') {
    if (
      typeof credential.deviceId !== 'string' ||
      credential.deviceId.length === 0 ||
      typeof credential.expiresAt !== 'string' ||
      Number.isNaN(Date.parse(credential.expiresAt))
    ) {
      throw new Error('Jeton d’appareil invalide')
    }
    return {
      version: 1,
      authKind: 'oauth',
      secret: credential.secret,
      deviceId: credential.deviceId,
      expiresAt: credential.expiresAt,
    }
  }

  return {
    version: 1,
    authKind: 'password',
    secret: credential.secret,
  }
}

export function parseSaveCredentialInput(value: unknown): SaveCredentialInput {
  const input = asRecord(value)
  return {
    jid: parseAccountInput(input.jid),
    remember: requiredBoolean(input.remember, 'remember'),
    credential: parseCredential(input.credential),
  }
}

export function parseMeetingInput(value: unknown): DesktopMeetingRequest {
  const input = asRecord(value)
  requireOnlyKeys(input, ['url', 'mode', 'issuedAt', 'expiresAt', 'room'])
  if (input.mode !== 'audio' && input.mode !== 'video' && input.mode !== 'screen') {
    throw new Error('Mode de réunion invalide')
  }
  if (
    typeof input.url !== 'string' ||
    input.url.length > 2_048 ||
    typeof input.issuedAt !== 'string' ||
    typeof input.expiresAt !== 'string' ||
    typeof input.room !== 'string' ||
    !/^MAER-[A-Za-z0-9]{16,128}$/u.test(input.room)
  ) {
    throw new Error('Adresse de réunion invalide')
  }
  let url: URL
  try {
    url = new URL(input.url)
  } catch {
    throw new Error('Adresse de réunion invalide')
  }
  const allowed = new URL(MAER_MEETING_ORIGIN)
  const issued = Date.parse(input.issuedAt)
  const expires = Date.parse(input.expiresAt)
  const now = Date.now()
  if (
    input.url !== url.toString() ||
    url.protocol !== 'https:' ||
    url.origin !== allowed.origin ||
    url.username ||
    url.password ||
    url.search ||
    url.pathname !== `/${input.room}` ||
    (input.mode === 'video'
      ? url.hash !== ''
      : url.hash !== '#config.startWithVideoMuted=true') ||
    !Number.isFinite(issued) ||
    !Number.isFinite(expires) ||
    new Date(issued).toISOString() !== input.issuedAt ||
    new Date(expires).toISOString() !== input.expiresAt ||
    expires - issued !== MEETING_TTL_MS ||
    now >= expires ||
    now < issued - MEETING_CLOCK_SKEW_MS
  ) {
    throw new Error('Adresse de réunion non autorisée')
  }
  return Object.freeze({
    url: url.toString(),
    mode: input.mode,
    issuedAt: input.issuedAt,
    expiresAt: input.expiresAt,
    room: input.room,
  })
}
