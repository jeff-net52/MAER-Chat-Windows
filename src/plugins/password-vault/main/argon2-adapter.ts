import { argon2id } from 'hash-wasm'
import { CryptoEngine } from 'kdbxweb'

export const PASSWORD_VAULT_ARGON2_PROFILE = Object.freeze({
  type: CryptoEngine.Argon2TypeArgon2id,
  version: 0x13,
  memoryKiB: 64 * 1024,
  iterations: 3,
  parallelism: 1,
  outputLength: 32,
})

const MAX_MEMORY_KIB = 128 * 1024
const MAX_ITERATIONS = 10
const MAX_PARALLELISM = 4
const KDBX_COMPOSITE_KEY_LENGTH = 32
const KDBX_ARGON2_SALT_LENGTH = 32

export interface PasswordVaultArgon2Options {
  password: Uint8Array
  salt: Uint8Array
  iterations: number
  parallelism: number
  memorySize: number
  hashLength: number
  outputType: 'binary'
}

export type PasswordVaultArgon2Hasher = (
  options: PasswordVaultArgon2Options,
) => Promise<Uint8Array>

function exactBuffer(value: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(value.byteLength)
  copy.set(value)
  return copy.buffer
}

function positiveBoundedInteger(
  value: number,
  label: string,
  maximum: number,
): void {
  if (!Number.isSafeInteger(value) || value < 1 || value > maximum) {
    throw new Error(`${label} Argon2id non pris en charge.`)
  }
}

export function createBoundedArgon2Implementation(
  hash: PasswordVaultArgon2Hasher = argon2id,
): CryptoEngine.Argon2Fn {
  return async (
    password,
    salt,
    memory,
    iterations,
    length,
    parallelism,
    type,
    version,
  ) => {
    if (type !== CryptoEngine.Argon2TypeArgon2id) {
      throw new Error('Seul Argon2id est pris en charge par le coffre MAER.')
    }
    if (version !== PASSWORD_VAULT_ARGON2_PROFILE.version) {
      throw new Error('La version Argon2id demandée n’est pas prise en charge.')
    }
    if (password.byteLength !== KDBX_COMPOSITE_KEY_LENGTH) {
      throw new Error('La clé composite KDBX est invalide.')
    }
    if (salt.byteLength !== KDBX_ARGON2_SALT_LENGTH) {
      throw new Error('Le sel Argon2id KDBX est invalide.')
    }
    if (length !== PASSWORD_VAULT_ARGON2_PROFILE.outputLength) {
      throw new Error('La longueur de sortie Argon2id n’est pas prise en charge.')
    }
    positiveBoundedInteger(memory, 'La mémoire', MAX_MEMORY_KIB)
    positiveBoundedInteger(iterations, "Le nombre d’itérations", MAX_ITERATIONS)
    positiveBoundedInteger(parallelism, 'Le parallélisme', MAX_PARALLELISM)
    if (memory < 8 * parallelism) {
      throw new Error('La mémoire Argon2id est insuffisante pour ce parallélisme.')
    }

    const ownedPassword = new Uint8Array(exactBuffer(new Uint8Array(password)))
    const ownedSalt = new Uint8Array(exactBuffer(new Uint8Array(salt)))
    try {
      const result = await hash({
        password: ownedPassword,
        salt: ownedSalt,
        iterations,
        parallelism,
        memorySize: memory,
        hashLength: length,
        outputType: 'binary',
      })
      if (!(result instanceof Uint8Array) || result.byteLength !== length) {
        throw new Error('La sortie de l’implémentation Argon2id est invalide.')
      }
      const output = exactBuffer(result)
      result.fill(0)
      return output
    } finally {
      ownedPassword.fill(0)
      ownedSalt.fill(0)
    }
  }
}

let installed = false

export function installPasswordVaultArgon2(): void {
  if (installed) return
  CryptoEngine.setArgon2Impl(createBoundedArgon2Implementation())
  installed = true
}
