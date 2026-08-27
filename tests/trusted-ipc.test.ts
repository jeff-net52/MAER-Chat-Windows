import { describe, expect, it, vi } from 'vitest'
import { installDenyByDefaultPermissionPolicy } from '../src/main/permission-policy'
import { TrustedIpcMain, TrustedRendererGuard } from '../src/main/trusted-ipc'

function trustedFixture() {
  const mainFrame = { url: 'maer-chat://app/' }
  const webContents = { mainFrame }
  const guard = new TrustedRendererGuard({
    expectedUrl: mainFrame.url,
    getWebContents: () => webContents as never,
  })
  return { guard, mainFrame, webContents }
}

describe('trusted renderer IPC boundary', () => {
  it('requires the expected webContents, main frame and exact renderer URL', () => {
    const { guard, mainFrame, webContents } = trustedFixture()

    expect(() =>
      guard.assertTrustedIpc({ sender: webContents, senderFrame: mainFrame } as never),
    ).not.toThrow()
    expect(() =>
      guard.assertTrustedIpc({ sender: { mainFrame }, senderFrame: mainFrame } as never),
    ).toThrow(/refusée/i)
    expect(() =>
      guard.assertTrustedIpc({
        sender: webContents,
        senderFrame: { url: mainFrame.url },
      } as never),
    ).toThrow(/refusée/i)

    mainFrame.url = 'maer-chat://app/other.html'
    expect(() =>
      guard.assertTrustedIpc({ sender: webContents, senderFrame: mainFrame } as never),
    ).toThrow(/refusée/i)
  })

  it('wraps every handler and disposes namespaced plugin handlers idempotently', async () => {
    const { guard, mainFrame, webContents } = trustedFixture()
    const handlers = new Map<string, (...args: unknown[]) => unknown>()
    const ipcMain = {
      handle: vi.fn((channel: string, handler: (...args: unknown[]) => unknown) => {
        handlers.set(channel, handler)
      }),
      removeHandler: vi.fn((channel: string) => handlers.delete(channel)),
    }
    const ipc = new TrustedIpcMain(ipcMain as never, guard)
    const scope = ipc.createPluginScope('fr.maer.example')
    const listener = vi.fn((value: unknown) => ({ value }))
    scope.handle('status', listener)
    const handler = handlers.get('maer:plugin:fr.maer.example:status')
    if (!handler) throw new Error('Handler de test absent')

    expect(handler({ sender: webContents, senderFrame: mainFrame }, 'ok')).toEqual({
      value: 'ok',
    })
    expect(() =>
      handler({ sender: { mainFrame }, senderFrame: mainFrame }, 'blocked'),
    ).toThrow(/refusée/i)
    expect(listener).toHaveBeenCalledTimes(1)

    scope.dispose()
    scope.dispose()
    expect(handlers.size).toBe(0)
    expect(ipcMain.removeHandler).toHaveBeenCalledTimes(1)
  })
})

describe('renderer permission policy', () => {
  it('allows only declared permissions from the trusted main frame', () => {
    const { guard, mainFrame, webContents } = trustedFixture()
    let check: ((...args: any[]) => boolean) | undefined
    let request: ((...args: any[]) => void) | undefined
    const session = {
      setPermissionCheckHandler: vi.fn((handler) => {
        check = handler
      }),
      setPermissionRequestHandler: vi.fn((handler) => {
        request = handler
      }),
    }
    installDenyByDefaultPermissionPolicy(session as never, guard)
    if (!check || !request) throw new Error('Politique de permissions absente')

    const details = { isMainFrame: true, requestingUrl: mainFrame.url }
    expect(check(webContents, 'media', 'maer-chat://app', details)).toBe(true)
    expect(check(webContents, 'notifications', 'maer-chat://app', details)).toBe(true)
    expect(check(webContents, 'geolocation', 'maer-chat://app', details)).toBe(false)
    expect(check(webContents, 'media', 'maer-chat://app', { ...details, isMainFrame: false })).toBe(false)
    expect(
      check(webContents, 'media', 'maer-chat://app', {
        ...details,
        requestingUrl: 'maer-chat://app/other.html',
      }),
    ).toBe(false)

    const callback = vi.fn()
    request(webContents, 'media', callback, details)
    request({ mainFrame }, 'media', callback, details)
    expect(callback).toHaveBeenNthCalledWith(1, true)
    expect(callback).toHaveBeenNthCalledWith(2, false)
  })
})
