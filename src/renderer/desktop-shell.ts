import {
  DEFAULT_MEETING_ORIGIN,
  createMeetingUrl,
  openMeetingExternally,
  startConversationCall,
  type CallConversation,
  type CallMode,
  type StartedCall,
} from './call-service'
import type { RendererPluginRegistry } from '../plugins/core/renderer/plugin-registry'

export type ThemePreference = 'system' | 'light' | 'dark'

export interface DesktopPreferences {
  theme: ThemePreference
  notifications: boolean
  sounds: boolean
}

export interface DesktopShellOptions {
  accountJid: string
  onLogout(): Promise<void>
  applyChatPreferences(preferences: DesktopPreferences): void
  pluginRegistry?: RendererPluginRegistry
}

const PREFERENCES_KEY = 'maer.desktop.preferences.v1'
const CALL_HISTORY_KEY = 'maer.desktop.call-history.v1'
const PUBLIC_MEETING_CONSENT_KEY = 'maer.desktop.public-meeting-consent.v1'
const DEFAULT_PREFERENCES: DesktopPreferences = {
  theme: 'system',
  notifications: true,
  sounds: true,
}

let shellOptions: DesktopShellOptions | undefined
let conversationSidebarObserver: MutationObserver | undefined
let conversationSidebarSyncPending = false
let conversationSearch = ''
let conversationFilter: 'all' | 'unread' = 'all'
let pluginPanelCleanup: (() => void) | undefined
let pluginSettingsCleanups: Array<() => void> = []

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

export function loadDesktopPreferences(): DesktopPreferences {
  const stored = readJson<Partial<DesktopPreferences>>(PREFERENCES_KEY, {})
  return {
    theme:
      stored.theme === 'dark' || stored.theme === 'light' || stored.theme === 'system'
        ? stored.theme
        : DEFAULT_PREFERENCES.theme,
    notifications:
      typeof stored.notifications === 'boolean'
        ? stored.notifications
        : DEFAULT_PREFERENCES.notifications,
    sounds: typeof stored.sounds === 'boolean' ? stored.sounds : DEFAULT_PREFERENCES.sounds,
  }
}

function saveDesktopPreferences(preferences: DesktopPreferences): void {
  localStorage.setItem(PREFERENCES_KEY, JSON.stringify(preferences))
}

function applyTheme(theme: ThemePreference): void {
  if (theme === 'system') {
    delete document.documentElement.dataset.maerTheme
  } else {
    document.documentElement.dataset.maerTheme = theme
  }
}

function callHistory(): StartedCall[] {
  const history = readJson<StartedCall[]>(CALL_HISTORY_KEY, [])
  return Array.isArray(history) ? history.slice(0, 20) : []
}

function rememberCall(call: StartedCall): void {
  localStorage.setItem(CALL_HISTORY_KEY, JSON.stringify([call, ...callHistory()].slice(0, 20)))
}

function confirmMeetingProvider(): boolean {
  if (new URL(DEFAULT_MEETING_ORIGIN).hostname !== 'meet.jit.si') return true
  if (localStorage.getItem(PUBLIC_MEETING_CONSENT_KEY) === 'accepted') return true
  const accepted = window.confirm(
    'Les appels audio/vidéo utilisent provisoirement le service public Jitsi Meet. ' +
      'Le contenu audio, vidéo et le partage d’écran ne transitent donc pas par le serveur XMPP MAER. Continuer ?',
  )
  if (accepted) localStorage.setItem(PUBLIC_MEETING_CONSENT_KEY, 'accepted')
  return accepted
}

function icon(path: string): string {
  return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${path}"></path></svg>`
}

