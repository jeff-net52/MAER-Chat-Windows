// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import {
  assertCallInvitationJoinable,
  createMeetingUrl,
  parseIncomingCallInvitation,
  startConversationCall,
} from '../src/renderer/call-service'

describe('MAER calls', () => {
  it('creates an opaque HTTPS meeting without exposing a JID', () => {
    const url = createMeetingUrl(
      'video',
      '12345678-1234-1234-1234-123456789abc',
    )

    expect(url).toBe('https://meet.jit.si/MAER-12345678123412341234123456789abc')
    expect(url).not.toContain('@')
  })

  it('sends a versioned expiring meeting link before opening it in the typed call window', async () => {
    const sendMessage = vi.fn(async (_attributes: { body: string }) => undefined)
    const openMeeting = vi.fn()
    const conversation = {
      get: vi.fn(() => 'alice@xmpp.maer.fr'),
      sendMessage,
    }

    const call = await startConversationCall(
      conversation,
      'screen',
      openMeeting,
      () => new Date('2026-08-26T18:00:00.000Z'),
    )

    expect(sendMessage).toHaveBeenCalledOnce()
    const sent = sendMessage.mock.calls[0]?.[0]
    expect(sent?.body).toContain(call.meetingUrl)
    expect(sent?.body).toMatch(/partage d’écran/i)
    expect(sent?.body).toContain('MAER-CALL/1 mode=screen')
    expect(sent?.body).toContain('issued=2026-08-26T18:00:00.000Z')
    expect(sent?.body).toContain('expires=2026-08-26T20:00:00.000Z')
    expect(sent?.body).toContain('room=MAER-')
    expect(sent?.body).toContain('via la conversation XMPP')
    expect(openMeeting).toHaveBeenCalledWith({
      mode: 'screen',
      meetingUrl: call.meetingUrl,
      issuedAt: call.startedAt,
      expiresAt: call.expiresAt,
      room: call.room,
    })
    expect(call.startedAt).toBe('2026-08-26T18:00:00.000Z')
    expect(call.expiresAt).toBe('2026-08-26T20:00:00.000Z')
  })

  it('strictly binds incoming mode, room, URL and timestamps and rechecks expiry at click time', async () => {
    const sendMessage = vi.fn(async (_attributes: { body: string }) => undefined)
    const call = await startConversationCall(
      { get: () => 'alice@xmpp.maer.fr', sendMessage },
      'video',
      vi.fn(),
      () => new Date('2026-08-26T18:00:00.000Z'),
    )
    const body = sendMessage.mock.calls[0]?.[0].body ?? ''
    const invitation = parseIncomingCallInvitation(body)
    expect(invitation).toMatchObject({
      mode: 'video',
      meetingUrl: call.meetingUrl,
      issuedAt: call.startedAt,
      expiresAt: call.expiresAt,
    })
    expect(() => assertCallInvitationJoinable(invitation, new Date('2026-08-26T19:59:59.999Z'))).not.toThrow()
    expect(() => assertCallInvitationJoinable(invitation, new Date('2026-08-26T20:00:00.000Z'))).toThrow(/expir/i)
    expect(() => parseIncomingCallInvitation(body.replace('/MAER-', '/MAER-tampered'))).toThrow(/invalide/i)
    expect(() => parseIncomingCallInvitation(body.replace('mode=video', 'mode=audio'))).toThrow(/invalide/i)
    expect(() => parseIncomingCallInvitation(body.replace(/\n/gu, '\r\n'))).toThrow(/invalide/i)
    expect(() => parseIncomingCallInvitation(body.replace('T18:00:00.000Z', 'T18:00:00Z'))).toThrow(/invalide/i)
    expect(() => parseIncomingCallInvitation(body.replace('meet.jit.si/', 'meet.jit.si:443/'))).toThrow(/invalide|réunion/i)
    expect(() => parseIncomingCallInvitation(body.replace(call.meetingUrl, `${call.meetingUrl}?team=1`))).toThrow(/invalide|réunion/i)
    expect(() => parseIncomingCallInvitation(body.replace(call.meetingUrl, `${call.meetingUrl}/extra`))).toThrow(/invalide|réunion/i)
  })

  it('refuses invalid conversations and insecure meeting origins', async () => {
    expect(() =>
      createMeetingUrl('video', '1234567890123456', 'http://meet.example'),
    ).toThrow(/HTTPS/i)

    await expect(
      startConversationCall(
        { get: () => 'not-a-jid', sendMessage: vi.fn() },
        'audio',
      ),
    ).rejects.toThrow(/conversation/i)
  })
})
