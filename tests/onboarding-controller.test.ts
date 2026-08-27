// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  OnboardingController,
  type ChatConnector,
  type DesktopBridge,
} from '../src/renderer/onboarding-controller'

const bootstrap = {
  version: '1.0.0',
  deviceName: 'PC Atelier',
  accounts: [] as string[],
  domain: 'xmpp.maer.fr',
  websocketUrl: 'wss://xmpp.maer.fr/xmpp-websocket',
  boshServiceUrl: 'https://xmpp.maer.fr/http-bind',
  demo: false,
}

function makeBridge(overrides: Partial<DesktopBridge> = {}): DesktopBridge {
  return {
    getBootstrap: vi.fn(async () => bootstrap),
    preparePasswordLogin: vi.fn(async () => ({
      jid: 'alice@xmpp.maer.fr',
      password: 'secret-password',
      remember: true,
    })),
    beginPairing: vi.fn(async () => ({
      sessionId: 'S1M4g7D8u2kL9pQ3xY6w',
      approvalUri:
        'maerchat://pair?code=482913&host=xmpp.maer.fr&sid=S1M4g7D8u2kL9pQ3xY6w&v=1',
      verificationCode: '482913',
      expiresAt: '2026-08-24T22:12:00.000Z',
    })),
    pollPairing: vi.fn(async () => ({ status: 'pending' as const })),
    cancelPairing: vi.fn(async () => undefined),
    loadCredential: vi.fn(async () => undefined),
    saveValidatedCredential: vi.fn(async () => undefined),
    deleteCredential: vi.fn(async () => false),
    openMeeting: vi.fn(async () => undefined),
    closeMeeting: vi.fn(async () => undefined),
    ...overrides,
  }
}

function makeChat(): ChatConnector {
  return {
    connect: vi.fn(async () => undefined),
  }
}

async function flush(): Promise<void> {
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
}