function shellMarkup(): string {
  return `<div id="maer-desktop-shell">
    <nav id="maer-app-rail" aria-label="Navigation principale">
      <img class="maer-rail-logo" src="./maer-chat-mark.png" alt="MAER Chat" />
      <div class="maer-rail-main">
        <button class="maer-rail-button is-active" type="button" data-maer-view="chats" aria-label="Discussions" title="Discussions">
          ${icon('M4 4h16v13H7l-3 3V4zm3 4v2h10V8H7zm0 4v2h7v-2H7z')}
        </button>
        <button class="maer-rail-button" type="button" data-maer-view="calls" aria-label="Appels" title="Appels">
          ${icon('M6.6 10.8a15.6 15.6 0 0 0 6.6 6.6l2.2-2.2c.3-.3.8-.4 1.2-.2 1.3.5 2.7.8 4.2.8.7 0 1.2.5 1.2 1.2v3.8c0 .7-.5 1.2-1.2 1.2C10.4 22 2 13.6 2 3.2 2 2.5 2.5 2 3.2 2H7c.7 0 1.2.5 1.2 1.2 0 1.5.3 2.9.8 4.2.1.4.1.9-.2 1.2l-2.2 2.2z')}
        </button>
      </div>
      <div class="maer-rail-bottom">
        <button class="maer-rail-button" type="button" data-maer-view="settings" aria-label="Paramètres" title="Paramètres">
          ${icon('M19.1 13a7.2 7.2 0 0 0 0-2l2.1-1.6-2-3.4-2.5 1a8.4 8.4 0 0 0-1.8-1L14.5 3h-4L10 6a8.4 8.4 0 0 0-1.8 1L5.7 6l-2 3.4L5.8 11a7.2 7.2 0 0 0 0 2l-2.1 1.6 2 3.4 2.5-1a8.4 8.4 0 0 0 1.8 1l.5 3h4l.5-3a8.4 8.4 0 0 0 1.8-1l2.5 1 2-3.4L19.1 13zM12.5 15.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7z')}
        </button>
        <button class="maer-account-avatar" type="button" data-maer-view="settings" aria-label="Compte MAER" title="Compte MAER">M</button>
      </div>
    </nav>
    <aside id="maer-side-panel" aria-label="Panneau MAER Chat" hidden>
      <header><button type="button" data-maer-action="close-panel" aria-label="Fermer">←</button><h2 data-maer-panel-title></h2></header>
      <div data-maer-panel-content></div>
    </aside>
    <div id="maer-toast" role="status" aria-live="polite" hidden></div>
  </div>`
}

function conversationSidebarMarkup(): string {
  return `<section id="maer-conversation-sidebar" aria-label="Discussions">
    <div class="maer-conversation-titlebar">
      <h1>Discussions</h1>
      <div class="maer-conversation-actions">
        <button class="maer-new-chat-button" type="button" data-maer-conversation-action="new-chat" aria-label="Ajouter un contact" title="Ajouter un contact">
          ${icon('M11 4h2v7h7v2h-7v7h-2v-7H4v-2h7V4z')}
        </button>
      </div>
    </div>
    <div class="maer-conversation-search" role="search">
      ${icon('M10.5 4a6.5 6.5 0 1 0 3.99 11.63L19.86 21 21 19.86l-5.37-5.37A6.5 6.5 0 0 0 10.5 4zm0 2a4.5 4.5 0 1 1 0 9 4.5 4.5 0 0 1 0-9z')}
      <input type="search" data-maer-conversation-search autocomplete="off" spellcheck="false" aria-label="Rechercher une discussion" placeholder="Rechercher ou démarrer une discussion" />
      <button class="maer-search-clear" type="button" data-maer-conversation-action="clear-search" aria-label="Effacer la recherche" title="Effacer" hidden>×</button>
    </div>
    <div class="maer-conversation-filters" role="group" aria-label="Filtrer les discussions">
      <button class="maer-filter-chip is-active" type="button" data-maer-conversation-filter="all" aria-pressed="true">Toutes</button>
      <button class="maer-filter-chip" type="button" data-maer-conversation-filter="unread" aria-pressed="false">Non lues <span class="maer-filter-count" data-maer-unread-count hidden></span></button>
    </div>
    <p class="maer-filter-empty" data-maer-filter-empty hidden>Aucune discussion correspondante.</p>
  </section>`
}

function rosterConversationItems(): HTMLElement[] {
  return [
    ...document.querySelectorAll<HTMLElement>(
      '#controlbox #converse-roster .roster-group-contacts .list-item',
    ),
  ]
}

