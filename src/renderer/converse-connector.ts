import type { ChatConnectRequest, ChatConnector } from './onboarding-controller'
import { normalizeAccountJid } from '../shared/jid'
import {
  MAER_ACCOUNT_DOMAIN,
  MAER_XMPP_SERVICE_HOST,
} from '../shared/service-config'
import type { CallConversation, CallMode } from './call-service'
import type { RendererPluginRegistry } from '../plugins/core/renderer/plugin-registry'
import {
  installMaerDesktopShell,
  launchConversationCall,
  registerIncomingCallMessage,
  uninstallMaerDesktopShell,
  type DesktopPreferences,
} from './desktop-shell'

interface ConverseConfiguration extends Record<string, unknown> {
  maer_oauth_only: boolean
}

interface ConversePrivateApi {
  listen: {
    once(event: string, callback: (...args: unknown[]) => void): void
    on?(event: string, callback: (...args: any[]) => unknown): void
  }
  settings?: {
    set(settings: Record<string, unknown>): void
  }
  user?: {
    logout?: () => Promise<void>
  }
}

interface ConverseObserverPlugin {
  _converse?: {
    api: ConversePrivateApi
  }
  initialize(): void
}

interface ConverseRuntime {
  initialize(config: Record<string, unknown>): Promise<unknown> | unknown
  plugins: {
    add(name: string, plugin: ConverseObserverPlugin): void
  }
  env: {
    Strophe: {
      SASLXOAuth2: new () => unknown
    }
  }
}

interface ConverseConnectionObserver {
  generation: number
  privateApi?: ConversePrivateApi
  onConnected?: () => void
  onDisconnected?: (reason: unknown) => void
}

interface ConverseChatElement {
  model?: CallConversation
}

interface ConverseCallEvent {
  model?: CallConversation
}

interface ConverseMessageModel {
  get(name: string): unknown
}

interface ConverseHeadingButton {
  a_class: string
  handler(event: Event): void
  i18n_text: string
  i18n_title: string
  icon_class: string
  name: string
  standalone: boolean
}

const CONNECTION_OBSERVER_PLUGIN = 'maer-chat-connection-observer'
const CONNECTED_BODY_CLASS = 'maer-chat-connected'
const observers = new WeakMap<ConverseRuntime, ConverseConnectionObserver>()

function setConverseUiVisible(visible: boolean): void {
  document.body.classList.toggle(CONNECTED_BODY_CLASS, visible)
  const root = document.querySelector<HTMLElement>('#conversejs')
  if (!root) return
  root.hidden = !visible
  root.setAttribute('aria-hidden', String(!visible))
}

async function stopFailedSession(privateApi: ConversePrivateApi | undefined): Promise<void> {
  const logout = privateApi?.user?.logout
  if (!logout) return
  let timeout: number | undefined
  try {
    await Promise.race([
      Promise.resolve().then(() => logout()),
      new Promise<void>((resolve) => {
        timeout = window.setTimeout(resolve, 2_000)
      }),
    ])
  } catch {
    // The renderer is already hidden. A half-open transport must not block a retry.
  } finally {
    if (timeout !== undefined) window.clearTimeout(timeout)
  }
}

function callHeadingButton(
  conversation: CallConversation,
  mode: CallMode,
): ConverseHeadingButton {
  const labels: Record<CallMode, { text: string; title: string; icon: string }> = {
    audio: { text: 'Appel audio', title: 'Démarrer un appel audio', icon: 'fa-phone' },
    video: { text: 'Appel vidéo', title: 'Démarrer un appel vidéo', icon: 'fa-video' },
    screen: {
      text: "Partager l’écran",
      title: "Démarrer une visioconférence avec partage d’écran",
      icon: 'fa-desktop',
    },
  }
  const label = labels[mode]
  return {
    a_class: `maer-${mode}-call`,
    handler(event) {
      event.preventDefault()
      event.stopPropagation()
      void launchConversationCall(conversation, mode)
    },
    i18n_text: label.text,
    i18n_title: label.title,
    icon_class: label.icon,
    name: `maer-${mode}-call`,
    standalone: true,
  }
}

function installCallExtensions(privateApi: ConversePrivateApi): void {
  privateApi.listen.on?.(
    'getHeadingButtons',
    (element: ConverseChatElement, buttons: ConverseHeadingButton[]) => {
      const conversation = element?.model
      if (!conversation || buttons.some((button) => button.name === 'maer-video-call')) {
        return buttons
      }
      buttons.unshift(
        callHeadingButton(conversation, 'audio'),
        callHeadingButton(conversation, 'video'),
        callHeadingButton(conversation, 'screen'),
      )
      return buttons
    },
  )
  privateApi.listen.on?.('callButtonClicked', (event: ConverseCallEvent) => {
    if (event?.model) void launchConversationCall(event.model, 'audio')
  })
  privateApi.listen.on?.('messageReceived', (message: ConverseMessageModel) => {
    if (!message?.get) return
    const body = message.get('plaintext') ?? message.get('body') ?? message.get('message')
    const sender = message.get('from') ?? message.get('contact_jid')
    registerIncomingCallMessage(body, sender)
  })
}

