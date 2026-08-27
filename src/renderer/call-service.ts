export type CallMode = 'audio' | 'video' | 'screen'

export interface CallConversation {
  get(name: 'jid'): unknown
  sendMessage(attributes: { body: string }): Promise<unknown>
}

export interface StartedCall {
  mode: CallMode
  targetJid: string
  meetingUrl: string
  startedAt: string
  expiresAt: string
  room: string
}

export interface IncomingCallInvitation {
  mode: CallMode
  meetingUrl: string
  issuedAt: string
  expiresAt: string
  room: string
}

export { MAER_MEETING_ORIGIN as DEFAULT_MEETING_ORIGIN } from '../shared/service-config'
import { MAER_MEETING_ORIGIN } from '../shared/service-config'

export const MEETING_HISTORY_TTL_MS = 2 * 60 * 60 * 1_000

const CALL_MESSAGE_LABELS: Record<CallMode, string> = {
  audio: 'Appel audio MAER — Invitation envoyée via la conversation XMPP.',
  video: 'Appel vidéo MAER — Invitation envoyée via la conversation XMPP.',
  screen: "Partage d’écran MAER — Invitation envoyée via la conversation XMPP.",
}

const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u
const ROOM = /^MAER-[A-Za-z0-9]{16,128}$/u

function secureMeetingOrigin(raw: string): URL {
  const origin = new URL(raw)
  if (origin.protocol !== 'https:' || origin.username || origin.password) {
    throw new Error('Le serveur de visioconférence doit utiliser HTTPS.')
  }
  return origin
}

export function createMeetingUrl(
  mode: CallMode,
  roomToken: string = crypto.randomUUID(),
  meetingOrigin = MAER_MEETING_ORIGIN,
): string {
  const sanitizedToken = roomToken.replace(/[^a-zA-Z0-9]/gu, '')
  if (sanitizedToken.length < 16) {
    throw new Error('Identifiant de réunion insuffisamment robuste.')
  }

  const url = secureMeetingOrigin(meetingOrigin)
  url.pathname = `${url.pathname.replace(/\/$/u, '')}/MAER-${sanitizedToken}`
  if (mode === 'audio' || mode === 'screen') {
    url.hash = 'config.startWithVideoMuted=true'
  }
  return url.toString()
}

export function createMeetingInvitation(
  mode: CallMode,
  now: Date = new Date(),
  roomToken?: string,
): IncomingCallInvitation {
  const meetingUrl = createMeetingUrl(mode, roomToken)
  const issuedAt = now.toISOString()
  return Object.freeze({
    mode,
    meetingUrl,
    issuedAt,
    expiresAt: new Date(now.getTime() + MEETING_HISTORY_TTL_MS).toISOString(),
    room: new URL(meetingUrl).pathname.slice(1),
  })
}

function parsedMeetingUrl(raw: string): URL {
  if (raw.length > 2_048) throw new Error('Adresse de réunion invalide.')
  const url = secureMeetingOrigin(raw)
  const allowed = new URL(MAER_MEETING_ORIGIN)
  if (
    raw !== url.toString() ||
    url.origin !== allowed.origin ||
    url.username ||
    url.password ||
    url.search ||
    !/^\/MAER-[A-Za-z0-9]{16,128}$/u.test(url.pathname) ||
    (url.hash && url.hash !== '#config.startWithVideoMuted=true')
  ) {
    throw new Error('Adresse de réunion non autorisée.')
  }
  return url
}

export function isMaerMeetingUrl(raw: string): boolean {
  try {
    parsedMeetingUrl(raw)
    return true
  } catch {
    return false
  }
}

export function isPublicMeetingOriginUrl(raw: string): boolean {
  try {
    return new URL(raw).origin === new URL(MAER_MEETING_ORIGIN).origin
  } catch {
    return false
  }
}

