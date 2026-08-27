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
}

export const DEFAULT_MEETING_ORIGIN = 'https://meet.jit.si'

const CALL_LABELS: Record<CallMode, string> = {
  audio: 'Appel audio',
  video: 'Appel vidéo',
  screen: "Partage d’écran",
}

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
  meetingOrigin = DEFAULT_MEETING_ORIGIN,
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

export function openMeetingExternally(url: string): void {
  const target = secureMeetingOrigin(url)
  const opened = window.open(target.toString(), '_blank', 'noopener,noreferrer')
  if (opened) opened.opener = null
}

export async function startConversationCall(
  conversation: CallConversation,
  mode: CallMode,
  openMeeting: (url: string) => void = openMeetingExternally,
  now: () => Date = () => new Date(),
): Promise<StartedCall> {
  const targetJid = conversation.get('jid')
  if (typeof targetJid !== 'string' || !targetJid.includes('@')) {
    throw new Error('Cette conversation ne peut pas recevoir un appel.')
  }

  const meetingUrl = createMeetingUrl(mode)
  const instruction =
    mode === 'screen'
      ? "Ouvrez la réunion puis choisissez « Partager l’écran »."
      : 'Ouvrez ce lien pour rejoindre.'
  await conversation.sendMessage({
    body: `${CALL_LABELS[mode]} MAER — ${instruction}\n${meetingUrl}`,
  })
  openMeeting(meetingUrl)
  return {
    mode,
    targetJid,
    meetingUrl,
    startedAt: now().toISOString(),
  }
}

