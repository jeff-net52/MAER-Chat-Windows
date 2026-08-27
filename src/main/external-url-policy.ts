import { MAER_MEETING_ORIGIN } from '../shared/service-config'

/** Exact Jitsi origin is reserved for MeetingWindowManager IPC. */
export function isReservedMeetingOrigin(raw: string): boolean {
  try {
    return new URL(raw).origin === new URL(MAER_MEETING_ORIGIN).origin
  } catch {
    return false
  }
}

export function assertGenericExternalUrlAllowed(raw: string): URL {
  const target = new URL(raw)
  if (isReservedMeetingOrigin(raw)) {
    throw new Error('Meeting links must use the validated MAER meeting window')
  }
  if (target.protocol !== 'https:' && target.protocol !== 'mailto:') {
    throw new Error('External URL scheme is not allowed')
  }
  return target
}