export function parseIncomingCallInvitation(body: unknown): IncomingCallInvitation {
  if (typeof body !== 'string' || body.length > 4_096 || body.includes('\0')) {
    throw new Error('Invitation d’appel invalide.')
  }
  if (body.includes('\r')) throw new Error('Invitation d’appel invalide.')
  const lines = body.split('\n')
  if (lines.length !== 3) throw new Error('Invitation d’appel invalide.')
  const match = /^MAER-CALL\/1 mode=(audio|video|screen) issued=(\S+) expires=(\S+) room=(MAER-[A-Za-z0-9]{16,128})$/u.exec(lines[1] ?? '')
  if (!match) throw new Error('Invitation d’appel invalide.')
  const modeValue = match[1]
  const issuedAt = match[2]
  const expiresAt = match[3]
  const room = match[4]
  if (!modeValue || !issuedAt || !expiresAt || !room) {
    throw new Error('Invitation d’appel invalide.')
  }
  const mode = modeValue as CallMode
  if (lines[0] !== CALL_MESSAGE_LABELS[mode] || !ISO_UTC.test(issuedAt) || !ISO_UTC.test(expiresAt) || !ROOM.test(room)) {
    throw new Error('Invitation d’appel invalide.')
  }
  const issued = Date.parse(issuedAt)
  const expires = Date.parse(expiresAt)
  if (
    !Number.isFinite(issued) ||
    !Number.isFinite(expires) ||
    new Date(issued).toISOString() !== issuedAt ||
    new Date(expires).toISOString() !== expiresAt ||
    expires - issued !== MEETING_HISTORY_TTL_MS
  ) {
    throw new Error('Invitation d’appel invalide.')
  }
  const url = parsedMeetingUrl(lines[2] ?? '')
  if (url.pathname !== `/${room}`) throw new Error('Invitation d’appel invalide.')
  if ((mode === 'video' && url.hash) || (mode !== 'video' && url.hash !== '#config.startWithVideoMuted=true')) {
    throw new Error('Invitation d’appel invalide.')
  }
  return Object.freeze({ mode, meetingUrl: url.toString(), issuedAt, expiresAt, room })
}

export function assertCallInvitationJoinable(
  invitation: IncomingCallInvitation,
  now: Date = new Date(),
): void {
  const current = now.getTime()
  if (
    current >= Date.parse(invitation.expiresAt) ||
    current < Date.parse(invitation.issuedAt) - 5 * 60 * 1_000
  ) {
    throw new Error('Cette invitation d’appel a expiré.')
  }
  const reparsed = parseIncomingCallInvitation(
    `${CALL_MESSAGE_LABELS[invitation.mode]}\n` +
      `MAER-CALL/1 mode=${invitation.mode} issued=${invitation.issuedAt} expires=${invitation.expiresAt} room=${invitation.room}\n` +
      invitation.meetingUrl,
  )
  if (reparsed.meetingUrl !== invitation.meetingUrl) throw new Error('Invitation d’appel invalide.')
}

export async function openMeetingInApp(invitation: IncomingCallInvitation): Promise<void> {
  assertCallInvitationJoinable(invitation)
  const target = parsedMeetingUrl(invitation.meetingUrl)
  await window.maerDesktop.openMeeting({
    url: target.toString(),
    mode: invitation.mode,
    issuedAt: invitation.issuedAt,
    expiresAt: invitation.expiresAt,
    room: invitation.room,
  })
}

/** @deprecated Kept for old call sites; meetings now stay inside MAER Chat. */
export async function startConversationCall(
  conversation: CallConversation,
  mode: CallMode,
  openMeeting: (invitation: IncomingCallInvitation) => void | Promise<void> = openMeetingInApp,
  now: () => Date = () => new Date(),
): Promise<StartedCall> {
  const targetJid = conversation.get('jid')
  if (typeof targetJid !== 'string' || !targetJid.includes('@')) {
    throw new Error('Cette conversation ne peut pas recevoir un appel.')
  }

  const meetingUrl = createMeetingUrl(mode)
  const startedAt = now()
  const expiresAt = new Date(startedAt.getTime() + MEETING_HISTORY_TTL_MS)
  const room = new URL(meetingUrl).pathname.slice(1)
  const invitation = Object.freeze({
    mode,
    meetingUrl,
    issuedAt: startedAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
    room,
  })
  await conversation.sendMessage({
    body:
      `${CALL_MESSAGE_LABELS[mode]}\n` +
      `MAER-CALL/1 mode=${mode} issued=${startedAt.toISOString()} expires=${expiresAt.toISOString()} room=${room}\n${meetingUrl}`,
  })
  await openMeeting(invitation)
  return {
    mode,
    targetJid,
    meetingUrl,
    startedAt: startedAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
    room,
  }
}
