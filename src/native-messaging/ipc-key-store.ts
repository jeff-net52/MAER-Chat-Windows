import { AsyncEntry } from '@napi-rs/keyring'
import { randomBytes, timingSafeEqual } from 'node:crypto'

export const NATIVE_VAULT_IPC_KEYRING_SERVICE =
  'MAER Chat Native Messaging IPC' as const
export const NATIVE_VAULT_IPC_KEYRING_ACCOUNT = 'local-user-v1' as const
export const NATIVE_VAULT_IPC_SECRET_BYTES = 32

export interface NativeVaultIpcKeyBackend {
  load(): Promise<Uint8Array | number[] | undefined>
  save(value: Uint8Array): Promise<void>
  delete(): Promise<boolean>
}

export interface NativeVaultIpcKeyringEntry {
  getSecret(): Promise<Uint8Array | number[] | null | undefined>
  setSecret(value: Uint8Array): Promise<void>
  deleteCredential(): Promise<boolean>
}

export class WindowsNativeVaultIpcKeyBackend implements NativeVaultIpcKeyBackend {
  private readonly entry: NativeVaultIpcKeyringEntry

  constructor(
    createEntry: (
      service: string,
      account: string,
    ) => NativeVaultIpcKeyringEntry = (service, account) =>
      new AsyncEntry(service, account),
  ) {
    this.entry = createEntry(
      NATIVE_VAULT_IPC_KEYRING_SERVICE,
      NATIVE_VAULT_IPC_KEYRING_ACCOUNT,
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

function isDenseByteArray(value: unknown): value is number[] {
  if (!Array.isArray(value) || value.length !== NATIVE_VAULT_IPC_SECRET_BYTES) {
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

function strictSecret(value: unknown): Uint8Array<ArrayBuffer> {
  const validTypedArray =
    value instanceof Uint8Array && value.byteLength === NATIVE_VAULT_IPC_SECRET_BYTES
  const validNumberArray = isDenseByteArray(value)
  if (!validTypedArray && !validNumberArray) {
    throw new Error('Invalid native vault IPC credential')
  }
  const result = new Uint8Array(NATIVE_VAULT_IPC_SECRET_BYTES)
  result.set(value as Uint8Array | number[])
  return result
}

export class NativeVaultIpcKeyStore {
  constructor(
    private readonly backend: NativeVaultIpcKeyBackend,
    private readonly generate: (length: number) => Uint8Array = randomBytes,
  ) {}

  /** Returns a caller-owned copy which must be zeroed immediately after use. */
  async load(): Promise<Uint8Array<ArrayBuffer> | undefined> {
    const stored = await this.backend.load()
    if (stored === undefined) return undefined
    try {
      return strictSecret(stored)
    } finally {
      stored.fill(0)
    }
  }

  /** Server-only initialization. The Native Messaging proxy must call load(). */
  async ensure(): Promise<void> {
    const existing = await this.load()
    if (existing) {
      existing.fill(0)
      return
    }

    const generatedValue = this.generate(NATIVE_VAULT_IPC_SECRET_BYTES)
    let generated: Uint8Array<ArrayBuffer>
    try {
      generated = strictSecret(generatedValue)
    } finally {
      generatedValue.fill(0)
    }

    let saved = false
    try {
      const transient = generated.slice()
      try {
        await this.backend.save(transient)
        saved = true
      } finally {
        transient.fill(0)
      }
      const verification = await this.load()
      if (!verification) throw new Error('Native vault IPC credential is unavailable')
      try {
        if (!timingSafeEqual(generated, verification)) {
          throw new Error('Native vault IPC credential verification failed')
        }
      } finally {
        verification.fill(0)
      }
    } catch (error) {
      if (saved) await this.backend.delete().catch(() => false)
      throw error
    } finally {
      generated.fill(0)
    }
  }
}

export function createWindowsNativeVaultIpcKeyStore(): NativeVaultIpcKeyStore {
  return new NativeVaultIpcKeyStore(new WindowsNativeVaultIpcKeyBackend())
}
