import { describe, expect, it, vi } from 'vitest'
import { createDesktopPluginBridge } from '../src/plugins/core/preload/plugin-bridge'

describe('explicit preload plugin bridge', () => {
  it('exposes only the typed Password Vault placeholder method', async () => {
    const invoke = vi.fn(async () => ({ version: 1, state: 'placeholder' }))
    const bridge = createDesktopPluginBridge(invoke)

    await expect(bridge.passwordVault.getStatus()).resolves.toEqual({
      version: 1,
      state: 'placeholder',
    })
    expect(invoke).toHaveBeenCalledWith('maer:plugin:fr.maer.password-vault:status')
    expect(Object.keys(bridge)).toEqual(['passwordVault'])
    expect('invoke' in bridge).toBe(false)
    expect(Object.isFrozen(bridge)).toBe(true)
  })

  it('rejects malformed main-process responses', async () => {
    const bridge = createDesktopPluginBridge(async () => ({
      version: 1,
      state: 'ready',
      secret: 'must-not-cross',
    }))

    await expect(bridge.passwordVault.getStatus()).rejects.toThrow(/invalide/i)
  })
})
