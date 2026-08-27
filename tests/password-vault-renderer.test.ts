// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PasswordVaultBridge } from '../src/plugins/password-vault/preload/bridge'
import { mountPasswordVaultPanel } from '../src/plugins/password-vault/renderer/plugin'
import type { PasswordVaultEntrySummary } from '../src/plugins/password-vault/shared/contract'

const ENTRY: PasswordVaultEntrySummary = {
  id: 'AQIDBAUGBwgJCgsMDQ4PEA==',
  title: 'Compte MAER',
  username: 'alice',
  url: 'https://example.test/',
  updatedAt: '2026-08-27T12:00:00.000Z',
}

function fakeBridge(overrides: Partial<PasswordVaultBridge> = {}): PasswordVaultBridge {
  return {
    status: vi.fn(async () => ({ state: 'unlocked' as const, entryCount: 1 })),
    initialize: vi.fn(async () => ({ state: 'unlocked' as const, entryCount: 0 })),
    unlock: vi.fn(async () => ({ state: 'unlocked' as const, entryCount: 1 })),
    lock: vi.fn(async () => ({ state: 'locked' as const, entryCount: null })),
    list: vi.fn(async () => [ENTRY]),
    search: vi.fn(async () => [ENTRY]),
    add: vi.fn(async () => ENTRY),
    update: vi.fn(async () => ENTRY),
    delete: vi.fn(async () => ({ entryId: ENTRY.id, deleted: true as const })),
    generate: vi.fn(async () => 'Generated-Secret-234'),
    copy: vi.fn(async () => ({
      entryId: ENTRY.id,
      copied: true as const,
      clearAfterSeconds: 30,
    })),
    openExtensionFolder: vi.fn(async () => ({
      target: 'folder' as const,
      opened: true as const,
    })),
    openExtensionGuide: vi.fn(async () => ({
      target: 'guide' as const,
      opened: true as const,
    })),
    ...overrides,
  }
}

describe('Firefox-like Password Vault renderer panel', () => {
  const cleanups: Array<() => void> = []

  beforeEach(() => {
    document.body.replaceChildren()
    localStorage.clear()
  })

  afterEach(() => {
    for (const cleanup of cleanups.splice(0).reverse()) cleanup()
  })

  function mount(bridge: PasswordVaultBridge) {
    const root = document.createElement('div')
    document.body.append(root)
    cleanups.push(mountPasswordVaultPanel(root, bridge))
    return root
  }

  it('starts locked and unlocks without persisting any secret in browser storage', async () => {
    const bridge = fakeBridge({
      status: vi.fn(async () => ({ state: 'locked' as const, entryCount: null })),
    })
    const root = mount(bridge)
    await vi.waitFor(() => expect(root.textContent).toContain('Coffre verrouillé'))

    root.querySelector<HTMLButtonElement>('[data-vault-action="unlock"]')?.click()

    await vi.waitFor(() => expect(root.querySelector('[data-vault-search]')).not.toBeNull())
    expect(bridge.unlock).toHaveBeenCalledOnce()
    expect(root.querySelector('input[type="password"]')).toBeNull()
    expect(localStorage.length).toBe(0)
  })

  it('supports search, detail and direct main-process clipboard copy without a DOM secret', async () => {
    const bridge = fakeBridge()
    const root = mount(bridge)
    await vi.waitFor(() => expect(root.textContent).toContain('Compte MAER'))

    const search = root.querySelector<HTMLInputElement>('[data-vault-search]')
    if (!search) throw new Error('Recherche absente')
    search.value = 'alice'
    search.dispatchEvent(new Event('input', { bubbles: true }))
    await vi.waitFor(() => expect(bridge.search).toHaveBeenCalledWith('alice'), { timeout: 1_000 })

    root.querySelector<HTMLButtonElement>('[data-vault-action="copy"]')?.click()
    await vi.waitFor(() => expect(bridge.copy).toHaveBeenCalledWith(ENTRY.id))
    expect(root.textContent).toContain('Effacement dans 30 secondes')
    expect(root.textContent).not.toContain('Generated-Secret')
    expect(root.querySelector('input[type="password"]')).toBeNull()
  })

  it('keeps generated and typed passwords transient, then wipes their input on save and cleanup', async () => {
    const bridge = fakeBridge()
    const root = mount(bridge)
    await vi.waitFor(() => expect(root.textContent).toContain('Compte MAER'))
    root.querySelector<HTMLButtonElement>('[data-vault-action="add"]')?.click()

    const title = root.querySelector<HTMLInputElement>('input[name="title"]')
    const username = root.querySelector<HTMLInputElement>('input[name="username"]')
    const url = root.querySelector<HTMLInputElement>('input[name="url"]')
    const password = root.querySelector<HTMLInputElement>('input[name="password"]')
    if (!title || !username || !url || !password) throw new Error('Formulaire absent')
    title.value = 'Nouveau compte'
    username.value = 'bob'
    url.value = 'https://new.example.test/'

    root.querySelector<HTMLButtonElement>('[data-vault-action="generate"]')?.click()
    await vi.waitFor(() => expect(password.value).toBe('Generated-Secret-234'))
    expect(root.textContent).not.toContain('Generated-Secret-234')
    expect(localStorage.length).toBe(0)

    root.querySelector<HTMLFormElement>('[data-vault-form]')?.dispatchEvent(
      new Event('submit', { bubbles: true, cancelable: true }),
    )
    await vi.waitFor(() => expect(bridge.add).toHaveBeenCalledWith({
      title: 'Nouveau compte',
      username: 'bob',
      url: 'https://new.example.test/',
      password: 'Generated-Secret-234',
    }))
    await vi.waitFor(() => expect(password.value).toBe(''))

    root.querySelector<HTMLButtonElement>('[data-vault-action="add"]')?.click()
    const pending = root.querySelector<HTMLInputElement>('input[name="password"]')
    if (!pending) throw new Error('Champ mot de passe absent')
    pending.value = 'Unsaved-Secret'
    cleanups.pop()?.()
    expect(pending.value).toBe('')
    expect(root.textContent).toBe('')
    expect(localStorage.length).toBe(0)
  })

  it('shows exact browser instructions and calls only path-free main actions', async () => {
    const bridge = fakeBridge({
      status: vi.fn(async () => ({ state: 'locked' as const, entryCount: null })),
    })
    const root = mount(bridge)
    await vi.waitFor(() => expect(root.textContent).toContain('Extension navigateur MAER'))

    expect(root.textContent).toContain('edge://extensions')
    expect(root.textContent).toContain('chrome://extensions')
    expect(root.textContent).toContain('about:debugging#/runtime/this-firefox')
    expect(root.textContent).toContain('dist/chromium')
    expect(root.textContent).toContain('dist/firefox/manifest.json')

    root.querySelector<HTMLButtonElement>(
      '[data-vault-action="open-extension-folder"]',
    )?.click()
    await vi.waitFor(() => expect(bridge.openExtensionFolder).toHaveBeenCalledWith())
    expect(root.textContent).toContain('Dossier de l’extension ouvert')

    root.querySelector<HTMLButtonElement>(
      '[data-vault-action="open-extension-guide"]',
    )?.click()
    await vi.waitFor(() => expect(bridge.openExtensionGuide).toHaveBeenCalledWith())
    expect(root.textContent).toContain('Guide d’installation ouvert ou sélectionné')
    expect(localStorage.length).toBe(0)
  })
})
