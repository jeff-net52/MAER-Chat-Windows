// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { createMeetingUrl, startConversationCall } from '../src/renderer/call-service'

describe('MAER calls', () => {
  it('creates an opaque HTTPS meeting without exposing a JID', () => {
    const url = createMeetingUrl(
      'video',
      '12345678-1234-1234-1234-123456789abc',
    )

    expect(url).toBe('https://meet.jit.si/MAER-12345678123412341234123456789abc')
    expect(url).not.toContain('@')
  })

  it('sends the same one-time meeting link before opening it', async () => {
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
    expect(sent?.body).toMatch(/partager l’écran/i)
    expect(openMeeting).toHaveBeenCalledWith(call.meetingUrl)
    expect(call.startedAt).toBe('2026-08-26T18:00:00.000Z')
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
