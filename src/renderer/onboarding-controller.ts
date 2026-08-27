import type { DesktopCredential } from '../shared/desktop-contract'
import {
  renderConnectionChoiceScreen,
  renderCredentialsScreen,
  renderErrorScreen,
  renderLoadingScreen,
  renderPairingScreen,
  renderWelcomeScreen,
} from './onboarding-ui'

export interface DesktopBootstrap {
  version: string
  deviceName: string
  accounts: string[]
  domain: string
  websocketUrl: string
  boshServiceUrl: string
  demo: boolean
}

export interface PasswordLoginInput {
  identifier: string
  password: string
  remember: boolean
}

export interface PreparedPasswordLogin {
  jid: string
  password: string
  remember: boolean
}

export interface PairingStartResult {
  sessionId: string
  approvalUri: string
  verificationCode: string
  expiresAt: string
}

export type PairingPollResult =
  | { status: 'pending'; expiresAt?: string }
  | {
      status: 'approved'
      jid: string
      accessToken: string
      tokenExpiresAt: string
      deviceId: string
    }
  | { status: 'rejected' }
  | { status: 'expired' }

export interface SaveCredentialRequest {
  jid: string
  remember: boolean
  credential: DesktopCredential
}

export interface DesktopBridge {
  getBootstrap(): Promise<DesktopBootstrap>
  preparePasswordLogin(input: PasswordLoginInput): Promise<PreparedPasswordLogin>
  beginPairing(): Promise<PairingStartResult>
  pollPairing(sessionId: string): Promise<PairingPollResult>
  cancelPairing(sessionId: string): Promise<void>
  loadCredential(jid: string): Promise<DesktopCredential | undefined>
  saveValidatedCredential(input: SaveCredentialRequest): Promise<void>
  deleteCredential(jid: string): Promise<boolean>
}

export interface ChatConnectRequest {
  jid: string
  secret: string
  authKind: 'password' | 'oauth'
  endpoints: {
    websocketUrl: string
    boshServiceUrl: string
  }
}

export interface ChatConnector {
  connect(request: ChatConnectRequest): Promise<void>
}

type QrEncoder = (value: string) => Promise<string>

function errorMessage(value: unknown): string {
  if (value instanceof Error && value.message) {
    return value.message
  }
  return 'Une erreur inattendue est survenue.'
}

export class OnboardingController {
  readonly #root: HTMLElement
  readonly #bridge: DesktopBridge
  readonly #chat: ChatConnector
  readonly #encodeQr: QrEncoder
  #bootstrap?: DesktopBootstrap
  #pairingSessionId?: string
  #pollTimer?: ReturnType<typeof setInterval>
  #pollInFlight = false

  constructor(
    root: HTMLElement,
    bridge: DesktopBridge,
    chat: ChatConnector,
    encodeQr: QrEncoder = async () => {
      throw new Error('Le générateur de QR code est indisponible')
    },
  ) {
    this.#root = root
    this.#bridge = bridge
    this.#chat = chat
    this.#encodeQr = encodeQr
    this.#root.addEventListener('click', this.#onClick)
    this.#root.addEventListener('submit', this.#onSubmit)
  }

  async start(): Promise<void> {
    this.#bootstrap = await this.#bridge.getBootstrap()
    this.#showWelcome()
  }

  dispose(): void {
    this.#clearPolling()
    this.#root.removeEventListener('click', this.#onClick)
    this.#root.removeEventListener('submit', this.#onSubmit)
  }

