import 'converse.js/dist/converse.css'
import QRCode from 'qrcode'
import packageMetadata from '../../package.json'
import './styles.css'
import './converse-maer.css'
import { RendererPluginRegistry } from '../plugins/core/renderer/plugin-registry'
import { FIRST_PARTY_RENDERER_PLUGINS } from '../plugins/renderer-registry'
import { ConverseChatConnector } from './converse-connector'
import { OnboardingController } from './onboarding-controller'

const root = document.querySelector<HTMLElement>('#onboarding-root')
if (!root) {
  throw new Error('La racine de l’interface est absente.')
}

const rendererPlugins = new RendererPluginRegistry({
  appVersion: packageMetadata.version,
  plugins: FIRST_PARTY_RENDERER_PLUGINS,
})

const controller = new OnboardingController(
  root,
  window.maerDesktop,
  new ConverseChatConnector(rendererPlugins),
  async (payload) =>
    QRCode.toDataURL(payload, {
      errorCorrectionLevel: 'H',
      margin: 4,
      width: 328,
      color: {
        dark: '#0B1F33',
        light: '#FFFFFFFF',
      },
    }),
)

void rendererPlugins.activateAll().then(() => controller.start()).catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Impossible de démarrer MAER Chat.'
  root.innerHTML = `<main class="onboarding error-screen"><section class="error-card"><h1>MAER Chat n’a pas pu démarrer</h1><p role="alert"></p></section></main>`
  const alert = root.querySelector('[role="alert"]')
  if (alert) alert.textContent = message
})

window.addEventListener(
  'beforeunload',
  () => {
    controller.dispose()
    void rendererPlugins.deactivateAll()
  },
  { once: true },
)
