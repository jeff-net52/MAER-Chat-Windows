import { join } from 'node:path'
import {
  flipFuses,
  FuseVersion,
  FuseV1Options,
} from '@electron/fuses'

const executableExtensions = Object.freeze({
  darwin: '.app',
  mas: '.app',
  win32: '.exe',
  linux: '',
})

export default async function applyElectronFuses(context) {
  const extension = executableExtensions[context.electronPlatformName]
  if (extension === undefined) {
    throw new Error(`Unsupported Electron platform: ${context.electronPlatformName}`)
  }

  const executableName = context.packager.appInfo.productFilename
  const executablePath = join(context.appOutDir, `${executableName}${extension}`)
  await flipFuses(executablePath, {
    version: FuseVersion.V1,
    strictlyRequireAllFuses: true,
    [FuseV1Options.RunAsNode]: false,
    [FuseV1Options.EnableCookieEncryption]: true,
    [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
    [FuseV1Options.EnableNodeCliInspectArguments]: false,
    [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
    [FuseV1Options.OnlyLoadAppFromAsar]: true,
    [FuseV1Options.LoadBrowserProcessSpecificV8Snapshot]: false,
    // The renderer still uses a bundled file:// entry so that its audited
    // OMEMO WASM asset can be fetched without introducing a custom protocol.
    [FuseV1Options.GrantFileProtocolExtraPrivileges]: true,
    // Electron 41+ added this ninth fuse. Keep guard-page trap handlers enabled
    // for the bundled OMEMO WebAssembly implementation.
    [FuseV1Options.WasmTrapHandlers]: true,
  })
}