  #showWelcome(): void {
    this.#root.hidden = false
    this.#root.innerHTML = renderWelcomeScreen(this.#bootstrap?.accounts ?? [])
  }

  #showChoice(): void {
    this.#root.hidden = false
    this.#root.innerHTML = renderConnectionChoiceScreen()
  }

  #showCredentials(message?: string): void {
    this.#root.hidden = false
    this.#root.innerHTML = renderCredentialsScreen()
    if (message) {
      const alert = this.#root.querySelector<HTMLElement>('[data-role="form-error"]')
      if (alert) {
        alert.textContent = message
        alert.hidden = false
      }
    }
  }

  #onClick = (event: Event): void => {
    const target = event.target instanceof Element ? event.target.closest<HTMLElement>('button') : null
    if (!target) return

    const account = target.dataset.account
    if (account) {
      void this.#connectStoredAccount(account)
      return
    }

    switch (target.dataset.action) {
      case 'start':
        this.#showChoice()
        break
      case 'back':
        this.#showWelcome()
        break
      case 'password':
      case 'use-password':
        void this.#cancelPairing()
        this.#showCredentials()
        break
      case 'pair':
      case 'retry':
        void this.#startPairing()
        break
      case 'cancel-pairing':
        void this.#cancelPairing()
        this.#showChoice()
        break
      case 'toggle-password':
        this.#togglePassword(target)
        break
    }
  }

  #onSubmit = (event: SubmitEvent): void => {
    const form = event.target
    if (!(form instanceof HTMLFormElement) || form.dataset.form !== 'credentials') return
    event.preventDefault()
    const data = new FormData(form)
    void this.#connectPassword({
      identifier: String(data.get('identifier') ?? ''),
      password: String(data.get('password') ?? ''),
      remember: data.get('remember') === 'on',
    })
  }

  #togglePassword(button: HTMLElement): void {
    const password = this.#root.querySelector<HTMLInputElement>('[name="password"]')
    if (!password) return
    const show = password.type === 'password'
    password.type = show ? 'text' : 'password'
    button.setAttribute('aria-label', show ? 'Masquer le mot de passe' : 'Afficher le mot de passe')
  }

  async #connectPassword(input: PasswordLoginInput): Promise<void> {
    try {
      const prepared = await this.#bridge.preparePasswordLogin(input)
      await this.#connectAndPersist(
        prepared.jid,
        {
          version: 1,
          authKind: 'password',
          secret: prepared.password,
        },
        prepared.remember,
      )
    } catch (error) {
      this.#showCredentials(errorMessage(error))
    }
  }

  async #connectStoredAccount(jid: string): Promise<void> {
    try {
      this.#root.innerHTML = renderLoadingScreen('Ouverture de vos conversations…')
      const credential = await this.#bridge.loadCredential(jid)
      if (!credential) {
        throw new Error('Ce compte n’est plus disponible dans Windows.')
      }
      await this.#connectAndPersist(jid, credential, true)
    } catch (error) {
      this.#root.innerHTML = renderErrorScreen(errorMessage(error))
    }
  }

  async #startPairing(): Promise<void> {
    this.#clearPolling()
    this.#root.innerHTML = renderLoadingScreen('Création d’un QR code sécurisé…')
    try {
      const session = await this.#bridge.beginPairing()
      this.#pairingSessionId = session.sessionId
      const qrDataUrl = await this.#encodeQr(session.approvalUri)
      this.#root.innerHTML = renderPairingScreen({
        qrDataUrl,
        verificationCode: session.verificationCode,
        expiresAt: session.expiresAt,
      })
      this.#pollTimer = setInterval(() => {
        void this.#pollPairing()
      }, 2_000)
    } catch (error) {
      this.#root.innerHTML = renderErrorScreen(errorMessage(error))
    }
  }

  async #pollPairing(): Promise<void> {
    const sessionId = this.#pairingSessionId
    if (!sessionId || this.#pollInFlight) return
    this.#pollInFlight = true
    try {
      const result = await this.#bridge.pollPairing(sessionId)
      if (result.status === 'pending') return
      this.#clearPolling()
      if (result.status === 'expired') {
        this.#root.innerHTML = renderErrorScreen('Le QR code a expiré. Générez-en un nouveau.')
        return
      }
      if (result.status === 'rejected') {
        this.#root.innerHTML = renderErrorScreen('L’association a été refusée sur le téléphone.')
        return
      }
      await this.#connectAndPersist(
        result.jid,
        {
          version: 1,
          authKind: 'oauth',
          secret: result.accessToken,
          deviceId: result.deviceId,
          expiresAt: result.tokenExpiresAt,
        },
        true,
      )
    } catch (error) {
      this.#clearPolling()
      this.#root.innerHTML = renderErrorScreen(errorMessage(error))
    } finally {
      this.#pollInFlight = false
    }
  }

  async #connectAndPersist(
    jid: string,
    credential: DesktopCredential,
    remember: boolean,
  ): Promise<void> {
    if (!this.#bootstrap) {
      throw new Error('Configuration de MAER Chat indisponible')
    }
    this.#root.hidden = false
    this.#root.innerHTML = renderLoadingScreen('Connexion sécurisée en cours…')
    await this.#chat.connect({
      jid,
      secret: credential.secret,
      authKind: credential.authKind,
      endpoints: {
        websocketUrl: this.#bootstrap.websocketUrl,
        boshServiceUrl: this.#bootstrap.boshServiceUrl,
      },
    })
    await this.#bridge.saveValidatedCredential({ jid, remember, credential })
    this.#root.replaceChildren()
    this.#root.hidden = true
  }

  async #cancelPairing(): Promise<void> {
    const sessionId = this.#pairingSessionId
    this.#clearPolling()
    if (sessionId) {
      try {
        await this.#bridge.cancelPairing(sessionId)
      } catch {
        // The local ephemeral key is already gone, so a server cleanup failure is harmless.
      }
    }
  }

  #clearPolling(): void {
    if (this.#pollTimer) clearInterval(this.#pollTimer)
    this.#pollTimer = undefined
    this.#pairingSessionId = undefined
    this.#pollInFlight = false
  }
}
