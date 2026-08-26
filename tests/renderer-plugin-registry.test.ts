// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import {
  RendererPluginRegistry,
  type RendererPluginDefinition,
  type RendererPluginContext,
} from '../src/plugins/core/renderer/plugin-registry'

function manifest(id: string) {
  return {
    id,
    displayName: id,
    version: '1.0.0',
    apiVersion: 1,
    minAppVersion: '1.1.0',
    capabilities: ['ui.rail', 'ui.panel', 'ui.settings', 'ui.commands'],
    contributions: [
      { kind: 'panel', id: 'home', title: 'Plugin Home' },
      {
        kind: 'rail',
        id: 'open',
        label: 'Plugin',
        iconId: 'tool',
        order: 10,
        placement: 'main',
        panelId: 'home',
      },
      { kind: 'settings', id: 'preferences', title: 'Plugin settings', order: 20 },
      { kind: 'command', id: 'refresh', title: 'Refresh plugin' },
    ],
  }
}

function workingPlugin(id = 'fr.maer.renderer'): RendererPluginDefinition & {
  activate: ReturnType<typeof vi.fn>
} {
  const activate = vi.fn((context: RendererPluginContext) => {
    context.registerPanel('home', (root) => {
      root.textContent = 'panel mounted'
      return () => root.replaceChildren()
    })
    context.registerSettings('preferences', (root) => {
      root.textContent = 'settings mounted'
    })
    context.registerCommand('refresh', () => undefined)
  })
  return { manifest: manifest(id), activate }
}

describe('renderer contribution registry', () => {
  it('activates idempotently and exposes declared contributions', async () => {
    const plugin = workingPlugin()
    const registry = new RendererPluginRegistry({
      appVersion: '1.1.0',
      plugins: [plugin],
    })

    await registry.activateAll()
    await registry.activateAll()

    expect(plugin.activate).toHaveBeenCalledOnce()
    expect(registry.railContributions()).toMatchObject([
      { pluginId: 'fr.maer.renderer', id: 'open', panelId: 'home' },
    ])
    expect(registry.settingsContributions()).toMatchObject([
      { pluginId: 'fr.maer.renderer', id: 'preferences' },
    ])
    expect(registry.commandContributions()).toMatchObject([
      { pluginId: 'fr.maer.renderer', id: 'refresh' },
    ])
    expect(await registry.runCommand('fr.maer.renderer', 'refresh')).toBe(true)
  })

  it('mounts and cleans a panel without leaking ownership of its root', async () => {
    const registry = new RendererPluginRegistry({
      appVersion: '1.1.0',
      plugins: [workingPlugin()],
    })
    await registry.activateAll()
    const root = document.createElement('div')

    const cleanup = registry.mountPanel('fr.maer.renderer', 'home', root)
    expect(root.textContent).toBe('panel mounted')
    cleanup?.()
    cleanup?.()
    expect(root.textContent).toBe('')
  })

  it('isolates activation, rendering and command failures', async () => {
    const good = workingPlugin('fr.maer.good-renderer')
    const bad: RendererPluginDefinition = {
      manifest: manifest('fr.maer.bad-renderer'),
      activate() {
        throw new Error('activation failed')
      },
    }
    const registry = new RendererPluginRegistry({
      appVersion: '1.1.0',
      plugins: [bad, good],
    })

    const report = await registry.activateAll()

    expect(report.active).toEqual(['fr.maer.good-renderer'])
    expect(report.failures).toMatchObject([
      { pluginId: 'fr.maer.bad-renderer', phase: 'activation' },
    ])
    expect(registry.railContributions()).toHaveLength(1)
  })

  it('fails closed when runtime code registers an undeclared contribution', async () => {
    const registry = new RendererPluginRegistry({
      appVersion: '1.1.0',
      plugins: [
        {
          manifest: { ...manifest('fr.maer.undeclared'), contributions: [] },
          activate(context) {
            context.registerPanel('hidden', () => undefined)
          },
        },
      ],
    })

    const report = await registry.activateAll()

    expect(report.active).toEqual([])
    expect(report.failures[0]?.message).toMatch(/non déclarée/i)
  })

  it('cleans staged activation and contains faulty mount cleanup callbacks', async () => {
    const stagedCleanup = vi.fn()
    const faultyCleanup: RendererPluginDefinition = {
      manifest: manifest('fr.maer.cleanup'),
      activate(context) {
        context.registerPanel('home', () => () => {
          throw new Error('cleanup failed')
        })
        context.registerSettings('preferences', () => undefined)
        context.registerCommand('refresh', () => undefined)
        return stagedCleanup
      },
    }
    const incompleteCleanup = vi.fn()
    const incomplete: RendererPluginDefinition = {
      manifest: manifest('fr.maer.incomplete'),
      activate() {
        return incompleteCleanup
      },
    }
    const registry = new RendererPluginRegistry({
      appVersion: '1.1.0',
      plugins: [incomplete, faultyCleanup],
    })

    const report = await registry.activateAll()
    expect(report.active).toEqual(['fr.maer.cleanup'])
    expect(incompleteCleanup).toHaveBeenCalledOnce()

    const root = document.createElement('div')
    const cleanup = registry.mountPanel('fr.maer.cleanup', 'home', root)
    expect(() => cleanup?.()).not.toThrow()
    expect(registry.report.failures).toMatchObject([
      { pluginId: 'fr.maer.incomplete', phase: 'activation' },
      { pluginId: 'fr.maer.cleanup', phase: 'deactivation' },
    ])
  })
})
