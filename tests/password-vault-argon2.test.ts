import { describe, expect, it, vi } from 'vitest'
import { CryptoEngine } from 'kdbxweb'
import {
  PASSWORD_VAULT_ARGON2_PROFILE,
  createBoundedArgon2Implementation,
  type PasswordVaultArgon2Options,
} from '../src/plugins/password-vault/main/argon2-adapter'

function bytes(length: number, value = 0x42): ArrayBuffer {
  return new Uint8Array(length).fill(value).buffer
}

const VALID_ARGUMENTS = [
  bytes(32, 0x11),
  bytes(32, 0x22),
  PASSWORD_VAULT_ARGON2_PROFILE.memoryKiB,
  PASSWORD_VAULT_ARGON2_PROFILE.iterations,
  PASSWORD_VAULT_ARGON2_PROFILE.outputLength,
  PASSWORD_VAULT_ARGON2_PROFILE.parallelism,
  CryptoEngine.Argon2TypeArgon2id,
  PASSWORD_VAULT_ARGON2_PROFILE.version,
] as const

describe('bounded Password Vault Argon2id adapter', () => {
  it('maps the KDBX callback to hash-wasm binary options', async () => {
    let received: PasswordVaultArgon2Options | undefined
    let ownedPassword: Uint8Array | undefined
    let ownedSalt: Uint8Array | undefined
    const hashOutput = new Uint8Array(32).fill(0xab)
    const hash = vi.fn(async (options) => {
      ownedPassword = options.password
      ownedSalt = options.salt
      received = {
        ...options,
        password: options.password.slice(),
        salt: options.salt.slice(),
      }
      return hashOutput
    })
    const implementation = createBoundedArgon2Implementation(hash)

    const output = await implementation(...VALID_ARGUMENTS)

    expect(new Uint8Array(output)).toEqual(new Uint8Array(32).fill(0xab))
    expect(received).toEqual({
      password: new Uint8Array(VALID_ARGUMENTS[0]),
      salt: new Uint8Array(VALID_ARGUMENTS[1]),
      memorySize: 64 * 1024,
      iterations: 3,
      parallelism: 1,
      hashLength: 32,
      outputType: 'binary',
    })
    expect(ownedPassword).toEqual(new Uint8Array(32))
    expect(ownedSalt).toEqual(new Uint8Array(32))
    expect(hashOutput).toEqual(new Uint8Array(32))
  })

  it.each([
    ['Argon2d', 6, CryptoEngine.Argon2TypeArgon2d],
    ['Argon2 1.0', 7, 0x10],
    ['a short composite key', 0, bytes(31)],
    ['a short salt', 1, bytes(31)],
    ['an oversized memory request', 2, 128 * 1024 + 1],
    ['too many iterations', 3, 11],
    ['a wrong output length', 4, 31],
    ['too much parallelism', 5, 5],
  ])('rejects %s before invoking WASM', async (_label, index, invalid) => {
    const hash = vi.fn(async () => new Uint8Array(32))
    const implementation = createBoundedArgon2Implementation(hash)
    const args = [...VALID_ARGUMENTS] as unknown[]
    args[index as number] = invalid

    await expect(
      implementation(...(args as Parameters<typeof implementation>)),
    ).rejects.toThrow()
    expect(hash).not.toHaveBeenCalled()
  })

  it('rejects malformed hash output', async () => {
    const implementation = createBoundedArgon2Implementation(
      async () => new Uint8Array(31),
    )
    await expect(implementation(...VALID_ARGUMENTS)).rejects.toThrow(/sortie/i)
  })

  it('computes an Argon2id 1.3 result with the real implementation', async () => {
    const implementation = createBoundedArgon2Implementation()
    const output = await implementation(
      bytes(32, 0x11),
      bytes(32, 0x22),
      8,
      1,
      32,
      1,
      CryptoEngine.Argon2TypeArgon2id,
      0x13,
    )
    expect(output.byteLength).toBe(32)
    expect(new Uint8Array(output).some((value) => value !== 0)).toBe(true)
  })
})