describe('OnboardingController', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="app"></div>'
    bootstrap.accounts = []
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('moves from the first-run welcome to the connection chooser', async () => {
    const root = document.querySelector<HTMLElement>('#app')!
    const controller = new OnboardingController(root, makeBridge(), makeChat())

    await controller.start()
    root.querySelector<HTMLButtonElement>('[data-action="start"]')!.click()

    expect(root.querySelector('[data-action="pair"]')).not.toBeNull()
    expect(root.querySelector('[data-action="password"]')).not.toBeNull()
  })

  it('stores a password only after XMPP authentication succeeds', async () => {
    const root = document.querySelector<HTMLElement>('#app')!
    const bridge = makeBridge()
    const chat = makeChat()
    const controller = new OnboardingController(root, bridge, chat)
    await controller.start()
    root.querySelector<HTMLButtonElement>('[data-action="start"]')!.click()
    root.querySelector<HTMLButtonElement>('[data-action="password"]')!.click()
    root.querySelector<HTMLInputElement>('[name="identifier"]')!.value = 'alice'
    root.querySelector<HTMLInputElement>('[name="password"]')!.value = 'secret-password'

    root.querySelector<HTMLFormElement>('[data-form="credentials"]')!.requestSubmit()
    await flush()

    expect(bridge.preparePasswordLogin).toHaveBeenCalledWith({
      identifier: 'alice',
      password: 'secret-password',
      remember: true,
    })
    expect(chat.connect).toHaveBeenCalledWith({
      jid: 'alice@xmpp.maer.fr',
      secret: 'secret-password',
      authKind: 'password',
      endpoints: {
        websocketUrl: bootstrap.websocketUrl,
        boshServiceUrl: bootstrap.boshServiceUrl,
      },
    })
    expect(bridge.saveValidatedCredential).toHaveBeenCalledWith({
      jid: 'alice@xmpp.maer.fr',
      remember: true,
      credential: {
        version: 1,
        authKind: 'password',
        secret: 'secret-password',
      },
    })
    expect(root.hidden).toBe(true)
    expect(root.textContent).not.toContain('secret-password')
  })

  it('polls a signed QR session and connects with its revocable token', async () => {
    vi.useFakeTimers()
    const root = document.querySelector<HTMLElement>('#app')!
    const bridge = makeBridge({
      pollPairing: vi.fn(async () => ({
        status: 'approved' as const,
        jid: 'alice@xmpp.maer.fr',
        accessToken: 'opaque-oauth-token',
        tokenExpiresAt: '2027-02-20T19:12:00.000Z',
        deviceId: 'dev_2o9R3x8T1q4W',
      })),
    })
    const chat = makeChat()
    const controller = new OnboardingController(
      root,
      bridge,
      chat,
      async () => 'data:image/png;base64,test-qr',
    )
    await controller.start()
    root.querySelector<HTMLButtonElement>('[data-action="start"]')!.click()
    root.querySelector<HTMLButtonElement>('[data-action="pair"]')!.click()
    await flush()

    expect(root.querySelector<HTMLImageElement>('[data-role="pairing-qr"]')?.src).toBe(
      'data:image/png;base64,test-qr',
    )

    await vi.advanceTimersByTimeAsync(2_100)
    await flush()

    expect(chat.connect).toHaveBeenCalledWith({
      jid: 'alice@xmpp.maer.fr',
      secret: 'opaque-oauth-token',
      authKind: 'oauth',
      endpoints: {
        websocketUrl: bootstrap.websocketUrl,
        boshServiceUrl: bootstrap.boshServiceUrl,
      },
    })
    expect(bridge.saveValidatedCredential).toHaveBeenCalledWith({
      jid: 'alice@xmpp.maer.fr',
      remember: true,
      credential: {
        version: 1,
        authKind: 'oauth',
        secret: 'opaque-oauth-token',
        deviceId: 'dev_2o9R3x8T1q4W',
        expiresAt: '2027-02-20T19:12:00.000Z',
      },
    })
  })

  it('returns from credentials to the connection choice and moves focus to its heading', async () => {
    const root = document.querySelector<HTMLElement>('#app')!
    const controller = new OnboardingController(root, makeBridge(), makeChat())
    await controller.start()
    root.querySelector<HTMLButtonElement>('[data-action="start"]')?.click()
    root.querySelector<HTMLButtonElement>('[data-action="password"]')?.click()
    root.querySelector<HTMLButtonElement>('[data-action="back-to-choice"]')?.click()
    await flush()

    expect(root.querySelector('[data-action="pair"]')).not.toBeNull()
    expect(document.activeElement?.textContent).toBe('Connecter MAER Chat')
  })

  it('shows only the useful IPC error text', async () => {
    const root = document.querySelector<HTMLElement>('#app')!
    const bridge = makeBridge({
      preparePasswordLogin: vi.fn(async () => Promise.reject(
        new Error("Error invoking remote method 'maer:prepare-password-login': Error: Saisissez uniquement votre identifiant local"),
      )),
    })
    const controller = new OnboardingController(root, bridge, makeChat())
    await controller.start()
    root.querySelector<HTMLButtonElement>('[data-action="start"]')?.click()
    root.querySelector<HTMLButtonElement>('[data-action="password"]')?.click()
    root.querySelector<HTMLInputElement>('[name="identifier"]')!.value = 'alice@example.test'
    root.querySelector<HTMLInputElement>('[name="password"]')!.value = 'secret'
    root.querySelector<HTMLFormElement>('[data-form="credentials"]')?.requestSubmit()
    await flush()

    const alert = root.querySelector<HTMLElement>('[data-role="form-error"]')
    expect(alert?.textContent).toBe('Saisissez uniquement votre identifiant local')
    expect(alert?.textContent).not.toMatch(/remote method|maer:/i)
  })

  it('forgets a remembered account from the welcome screen', async () => {
    const root = document.querySelector<HTMLElement>('#app')!
    const bridge = makeBridge({
      getBootstrap: vi.fn(async () => ({ ...bootstrap, accounts: ['alice@xmpp.maer.fr'] })),
      deleteCredential: vi.fn(async () => true),
    })
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const controller = new OnboardingController(root, bridge, makeChat())
    await controller.start()
    root.querySelector<HTMLButtonElement>('[data-forget-account="alice@xmpp.maer.fr"]')?.click()
    await flush()

    expect(bridge.deleteCredential).toHaveBeenCalledWith('alice@xmpp.maer.fr')
    expect(root.querySelector('[data-account="alice@xmpp.maer.fr"]')).toBeNull()
  })
})
