import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { PASSWORD_VAULT_ACTIONS } from '../src/plugins/password-vault/shared/contract'

function source(path: string): string {
  return readFileSync(new URL(path, import.meta.url), 'utf8')
}

describe('Password Vault plugin security boundaries', () => {
  it('keeps explicit copy and time-bounded reveal operations behind the main process', () => {
    expect(PASSWORD_VAULT_ACTIONS).toContain('reveal')
    expect(PASSWORD_VAULT_ACTIONS).toContain('copy')
    expect(source('../src/plugins/password-vault/main/plugin.ts')).toContain(
      'this.clipboardLease.copy(password)',
    )
    const preload = source('../src/plugins/password-vault/preload/bridge.ts')
    const renderer = source('../src/plugins/password-vault/renderer/plugin.ts')
    expect(preload).toContain("base('reveal', createRequestId())")
    expect(renderer).toContain('this.revealTimer = setTimeout')
    expect(renderer).toContain('input.value = result.password')
    expect(renderer).toContain("input.value = ''")
  })

  it('does not persist or log renderer secrets', () => {
    const renderer = source('../src/plugins/password-vault/renderer/plugin.ts')
    expect(renderer).not.toMatch(/localStorage|sessionStorage|indexedDB/u)
    expect(renderer).not.toMatch(/console\.(?:log|info|warn|error)/u)
    expect(renderer).not.toMatch(/innerHTML\s*=/u)
    expect(renderer).toContain("input.value = ''")
  })

  it('exposes no generic IPC primitive or key material to the renderer', () => {
    const preload = source('../src/plugins/password-vault/preload/bridge.ts')
    const publicBridge = source('../src/plugins/core/preload/plugin-bridge.ts')
    expect(preload).toContain("pluginIpcChannel(PASSWORD_VAULT_PLUGIN_ID, 'request')")
    expect(publicBridge).toContain('passwordVault: PasswordVaultBridge')
    expect(publicBridge).not.toMatch(/key|secret/iu)
  })
})
