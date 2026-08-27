import { EventEmitter } from 'node:events'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { MainPluginContext } from '../src/plugins/core/main/plugin-host'
import type { NativeVaultGateway } from '../src/plugins/password-vault/main/native-vault-gateway'
import { createPasswordVaultMainPlugin } from '../src/plugins/password-vault/main/plugin'

const keyring = vi.hoisted(() => ({ value: undefined as Uint8Array | undefined }))

vi.mock('@napi-rs/keyring', () => ({
  AsyncEntry: class {
    async getSecret(): Promise<Uint8Array | undefined> {
      return keyring.value?.slice()
    }

    async setSecret(value: Uint8Array): Promise<void> {
      keyring.value = value.slice()
    }

    async deleteCredential(): Promise<boolean> {
      const present = Boolean(keyring.value)
      keyring.value?.fill(0)
      keyring.value = undefined
      return present
    }
  },
}))

const temporaryDirectories: string[] = []

afterEach(async () => {
  keyring.value?.fill(0)
  keyring.value = undefined
  for (const directory of temporaryDirectories.splice(0)) {
    const resolved = resolve(directory)
    if (!resolved.startsWith(resolve(tmpdir()))) {
      throw new Error('Refusing to remove a non-temporary test directory')
    }
    await rm(resolved, { recursive: true, force: true })
  }
})

function request(action: string): Record<string, unknown> {
  return {
    version: 1,
    requestId: '77ed591b-cb1e-4bb0-9f3d-c99e99b6ff42',
    action,
  }
}

describe('main-only NativeVaultGateway', () => {
  it('shares the desktop session and enforces credential-to-origin ownership', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'maer-native-gateway-'))
    temporaryDirectories.push(directory)
    const powerMonitor = new EventEmitter()
    const clipboard = { writeText: vi.fn(), readText: vi.fn(() => ''), clear: vi.fn() }
    let gateway: NativeVaultGateway | undefined
    let handler: ((value: unknown) => unknown) | undefined
    const plugin = createPasswordVaultMainPlugin({
      vaultPath: join(directory, 'vault.kdbx'),
      powerMonitor,
      clipboard,
      publishNativeGateway: (value) => {
        gateway = value
      },
    })
    const context = {
      manifest: plugin.manifest,
      ipc: {
        handle(_method: string, listener: (value: unknown) => unknown) {
          handler = listener
        },
        dispose() {},
      },
    } as MainPluginContext
    const deactivate = await plugin.activate(context)
    expect(typeof deactivate).toBe('function')
    expect(gateway).toBeDefined()
    expect(handler).toBeDefined()

    await handler?.(request('initialize'))
    await expect(gateway?.status()).resolves.toEqual({ state: 'ready' })
    await gateway?.save({
      origin: 'https://example.test',
      credentialId: '',
      username: 'alice',
      password: 'main-only-secret',
      label: 'Example',
    })
    const entries = await gateway?.lookup({
      origin: 'https://example.test',
      usernameHint: 'alice',
      formSignature: 'post:text/username,password/current-password',
    })
    expect(entries).toHaveLength(1)
    expect(JSON.stringify(entries)).not.toContain('main-only-secret')
    const credentialId = entries?.[0]?.credentialId
    expect(credentialId).toBeTruthy()

    await expect(
      gateway?.reveal({ origin: 'https://example.test', credentialId: credentialId ?? '' }),
    ).resolves.toEqual({
      credentialId,
      username: 'alice',
      password: 'main-only-secret',
    })
    await expect(
      gateway?.reveal({ origin: 'https://other.test', credentialId: credentialId ?? '' }),
    ).rejects.toMatchObject({ code: 'DENIED' })

    const listed = await handler?.(request('list'))
    expect(listed).toMatchObject({
      ok: true,
      result: [{ id: credentialId, username: 'alice' }],
    })
    expect(JSON.stringify(listed)).not.toContain('main-only-secret')

    await gateway?.lock()
    await expect(gateway?.status()).resolves.toEqual({ state: 'locked' })
    await handler?.(request('unlock'))
    await expect(gateway?.status()).resolves.toEqual({ state: 'ready' })

    await expect(
      gateway?.save({
        origin: 'https://other.test',
        credentialId: credentialId ?? '',
        username: 'mallory',
        password: 'wrong-origin',
        label: 'Other',
      }),
    ).rejects.toMatchObject({ code: 'DENIED' })
    await expect(
      gateway?.save({
        origin: 'http://example.test',
        credentialId: '',
        username: 'alice',
        password: 'insecure',
        label: 'HTTP',
      }),
    ).rejects.toMatchObject({ code: 'DENIED' })
    await expect(gateway?.status()).resolves.toEqual({ state: 'locked' })
    await (deactivate as () => Promise<void>)()
    expect(gateway).toBeUndefined()
  })
})
