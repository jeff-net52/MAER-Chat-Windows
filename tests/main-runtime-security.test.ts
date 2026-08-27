import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { CoordinatedShutdown } from '../src/main/coordinated-shutdown'
import { resolveRendererEntry } from '../src/main/runtime-resources'

describe('main runtime security boundaries', () => {
  it('ignores ELECTRON_RENDERER_URL in packaged builds', () => {
    const bundled = join('C:\\Program Files', 'MAER Chat', 'resources', 'app', 'index.html')
    const entry = resolveRendererEntry(true, 'https://attacker.invalid/', bundled)
    expect(entry).toEqual({
      source: 'bundled',
      url: 'maer-chat://app/',
      filePath: bundled,
    })
    expect(entry.url).not.toContain('attacker.invalid')
    expect(entry.url).not.toMatch(/^file:/u)
  })

  it('uses a development renderer URL only outside packaged builds', () => {
    expect(resolveRendererEntry(false, 'http://127.0.0.1:5173', 'unused')).toEqual({
      source: 'development',
      url: 'http://127.0.0.1:5173/',
    })
  })

  it('coordinates idempotent shutdown before exiting', async () => {
    const order: string[] = []
    let releaseBridge: (() => void) | undefined
    const bridgeGate = new Promise<void>((resolve) => {
      releaseBridge = resolve
    })
    const shutdown = new CoordinatedShutdown({
      markQuitting: () => order.push('quitting'),
      stopNativeVaultBridge: async () => {
        order.push('bridge:start')
        await bridgeGate
        order.push('bridge:done')
      },
      cancelPairing: () => {
        order.push('pairing')
      },
      deactivatePlugins: () => {
        order.push('plugins')
      },
      disposeIpc: () => order.push('ipc'),
      exit: (code) => order.push(`exit:${code}`),
    })
    const first = { preventDefault: vi.fn() }
    const second = { preventDefault: vi.fn() }
    shutdown.request(first)
    shutdown.request(second)
    expect(first.preventDefault).toHaveBeenCalledOnce()
    expect(second.preventDefault).toHaveBeenCalledOnce()
    expect(order).toEqual(['quitting', 'bridge:start', 'quitting'])
    releaseBridge?.()
    await shutdown.wait()
    expect(order).toEqual([
      'quitting',
      'bridge:start',
      'quitting',
      'bridge:done',
      'pairing',
      'plugins',
      'ipc',
      'exit:0',
    ])
  })

  it('continues fail-closed cleanup after individual shutdown failures', async () => {
    const disposeIpc = vi.fn()
    const exit = vi.fn()
    const shutdown = new CoordinatedShutdown({
      markQuitting: vi.fn(),
      stopNativeVaultBridge: vi.fn(async () => Promise.reject(new Error('bridge'))),
      cancelPairing: vi.fn(async () => Promise.reject(new Error('pairing'))),
      deactivatePlugins: vi.fn(async () => Promise.reject(new Error('plugins'))),
      disposeIpc,
      exit,
    })
    shutdown.request({ preventDefault: vi.fn() })
    await shutdown.wait()
    expect(disposeIpc).toHaveBeenCalledOnce()
    expect(exit).toHaveBeenCalledWith(0)
  })
})
