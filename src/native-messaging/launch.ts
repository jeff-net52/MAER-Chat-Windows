import { resolve } from 'node:path'
import {
  NATIVE_VAULT_CHROMIUM_ORIGIN,
  NATIVE_VAULT_FIREFOX_EXTENSION_ID,
  NATIVE_VAULT_HOST_NAME,
} from './constants'
import { nativeVaultManifestPath } from './manifests'

export type NativeMessagingLaunch = Readonly<{
  browser: 'chromium' | 'firefox'
}>

export type NativeMessagingRuntimeLaunch = NativeMessagingLaunch &
  Readonly<{ transportToken: string }>

export const NATIVE_MESSAGING_SHIM_ARGUMENT = '--maer-native-transport=' as const
const NATIVE_MESSAGING_SHIM_TOKEN = /^[a-f0-9]{32}$/u

export class NativeMessagingLaunchError extends Error {
  constructor() {
    super('Invalid Native Messaging launcher')
    this.name = 'NativeMessagingLaunchError'
  }
}

function sameWindowsPath(left: string, right: string): boolean {
  return resolve(left).toLocaleLowerCase('en-US') === resolve(right).toLocaleLowerCase('en-US')
}

function looksLikeNativeMessaging(args: readonly string[]): boolean {
  const first = args[0] ?? ''
  const second = args[1] ?? ''
  return (
    first.startsWith('chrome-extension://') ||
    first.toLocaleLowerCase('en-US').includes(NATIVE_VAULT_HOST_NAME) ||
    second === NATIVE_VAULT_FIREFOX_EXTENSION_ID ||
    second.startsWith('--parent-window=')
  )
}

/**
 * Validates the browser-supplied identity before the process reads stdin or
 * connects to the GUI pipe. Returns undefined only for an ordinary GUI launch.
 */
export function detectNativeMessagingLaunch(
  args: readonly string[],
  localAppData: string | undefined,
): NativeMessagingLaunch | undefined {
  if (args[0] === NATIVE_VAULT_CHROMIUM_ORIGIN) {
    if (
      args.length !== 2 ||
      !/^--parent-window=(?:0|[1-9][0-9]{0,19})$/u.test(args[1] ?? '')
    ) {
      throw new NativeMessagingLaunchError()
    }
    return Object.freeze({ browser: 'chromium' })
  }

  if (args[1] === NATIVE_VAULT_FIREFOX_EXTENSION_ID) {
    if (
      args.length !== 2 ||
      !localAppData ||
      !sameWindowsPath(args[0] ?? '', nativeVaultManifestPath(localAppData, 'firefox'))
    ) {
      throw new NativeMessagingLaunchError()
    }
    return Object.freeze({ browser: 'firefox' })
  }

  if (looksLikeNativeMessaging(args)) throw new NativeMessagingLaunchError()
  return undefined
}

/**
 * Runtime entry point accepted only from the installed shim. Direct browser
 * launches fail closed because Electron stdio is not a reliable binary channel
 * on Windows.
 */
export function detectNativeMessagingRuntimeLaunch(
  args: readonly string[],
  localAppData: string | undefined,
): NativeMessagingRuntimeLaunch | undefined {
  const transportArgument = args[2] ?? ''
  if (
    args.length === 3 &&
    transportArgument.startsWith(NATIVE_MESSAGING_SHIM_ARGUMENT)
  ) {
    const transportToken = transportArgument.slice(NATIVE_MESSAGING_SHIM_ARGUMENT.length)
    if (!NATIVE_MESSAGING_SHIM_TOKEN.test(transportToken)) {
      throw new NativeMessagingLaunchError()
    }
    const launch = detectNativeMessagingLaunch(args.slice(0, 2), localAppData)
    if (!launch) throw new NativeMessagingLaunchError()
    return Object.freeze({ ...launch, transportToken })
  }

  const launch = detectNativeMessagingLaunch(args, localAppData)
  if (launch) throw new NativeMessagingLaunchError()
  return undefined
}
