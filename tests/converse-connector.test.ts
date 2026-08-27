// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ConverseChatConnector } from '../src/renderer/converse-connector'

const fake = vi.hoisted(() => {
  const listeners = new Map<string, (...args: unknown[]) => void>()
  const privateApi = {
    listen: {
      once: vi.fn((event: string, callback: (...args: unknown[]) => void) => {
        listeners.set(event, callback)
      }),
      on: vi.fn((event: string, callback: (...args: unknown[]) => void) => {
        listeners.set(event, callback)
      }),
    },
    settings: {
      set: vi.fn(),
    },
    user: {
      logout: vi.fn(async () => undefined),
    },
  }
  const state: {
    plugin?: { initialize?: () => void; _converse?: { api: typeof privateApi } }
    lastConfiguration?: Record<string, unknown>
  } = {}
  const runtime = {
    plugins: {
      add: vi.fn((_name: string, plugin: typeof state.plugin) => {
        state.plugin = plugin
      }),
    },
    initialize: vi.fn(async (configuration: Record<string, unknown>) => {
      state.lastConfiguration = configuration
      if (!state.plugin) throw new Error('Le plugin de connexion n’est pas enregistré')
      state.plugin._converse = { api: privateApi }
      state.plugin.initialize?.()
      listeners.get('connected')?.()
    }),
    env: {
      Strophe: {
        SASLXOAuth2: class {},
      },
    },
  }
  return { listeners, privateApi, runtime, state }
})

vi.mock('converse.js', () => ({ default: fake.runtime }))

const request = {
  jid: 'emilien@xmpp.maer.fr',
  secret: 'temporary-test-secret',
  authKind: 'password' as const,
  endpoints: {
    websocketUrl: 'wss://xmpp.maer.fr/xmpp-websocket',
    boshServiceUrl: 'https://xmpp.maer.fr/http-bind',
  },
}

describe('ConverseChatConnector', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    fake.listeners.clear()
    fake.state.lastConfiguration = undefined
  })

  it('observes connection events through a Converse v14 plugin', async () => {
    expect(fake.runtime).not.toHaveProperty('api')
    const connector = new ConverseChatConnector()

    await expect(connector.connect(request)).resolves.toBeUndefined()

    expect(fake.runtime.plugins.add).toHaveBeenCalledOnce()
    expect(fake.privateApi.listen.once).toHaveBeenCalledWith(
      'connected',
      expect.any(Function),
    )
    expect(fake.privateApi.listen.on).toHaveBeenCalledWith(
      'getHeadingButtons',
      expect.any(Function),
    )
    expect(fake.state.lastConfiguration?.whitelisted_plugins).toEqual([
      'maer-chat-connection-observer',
    ])

    await connector.disconnect()
    expect(fake.privateApi.user.logout).toHaveBeenCalledOnce()
  })

  it('adds audio, video and screen-sharing actions to chat headers', async () => {
    const connector = new ConverseChatConnector()
    await connector.connect(request)
    const hook = fake.listeners.get('getHeadingButtons')
    const buttons: Array<{ name: string }> = []
    const conversation = {
      get: vi.fn(() => 'alice@xmpp.maer.fr'),
      sendMessage: vi.fn(async () => undefined),
    }

    hook?.({ model: conversation }, buttons)

    expect(buttons.map((button) => button.name)).toEqual([
      'maer-audio-call',
      'maer-video-call',
      'maer-screen-call',
    ])
  })
})
