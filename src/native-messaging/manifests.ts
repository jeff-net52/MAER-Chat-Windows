import { isAbsolute, join, resolve } from 'node:path'
import {
  NATIVE_VAULT_CHROMIUM_ORIGIN,
  NATIVE_VAULT_FIREFOX_EXTENSION_ID,
  NATIVE_VAULT_HOST_NAME,
} from './constants'

export type NativeVaultBrowserFamily = 'chrome' | 'edge' | 'firefox'

interface ChromiumNativeHostManifest {
  name: typeof NATIVE_VAULT_HOST_NAME
  description: string
  path: string
  type: 'stdio'
  allowed_origins: readonly [typeof NATIVE_VAULT_CHROMIUM_ORIGIN]
}

interface FirefoxNativeHostManifest {
  name: typeof NATIVE_VAULT_HOST_NAME
  description: string
  path: string
  type: 'stdio'
  allowed_extensions: readonly [typeof NATIVE_VAULT_FIREFOX_EXTENSION_ID]
}

export type NativeVaultHostManifest =
  | ChromiumNativeHostManifest
  | FirefoxNativeHostManifest

function absoluteWindowsExecutable(value: string): string {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > 32_767 ||
    value.includes('\0') ||
    !isAbsolute(value) ||
    !value.toLocaleLowerCase('en-US').endsWith('.exe')
  ) {
    throw new Error('Invalid Native Messaging executable path')
  }
  return resolve(value)
}

export function nativeVaultManifestDirectory(localAppData: string): string {
  if (
    typeof localAppData !== 'string' ||
    localAppData.length === 0 ||
    localAppData.includes('\0') ||
    !isAbsolute(localAppData)
  ) {
    throw new Error('Invalid local application data path')
  }
  return join(resolve(localAppData), 'MAER Chat', 'NativeMessaging')
}

export function nativeVaultManifestPath(
  localAppData: string,
  browser: NativeVaultBrowserFamily,
): string {
  return join(
    nativeVaultManifestDirectory(localAppData),
    `${NATIVE_VAULT_HOST_NAME}-${browser}.json`,
  )
}

export function createNativeVaultHostManifest(
  browser: NativeVaultBrowserFamily,
  executablePath: string,
): NativeVaultHostManifest {
  const common = {
    name: NATIVE_VAULT_HOST_NAME,
    description: 'Pont local sécurisé du coffre de mots de passe MAER Chat',
    path: absoluteWindowsExecutable(executablePath),
    type: 'stdio' as const,
  }
  if (browser === 'firefox') {
    return Object.freeze({
      ...common,
      allowed_extensions: Object.freeze([NATIVE_VAULT_FIREFOX_EXTENSION_ID] as const),
    })
  }
  return Object.freeze({
    ...common,
    allowed_origins: Object.freeze([NATIVE_VAULT_CHROMIUM_ORIGIN] as const),
  })
}
