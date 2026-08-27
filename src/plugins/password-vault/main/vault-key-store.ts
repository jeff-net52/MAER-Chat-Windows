import { AsyncEntry } from '@napi-rs/keyring'
import { randomBytes, timingSafeEqual } from 'node:crypto'
import { PASSWORD_VAULT_SECRET_LENGTH } from './kdbx-vault'

export const PASSWORD_VAULT_KEYRING_SERVICE = 'MAER Chat Password Vault'
export const PASSWORD_VAULT_KEYRING_ACCOUNT = 'local-vault-v1'

export interface VaultKeyBackend {
  /** The returned byte array belongs to the caller and may be zeroed. */
  load(): Promise<Uint8Array | number[] | undefined>
  /** The implementation must copy the value before this promise resolves. */
  save(value: Uint8Array): Promise<void>
  delete(): Promise<boolean>
}

export interface VaultKeyringEntry {
  getSecret(): Promise<Uint8Array | number[] | null | undefined>
  setSecret(value: Uint8Array): Promise<void>
  deleteCredential(): Promise<boolean>
}

export type VaultKeyringEntryFactory = (
  service: string,
  account: string,
) => VaultKeyringEntry

function isDenseByteArray(value: unknown): value is number[] {
  if (!Array.isArray(value) || value.length !== PASSWORD_VAULT_SECRET_LENGTH) {
    return false
  }
  for (let index = 0; index < value.length; index += 1) {
    const entry = value[index]
    if (
      !Object.hasOwn(value, index) ||
      !Number.isSafeInteger(entry) ||
      entry < 0 ||
      entry > 255
    ) {
      return false
    }
  }
  return true
}

function copyStrictVaultKey(value: unknown, label: string): Uint8Array<ArrayBuffer> {
  const validTypedArray =
    value instanceof Uint8Array && value.byteLength === PASSWORD_VAULT_SECRET_LENGTH
  const validNumberArray = isDenseByteArray(value)
  if (!validTypedArray && !validNumberArray) {
    throw new Error(`${label} doit contenir exactement 32 octets binaires.`)
  }
  const copy = new Uint8Array(PASSWORD_VAULT_SECRET_LENGTH)
  copy.set(value as Uint8Array | number[])
  return copy
}

export class WindowsVaultKeyBackend implements VaultKeyBackend {
  private readonly entry: VaultKeyringEntry

  constructor(
    createEntry: VaultKeyringEntryFactory = (service, account) =>
      new AsyncEntry(service, account),
  ) {
    this.entry = createEntry(
      PASSWORD_VAULT_KEYRING_SERVICE,
      PASSWORD_VAULT_KEYRING_ACCOUNT,
    )
  }

  async load(): Promise<Uint8Array | number[] | undefined> {
    return (await this.entry.getSecret()) ?? undefined
  }

  save(value: Uint8Array): Promise<void> {
    return this.entry.setSecret(value)
  }

  delete(): Promise<boolean> {
    return this.entry.deleteCredential()
  }
}

export class VaultKeyStore {
  constructor(
    private readonly backend: VaultKeyBackend,
    private readonly generateRandomKey: (length: number) => Uint8Array = randomBytes,
  ) {}

  async load(): Promise<Uint8Array<ArrayBuffer> | undefined> {
    const stored = await this.backend.load()
    if (stored === undefined) return undefined
    try {
      return copyStrictVaultKey(stored, 'La clé Windows du coffre')
    } finally {
      stored.fill(0)
    }
  }

  async create(): Promise<Uint8Array<ArrayBuffer>> {
    const existing = await this.load()
    if (existing) {
      existing.fill(0)
      throw new Error('Une clé Windows existe déjà pour le coffre local.')
    }

    const generatedValue = this.generateRandomKey(PASSWORD_VAULT_SECRET_LENGTH)
    const generated = copyStrictVaultKey(generatedValue, 'La nouvelle clé du coffre')
    generatedValue.fill(0)
    try {
      const transient = generated.slice()
      try {
        await this.backend.save(transient)
      } finally {
        transient.fill(0)
      }

      const verification = await this.load()
      if (!verification) {
        throw new Error('La clé du coffre n’a pas été relue depuis Windows.')
      }
      try {
        if (!timingSafeEqual(generated, verification)) {
          throw new Error('La clé relue depuis Windows ne correspond pas à la clé créée.')
        }
      } finally {
        verification.fill(0)
      }
      return generated
    } catch (error) {
      generated.fill(0)
      throw error
    }
  }

  delete(): Promise<boolean> {
    return this.backend.delete()
  }
}

export function createWindowsVaultKeyStore(): VaultKeyStore {
  return new VaultKeyStore(new WindowsVaultKeyBackend())
}
