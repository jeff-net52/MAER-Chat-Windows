import { describe, expect, it, vi } from 'vitest'
import { createDesktopPluginBridge } from '../src/plugins/core/preload/plugin-bridge'
import { PasswordVaultBridgeError } from '../src/plugins/password-vault/preload/bridge'

const REQUEST_ID = '77ed591b-cb1e-4bb0-9f3d-c99e99b6ff42'
const ENTRY_ID = 'AQIDBAUGBwgJCgsMDQ4PEA=='
const SUMMARY = {
  id: ENTRY_ID,
  title: 'Compte MAER',
  username: 'alice',
  url: 'https://example.test/',
  updatedAt: '2026-08-27T12:00:00.000Z',
}

function response(request: { requestId: string; action: string }) {
  const results: Record<string, unknown> = {
    status: { state: 'locked', entryCount: null },
    initialize: { state: 'unlocked', entryCount: 0 },
    unlock: { state: 'unlocked', entryCount: 1 },
    lock: { state: 'locked', entryCount: null },
    list: [SUMMARY],
    search: [SUMMARY],
    add: SUMMARY,
    update: SUMMARY,
    delete: { entryId: ENTRY_ID, deleted: true },
    generate: { password: 'SafeGenerated-2345' },
    copy: { entryId: ENTRY_ID, copied: true, clearAfterSeconds: 30 },
  }
  return {
    version: 1,
    requestId: request.requestId,
    ok: true,
    action: request.action,
    result: results[request.action],
  }
}

describe('explicit preload plugin bridge', () => {
  it('exposes only bounded Password Vault operations over one private channel', async () => {
    const invoke = vi.fn(async (_channel: string, request: unknown) =>
      response(request as { requestId: string; action: string }),
    )
    const bridge = createDesktopPluginBridge(invoke)
    const vault = createDesktopPluginBridge(invoke).passwordVault
    const createId = () => REQUEST_ID
    const deterministic = createDesktopPluginBridge(
      (channel, request) => invoke(channel, request),
    )

    // The public desktop bridge never exposes a generic invoke function.
    expect(Object.keys(bridge)).toEqual(['passwordVault'])
    expect('invoke' in bridge).toBe(false)
    expect(Object.isFrozen(bridge)).toBe(true)
    expect(Object.keys(vault)).toEqual([
      'status',
      'initialize',
      'unlock',
      'lock',
      'list',
      'search',
      'add',
      'update',
      'delete',
      'generate',
      'copy',
    ])
    expect(deterministic.passwordVault).toBeDefined()

    // Exercise the bridge with browser UUIDs; request and response ids are still matched.
    await expect(vault.status()).resolves.toEqual({ state: 'locked', entryCount: null })
    await expect(vault.unlock()).resolves.toMatchObject({ state: 'unlocked' })
    await expect(vault.list()).resolves.toEqual([SUMMARY])
    await expect(vault.search('maer')).resolves.toEqual([SUMMARY])
    await expect(vault.add({
      title: 'Compte MAER', username: 'alice', url: 'https://example.test', password: 'secret',
    })).resolves.toEqual(SUMMARY)
    await expect(vault.update({
      id: ENTRY_ID,
      title: 'Compte MAER',
      username: 'alice',
      url: 'https://example.test',
      password: { mode: 'keep' },
    })).resolves.toEqual(SUMMARY)
    await expect(vault.delete(ENTRY_ID)).resolves.toEqual({ entryId: ENTRY_ID, deleted: true })
    await expect(vault.generate()).resolves.toBe('SafeGenerated-2345')
    await expect(vault.copy(ENTRY_ID)).resolves.toEqual({
      entryId: ENTRY_ID, copied: true, clearAfterSeconds: 30,
    })

    expect(invoke).toHaveBeenCalled()
    expect(invoke.mock.calls.every(([channel]) =>
      channel === 'maer:plugin:fr.maer.password-vault:request')).toBe(true)
    expect(createId()).toBe(REQUEST_ID)
  })

  it('rejects malformed, mismatched and failed main-process responses', async () => {
    const malformed = createDesktopPluginBridge(async () => ({
      version: 1,
      requestId: REQUEST_ID,
      ok: true,
      action: 'status',
      result: { state: 'locked', entryCount: null, password: 'must-not-cross' },
    }))
    await expect(malformed.passwordVault.status()).rejects.toThrow(/champ inconnu/i)

    const mismatch = createDesktopPluginBridge(async (_channel, request) => ({
      ...response(request as { requestId: string; action: string }),
      requestId: REQUEST_ID,
    }))
    await expect(mismatch.passwordVault.status()).rejects.toThrow(/correspond pas/i)

    const failure = createDesktopPluginBridge(async (_channel, request) => ({
      version: 1,
      requestId: (request as { requestId: string }).requestId,
      ok: false,
      error: { code: 'locked', message: 'Le coffre est verrouillé.' },
    }))
    await expect(failure.passwordVault.list()).rejects.toBeInstanceOf(PasswordVaultBridgeError)
  })

  it('rejects unsafe renderer input before invoking IPC', async () => {
    const invoke = vi.fn()
    const vault = createDesktopPluginBridge(invoke).passwordVault

    await expect(vault.add({
      title: 'Compte',
      username: 'alice',
      url: 'http://example.test',
      password: 'secret',
    })).rejects.toThrow(/https/i)
    await expect(vault.generate(4)).rejects.toThrow(/longueur/i)
    expect(invoke).not.toHaveBeenCalled()
  })
})
