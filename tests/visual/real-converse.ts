import converse from 'converse.js'
import 'converse.js/dist/converse.css'
import '../../src/renderer/converse-maer.css'
import { installMaerDesktopShell } from '../../src/renderer/desktop-shell'

declare global {
  interface Window {
    __maerRealConverseFailure?: string
  }
}

document.documentElement.dataset.maerRealConverseReady = 'initializing'

try {
  let initializationFailure: unknown
  void Promise.resolve(converse.initialize({
    authentication: 'login',
    auto_login: false,
    auto_reconnect: false,
    discover_connection_methods: false,
    i18n: 'en',
    loglevel: 'error',
    show_controlbox_by_default: true,
    singleton: false,
    view_mode: 'fullscreen',
    websocket_url: 'wss://xmpp.maer.fr/xmpp-websocket',
  })).catch((error: unknown) => {
    initializationFailure = error
  })

  await customElements.whenDefined('converse-chats')
  const deadline = Date.now() + 15_000
  while (!document.querySelector('#controlbox') && Date.now() < deadline) {
    if (initializationFailure) throw initializationFailure
    await new Promise((resolve) => window.setTimeout(resolve, 25))
  }
  if (!document.querySelector('#controlbox')) {
    throw new Error('Le vrai controlbox Converse n’a pas été créé.')
  }
  installMaerDesktopShell({
    accountJid: 'visual-test@xmpp.maer.fr',
    async onLogout() {},
    applyChatPreferences() {},
  })
  document.documentElement.dataset.maerRealConverseReady = 'true'
} catch (error) {
  window.__maerRealConverseFailure = error instanceof Error ? error.message : String(error)
  document.documentElement.dataset.maerRealConverseReady = 'failed'
}
