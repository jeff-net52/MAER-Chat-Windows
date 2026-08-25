import type { ChatConnectRequest, ChatConnector } from './onboarding-controller'

interface ConverseConfiguration extends Record<string, unknown> {
  maer_oauth_only: boolean
}

interface ConverseRuntime {
  initialize(config: Record<string, unknown>): Promise<unknown> | unknown
  api: {
    listen: {
      once(event: string, callback: (...args: unknown[]) => void): void
    }
    user?: {
      logout?: () => Promise<void>
    }
  }
  env: {
    Strophe: {
      SASLXOAuth2: new () => unknown
    }
  }
}

function validateTransport(raw: string, protocol: 'wss:' | 'https:', domain: string, label: string): string {
  const parsed = new URL(raw)
  if (parsed.protocol !== protocol) {
    throw new Error(`${label} doit utiliser ${protocol === 'wss:' ? 'WSS' : 'HTTPS'}.`)
  }
  if (parsed.hostname.toLowerCase() !== domain.toLowerCase()) {
    throw new Error(`${label} doit appartenir au domaine XMPP.`)
  }
  if (parsed.username || parsed.password || parsed.hash) {
    throw new Error(`${label} contient des éléments non autorisés.`)
  }
  return parsed.toString()
}

export function buildConverseConfiguration(request: ChatConnectRequest): ConverseConfiguration {
  const at = request.jid.lastIndexOf('@')
  if (at < 1 || at === request.jid.length - 1) {
    throw new Error('Adresse XMPP invalide.')
  }
  const domain = request.jid.slice(at + 1).toLowerCase()
  const websocketUrl = validateTransport(request.endpoints.websocketUrl, 'wss:', domain, 'Le transport WebSocket')
  const boshServiceUrl = validateTransport(request.endpoints.boshServiceUrl, 'https:', domain, 'Le transport BOSH')

  return {
    maer_oauth_only: request.authKind === 'oauth',
    authentication: 'login',
    auto_login: true,
    auto_reconnect: true,
    jid: request.jid,
    password: request.secret,
    websocket_url: websocketUrl,
    bosh_service_url: boshServiceUrl,
    discover_connection_methods: false,
    view_mode: 'fullscreened',
    singleton: true,
    show_controlbox_by_default: true,
    allow_logout: false,
    allow_registration: false,
    allow_adhoc_commands: false,
    clear_cache_on_logout: false,
    persistent_store: 'IndexedDB',
    persist_credentials: false,
    trusted: true,
    i18n: 'fr',
    locale: 'fr',
    theme: 'classic',
    loglevel: 'warn',
    message_archiving: 'always',
    archived_messages_page_size: 50,
    muc_history_max_stanzas: 100,
    enable_smacks: true,
    enable_muc_push: true,
    allow_message_corrections: true,
    allow_message_retraction: 'all',
    allow_message_styling: true,
    allow_non_roster_messaging: false,
    allow_public_bookmarks: false,
    auto_register_muc_nickname: true,
    omemo_default: true,
    prune_messages_above: 2_000,
    show_desktop_notifications: true,
    notification_icon: './maer-chat-mark.png',
    sounds_path: '',
    assets_path: './',
  }
}

function userFacingConnectionError(error: unknown): Error {
  if (error instanceof Error && error.message) {
    return error
  }
  return new Error('La connexion au serveur XMPP a échoué. Vérifiez vos identifiants et votre réseau.')
}

export class ConverseChatConnector implements ChatConnector {
  private runtime?: ConverseRuntime
  private connecting = false

  async connect(request: ChatConnectRequest): Promise<void> {
    if (this.connecting) {
      throw new Error('Une connexion est déjà en cours.')
    }
    if (this.runtime) {
      throw new Error('Une session XMPP est déjà initialisée. Redémarrez MAER Chat pour changer de compte.')
    }
    this.connecting = true

    try {
      const imported = await import('converse.js')
      const converse = imported.default as unknown as ConverseRuntime
      const built = buildConverseConfiguration(request)
      const { maer_oauth_only: oauthOnly, ...configuration } = built

      if (oauthOnly) {
        const Mechanism = converse.env.Strophe.SASLXOAuth2
        configuration.connection_options = {
          mechanisms: [new Mechanism()],
        }
      }

      await new Promise<void>((resolve, reject) => {
        let settled = false
        const timeout = window.setTimeout(() => {
          if (!settled) {
            settled = true
            reject(new Error('Le serveur XMPP ne répond pas. Réessayez dans quelques instants.'))
          }
        }, 35_000)

        converse.api.listen.once('connected', () => {
          if (settled) return
          settled = true
          window.clearTimeout(timeout)
          this.runtime = converse
          resolve()
        })
        converse.api.listen.once('disconnected', (reason: unknown) => {
          if (settled) return
          settled = true
          window.clearTimeout(timeout)
          reject(userFacingConnectionError(reason))
        })

        Promise.resolve(converse.initialize(configuration)).catch((error: unknown) => {
          if (settled) return
          settled = true
          window.clearTimeout(timeout)
          reject(userFacingConnectionError(error))
        })
      })
    } finally {
      this.connecting = false
    }
  }

  async disconnect(): Promise<void> {
    const logout = this.runtime?.api.user?.logout
    if (logout) {
      await logout()
    }
    this.runtime = undefined
  }
}
