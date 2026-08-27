import { describe, expect, it, vi } from 'vitest'
import {
  MainPluginHost,
  type MainPluginDefinition,
  type PluginIpcScope,
} from '../src/plugins/core/main/plugin-host'
import { createFirstPartyMainPlugins } from '../src/plugins/main-registry'

function manifest(id: string, capabilities: string[] = []) {
  return {
    id,
    displayName: id,
    version: '1.0.0',
    apiVersion: 1,
    minAppVersion: '1.1.0',
    capabilities,
    contributions: [],
  }
}

function scopes() {
  const handlers = new Map<string, Map<string, (...args: unknown[]) => unknown>>()
  const disposed: string[] = []
  return {
    handlers,
    disposed,
    create(pluginId: string): PluginIpcScope {
      const pluginHandlers = new Map<string, (...args: unknown[]) => unknown>()
      handlers.set(pluginId, pluginHandlers)
      return {
        handle(method, listener) {
          pluginHandlers.set(method, listener as (...args: unknown[]) => unknown)
        },
        dispose() {
          if (disposed.includes(pluginId)) return
          disposed.push(pluginId)
          pluginHandlers.clear()
        },
      }
    },
  }
}

describe('main first-party plugin host', () => {
  it('activates once and isolates a failing plugin', async () => {
    const state = scopes()
    const activate = vi.fn()
    const plugins: MainPluginDefinition[] = [
      { manifest: manifest('fr.maer.good'), activate },
      {
        manifest: manifest('fr.maer.failure'),
        activate() {
          throw new Error('boom')
        },
      },
    ]
    const host = new MainPluginHost({
      appVersion: '1.1.0',
      plugins,
      createIpcScope: (id) => state.create(id),
    })

    const first = await host.activateAll()
    const second = await host.activateAll()

    expect(first.active).toEqual(['fr.maer.good'])
    expect(first.failures).toMatchObject([{ pluginId: 'fr.maer.failure', phase: 'activation' }])
    expect(second.active).toEqual(['fr.maer.good'])
    expect(activate).toHaveBeenCalledOnce()
    expect(state.disposed).toContain('fr.maer.failure')
  })

  it('fails activation when an undeclared IPC capability is used', async () => {
    const state = scopes()
    const host = new MainPluginHost({
      appVersion: '1.1.0',
      plugins: [
        {
          manifest: manifest('fr.maer.no-ipc'),
          activate(context) {
            context.ipc.handle('status', () => 'forbidden')
          },
        },
      ],
      createIpcScope: (id) => state.create(id),
    })

    const report = await host.activateAll()

    expect(report.active).toEqual([])
    expect(report.failures[0]?.message).toMatch(/main\.ipc/i)
    expect(state.disposed).toEqual(['fr.maer.no-ipc'])
  })

  it('registers the Password Vault request handler with a locked startup state', async () => {
    const state = scopes()
    const powerListeners = new Map<string, Set<() => void>>()
    const powerMonitor = {
      on(event: 'lock-screen' | 'suspend', listener: () => void) {
        const listeners = powerListeners.get(event) ?? new Set()
        listeners.add(listener)
        powerListeners.set(event, listeners)
        return this
      },
      removeListener(event: 'lock-screen' | 'suspend', listener: () => void) {
        powerListeners.get(event)?.delete(listener)
        return this
      },
    }
    const host = new MainPluginHost({
      appVersion: '1.1.0',
      plugins: createFirstPartyMainPlugins({
        passwordVault: {
          vaultPath: 'C:\\safe-test-directory\\maer-passwords.kdbx',
          powerMonitor,
          clipboard: { writeText() {}, readText: () => '', clear() {} },
        },
      }),
      createIpcScope: (id) => state.create(id),
    })

    const report = await host.activateAll()
    const request = state.handlers.get('fr.maer.password-vault')?.get('request')

    expect(report.active).toEqual(['fr.maer.password-vault'])
    await expect(request?.({
      version: 1,
      requestId: '77ed591b-cb1e-4bb0-9f3d-c99e99b6ff42',
      action: 'status',
    })).resolves.toMatchObject({
      ok: true,
      action: 'status',
      result: { state: 'locked', entryCount: null },
    })
    await host.deactivateAll()
    expect(state.disposed).toEqual(['fr.maer.password-vault'])
  })
})
