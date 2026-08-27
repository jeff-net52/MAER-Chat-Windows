import { describe, expect, it, vi } from 'vitest'
import {
  PasswordVaultController,
  type PasswordVaultBrowserExtensionResources,
  type PasswordVaultOperations,
} from '../src/plugins/password-vault/main/plugin'
import type {
  PasswordVaultEntrySummary,
  PasswordVaultEntryUpdate,
  PasswordVaultNewEntry,
  PasswordVaultStatus,
} from '../src/plugins/password-vault/shared/contract'

const REQUEST_ID = '77ed591b-cb1e-4bb0-9f3d-c99e99b6ff42'
const ENTRY_ID = 'AQIDBAUGBwgJCgsMDQ4PEA=='

function request(action: string, fields: Record<string, unknown> = {}) {
  return { version: 1, requestId: REQUEST_ID, action, ...fields }
}

class MemoryOperations implements PasswordVaultOperations {
  state: PasswordVaultStatus = { state: 'locked', entryCount: null }
  entries: PasswordVaultEntrySummary[] = []
  order: string[] = []
  disposed = false

  async status() { return this.state }
  async initialize() {
    this.state = { state: 'unlocked', entryCount: this.entries.length }
    return this.state
  }
  async unlock() {
    this.state = { state: 'unlocked', entryCount: this.entries.length }
    return this.state
  }
  async lock() {
    this.state = { state: 'locked', entryCount: null }
    return this.state
  }
  async list() { this.order.push('list'); return this.entries }
  async search(query: string) {
    this.order.push('search')
    return this.entries.filter((entry) => entry.title.toLocaleLowerCase('fr').includes(query))
  }
  async add(entry: PasswordVaultNewEntry) {
    this.order.push('add')
    const added = {
      id: ENTRY_ID,
      title: entry.title,
      username: entry.username,
      url: entry.url,
      updatedAt: '2026-08-27T12:00:00.000Z',
    }
    this.entries.push(added)
    this.state = { state: 'unlocked', entryCount: this.entries.length }
    return added
  }
  async update(entry: PasswordVaultEntryUpdate) {
    const updated = {
      id: entry.id,
      title: entry.title,
      username: entry.username,
      url: entry.url,
      updatedAt: '2026-08-27T12:01:00.000Z',
    }
    this.entries = [updated]
    return updated
  }
  async delete(entryId: string) {
    this.entries = this.entries.filter((entry) => entry.id !== entryId)
    return { entryId, deleted: true as const }
  }
  async generate() { return 'Generated-Secret-234' }
  async copy(entryId: string) {
    return { entryId, copied: true as const, clearAfterSeconds: 30 }
  }
  async dispose() { this.disposed = true }
}

describe('Password Vault serialized main controller', () => {
  it('executes the bounded CRUD/search/generate/copy protocol without secret list fields', async () => {
    const operations = new MemoryOperations()
    const controller = new PasswordVaultController(operations)

    await expect(controller.handle(request('status'))).resolves.toMatchObject({
      ok: true,
      result: { state: 'locked', entryCount: null },
    })
    await controller.handle(request('initialize'))
    const added = await controller.handle(request('add', {
      entry: {
        title: 'Compte MAER',
        username: 'alice',
        url: 'https://example.test/',
        password: 'Main-Only-Secret',
      },
    }))
    expect(added).toMatchObject({ ok: true, action: 'add', result: { id: ENTRY_ID } })

    const [listed, searched] = await Promise.all([
      controller.handle(request('list')),
      controller.handle(request('search', { query: 'compte' })),
    ])
    expect(listed).toMatchObject({ ok: true, result: [{ id: ENTRY_ID }] })
    expect(searched).toMatchObject({ ok: true, result: [{ id: ENTRY_ID }] })
    expect(JSON.stringify(listed)).not.toContain('Main-Only-Secret')
    expect(operations.order).toEqual(['add', 'list', 'search'])

    await expect(controller.handle(request('update', {
      entry: {
        id: ENTRY_ID,
        title: 'Compte principal',
        username: 'alice@example.test',
        url: 'https://example.test/login',
        password: { mode: 'keep' },
      },
    }))).resolves.toMatchObject({ ok: true, result: { title: 'Compte principal' } })
    await expect(controller.handle(request('generate', { length: 20 }))).resolves.toMatchObject({
      ok: true,
      result: { password: 'Generated-Secret-234' },
    })
    await expect(controller.handle(request('copy', { entryId: ENTRY_ID }))).resolves.toMatchObject({
      ok: true,
      result: { copied: true, clearAfterSeconds: 30 },
    })
    await expect(controller.handle(request('delete', { entryId: ENTRY_ID }))).resolves.toMatchObject({
      ok: true,
      result: { deleted: true },
    })
    await controller.dispose()
    expect(operations.disposed).toBe(true)
  })

  it('serializes concurrent calls before disposal', async () => {
    const operations = new MemoryOperations()
    let release: (() => void) | undefined
    const gate = new Promise<void>((resolve) => { release = resolve })
    const originalAdd = operations.add.bind(operations)
    operations.add = vi.fn(async (entry) => {
      operations.order.push('add-start')
      await gate
      const result = await originalAdd(entry)
      operations.order.push('add-end')
      return result
    })
    const controller = new PasswordVaultController(operations)
    const add = controller.handle(request('add', {
      entry: {
        title: 'Compte', username: '', url: 'https://example.test/', password: 'secret',
      },
    }))
    const list = controller.handle(request('list'))
    await vi.waitFor(() => expect(operations.order).toEqual(['add-start']))
    release?.()
    await Promise.all([add, list])

    expect(operations.order).toEqual(['add-start', 'add', 'add-end', 'list'])
    await controller.dispose()
  })

  it('returns bounded business failures and rejects malformed schemas as promises', async () => {
    const operations = new MemoryOperations()
    operations.list = vi.fn(async () => { throw new Error('sensitive backend detail') })
    const controller = new PasswordVaultController(operations)

    await expect(controller.handle(request('list'))).resolves.toMatchObject({
      ok: false,
      error: {
        code: 'internal',
        message: 'Le coffre est temporairement indisponible.',
      },
    })
    await expect(controller.handle({
      ...request('status'),
      password: 'smuggled',
    })).rejects.toThrow(/champ inconnu/i)
    await controller.dispose()
  })

  it('opens only the two injected browser-extension resources without a renderer path', async () => {
    const operations = new MemoryOperations()
    const browserExtensions: PasswordVaultBrowserExtensionResources = {
      openFolder: vi.fn(async () => undefined),
      openGuide: vi.fn(async () => undefined),
    }
    const controller = new PasswordVaultController(operations, browserExtensions)

    await expect(controller.handle(request('open-extension-folder'))).resolves.toMatchObject({
      ok: true,
      action: 'open-extension-folder',
      result: { target: 'folder', opened: true },
    })
    await expect(controller.handle(request('open-extension-guide'))).resolves.toMatchObject({
      ok: true,
      action: 'open-extension-guide',
      result: { target: 'guide', opened: true },
    })
    expect(browserExtensions.openFolder).toHaveBeenCalledWith()
    expect(browserExtensions.openGuide).toHaveBeenCalledWith()
    await expect(controller.handle(request('open-extension-folder', {
      path: 'C:\\Windows',
    }))).rejects.toThrow(/champ inconnu/i)
    expect(browserExtensions.openFolder).toHaveBeenCalledTimes(1)
    await controller.dispose()
  })
})
