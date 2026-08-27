import { stat } from 'node:fs/promises'
import { join, resolve } from 'node:path'

const BROWSER_EXTENSION_RESOURCE_SEGMENTS = [
  'browser-extensions',
  'maer-password-vault',
] as const

export interface BrowserExtensionResourcePaths {
  rootDirectory: string
  installationGuide: string
}

export interface BrowserExtensionResourceOpener {
  openFolder(): Promise<void>
  openGuide(): Promise<void>
}

export interface BrowserExtensionResourceOptions {
  isPackaged: boolean
  resourcesPath: string
  mainDirectory: string
  openPath(path: string): Promise<string>
  revealPath?(path: string): void
  inspectPath?(path: string): Promise<'directory' | 'file' | 'other'>
}

export function resolveBrowserExtensionResourcePaths(
  options: Pick<
    BrowserExtensionResourceOptions,
    'isPackaged' | 'resourcesPath' | 'mainDirectory'
  >,
): BrowserExtensionResourcePaths {
  const rootDirectory = options.isPackaged
    ? join(options.resourcesPath, ...BROWSER_EXTENSION_RESOURCE_SEGMENTS)
    : resolve(options.mainDirectory, '../..', ...BROWSER_EXTENSION_RESOURCE_SEGMENTS)

  return Object.freeze({
    rootDirectory,
    installationGuide: options.isPackaged
      ? join(rootDirectory, 'installation.md')
      : join(rootDirectory, 'docs', 'installation.md'),
  })
}

export function createBrowserExtensionResourceOpener(
  options: BrowserExtensionResourceOptions,
): BrowserExtensionResourceOpener {
  const paths = resolveBrowserExtensionResourcePaths(options)
  const inspectPath = options.inspectPath ?? (async (path: string) => {
    const metadata = await stat(path)
    if (metadata.isDirectory()) return 'directory'
    if (metadata.isFile()) return 'file'
    return 'other'
  })

  async function assertExactPath(
    path: string,
    expectedKind: 'directory' | 'file',
  ): Promise<void> {
    try {
      if (await inspectPath(path) === expectedKind) return
    } catch {
      // Detailed filesystem errors must not cross the IPC boundary.
    }
    throw new Error('La ressource locale de l’extension navigateur est indisponible.')
  }

  async function openFolder(): Promise<void> {
    await assertExactPath(paths.rootDirectory, 'directory')
    try {
      if (!(await options.openPath(paths.rootDirectory))) return
    } catch {
      // Detailed shell errors must not cross the IPC boundary.
    }
    throw new Error('La ressource locale de l’extension navigateur est indisponible.')
  }

  async function openGuide(): Promise<void> {
    await assertExactPath(paths.installationGuide, 'file')
    try {
      if (!(await options.openPath(paths.installationGuide))) return
    } catch {
      // Explorer remains a safe fallback when Markdown has no association.
    }
    try {
      if (options.revealPath) {
        options.revealPath(paths.installationGuide)
        return
      }
    } catch {
      // Detailed shell errors must not cross the IPC boundary.
    }
    throw new Error('La ressource locale de l’extension navigateur est indisponible.')
  }

  return Object.freeze({
    openFolder,
    openGuide,
  })
}
