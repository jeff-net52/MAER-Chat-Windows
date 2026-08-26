import 'converse.js/dist/converse.css'
import packageMetadata from '../../package.json'
import { RendererPluginRegistry } from '../../src/plugins/core/renderer/plugin-registry'
import { FIRST_PARTY_RENDERER_PLUGINS } from '../../src/plugins/renderer-registry'
import '../../src/renderer/converse-maer.css'
import { installMaerDesktopShell } from '../../src/renderer/desktop-shell'

const style = document.createElement('style')
style.textContent = `
  .mock-chat-flyout { display: flex; flex-direction: column; }
  .mock-chat-title { display: flex; flex: 1 1 auto; align-items: center; }
  .mock-avatar { display: inline-flex; align-items: center; justify-content: center; color: #fff; background: linear-gradient(135deg, #0057b8, #0089e6); font-weight: 700; }
  .mock-avatar-cyan { background: linear-gradient(135deg, #007f8b, #13b5c8); }
  .mock-avatar-purple { background: linear-gradient(135deg, #7047b7, #a66ce0); }
  .chat-status--avatar { background: #32d583 !important; }
  .mock-search { font-size: 25px; line-height: 1; }
`
document.head.append(style)

const rendererPlugins = new RendererPluginRegistry({
  appVersion: packageMetadata.version,
  plugins: FIRST_PARTY_RENDERER_PLUGINS,
})
const pluginReport = await rendererPlugins.activateAll()
if (pluginReport.failures.length > 0) {
  throw new Error('Le registre de plugins du harnais visuel n’a pas pu être activé.')
}

installMaerDesktopShell({
  accountJid: 'emilien@xmpp.maer.fr',
  async onLogout() {},
  applyChatPreferences() {},
  pluginRegistry: rendererPlugins,
})

const railLogo = document.querySelector<HTMLImageElement>('.maer-rail-logo')
if (railLogo) {
  railLogo.src = new URL('../../src/renderer/public/maer-chat-mark.png', import.meta.url).href
}