function syncConversationFilters(): void {
  const normalizedSearch = conversationSearch.trim().toLocaleLowerCase('fr')
  const items = rosterConversationItems()
  let unreadCount = 0
  let visibleCount = 0

  for (const item of items) {
    const isUnread = Boolean(item.querySelector('.msgs-indicator, .unread-msgs'))
    if (isUnread) unreadCount += 1
    const searchableText = item.textContent?.toLocaleLowerCase('fr') ?? ''
    const visible =
      (!normalizedSearch || searchableText.includes(normalizedSearch)) &&
      (conversationFilter === 'all' || isUnread)
    item.classList.toggle('maer-filter-hidden', !visible)
    if (visible) visibleCount += 1
  }

  const unreadBadge = document.querySelector<HTMLElement>('[data-maer-unread-count]')
  if (unreadBadge) {
    const value = String(unreadCount)
    if (unreadBadge.textContent !== value) unreadBadge.textContent = value
    unreadBadge.hidden = unreadCount === 0
  }
  const emptyState = document.querySelector<HTMLElement>('[data-maer-filter-empty]')
  if (emptyState) emptyState.hidden = items.length === 0 || visibleCount > 0

  document.querySelectorAll<HTMLButtonElement>('[data-maer-conversation-filter]').forEach((button) => {
    const active = button.dataset.maerConversationFilter === conversationFilter
    button.classList.toggle('is-active', active)
    button.setAttribute('aria-pressed', String(active))
  })
}

function onConversationSidebarClick(event: Event): void {
  const button = event.target instanceof Element ? event.target.closest<HTMLButtonElement>('button') : null
  if (!button) return
  const filter = button.dataset.maerConversationFilter
  if (filter === 'all' || filter === 'unread') {
    conversationFilter = filter
    syncConversationFilters()
    return
  }
  if (button.dataset.maerConversationAction === 'clear-search') {
    const search = document.querySelector<HTMLInputElement>('[data-maer-conversation-search]')
    if (search) {
      search.value = ''
      search.focus()
    }
    conversationSearch = ''
    button.hidden = true
    syncConversationFilters()
    return
  }
  if (button.dataset.maerConversationAction === 'new-chat') {
    const nativeAddContact = document.querySelector<HTMLElement>('#controlbox .add-contact')
    if (nativeAddContact) nativeAddContact.click()
    else showToast("L’ajout de contact n’est pas encore disponible.")
  }
}

function onConversationSidebarInput(event: Event): void {
  if (!(event.target instanceof HTMLInputElement)) return
  if (!event.target.matches('[data-maer-conversation-search]')) return
  conversationSearch = event.target.value
  const clear = document.querySelector<HTMLButtonElement>('[data-maer-conversation-action="clear-search"]')
  if (clear) clear.hidden = conversationSearch.length === 0
  syncConversationFilters()
}

function syncConversationSidebar(): void {
  const flyout = document.querySelector<HTMLElement>('#controlbox .box-flyout')
  if (!flyout) return
  let header = flyout.querySelector<HTMLElement>('#maer-conversation-sidebar')
  if (!header) {
    flyout.insertAdjacentHTML('afterbegin', conversationSidebarMarkup())
    header = flyout.querySelector<HTMLElement>('#maer-conversation-sidebar')
    header?.addEventListener('click', onConversationSidebarClick)
    header?.addEventListener('input', onConversationSidebarInput)
  }
  const search = header?.querySelector<HTMLInputElement>('[data-maer-conversation-search]')
  if (search && search.value !== conversationSearch) search.value = conversationSearch
  const clear = header?.querySelector<HTMLButtonElement>('[data-maer-conversation-action="clear-search"]')
  if (clear) clear.hidden = conversationSearch.length === 0

  document.body.classList.add('maer-conversation-sidebar-ready')
  const chatrooms = flyout.querySelector<HTMLElement>('#chatrooms')
  chatrooms?.classList.toggle(
    'maer-section-empty',
    !chatrooms.querySelector('.items-list .list-item'),
  )
  flyout
    .querySelectorAll<HTMLElement>('#converse-roster .roster-group > .list-toggle')
    .forEach((heading) => {
      const label = heading.textContent?.trim().toLocaleLowerCase('fr') ?? ''
      heading.classList.toggle(
        'maer-default-group-heading',
        label === 'sans groupe' || label === 'ungrouped',
      )
    })
  syncConversationFilters()
}

