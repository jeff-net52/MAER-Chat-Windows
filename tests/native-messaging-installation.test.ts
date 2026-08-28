import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  NATIVE_VAULT_CHROMIUM_EXTENSION_ID,
  NATIVE_VAULT_CHROMIUM_ORIGIN,
  NATIVE_VAULT_FIREFOX_EXTENSION_ID,
  NATIVE_VAULT_HOST_NAME,
} from '../src/native-messaging/constants'
import {
  detectNativeMessagingLaunch,
  detectNativeMessagingRuntimeLaunch,
  NATIVE_MESSAGING_SHIM_ARGUMENT,
  NativeMessagingLaunchError,
} from '../src/native-messaging/launch'
import {
  createNativeVaultHostManifest,
  nativeVaultManifestPath,
} from '../src/native-messaging/manifests'

const repository = resolve(import.meta.dirname, '..')
const localAppData = 'C:\\Users\\Alice\\AppData\\Local'
const executable = 'C:\\Users\\Alice\\AppData\\Local\\Programs\\MAER Chat\\MAER Chat.exe'

describe('Native Messaging launch identity and installation', () => {
  it('accepts only the exact Chromium origin plus Windows parent handle', () => {
    expect(
      detectNativeMessagingLaunch(
        [NATIVE_VAULT_CHROMIUM_ORIGIN, '--parent-window=0'],
        localAppData,
      ),
    ).toEqual({ browser: 'chromium' })
    expect(() =>
      detectNativeMessagingLaunch(
        ['chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/', '--parent-window=0'],
        localAppData,
      ),
    ).toThrow(NativeMessagingLaunchError)
    expect(() =>
      detectNativeMessagingLaunch([NATIVE_VAULT_CHROMIUM_ORIGIN], localAppData),
    ).toThrow(NativeMessagingLaunchError)
  })

  it('accepts only the exact Firefox manifest path and add-on ID', () => {
    const manifest = nativeVaultManifestPath(localAppData, 'firefox')
    expect(
      detectNativeMessagingLaunch(
        [manifest, NATIVE_VAULT_FIREFOX_EXTENSION_ID],
        localAppData,
      ),
    ).toEqual({ browser: 'firefox' })
    expect(() =>
      detectNativeMessagingLaunch(
        ['C:\\Temp\\fr.maer.password_vault-firefox.json', NATIVE_VAULT_FIREFOX_EXTENSION_ID],
        localAppData,
      ),
    ).toThrow(NativeMessagingLaunchError)
    expect(detectNativeMessagingLaunch([], localAppData)).toBeUndefined()
  })

  it('admits the private shim transport only after a strict browser identity', () => {
    const token = 'a'.repeat(32)
    expect(
      detectNativeMessagingRuntimeLaunch(
        [
          NATIVE_VAULT_CHROMIUM_ORIGIN,
          '--parent-window=0',
          `${NATIVE_MESSAGING_SHIM_ARGUMENT}${token}`,
        ],
        localAppData,
      ),
    ).toEqual({ browser: 'chromium', transportToken: token })
    expect(
      detectNativeMessagingRuntimeLaunch(
        [
          nativeVaultManifestPath(localAppData, 'firefox'),
          NATIVE_VAULT_FIREFOX_EXTENSION_ID,
          `${NATIVE_MESSAGING_SHIM_ARGUMENT}${token}`,
        ],
        localAppData,
      ),
    ).toEqual({ browser: 'firefox', transportToken: token })
    expect(() =>
      detectNativeMessagingRuntimeLaunch(
        [NATIVE_VAULT_CHROMIUM_ORIGIN, '--parent-window=0'],
        localAppData,
      ),
    ).toThrow(NativeMessagingLaunchError)
    expect(() =>
      detectNativeMessagingRuntimeLaunch(
        [
          NATIVE_VAULT_CHROMIUM_ORIGIN,
          '--parent-window=0',
          `${NATIVE_MESSAGING_SHIM_ARGUMENT}${'g'.repeat(32)}`,
        ],
        localAppData,
      ),
    ).toThrow(NativeMessagingLaunchError)
    expect(detectNativeMessagingRuntimeLaunch([], localAppData)).toBeUndefined()
  })

  it('generates separate closed host manifests for Chromium and Firefox', () => {
    const chromium = createNativeVaultHostManifest('edge', executable)
    const firefox = createNativeVaultHostManifest('firefox', executable)
    expect(chromium).toEqual({
      name: NATIVE_VAULT_HOST_NAME,
      description: expect.any(String),
      path: executable,
      type: 'stdio',
      allowed_origins: [NATIVE_VAULT_CHROMIUM_ORIGIN],
    })
    expect(firefox).toEqual({
      name: NATIVE_VAULT_HOST_NAME,
      description: expect.any(String),
      path: executable,
      type: 'stdio',
      allowed_extensions: [NATIVE_VAULT_FIREFOX_EXTENSION_ID],
    })
    expect(JSON.stringify(chromium)).not.toContain('*')
    expect(JSON.stringify(firefox)).not.toContain('*')
  })

  it('derives the frozen Chromium ID from the committed public SPKI key', () => {
    const manifest = JSON.parse(
      readFileSync(
        resolve(
          repository,
          'browser-extensions/maer-password-vault/manifests/chromium.json',
        ),
        'utf8',
      ),
    ) as { key: string }
    const digest = createHash('sha256')
      .update(Buffer.from(manifest.key, 'base64'))
      .digest()
      .subarray(0, 16)
    const id = [...digest]
      .map(
        (byte) =>
          String.fromCharCode(97 + (byte >> 4)) +
          String.fromCharCode(97 + (byte & 15)),
      )
      .join('')
    expect(id).toBe(NATIVE_VAULT_CHROMIUM_EXTENSION_ID)
  })

  it('packages per-user install/uninstall scripts without broad deletion', () => {
    const install = readFileSync(
      resolve(repository, 'resources/native-messaging/install-host.ps1'),
      'utf8',
    )
    const uninstall = readFileSync(
      resolve(repository, 'resources/native-messaging/uninstall-host.ps1'),
      'utf8',
    )
    for (const registry of [
      'Google\\Chrome\\NativeMessagingHosts',
      'Microsoft\\Edge\\NativeMessagingHosts',
      'Mozilla\\NativeMessagingHosts',
    ]) {
      expect(install).toContain(registry)
      expect(uninstall).toContain(registry)
    }
    expect(install).toContain(NATIVE_VAULT_CHROMIUM_ORIGIN)
    expect(install).toContain(NATIVE_VAULT_FIREFOX_EXTENSION_ID)
    expect(uninstall).not.toMatch(/Remove-Item[^\r\n]+-Recurse/u)

    const packageJson = JSON.parse(
      readFileSync(resolve(repository, 'package.json'), 'utf8'),
    ) as {
      build: {
        beforePack: string
        afterPack: string
        electronFuses?: Record<string, boolean>
        extraResources: unknown
        nsis: { include: string; uninstallDisplayName: string }
      }
    }
    expect(packageJson.build.beforePack).toBe('scripts/build-native-host-shim.mjs')
    expect(packageJson.build.afterPack).toBe('scripts/apply-electron-fuses.mjs')
    expect(packageJson.build.electronFuses).toBeUndefined()
    const fuseScript = readFileSync(
      resolve(repository, 'scripts/apply-electron-fuses.mjs'),
      'utf8',
    )
    expect(fuseScript).toContain('strictlyRequireAllFuses: true')
    for (const fuse of [
      'RunAsNode',
      'EnableCookieEncryption',
      'EnableNodeOptionsEnvironmentVariable',
      'EnableNodeCliInspectArguments',
      'EnableEmbeddedAsarIntegrityValidation',
      'OnlyLoadAppFromAsar',
      'LoadBrowserProcessSpecificV8Snapshot',
      'GrantFileProtocolExtraPrivileges',
      'WasmTrapHandlers',
    ]) {
      expect(fuseScript).toContain(`FuseV1Options.${fuse}`)
    }
    expect(packageJson.build.extraResources).toBeDefined()
    expect(packageJson.build.nsis.include).toBe('build/installer.nsh')
    expect(packageJson.build.nsis.uninstallDisplayName).toBe('${productName} ${version}')

    const installer = readFileSync(
      resolve(repository, packageJson.build.nsis.include),
      'utf8',
    )
    expect(installer).toContain(
      'WriteRegStr SHELL_CONTEXT "${UNINSTALL_REGISTRY_KEY}" "DisplayName" "${UNINSTALL_DISPLAY_NAME}"',
    )
    expect(installer).toContain(
      'WriteRegStr SHELL_CONTEXT "${UNINSTALL_REGISTRY_KEY}" "DisplayVersion" "${VERSION}"',
    )
    expect(installer).not.toMatch(/DisplayVersion[^\r\n]+\d+\.\d+\.\d+/u)
  })

  it('ships an auditable fail-closed shim built by an explicit C# compiler path', () => {
    const source = readFileSync(
      resolve(
        repository,
        'resources/native-messaging/host-shim/MaerPasswordVaultNativeHostShim.cs',
      ),
      'utf8',
    )
    const buildScript = readFileSync(
      resolve(repository, 'scripts/build-native-host-shim.mjs'),
      'utf8',
    )
    const install = readFileSync(
      resolve(repository, 'resources/native-messaging/install-host.ps1'),
      'utf8',
    )
    expect(source).toContain('Path.Combine(ownDirectory, "..", "..", "MAER Chat.exe")')
    expect(source).toContain('start.UseShellExecute = false')
    expect(source).toContain('MaximumFrameBytes = 65536')
    expect(source).toContain('ElectronPrefaceTimeoutMilliseconds = 5000')
    expect(source).toContain('electronPreface[0] != 13')
    expect(source).toContain('electronPreface[1] != 10')
    expect(source).toContain('RNGCryptoServiceProvider')
    expect(source).toContain('WindowsIdentity.GetCurrent().User')
    expect(source).toContain('security.SetAccessRuleProtection(true, false)')
    expect(source).toContain('GetNamedPipeClientProcessId')
    expect(source).toContain('clientProcessId == (uint)child.Id')
    expect(source).toContain('maer-chat-native-in-')
    expect(source).toContain('maer-chat-native-out-')
    expect(source).toContain('PipeDirection.InOut')
    expect(source).not.toMatch(/Console\.(Write|WriteLine)\(/u)
    expect(buildScript).toContain("Framework64', 'v4.0.30319', 'csc.exe")
    expect(buildScript).not.toMatch(/spawnSync\(\s*['"]csc/u)
    expect(install).toContain('maer-password-vault-host.exe')
  })
})
