import { describe, expect, it, vi } from 'vitest'
import { createDesktopHandlers } from '../src/main/ipc-handlers'

function dependencies() {
  return {
    appVersion: '1.0.0',
    deviceName: 'PC Atelier',
    endpoints: {
      domain: 'xmpp.maer.fr',
      websocketUrl: 'wss://xmpp.maer.fr/xmpp-websocket',
      boshServiceUrl: 'https://xmpp.maer.fr/http-bind',
      pairingApiBaseUrl: 'https://xmpp.maer.fr/maer-pairing/v1',
    },
    credentials: {
      listAccounts: vi.fn(async () => ['alice@xmpp.maer.fr']),
      load: vi.fn(async () => ({
        version: 1 as const,
        authKind: 'password' as const,
        secret: 'stored-secret',
      })),
      save: vi.fn(async () => undefined),
      delete: vi.fn(async () => true),
    },
    pairing: {
      begin: vi.fn(async () => ({
        sessionId: 'session_1234567890abcdef',
        approvalUri: 'maerchat://pair?v=1&sid=session_1234567890abcdef',
        verificationCode: '804261',
        expiresAt: '2026-08-24T22:12:00.000Z',
      })),
      poll: vi.fn(async () => ({ status: 'pending' as const })),
      cancel: vi.fn(async () => undefined),
    },
  }
}

describe('desktop IPC handlers', () => {
  it('bootstraps with public configuration and remembered account names only', async () => {
    const deps = dependencies()
    const handlers = createDesktopHandlers(deps)

    const result = await handlers.bootstrap()

    expect(result).toMatchObject({
      version: '1.0.0',
      deviceName: 'PC Atelier',
      accounts: ['alice@xmpp.maer.fr'],
      endpoints: deps.endpoints,
    })
    expect(JSON.stringify(result)).not.toMatch(/stored-secret|password|access_token/i)
  })

  it('normalizes password login without persisting before authentication', async () => {
    const deps = dependencies()
    const handlers = createDesktopHandlers(deps)

    await expect(
      handlers.preparePasswordLogin({
        identifier: 'alice',
        password: 'not-yet-validated',
        remember: true,
      }),
    ).resolves.toEqual({
      jid: 'alice@xmpp.maer.fr',
      credential: {
        version: 1,
        authKind: 'password',
        secret: 'not-yet-validated',
      },
      remember: true,
    })
    expect(deps.credentials.save).not.toHaveBeenCalled()
  })

  it('expands the short Edouard login to the MAER XMPP account', async () => {
    const handlers = createDesktopHandlers(dependencies())

    await expect(
      handlers.preparePasswordLogin({
        identifier: 'edouard',
        password: 'Edouard123abc',
        remember: true,
      }),
    ).resolves.toMatchObject({
      jid: 'edouard@xmpp.maer.fr',
      credential: {
        authKind: 'password',
        secret: 'Edouard123abc',
      },
    })
  })

  it.each([
    'alice@xmpp.maer.fr',
    'alice/desktop',
    'alice@legacy.example',
  ])('rejects non-local login identifier %j before authentication', async (identifier) => {
    const handlers = createDesktopHandlers(dependencies())

    await expect(
      handlers.preparePasswordLogin({
        identifier,
        password: 'not-yet-validated',
        remember: false,
      }),
    ).rejects.toThrow(/identifiant local/i)
  })

  it('stores only a renderer-confirmed valid credential', async () => {
    const deps = dependencies()
    const handlers = createDesktopHandlers(deps)
    const credential = {
      version: 1 as const,
      authKind: 'oauth' as const,
      secret: 'opaque-token',
      deviceId: 'device-42',
      expiresAt: '2026-09-24T22:12:00.000Z',
    }

    await handlers.saveValidatedCredential({
      jid: 'alice@xmpp.maer.fr',
      remember: true,
      credential,
    })

    expect(deps.credentials.save).toHaveBeenCalledWith('alice@xmpp.maer.fr', credential)
  })

  it('purges a previously remembered credential when remember is disabled', async () => {
    const deps = dependencies()
    const handlers = createDesktopHandlers(deps)

    await handlers.saveValidatedCredential({
      jid: 'alice@xmpp.maer.fr',
      remember: false,
      credential: {
        version: 1,
        authKind: 'password',
        secret: 'validated-but-not-persisted',
      },
    })

    expect(deps.credentials.delete).toHaveBeenCalledWith('alice@xmpp.maer.fr')
    expect(deps.credentials.save).not.toHaveBeenCalled()
  })

  it('owns QR pairing and validates the session ID crossing IPC', async () => {
    const deps = dependencies()
    const handlers = createDesktopHandlers(deps)

    await handlers.beginPairing()
    await handlers.pollPairing('session_1234567890abcdef')
    await handlers.cancelPairing('session_1234567890abcdef')

    expect(deps.pairing.begin).toHaveBeenCalledWith('PC Atelier')
    expect(deps.pairing.poll).toHaveBeenCalledWith('session_1234567890abcdef')
    expect(deps.pairing.cancel).toHaveBeenCalledWith('session_1234567890abcdef')
    await expect(handlers.pollPairing('../escape')).rejects.toThrow(/session/i)
  })
})