function scheduleConversationSidebarSync(): void {
  if (conversationSidebarSyncPending) return
  conversationSidebarSyncPending = true
  queueMicrotask(() => {
    conversationSidebarSyncPending = false
    if (typeof document === 'undefined') return
    syncConversationSidebar()
  })
}

function installConversationSidebar(): void {
  conversationSidebarObserver?.disconnect()
  syncConversationSidebar()
  conversationSidebarObserver = new MutationObserver(scheduleConversationSidebarSync)
  conversationSidebarObserver.observe(document.body, { childList: true, subtree: true })
}

function uninstallConversationSidebar(): void {
  conversationSidebarObserver?.disconnect()
  conversationSidebarObserver = undefined
  document.querySelector('#maer-conversation-sidebar')?.remove()
  document
    .querySelectorAll('.maer-filter-hidden')
    .forEach((element) => element.classList.remove('maer-filter-hidden'))
  document
    .querySelectorAll('.maer-section-empty')
    .forEach((element) => element.classList.remove('maer-section-empty'))
  document
    .querySelectorAll('.maer-default-group-heading')
    .forEach((element) => element.classList.remove('maer-default-group-heading'))
  document.body.classList.remove('maer-conversation-sidebar-ready')
  conversationSearch = ''
  conversationFilter = 'all'
}

function panel(): HTMLElement | null {
  return document.querySelector<HTMLElement>('#maer-side-panel')
}

function activateRail(view: string): void {
  document
    .querySelectorAll<HTMLElement>('[data-maer-view], [data-maer-plugin-key]')
    .forEach((button) => {
      button.classList.toggle(
        'is-active',
        button.dataset.maerView === view || button.dataset.maerPluginKey === view,
      )
    })
}

const PLUGIN_ICON_PATHS = {
  extension:
    'M12 2a4 4 0 0 1 4 4v2h2a4 4 0 1 1 0 8h-2v2a4 4 0 1 1-8 0v-2H6a4 4 0 1 1 0-8h2V6a4 4 0 0 1 4-4z',
  tool: 'M14.7 6.3a4 4 0 0 0-5-5L12 3.6 9.6 6 7.3 3.7a4 4 0 0 0 5 5L4 17a2.1 2.1 0 1 0 3 3l8.3-8.3a4 4 0 0 0 5-5L18 9l-2.4-2.4 2.3-2.3a4 4 0 0 0-3.2 2z',
  vault:
    'M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zm7 4a5 5 0 1 0 0 10 5 5 0 0 0 0-10zm0 2a3 3 0 0 1 1 5.8V17h-2v-2.2A3 3 0 0 1 12 9z',
} as const

function clearPluginPanel(): void {
  pluginPanelCleanup?.()
  pluginPanelCleanup = undefined
}

function clearPluginSettings(): void {
  for (const cleanup of pluginSettingsCleanups.splice(0).reverse()) cleanup()
}

function installPluginRail(): void {
  const registry = shellOptions?.pluginRegistry
  if (!registry) return
  for (const contribution of registry.railContributions()) {
    const selector = contribution.placement === 'main' ? '.maer-rail-main' : '.maer-rail-bottom'
    const target = document.querySelector<HTMLElement>(selector)
    if (!target) continue
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'maer-rail-button'
    button.dataset.maerPluginId = contribution.pluginId
    button.dataset.maerPluginPanel = contribution.panelId
    button.dataset.maerPluginKey = contribution.key
    button.setAttribute('aria-label', contribution.label)
    button.title = contribution.label
    button.innerHTML = icon(PLUGIN_ICON_PATHS[contribution.iconId])
    if (contribution.placement === 'bottom') {
      target.insertBefore(button, target.querySelector('[data-maer-view="settings"]'))
    } else {
      target.append(button)
    }
  }
}

