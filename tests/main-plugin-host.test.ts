import { describe, expect, it, vi } from 'vitest'
import {
  MainPluginHost,
  type MainPluginDefinition,
  type PluginIpcScope,
} from '../src/plugins/core/main/plugin-host'
import { FIRST_PARTY_MAIN_PLUGINS } from '../src/plugins/main-registry'

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

  it('registers the Password Vault placeholder without any secret storage', async () => {
    const state = scopes()
    const host = new MainPluginHost({
      appVersion: '1.1.0',
      plugins: FIRST_PARTY_MAIN_PLUGINS,
      createIpcScope: (id) => state.create(id),
    })

    const report = await host.activateAll()
    const status = state.handlers.get('fr.maer.password-vault')?.get('status')

    expect(report.active).toEqual(['fr.maer.password-vault'])
    expect(status?.()).toEqual({ version: 1, state: 'placeholder' })
    await host.deactivateAll()
    expect(state.disposed).toEqual(['fr.maer.password-vault'])
  })
})
