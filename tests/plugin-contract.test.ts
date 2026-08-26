import { describe, expect, it } from 'vitest'
import {
  isVersionAtLeast,
  parsePluginManifest,
  pluginIpcChannel,
} from '../src/plugins/core/shared/plugin-contract'

function manifest() {
  return {
    id: 'fr.maer.example',
    displayName: 'Plugin exemple',
    version: '1.2.3',
    apiVersion: 1,
    minAppVersion: '1.1.0',
    capabilities: ['main.ipc', 'ui.rail', 'ui.panel'],
    contributions: [
      { kind: 'panel', id: 'home', title: 'Accueil' },
      {
        kind: 'rail',
        id: 'open',
        label: 'Ouvrir',
        iconId: 'extension',
        order: 20,
        placement: 'main',
        panelId: 'home',
      },
    ],
  }
}

describe('plugin manifest contract', () => {
  it('accepts and freezes a fully declared API v1 manifest', () => {
    const parsed = parsePluginManifest(manifest())

    expect(parsed.id).toBe('fr.maer.example')
    expect(parsed.contributions).toHaveLength(2)
    expect(Object.isFrozen(parsed)).toBe(true)
    expect(Object.isFrozen(parsed.capabilities)).toBe(true)
    expect(Object.isFrozen(parsed.contributions)).toBe(true)
  })

  it('fails closed for unknown fields, capabilities and API versions', () => {
    expect(() => parsePluginManifest({ ...manifest(), remoteEntry: 'https://example.test' })).toThrow(
      /champ inconnu/i,
    )
    expect(() =>
      parsePluginManifest({ ...manifest(), capabilities: ['network.unrestricted'] }),
    ).toThrow(/capacité/i)
    expect(() => parsePluginManifest({ ...manifest(), apiVersion: 2 })).toThrow(/version API/i)
  })

  it('requires declared capabilities and an existing panel for rail contributions', () => {
    expect(() =>
      parsePluginManifest({ ...manifest(), capabilities: ['main.ipc', 'ui.panel'] }),
    ).toThrow(/ui.rail/i)
    expect(() =>
      parsePluginManifest({
        ...manifest(),
        contributions: manifest().contributions.filter(({ kind }) => kind === 'rail'),
      }),
    ).toThrow(/panneau.*absent/i)
  })

  it('constructs only namespaced, syntactically bounded IPC channels', () => {
    expect(pluginIpcChannel('fr.maer.example', 'get-status')).toBe(
      'maer:plugin:fr.maer.example:get-status',
    )
    expect(() => pluginIpcChannel('fr.maer.example', '../secret')).toThrow(/méthode IPC/i)
  })

  it('checks minimum compatible application versions', () => {
    expect(isVersionAtLeast('1.2.0', '1.1.9')).toBe(true)
    expect(isVersionAtLeast('1.0.9', '1.1.0')).toBe(false)
    expect(isVersionAtLeast('1.1.0-beta.2', '1.1.0')).toBe(false)
    expect(isVersionAtLeast('1.1.0', '1.1.0-beta.2')).toBe(true)
  })
})