function showToast(message: string): void {
  const toast = document.querySelector<HTMLElement>('#maer-toast')
  if (!toast) return
  toast.textContent = message
  toast.hidden = false
  window.setTimeout(() => {
    toast.hidden = true
  }, 4200)
}

function renderCallsPanel(container: HTMLElement): void {
  const history = callHistory()
  container.innerHTML = `<section class="maer-panel-section maer-calls-intro">
      <div class="maer-feature-icon">${icon('M15 10l4.5-3v10L15 14v3H4V7h11v3z')}</div>
      <h3>Appels audio et vidéo</h3>
      <p>Dans une discussion, utilisez les boutons téléphone, caméra ou écran. Un lien privé à usage ponctuel est envoyé au contact.</p>
      <button type="button" class="maer-primary-action" data-maer-action="test-meeting">Ouvrir une réunion de test</button>
    </section>
    <section class="maer-panel-section"><h3>Appels récents</h3><div data-maer-call-history></div></section>`
  const historyRoot = container.querySelector<HTMLElement>('[data-maer-call-history]')
  if (!historyRoot) return
  if (history.length === 0) {
    historyRoot.innerHTML = '<p class="maer-empty-state">Aucun appel récent.</p>'
    return
  }
  for (const call of history) {
    const row = document.createElement('div')
    row.className = 'maer-call-row'
    const copy = document.createElement('div')
    const title = document.createElement('strong')
    title.textContent = call.targetJid
    const detail = document.createElement('small')
    detail.textContent = `${call.mode === 'audio' ? 'Audio' : call.mode === 'video' ? 'Vidéo' : 'Écran'} · ${new Date(call.startedAt).toLocaleString('fr-FR')}`
    copy.append(title, detail)
    const reopen = document.createElement('button')
    reopen.type = 'button'
    reopen.textContent = 'Rejoindre'
    reopen.addEventListener('click', () => openMeetingExternally(call.meetingUrl))
    row.append(copy, reopen)
    historyRoot.append(row)
  }
}

function renderSettingsPanel(container: HTMLElement): void {
  clearPluginSettings()
  const preferences = loadDesktopPreferences()
  container.innerHTML = `<section class="maer-account-card">
      <span class="maer-settings-avatar"></span>
      <div><strong data-maer-account></strong><small>Compte XMPP MAER</small></div>
    </section>
    <section class="maer-panel-section">
      <h3>Apparence</h3>
      <label class="maer-setting-row"><span><strong>Thème</strong><small>Adapter les couleurs de l’application</small></span>
        <select data-maer-setting="theme">
          <option value="system">Système</option><option value="light">Clair</option><option value="dark">Sombre</option>
        </select>
      </label>
    </section>
    <section class="maer-panel-section">
      <h3>Notifications</h3>
      <label class="maer-setting-row"><span><strong>Notifications Windows</strong><small>Prévenir des nouveaux messages</small></span><input type="checkbox" data-maer-setting="notifications" /></label>
      <label class="maer-setting-row"><span><strong>Sons</strong><small>Jouer un son pour les nouveaux messages</small></span><input type="checkbox" data-maer-setting="sounds" /></label>
    </section>
    <section class="maer-panel-section">
      <h3>Audio et vidéo</h3>
      <p>Vérifiez les autorisations de la caméra et du microphone avant un appel.</p>
      <button type="button" class="maer-secondary-action" data-maer-action="test-media">Tester caméra et micro</button>
      <div class="maer-media-test" data-maer-media-test hidden><video autoplay muted playsinline></video><p role="status"></p><button type="button" data-maer-action="stop-media">Arrêter le test</button></div>
    </section>
    <section class="maer-panel-section maer-provider-note"><h3>Visioconférence</h3><p>Les réunions s’ouvrent actuellement sur Jitsi Meet. Le nom du salon est aléatoire et ne contient aucune adresse XMPP.</p></section>
    <button type="button" class="maer-danger-action" data-maer-action="logout">Se déconnecter sur cet ordinateur</button>`

  const account = container.querySelector<HTMLElement>('[data-maer-account]')
  if (account) account.textContent = shellOptions?.accountJid ?? ''
  const avatar = container.querySelector<HTMLElement>('.maer-settings-avatar')
  if (avatar) avatar.textContent = (shellOptions?.accountJid[0] ?? 'M').toLocaleUpperCase('fr')
  const theme = container.querySelector<HTMLSelectElement>('[data-maer-setting="theme"]')
  if (theme) theme.value = preferences.theme
  const notifications = container.querySelector<HTMLInputElement>('[data-maer-setting="notifications"]')
  if (notifications) notifications.checked = preferences.notifications
  const sounds = container.querySelector<HTMLInputElement>('[data-maer-setting="sounds"]')
  if (sounds) sounds.checked = preferences.sounds

  const registry = shellOptions?.pluginRegistry
  if (!registry) return
  for (const contribution of registry.settingsContributions()) {
    const section = document.createElement('section')
    section.className = 'maer-panel-section maer-plugin-settings-section'
    section.dataset.maerPluginSettings = contribution.key
    const heading = document.createElement('h3')
    heading.textContent = contribution.title
    const pluginRoot = document.createElement('div')
    section.append(heading, pluginRoot)
    container.append(section)
    const cleanup = registry.mountSettings(
      contribution.pluginId,
      contribution.id,
      pluginRoot,
    )
    if (cleanup) pluginSettingsCleanups.push(cleanup)
    else section.remove()
  }
}