function connectionObserver(runtime: ConverseRuntime): ConverseConnectionObserver {
  const existing = observers.get(runtime)
  if (existing) return existing

  const observer: ConverseConnectionObserver = { generation: 0 }
  const plugin: ConverseObserverPlugin = {
    initialize() {
      const privateApi = this._converse?.api
      if (!privateApi?.listen) {
        throw new Error('L’API de connexion Converse.js est indisponible.')
      }
      observer.privateApi = privateApi
      installCallExtensions(privateApi)
      const generation = observer.generation
      privateApi.listen.once('connected', () => {
        if (observer.generation === generation) observer.onConnected?.()
      })
      privateApi.listen.once('disconnected', (reason: unknown) => {
        if (observer.generation === generation) observer.onDisconnected?.(reason)
      })
    },
  }
  runtime.plugins.add(CONNECTION_OBSERVER_PLUGIN, plugin)
  observers.set(runtime, observer)
  return observer
}

function validateTransport(raw: string, protocol: 'wss:' | 'https:', label: string): string {
  const parsed = new URL(raw)
  if (parsed.protocol !== protocol) {
    throw new Error(`${label} doit utiliser ${protocol === 'wss:' ? 'WSS' : 'HTTPS'}.`)
  }
  if (parsed.hostname.toLowerCase() !== MAER_XMPP_SERVICE_HOST) {
    throw new Error(`${label} doit appartenir au serveur XMPP MAER.`)
  }
  if (parsed.username || parsed.password || parsed.hash) {
    throw new Error(`${label} contient des éléments non autorisés.`)
  }
  return parsed.toString()
}

export function buildConverseConfiguration(request: ChatConnectRequest): ConverseConfiguration {
  const jid = normalizeAccountJid(request.jid, MAER_ACCOUNT_DOMAIN)
  const websocketUrl = validateTransport(request.endpoints.websocketUrl, 'wss:', 'Le transport WebSocket')
  const boshServiceUrl = validateTransport(request.endpoints.boshServiceUrl, 'https:', 'Le transport BOSH')

  return {
    maer_oauth_only: request.authKind === 'oauth',
    authentication: 'login',
    auto_login: true,
    auto_reconnect: true,
    jid,
    password: request.secret,
    websocket_url: websocketUrl,
    bosh_service_url: boshServiceUrl,
    discover_connection_methods: false,
    view_mode: 'fullscreen',
    singleton: false,
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
    visible_toolbar_buttons: {
      call: true,
      clear: true,
      emoji: true,
      fileupload: true,
      location: false,
      spoiler: false,
    },
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
  private privateApi?: ConversePrivateApi
  private connecting = false

  constructor(private readonly pluginRegistry?: RendererPluginRegistry) {}

  async connect(request: ChatConnectRequest): Promise<void> {
    if (this.connecting) {
      throw new Error('Une connexion est déjà en cours.')
    }
    if (this.runtime) {
      throw new Error('Une session XMPP est déjà initialisée. Redémarrez MAER Chat pour changer de compte.')
    }
    this.connecting = true
    setConverseUiVisible(false)
    let activeObserver: ConverseConnectionObserver | undefined
    let attemptGeneration: number | undefined
    let transportDisconnected = false

    try {
      const imported = await import('converse.js')
      const converse = imported.default as unknown as ConverseRuntime
      const observer = connectionObserver(converse)
      observer.generation += 1
      activeObserver = observer
      attemptGeneration = observer.generation
      const built = buildConverseConfiguration(request)
      const { maer_oauth_only: oauthOnly, ...configuration } = built
      configuration.whitelisted_plugins = [CONNECTION_OBSERVER_PLUGIN]

      if (oauthOnly) {
        const Mechanism = converse.env.Strophe.SASLXOAuth2
        configuration.connection_options = {
          mechanisms: [Mechanism],
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

        observer.onConnected = () => {
          if (settled) return
          settled = true
          window.clearTimeout(timeout)
          this.runtime = converse
          this.privateApi = observer.privateApi
          setConverseUiVisible(true)
          installMaerDesktopShell({
            accountJid: request.jid,
            onLogout: async (options) => {
              if (options?.forgetCredential) {
                await window.maerDesktop.deleteCredential(request.jid)
              }
              await this.disconnect()
              window.location.reload()
            },
            applyChatPreferences: (preferences: DesktopPreferences) => {
              this.privateApi?.settings?.set({
                play_sounds: preferences.sounds,
                show_desktop_notifications: preferences.notifications,
              })
            },
            pluginRegistry: this.pluginRegistry,
          })
          resolve()
        }
        observer.onDisconnected = (reason: unknown) => {
          if (settled) return
          transportDisconnected = true
          settled = true
          window.clearTimeout(timeout)
          reject(userFacingConnectionError(reason))
        }

        Promise.resolve(converse.initialize(configuration)).catch((error: unknown) => {
          if (settled) return
          settled = true
          window.clearTimeout(timeout)
          reject(userFacingConnectionError(error))
        })
      })
    } catch (error) {
      if (
        activeObserver &&
        attemptGeneration !== undefined &&
        activeObserver.generation === attemptGeneration
      ) {
        activeObserver.generation += 1
      }
      if (activeObserver) {
        activeObserver.onConnected = undefined
        activeObserver.onDisconnected = undefined
      }
      setConverseUiVisible(false)
      if (!transportDisconnected) {
        await stopFailedSession(activeObserver?.privateApi)
      }
      throw error
    } finally {
      this.connecting = false
    }
  }

  async disconnect(): Promise<void> {
    setConverseUiVisible(false)
    uninstallMaerDesktopShell()
    const logout = this.privateApi?.user?.logout
    if (logout) {
      await logout()
    }
    this.runtime = undefined
    this.privateApi = undefined
  }
}
