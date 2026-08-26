// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  installMaerDesktopShell,
  loadDesktopPreferences,
  uninstallMaerDesktopShell,
} from '../src/renderer/desktop-shell'
import { RendererPluginRegistry } from '../src/plugins/core/renderer/plugin-registry'

describe('WhatsApp-style desktop shell', () => {
  beforeEach(() => {
    localStorage.clear()
    document.documentElement.removeAttribute('data-maer-theme')
    document.body.replaceChildren()
  })

  it('adds accessible chat, call and settings navigation', () => {
    installMaerDesktopShell({
      accountJid: 'alice@xmpp.maer.fr',
      onLogout: vi.fn(async () => undefined),
      applyChatPreferences: vi.fn(),
    })

    expect(document.querySelector('#maer-app-rail')).not.toBeNull()
    expect(document.querySelector('[aria-label="Discussions"]')).not.toBeNull()
    expect(document.querySelector('[aria-label="Appels"]')).not.toBeNull()
    expect(document.querySelector('[aria-label="Paramètres"]')).not.toBeNull()
  })

  it('persists appearance and notification preferences', () => {
    installMaerDesktopShell({
      accountJid: 'alice@xmpp.maer.fr',
      onLogout: vi.fn(async () => undefined),
      applyChatPreferences: vi.fn(),
    })
    document.querySelector<HTMLButtonElement>('[data-maer-view="settings"]')?.click()
    const theme = document.querySelector<HTMLSelectElement>('[data-maer-setting="theme"]')
    if (!theme) throw new Error('Sélecteur de thème absent')
    theme.value = 'dark'
    theme.dispatchEvent(new Event('change', { bubbles: true }))

    expect(loadDesktopPreferences().theme).toBe('dark')
    expect(document.documentElement.dataset.maerTheme).toBe('dark')
  })

  it('adds WhatsApp-style conversation search and unread filters', () => {
    document.body.innerHTML = `<div id="controlbox"><div class="box-flyout">
      <div id="chatrooms"><div class="items-list"></div></div>
      <div id="converse-roster"><div class="roster-group-contacts">
        <div class="list-item"><span class="contact-name">Alice</span></div>
        <div class="list-item"><a class="unread-msgs"><span class="contact-name">Bob</span><span class="msgs-indicator">2</span></a></div>
      </div></div>
    </div></div>`
    installMaerDesktopShell({
      accountJid: 'alice@xmpp.maer.fr',
      onLogout: vi.fn(async () => undefined),
      applyChatPreferences: vi.fn(),
    })

    expect(document.querySelector('#maer-conversation-sidebar')).not.toBeNull()
    expect(document.querySelector('#chatrooms')?.classList.contains('maer-section-empty')).toBe(true)

    document.querySelector<HTMLButtonElement>('[data-maer-conversation-filter="unread"]')?.click()
    const items = document.querySelectorAll<HTMLElement>('.roster-group-contacts .list-item')
    expect(items[0]?.classList.contains('maer-filter-hidden')).toBe(true)
    expect(items[1]?.classList.contains('maer-filter-hidden')).toBe(false)

    const search = document.querySelector<HTMLInputElement>('[data-maer-conversation-search]')
    if (!search) throw new Error('Recherche des discussions absente')
    document.querySelector<HTMLButtonElement>('[data-maer-conversation-filter="all"]')?.click()
    search.value = 'Alice'
    search.dispatchEvent(new Event('input', { bubbles: true }))
    expect(items[0]?.classList.contains('maer-filter-hidden')).toBe(false)
    expect(items[1]?.classList.contains('maer-filter-hidden')).toBe(true)
  })

  it('forwards the new-contact action to Converse', () => {
    document.body.innerHTML = `<div id="controlbox"><div class="box-flyout">
      <button class="add-contact" type="button">Ajouter</button>
    </div></div>`
    const nativeAdd = document.querySelector<HTMLButtonElement>('.add-contact')
    const clicked = vi.fn()
    nativeAdd?.addEventListener('click', clicked)
    installMaerDesktopShell({
      accountJid: 'alice@xmpp.maer.fr',
      onLogout: vi.fn(async () => undefined),
      applyChatPreferences: vi.fn(),
    })

    document.querySelector<HTMLButtonElement>('[data-maer-conversation-action="new-chat"]')?.click()

    expect(clicked).toHaveBeenCalledOnce()
  })

  it('removes the shell without touching the Converse root', () => {
    const converse = document.createElement('converse-root')
    document.body.append(converse)
    installMaerDesktopShell({
      accountJid: 'alice@xmpp.maer.fr',
      onLogout: vi.fn(async () => undefined),
      applyChatPreferences: vi.fn(),
    })

    uninstallMaerDesktopShell()

    expect(document.querySelector('#maer-desktop-shell')).toBeNull()
    expect(document.querySelector('converse-root')).toBe(converse)
  })

  it('mounts declared plugin rail, panel and settings contributions', async () => {
    const registry = new RendererPluginRegistry({
      appVersion: '1.1.0',
      plugins: [
        {
          manifest: {
            id: 'fr.maer.shell-test',
            displayName: 'Shell Test',
            version: '1.0.0',
            apiVersion: 1,
            minAppVersion: '1.1.0',
            capabilities: ['ui.rail', 'ui.panel', 'ui.settings'],
            contributions: [
              { kind: 'panel', id: 'home', title: 'Panneau test' },
              {
                kind: 'rail',
                id: 'open',
                label: 'Plugin test',
                iconId: 'tool',
                order: 10,
                placement: 'main',
                panelId: 'home',
              },
              { kind: 'settings', id: 'preferences', title: 'Réglages test', order: 10 },
            ],
          },
          activate(context) {
            context.registerPanel('home', (root) => {
              root.textContent = 'Contenu du plugin'
            })
            context.registerSettings('preferences', (root) => {
              root.textContent = 'Réglages du plugin'
            })
          },
        },
      ],
    })
    await registry.activateAll()
    installMaerDesktopShell({
      accountJid: 'alice@xmpp.maer.fr',
      onLogout: vi.fn(async () => undefined),
      applyChatPreferences: vi.fn(),
      pluginRegistry: registry,
    })

    const pluginButton = document.querySelector<HTMLButtonElement>('[aria-label="Plugin test"]')
    pluginButton?.click()
    expect(document.querySelector('[data-maer-panel-title]')?.textContent).toBe('Panneau test')
    expect(document.querySelector('.maer-plugin-panel-root')?.textContent).toBe(
      'Contenu du plugin',
    )

    document.querySelector<HTMLButtonElement>('[data-maer-view="settings"]')?.click()
    expect(document.querySelector('[data-maer-plugin-settings]')?.textContent).toContain(
      'Réglages du plugin',
    )
  })
})
