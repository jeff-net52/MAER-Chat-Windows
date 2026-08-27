// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  installMaerDesktopShell,
  loadDesktopPreferences,
  MAX_RETAINED_INCOMING_CALLS,
  registerIncomingCallMessage,
  uninstallMaerDesktopShell,
} from '../src/renderer/desktop-shell'
import { RendererPluginRegistry } from '../src/plugins/core/renderer/plugin-registry'

const originalMediaDevices = Object.getOwnPropertyDescriptor(navigator, 'mediaDevices')
const originalNotification = Object.getOwnPropertyDescriptor(window, 'Notification')
const originalMaerDesktop = Object.getOwnPropertyDescriptor(window, 'maerDesktop')

describe('WhatsApp-style desktop shell', () => {
  beforeEach(() => {
    localStorage.clear()
    document.documentElement.removeAttribute('data-maer-theme')
    document.body.replaceChildren()
  })

  afterEach(() => {
    vi.useRealTimers()
    uninstallMaerDesktopShell()
    vi.restoreAllMocks()
    if (originalMediaDevices) Object.defineProperty(navigator, 'mediaDevices', originalMediaDevices)
    else Reflect.deleteProperty(navigator, 'mediaDevices')
    if (originalNotification) Object.defineProperty(window, 'Notification', originalNotification)
    else Reflect.deleteProperty(window, 'Notification')
    if (originalMaerDesktop) Object.defineProperty(window, 'maerDesktop', originalMaerDesktop)
    else Reflect.deleteProperty(window, 'maerDesktop')
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

  it('exposes an accessible about and open-source licenses section in settings', () => {
    installMaerDesktopShell({
      accountJid: 'alice@xmpp.maer.fr',
      onLogout: vi.fn(async () => undefined),
      applyChatPreferences: vi.fn(),
    })

    document.querySelector<HTMLButtonElement>('[data-maer-view="settings"]')?.click()

    const section = document.querySelector<HTMLElement>('[data-maer-about]')
    const heading = document.querySelector<HTMLElement>('#maer-about-heading')
    const details = document.querySelector<HTMLDetailsElement>('.maer-license-details')
    expect(section?.getAttribute('aria-labelledby')).toBe('maer-about-heading')
    expect(heading?.textContent).toMatch(/propos et licences/i)
    expect(document.querySelector('[data-maer-app-version]')?.textContent).toMatch(/^\d+\.\d+\.\d+$/u)
    expect(document.querySelector('[data-maer-license-summary]')?.textContent).toMatch(/composants libres/i)
    expect(details?.querySelectorAll('li')).toHaveLength(4)
    expect(section?.textContent).toContain('GPL-3.0-or-later')
    expect(section?.textContent).toContain('Converse.js 14.0.0')
    expect(section?.textContent).toContain('libomemo.js 2.0.2')
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

  it('closes panels with Escape, exposes rail state and returns focus', () => {
    installMaerDesktopShell({
      accountJid: 'alice@xmpp.maer.fr',
      onLogout: vi.fn(async () => undefined),
      applyChatPreferences: vi.fn(),
    })
    const settings = document.querySelector<HTMLButtonElement>('[data-maer-view="settings"]')
    settings?.focus()
    settings?.click()

    expect(settings?.getAttribute('aria-current')).toBe('page')
    expect(document.querySelector<HTMLElement>('#maer-side-panel')?.hidden).toBe(false)
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    expect(document.querySelector<HTMLElement>('#maer-side-panel')?.hidden).toBe(true)
    expect(document.activeElement).toBe(settings)
    expect(document.querySelector('[data-maer-view="chats"]')?.getAttribute('aria-current')).toBe('page')
  })

  it('stops every acquired media track once when the panel closes', async () => {
    const audioStop = vi.fn()
    const videoStop = vi.fn()
    const stream = {
      getTracks: () => [{ stop: audioStop }, { stop: videoStop }],
    } as unknown as MediaStream
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia: vi.fn(async () => stream) },
    })
    installMaerDesktopShell({
      accountJid: 'alice@xmpp.maer.fr',
      onLogout: vi.fn(async () => undefined),
      applyChatPreferences: vi.fn(),
    })
    document.querySelector<HTMLButtonElement>('[data-maer-view="settings"]')?.click()
    document.querySelector<HTMLButtonElement>('[data-maer-action="test-media"]')?.click()
    await vi.waitFor(() => {
      expect(document.querySelector<HTMLVideoElement>('[data-maer-media-test] video')?.srcObject).toBe(stream)
    })

    document.querySelector<HTMLButtonElement>('[data-maer-action="close-panel"]')?.click()
    expect(audioStop).toHaveBeenCalledOnce()
    expect(videoStop).toHaveBeenCalledOnce()
    expect(document.querySelector<HTMLVideoElement>('[data-maer-media-test] video')?.srcObject).toBeNull()
  })

  it('stops a late media grant when its panel was already closed', async () => {
    let resolveStream: ((stream: MediaStream) => void) | undefined
    const getUserMedia = vi.fn(() => new Promise<MediaStream>((resolve) => {
      resolveStream = resolve
    }))
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia },
    })
    const stop = vi.fn()
    const stream = { getTracks: () => [{ stop }] } as unknown as MediaStream
    installMaerDesktopShell({
      accountJid: 'alice@xmpp.maer.fr',
      onLogout: vi.fn(async () => undefined),
      applyChatPreferences: vi.fn(),
    })
    document.querySelector<HTMLButtonElement>('[data-maer-view="settings"]')?.click()
    document.querySelector<HTMLButtonElement>('[data-maer-action="test-media"]')?.click()
    document.querySelector<HTMLButtonElement>('[data-maer-action="close-panel"]')?.click()
    resolveStream?.(stream)

    await vi.waitFor(() => expect(stop).toHaveBeenCalledOnce())
  })

  it('reverts notifications when Windows denies permission', async () => {
    Object.defineProperty(window, 'Notification', {
      configurable: true,
      value: { permission: 'default', requestPermission: vi.fn(async () => 'denied') },
    })
    installMaerDesktopShell({
      accountJid: 'alice@xmpp.maer.fr',
      onLogout: vi.fn(async () => undefined),
      applyChatPreferences: vi.fn(),
    })
    document.querySelector<HTMLButtonElement>('[data-maer-view="settings"]')?.click()
    const notifications = document.querySelector<HTMLInputElement>('[data-maer-setting="notifications"]')
    if (!notifications) throw new Error('Réglage de notifications absent')
    notifications.checked = true
    notifications.dispatchEvent(new Event('change', { bubbles: true }))

    await vi.waitFor(() => expect(notifications.checked).toBe(false))
    expect(loadDesktopPreferences().notifications).toBe(false)
  })

  it('shows a strict incoming-call prompt and joins only after consent', async () => {
    const openMeeting = vi.fn(async () => undefined)
    Object.defineProperty(window, 'maerDesktop', {
      configurable: true,
      value: { openMeeting, closeMeeting: vi.fn(async () => undefined) },
    })
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    installMaerDesktopShell({
      accountJid: 'alice@xmpp.maer.fr',
      onLogout: vi.fn(async () => undefined),
      applyChatPreferences: vi.fn(),
    })
    const issued = new Date(Date.now() - 1_000)
    const expires = new Date(issued.getTime() + 2 * 60 * 60 * 1_000)
    const room = 'MAER-1234567890123456'
    const body =
      `Appel vidéo MAER — Invitation envoyée via la conversation XMPP.\n` +
      `MAER-CALL/1 mode=video issued=${issued.toISOString()} expires=${expires.toISOString()} room=${room}\n` +
      `https://meet.jit.si/${room}`

    expect(registerIncomingCallMessage(body, 'bob@xmpp.maer.fr/mobile')).toBe(true)
    expect(document.querySelector('[data-maer-incoming-call]')?.textContent).toContain('bob@xmpp.maer.fr')
    document.querySelector<HTMLButtonElement>('[data-maer-action="join-incoming-call"]')?.click()

    await vi.waitFor(() => expect(openMeeting).toHaveBeenCalledWith({
      url: `https://meet.jit.si/${room}`,
      mode: 'video',
      issuedAt: issued.toISOString(),
      expiresAt: expires.toISOString(),
      room,
    }))
    expect(window.confirm).toHaveBeenCalledOnce()
  })

  it('blocks unbound MAER meeting hyperlinks instead of delegating them', () => {
    installMaerDesktopShell({
      accountJid: 'alice@xmpp.maer.fr',
      onLogout: vi.fn(async () => undefined),
      applyChatPreferences: vi.fn(),
    })
    const anchor = document.createElement('a')
    anchor.href = 'https://meet.jit.si/MAER-1234567890123456'
    document.body.append(anchor)
    const event = new MouseEvent('click', { bubbles: true, cancelable: true, composed: true })

    expect(anchor.dispatchEvent(event)).toBe(false)
    expect(document.querySelector('#maer-toast')?.textContent).toMatch(/MAER-CALL\/1/)
  })

  it.each([
    'https://meet.jit.si/team-room',
    'https://meet.jit.si/MAER-1234567890123456?team=1',
    'https://meet.jit.si/MAER-1234567890123456#unexpected',
    'https://meet.jit.si:443/MAER-1234567890123456',
  ])('blocks every generic exact-origin Jitsi link %s', (href) => {
    installMaerDesktopShell({
      accountJid: 'alice@xmpp.maer.fr',
      onLogout: vi.fn(async () => undefined),
      applyChatPreferences: vi.fn(),
    })
    const anchor = document.createElement('a')
    anchor.setAttribute('href', href)
    document.body.append(anchor)
    const event = new MouseEvent('click', { bubbles: true, cancelable: true, composed: true })

    expect(anchor.dispatchEvent(event)).toBe(false)
    expect(document.querySelector('#maer-toast')?.textContent).toMatch(/bloqu|MAER-CALL/i)
  })

  it('asks for Jitsi consent again when reopening history after revocation', async () => {
    const openMeeting = vi.fn(async () => undefined)
    Object.defineProperty(window, 'maerDesktop', {
      configurable: true,
      value: { openMeeting, closeMeeting: vi.fn(async () => undefined) },
    })
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
    const expiresAt = new Date(Date.now() + 60_000)
    localStorage.setItem('maer.desktop.call-history.v1', JSON.stringify([{
      mode: 'video',
      targetJid: 'bob@xmpp.maer.fr',
      meetingUrl: 'https://meet.jit.si/MAER-1234567890123456',
      startedAt: new Date(expiresAt.getTime() - 2 * 60 * 60 * 1_000).toISOString(),
      expiresAt: expiresAt.toISOString(),
      room: 'MAER-1234567890123456',
    }]))
    installMaerDesktopShell({
      accountJid: 'alice@xmpp.maer.fr',
      onLogout: vi.fn(async () => undefined),
      applyChatPreferences: vi.fn(),
    })
    document.querySelector<HTMLButtonElement>('[data-maer-view="calls"]')?.click()
    const join = [...document.querySelectorAll<HTMLButtonElement>('.maer-call-row button')]
      .find((button) => button.textContent === 'Rejoindre')
    join?.click()

    await vi.waitFor(() => expect(openMeeting).toHaveBeenCalledOnce())
    expect(confirm).toHaveBeenCalledOnce()
  })

  it('revalidates history expiration after the Jitsi confirmation', async () => {
    vi.useFakeTimers()
    const now = new Date('2026-08-27T12:00:00.000Z')
    vi.setSystemTime(now)
    const openMeeting = vi.fn(async () => undefined)
    Object.defineProperty(window, 'maerDesktop', {
      configurable: true,
      value: { openMeeting, closeMeeting: vi.fn(async () => undefined) },
    })
    const expiresAt = new Date(now.getTime() + 100)
    vi.spyOn(window, 'confirm').mockImplementation(() => {
      vi.setSystemTime(new Date(expiresAt.getTime() + 1))
      return true
    })
    localStorage.setItem('maer.desktop.call-history.v1', JSON.stringify([{
      mode: 'video',
      targetJid: 'bob@xmpp.maer.fr',
      meetingUrl: 'https://meet.jit.si/MAER-1234567890123456',
      startedAt: new Date(expiresAt.getTime() - 2 * 60 * 60 * 1_000).toISOString(),
      expiresAt: expiresAt.toISOString(),
      room: 'MAER-1234567890123456',
    }]))
    installMaerDesktopShell({
      accountJid: 'alice@xmpp.maer.fr',
      onLogout: vi.fn(async () => undefined),
      applyChatPreferences: vi.fn(),
    })
    document.querySelector<HTMLButtonElement>('[data-maer-view="calls"]')?.click()
    document.querySelector<HTMLButtonElement>('.maer-call-row button')?.click()
    await Promise.resolve()

    expect(openMeeting).not.toHaveBeenCalled()
    expect(document.querySelector('#maer-toast')?.textContent).toMatch(/expir/i)
  })

  it('removes refused invitations and evicts the oldest entry above the documented bound', () => {
    installMaerDesktopShell({
      accountJid: 'alice@xmpp.maer.fr',
      onLogout: vi.fn(async () => undefined),
      applyChatPreferences: vi.fn(),
    })
    const issued = new Date(Date.now() - 1_000)
    const expires = new Date(issued.getTime() + 2 * 60 * 60 * 1_000)
    const bodyFor = (index: number) => {
      const room = `MAER-${String(index).padStart(16, '0')}`
      return {
        room,
        body:
          `Appel vidéo MAER — Invitation envoyée via la conversation XMPP.\n` +
          `MAER-CALL/1 mode=video issued=${issued.toISOString()} expires=${expires.toISOString()} room=${room}\n` +
          `https://meet.jit.si/${room}`,
      }
    }
    for (let index = 0; index <= MAX_RETAINED_INCOMING_CALLS; index += 1) {
      expect(registerIncomingCallMessage(bodyFor(index).body, 'bob@xmpp.maer.fr')).toBe(true)
    }
    const oldest = document.createElement('a')
    oldest.href = `https://meet.jit.si/${bodyFor(0).room}`
    document.body.append(oldest)
    oldest.click()
    expect(document.querySelector('#maer-toast')?.textContent).toMatch(/li|valide/i)

    document.querySelector<HTMLButtonElement>('[data-maer-action="refuse-incoming-call"]')?.click()
    const newest = document.createElement('a')
    newest.href = `https://meet.jit.si/${bodyFor(MAX_RETAINED_INCOMING_CALLS).room}`
    document.body.append(newest)
    newest.click()
    expect(document.querySelector('#maer-toast')?.textContent).toMatch(/li|valide/i)
  })

  it('purges retained invitations as soon as they expire', () => {
    vi.useFakeTimers()
    const now = new Date('2026-08-27T12:00:00.000Z')
    vi.setSystemTime(now)
    installMaerDesktopShell({
      accountJid: 'alice@xmpp.maer.fr',
      onLogout: vi.fn(async () => undefined),
      applyChatPreferences: vi.fn(),
    })
    const bodyFor = (room: string, expiresAt: Date) => {
      const issuedAt = new Date(expiresAt.getTime() - 2 * 60 * 60 * 1_000)
      return `Appel vidéo MAER — Invitation envoyée via la conversation XMPP.\n` +
        `MAER-CALL/1 mode=video issued=${issuedAt.toISOString()} expires=${expiresAt.toISOString()} room=${room}\n` +
        `https://meet.jit.si/${room}`
    }
    const expiredRoom = 'MAER-0000000000000001'
    expect(registerIncomingCallMessage(bodyFor(expiredRoom, new Date(now.getTime() + 100)), 'bob')).toBe(true)
    vi.setSystemTime(new Date(now.getTime() + 200))
    const freshRoom = 'MAER-0000000000000002'
    expect(registerIncomingCallMessage(bodyFor(freshRoom, new Date(now.getTime() + 60_000)), 'bob')).toBe(true)

    const anchor = document.createElement('a')
    anchor.href = `https://meet.jit.si/${expiredRoom}`
    document.body.append(anchor)
    anchor.click()
    expect(document.querySelector('#maer-toast')?.textContent).toMatch(/li|valide/i)
  })
})
