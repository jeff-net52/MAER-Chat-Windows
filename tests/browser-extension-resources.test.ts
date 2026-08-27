import { join, resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import {
  createBrowserExtensionResourceOpener,
  resolveBrowserExtensionResourcePaths,
} from '../src/main/browser-extension-resources'

describe('browser-extension main-only resources', () => {
  it('resolves only the packaged resource directory and its installation guide', () => {
    expect(
      resolveBrowserExtensionResourcePaths({
        isPackaged: true,
        resourcesPath: 'C:\\Program Files\\MAER Chat\\resources',
        mainDirectory: 'ignored',
      }),
    ).toEqual({
      rootDirectory: join(
        'C:\\Program Files\\MAER Chat\\resources',
        'browser-extensions',
        'maer-password-vault',
      ),
      installationGuide: join(
        'C:\\Program Files\\MAER Chat\\resources',
        'browser-extensions',
        'maer-password-vault',
        'installation.md',
      ),
    })
  })

  it('resolves the generated source resource directory during development', () => {
    expect(
      resolveBrowserExtensionResourcePaths({
        isPackaged: false,
        resourcesPath: 'ignored',
        mainDirectory: resolve('repository', 'out', 'main'),
      }),
    ).toEqual({
      rootDirectory: resolve(
        'repository',
        'browser-extensions',
        'maer-password-vault',
      ),
      installationGuide: resolve(
        'repository',
        'browser-extensions',
        'maer-password-vault',
        'docs',
        'installation.md',
      ),
    })
  })

  it('opens only the two main-selected paths and never accepts a renderer path', async () => {
    const openPath = vi.fn(async () => '')
    const opener = createBrowserExtensionResourceOpener({
      isPackaged: true,
      resourcesPath: 'C:\\Program Files\\MAER Chat\\resources',
      mainDirectory: 'ignored',
      openPath,
      inspectPath: vi.fn(async (path) =>
        path.endsWith('installation.md') ? 'file' : 'directory'),
    })

    expect(Object.keys(opener)).toEqual(['openFolder', 'openGuide'])
    expect(Object.isFrozen(opener)).toBe(true)
    expect(opener.openFolder).toHaveLength(0)
    expect(opener.openGuide).toHaveLength(0)

    await opener.openFolder()
    await opener.openGuide()

    expect(openPath.mock.calls).toEqual([
      [join(
        'C:\\Program Files\\MAER Chat\\resources',
        'browser-extensions',
        'maer-password-vault',
      )],
      [join(
        'C:\\Program Files\\MAER Chat\\resources',
        'browser-extensions',
        'maer-password-vault',
        'installation.md',
      )],
    ])
  })

  it('converts shell failures into a path-free error', async () => {
    const opener = createBrowserExtensionResourceOpener({
      isPackaged: true,
      resourcesPath: 'C:\\Program Files\\MAER Chat\\resources',
      mainDirectory: 'ignored',
      openPath: vi.fn(async () => 'sensitive local path'),
      inspectPath: vi.fn(async () => 'file' as const),
    })

    await expect(opener.openGuide()).rejects.toThrow(
      'La ressource locale de l’extension navigateur est indisponible.',
    )
  })

  it('reveals the exact guide in Explorer when Markdown has no application', async () => {
    const revealPath = vi.fn()
    const opener = createBrowserExtensionResourceOpener({
      isPackaged: true,
      resourcesPath: 'C:\\Program Files\\MAER Chat\\resources',
      mainDirectory: 'ignored',
      openPath: vi.fn(async () => 'No application is associated with this file'),
      revealPath,
      inspectPath: vi.fn(async () => 'file' as const),
    })

    await opener.openGuide()
    expect(revealPath).toHaveBeenCalledWith(join(
      'C:\\Program Files\\MAER Chat\\resources',
      'browser-extensions',
      'maer-password-vault',
      'installation.md',
    ))
  })

  it('rejects a replaced resource before asking the shell to open it', async () => {
    const openPath = vi.fn(async () => '')
    const opener = createBrowserExtensionResourceOpener({
      isPackaged: true,
      resourcesPath: 'C:\\Program Files\\MAER Chat\\resources',
      mainDirectory: 'ignored',
      openPath,
      inspectPath: vi.fn(async () => 'other' as const),
    })

    await expect(opener.openFolder()).rejects.toThrow(/indisponible/u)
    expect(openPath).not.toHaveBeenCalled()
  })
})
