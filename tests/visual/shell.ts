import 'converse.js/dist/converse.css'
import packageMetadata from '../../package.json'
import { RendererPluginRegistry } from '../../src/plugins/core/renderer/plugin-registry'
import { FIRST_PARTY_RENDERER_PLUGINS } from '../../src/plugins/renderer-registry'
import '../../src/renderer/converse-maer.css'
import { installMaerDesktopShell } from '../../src/renderer/desktop-shell'

const vaultPreview = new URLSearchParams(window.location.search).get('plugin') === 'vault'
const previewEntry = Object.freeze({
  id: 'AQIDBAUGBwgJCgsMDQ4PEA==',
  title: 'Compte MAER',
  username: 'emilien',
  url: 'https://xmpp.maer.fr/',
  updatedAt: '2026-08-27T12:00:00.000Z',
})

if (vaultPreview) {
  window.maerPlugins = Object.freeze({
    passwordVault: Object.freeze({
      async status() { return { state: 'unlocked' as const, entryCount: 1 } },
      async initialize() { return { state: 'unlocked' as const, entryCount: 0 } },
      async unlock() { return { state: 'unlocked' as const, entryCount: 1 } },
      async lock() { return { state: 'locked' as const, entryCount: null } },
      async list() { return [previewEntry] },
      async search() { return [previewEntry] },
      async add() { return previewEntry },
      async update() { return previewEntry },
      async delete() { return { entryId: previewEntry.id, deleted: true as const } },
      async generate() { return 'Preview-Generated-234' },
      async copy() {
        return { entryId: previewEntry.id, copied: true as const, clearAfterSeconds: 30 }
      },
      async copyUsername() {
        return { entryId: previewEntry.id, usernameCopied: true as const, clearAfterSeconds: 30 }
      },
      async reveal() { return { entryId: previewEntry.id, password: 'Preview-Secret-234' } },
      async openUrl() { return { entryId: previewEntry.id, opened: true as const } },
      async exportBackup() { return { operation: 'export' as const, completed: true, entryCount: 1 } },
      async importBackup() { return { operation: 'import' as const, completed: true, entryCount: 1 } },
      async reset() { return { state: 'uninitialized' as const, entryCount: null } },
      async openExtensionFolder() {
        return { target: 'folder' as const, opened: true as const }
      },
      async openExtensionGuide() {
        return { target: 'guide' as const, opened: true as const }
      },
    }),
  })
}

const style = document.createElement('style')
style.textContent = `
  .mock-chat-flyout { display: flex; flex-direction: column; }
  .mock-chat-title { display: flex; flex: 1 1 auto; align-items: center; }
  .mock-avatar { display: inline-flex; align-items: center; justify-content: center; color: #fff; background: linear-gradient(135deg, #0057b8, #0089e6); font-weight: 700; }
  .mock-avatar-cyan { background: linear-gradient(135deg, #007f8b, #13b5c8); }
  .mock-avatar-purple { background: linear-gradient(135deg, #7047b7, #a66ce0); }
  .chat-status--avatar { background: #32d583 !important; }
  .mock-search { font-size: 25px; line-height: 1; }
  .maer-visual-test *, .maer-visual-test *::before, .maer-visual-test *::after {
    caret-color: transparent !important;
    transition: none !important;
    animation: none !important;
  }
`
document.head.append(style)

const rendererPlugins = new RendererPluginRegistry({
  appVersion: packageMetadata.version,
  // The baseline protects the WhatsApp discussion/call shell independently of
  // legitimate first-party rail contributions such as Password Vault.
  plugins: vaultPreview ? FIRST_PARTY_RENDERER_PLUGINS : [],
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

if (vaultPreview) {
  document.querySelector<HTMLButtonElement>('[aria-label="Mots de passe"]')?.click()
}
