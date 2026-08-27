import { beforeAll, describe, expect, it } from 'vitest'
import {
  ByteUtils,
  Consts,
  Int64,
  Kdbx,
  KdbxCredentials,
  ProtectedValue,
} from 'kdbxweb'
import {
  createPasswordVaultDatabase,
  loadPasswordVaultDatabase,
  savePasswordVaultDatabase,
  wipePasswordVaultDatabase,
} from '../src/plugins/password-vault/main/kdbx-vault'

const SECRET = new Uint8Array(32).fill(0x31)
const OTHER_SECRET = new Uint8Array(32).fill(0x32)
const PLAINTEXT_PASSWORD = 'MAER-test-password-that-must-stay-encrypted'

let serialized: ArrayBuffer

function int64(value: unknown): number {
  if (!(value instanceof Int64)) throw new Error('Expected an Int64 KDBX parameter')
  return value.value
}

function containsBytes(data: ArrayBuffer, needle: Uint8Array): boolean {
  const haystack = new Uint8Array(data)
  outer: for (let index = 0; index <= haystack.length - needle.length; index += 1) {
    for (let offset = 0; offset < needle.length; offset += 1) {
      if (haystack[index + offset] !== needle[offset]) continue outer
    }
    return true
  }
  return false
}

function containsUtf8(data: ArrayBuffer, text: string): boolean {
  return containsBytes(data, new TextEncoder().encode(text))
}

beforeAll(async () => {
  const database = await createPasswordVaultDatabase(SECRET)
  const entry = database.createEntry(database.getDefaultGroup())
  entry.fields.set('Title', 'Compte de test')
  entry.fields.set('UserName', 'alice')
  entry.fields.set('URL', 'https://example.test/')
  entry.fields.set('Password', ProtectedValue.fromString(PLAINTEXT_PASSWORD))
  serialized = await savePasswordVaultDatabase(database)
}, 30_000)

describe('Password Vault KDBX 4.1 core', () => {
  it('writes the binary KDBX 4.1 header and exact Argon2id profile', async () => {
    const header = new DataView(serialized)
    expect(header.getUint32(0, true)).toBe(0x9aa2d903)
    expect(header.getUint32(4, true)).toBe(0xb54bfb67)
    expect(header.getUint16(8, true)).toBe(1)
    expect(header.getUint16(10, true)).toBe(4)

    const database = await loadPasswordVaultDatabase(serialized.slice(0), SECRET)
    expect(database.header.dataCipherUuid?.toString()).toBe(Consts.CipherId.Aes)
    const parameters = database.header.kdfParameters
    if (!parameters) throw new Error('Missing KDF parameters')
    const uuid = parameters.get('$UUID')
    if (!(uuid instanceof ArrayBuffer)) throw new Error('Missing KDF UUID')
    expect(ByteUtils.bytesToBase64(uuid)).toBe(Consts.KdfId.Argon2id)
    expect(parameters.get('V')).toBe(0x13)
    expect(parameters.get('P')).toBe(1)
    expect(int64(parameters.get('I'))).toBe(3)
    expect(int64(parameters.get('M'))).toBe(64 * 1024 * 1024)
  }, 30_000)

  it('keeps entry passwords protected in memory and out of serialized bytes', async () => {
    const database = await loadPasswordVaultDatabase(serialized.slice(0), SECRET)
    const entry = [...database.getDefaultGroup().allEntries()].find(
      (candidate) => candidate.fields.get('Title') === 'Compte de test',
    )
    const password = entry?.fields.get('Password')
    expect(password).toBeInstanceOf(ProtectedValue)
    expect(password instanceof ProtectedValue ? password.getText() : undefined).toBe(
      PLAINTEXT_PASSWORD,
    )
    expect(containsUtf8(serialized, PLAINTEXT_PASSWORD)).toBe(false)
    expect(containsBytes(serialized, SECRET)).toBe(false)
    expect(SECRET).toEqual(new Uint8Array(32).fill(0x31))
    expect(database.credentials.passwordHash).toBeInstanceOf(ProtectedValue)
  }, 30_000)

  it('rejects a wrong secret', async () => {
    await expect(
      loadPasswordVaultDatabase(serialized.slice(0), OTHER_SECRET),
    ).rejects.toThrow()
  }, 30_000)

  it('rejects authenticated data tampering', async () => {
    const tampered = serialized.slice(0)
    const bytes = new Uint8Array(tampered)
    const tamperedIndex = Math.floor(bytes.length / 2)
    bytes[tamperedIndex] = (bytes[tamperedIndex] ?? 0) ^ 0x80
    await expect(loadPasswordVaultDatabase(tampered, SECRET)).rejects.toThrow()
  }, 30_000)

  it('rejects non-32-byte vault secrets before KDBX processing', async () => {
    await expect(createPasswordVaultDatabase(new Uint8Array(31))).rejects.toThrow(/32 octets/i)
  })

  it('rejects password fields that are not protected in memory', async () => {
    const database = await createPasswordVaultDatabase(SECRET)
    const entry = database.createEntry(database.getDefaultGroup())
    entry.fields.set('Password', 'plaintext')

    await expect(savePasswordVaultDatabase(database)).rejects.toThrow(/protégé en mémoire/i)
  })

  it('zeroes retained protected values on best-effort disposal', async () => {
    const database = await loadPasswordVaultDatabase(serialized.slice(0), SECRET)
    const credential = database.credentials.passwordHash
    const entry = [...database.getDefaultGroup().allEntries()].find(
      (candidate) => candidate.fields.get('Title') === 'Compte de test',
    )
    const password = entry?.fields.get('Password')
    const streamKey = database.header.protectedStreamKey
    expect(credential).toBeInstanceOf(ProtectedValue)
    expect(password).toBeInstanceOf(ProtectedValue)
    expect(streamKey).toBeInstanceOf(ArrayBuffer)

    wipePasswordVaultDatabase(database)

    expect(credential?.value).toEqual(new Uint8Array(credential?.value.byteLength ?? 0))
    expect(credential?.salt).toEqual(new Uint8Array(credential?.salt.byteLength ?? 0))
    if (password instanceof ProtectedValue) {
      expect(password.value).toEqual(new Uint8Array(password.value.byteLength))
      expect(password.salt).toEqual(new Uint8Array(password.salt.byteLength))
    }
    if (streamKey) {
      expect(new Uint8Array(streamKey)).toEqual(new Uint8Array(streamKey.byteLength))
    }
  }, 30_000)

  it('rejects oversized input before parsing', async () => {
    const oversized = new ArrayBuffer(16 * 1024 * 1024 + 1)
    await expect(loadPasswordVaultDatabase(oversized, SECRET)).rejects.toThrow(/taille/i)
  })

  it('does not accept an arbitrary KDBX 4.0 profile as a MAER vault', async () => {
    const credentials = new KdbxCredentials(ProtectedValue.fromString('legacy'))
    await credentials.ready
    const legacy = Kdbx.create(credentials, 'Legacy')
    await expect(savePasswordVaultDatabase(legacy)).rejects.toThrow(/4\.1/i)
  })
})