function openPanel(view: 'calls' | 'settings'): void {
  clearPluginPanel()
  if (view !== 'settings') clearPluginSettings()
  const target = panel()
  if (!target) return
  const title = target.querySelector<HTMLElement>('[data-maer-panel-title]')
  const content = target.querySelector<HTMLElement>('[data-maer-panel-content]')
  if (!title || !content) return
  title.textContent = view === 'calls' ? 'Appels' : 'Paramètres'
  if (view === 'calls') renderCallsPanel(content)
  else renderSettingsPanel(content)
  target.hidden = false
  activateRail(view)
}

function openPluginPanel(pluginId: string, panelId: string, railKey: string): void {
  clearPluginPanel()
  clearPluginSettings()
  const registry = shellOptions?.pluginRegistry
  const contribution = registry?.panel(pluginId, panelId)
  const target = panel()
  const title = target?.querySelector<HTMLElement>('[data-maer-panel-title]')
  const content = target?.querySelector<HTMLElement>('[data-maer-panel-content]')
  if (!registry || !contribution || !target || !title || !content) return
  title.textContent = contribution.title
  content.replaceChildren()
  const pluginRoot = document.createElement('div')
  pluginRoot.className = 'maer-plugin-panel-root'
  content.append(pluginRoot)
  const cleanup = registry.mountPanel(pluginId, panelId, pluginRoot)
  if (!cleanup) {
    pluginRoot.textContent = 'Ce module est temporairement indisponible.'
  } else {
    pluginPanelCleanup = cleanup
  }
  target.hidden = false
  activateRail(railKey)
}

function closePanel(): void {
  clearPluginPanel()
  clearPluginSettings()
  const target = panel()
  if (target) target.hidden = true
  activateRail('chats')
}

async function testMedia(): Promise<void> {
  const root = document.querySelector<HTMLElement>('[data-maer-media-test]')
  const video = root?.querySelector<HTMLVideoElement>('video')
  const status = root?.querySelector<HTMLElement>('[role="status"]')
  if (!root || !video || !status || !navigator.mediaDevices?.getUserMedia) {
    showToast('Caméra et microphone indisponibles sur cet appareil.')
    return
  }
  root.hidden = false
  status.textContent = 'Demande d’autorisation en cours…'
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true })
    video.srcObject = stream
    status.textContent = 'Caméra et microphone opérationnels.'
  } catch {
    status.textContent = 'Autorisation refusée ou périphérique indisponible.'
  }
}

function stopMedia(): void {
  const root = document.querySelector<HTMLElement>('[data-maer-media-test]')
  const video = root?.querySelector<HTMLVideoElement>('video')
  const stream = video?.srcObject
  const mediaStream = stream as MediaStream | null | undefined
  if (mediaStream && typeof mediaStream.getTracks === 'function') {
    mediaStream.getTracks().forEach((track) => track.stop())
  }
  if (video) video.srcObject = null
  if (root) root.hidden = true
}

function onShellClick(event: Event): void {
  const button = event.target instanceof Element ? event.target.closest<HTMLButtonElement>('button') : null
  if (!button) return
  const view = button.dataset.maerView
  if (view === 'chats') closePanel()
  if (view === 'calls' || view === 'settings') openPanel(view)
  if (
    button.dataset.maerPluginId &&
    button.dataset.maerPluginPanel &&
    button.dataset.maerPluginKey
  ) {
    openPluginPanel(
      button.dataset.maerPluginId,
      button.dataset.maerPluginPanel,
      button.dataset.maerPluginKey,
    )
  }
  switch (button.dataset.maerAction) {
    case 'close-panel':
      closePanel()
      break
    case 'test-meeting':
      if (confirmMeetingProvider()) openMeetingExternally(createMeetingUrl('video'))
      break
    case 'test-media':
      void testMedia()
      break
    case 'stop-media':
      stopMedia()
      break
    case 'logout':
      button.disabled = true
      void shellOptions?.onLogout()
      break
  }
}

function onShellChange(event: Event): void {
  const input = event.target
  if (!(input instanceof HTMLInputElement || input instanceof HTMLSelectElement)) return
  const key = input.dataset.maerSetting
  if (!key) return
  const preferences = loadDesktopPreferences()
  if (key === 'theme' && input instanceof HTMLSelectElement) {
    preferences.theme = input.value as ThemePreference
  } else if (key === 'notifications' && input instanceof HTMLInputElement) {
    preferences.notifications = input.checked
    if (input.checked && 'Notification' in window && Notification.permission === 'default') {
      void Notification.requestPermission()
    }
  } else if (key === 'sounds' && input instanceof HTMLInputElement) {
    preferences.sounds = input.checked
  }
  saveDesktopPreferences(preferences)
  applyTheme(preferences.theme)
  shellOptions?.applyChatPreferences(preferences)
}

export function installMaerDesktopShell(options: DesktopShellOptions): void {
  shellOptions = options
  document.querySelector('#maer-desktop-shell')?.remove()
  document.body.insertAdjacentHTML('beforeend', shellMarkup())
  const accountButton = document.querySelector<HTMLElement>('.maer-account-avatar')
  if (accountButton) {
    const initial = (options.accountJid.split('@')[0]?.[0] ?? 'M').toLocaleUpperCase('fr')
    accountButton.textContent = initial
    accountButton.setAttribute('aria-label', `Compte ${options.accountJid}`)
    accountButton.title = options.accountJid
  }
  document.body.classList.add('maer-shell-active')
  const preferences = loadDesktopPreferences()
  applyTheme(preferences.theme)
  options.applyChatPreferences(preferences)
  document.querySelector('#maer-desktop-shell')?.addEventListener('click', onShellClick)
  document.querySelector('#maer-desktop-shell')?.addEventListener('change', onShellChange)
  installPluginRail()
  installConversationSidebar()
}

export function uninstallMaerDesktopShell(): void {
  stopMedia()
  clearPluginPanel()
  clearPluginSettings()
  uninstallConversationSidebar()
  document.querySelector('#maer-desktop-shell')?.remove()
  document.body.classList.remove('maer-shell-active')
  shellOptions = undefined
}

export async function launchConversationCall(
  conversation: CallConversation,
  mode: CallMode,
): Promise<void> {
  if (!confirmMeetingProvider()) return
  try {
    const call = await startConversationCall(conversation, mode)
    rememberCall(call)
    showToast(
      mode === 'screen'
        ? "Lien envoyé. Dans la réunion, cliquez sur « Partager l’écran »."
        : 'Lien d’appel envoyé et réunion ouverte.',
    )
  } catch (error) {
    showToast(error instanceof Error ? error.message : "Impossible de démarrer l’appel.")
  }
}
