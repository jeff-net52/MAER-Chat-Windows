import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scrypt,
} from 'node:crypto'
import type { PasswordVaultNewEntry } from '../shared/contract'

const MAGIC = 'MAER-VAULT-BACKUP-V1\n'
const SCRYPT_N = 32_768
const SCRYPT_R = 8
const SCRYPT_P = 1
const MAX_BACKUP_BYTES = 20 * 1024 * 1024
const MAX_ENTRIES = 10_000

interface BackupEnvelope {
  version: 1
  kdf: 'scrypt-32768-8-1'
  cipher: 'aes-256-gcm'
  salt: string
  iv: string
  tag: string
  ciphertext: string
}

function deriveKey(passphrase: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(
      passphrase,
      salt,
      32,
      { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P, maxmem: 64 * 1024 * 1024 },
      (error, key) => (error ? reject(error) : resolve(key as Buffer)),
    )
  })
}

function boundedPassphrase(value: string): string {
  if (typeof value !== 'string' || value.length < 12 || value.length > 1_024) {
    throw new Error('La phrase secrète doit contenir au moins 12 caractères.')
  }
  return value
}

function strictEntry(value: unknown): PasswordVaultNewEntry {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('La sauvegarde contient une entrée invalide.')
  }
  const entry = value as Record<string, unknown>
  if (
    Object.keys(entry).sort().join(',') !== 'password,title,url,username' ||
    typeof entry.title !== 'string' ||
    entry.title.length < 1 ||
    entry.title.length > 160 ||
    typeof entry.username !== 'string' ||
    entry.username.length > 320 ||
    typeof entry.password !== 'string' ||
    entry.password.length < 1 ||
    entry.password.length > 4_096 ||
    typeof entry.url !== 'string' ||
    entry.url.length > 2_048
  ) {
    throw new Error('La sauvegarde contient une entrée invalide.')
  }
  const url = new URL(entry.url)
  if (url.protocol !== 'https:' || url.username || url.password) {
    throw new Error('La sauvegarde contient une adresse non sécurisée.')
  }
  return Object.freeze({
    title: entry.title,
    username: entry.username,
    password: entry.password,
    url: url.toString(),
  })
}

export async function encryptVaultBackup(
  entries: readonly PasswordVaultNewEntry[],
  passphrase: string,
): Promise<Uint8Array> {
  boundedPassphrase(passphrase)
  if (entries.length > MAX_ENTRIES) throw new Error('Le coffre contient trop d’entrées.')
  const payload = Buffer.from(
    JSON.stringify({
      version: 1,
      createdAt: new Date().toISOString(),
      entries: entries.map(strictEntry),
    }),
    'utf8',
  )
  const salt = randomBytes(16)
  const iv = randomBytes(12)
  const key = await deriveKey(passphrase, salt)
  try {
    const cipher = createCipheriv('aes-256-gcm', key, iv)
    const ciphertext = Buffer.concat([cipher.update(payload), cipher.final()])
    const envelope: BackupEnvelope = {
      version: 1,
      kdf: 'scrypt-32768-8-1',
      cipher: 'aes-256-gcm',
      salt: salt.toString('base64'),
      iv: iv.toString('base64'),
      tag: cipher.getAuthTag().toString('base64'),
      ciphertext: ciphertext.toString('base64'),
    }
    const result = Buffer.from(`${MAGIC}${JSON.stringify(envelope)}\n`, 'utf8')
    if (result.length > MAX_BACKUP_BYTES) throw new Error('La sauvegarde est trop volumineuse.')
    return result
  } finally {
    key.fill(0)
    payload.fill(0)
  }
}

export async function decryptVaultBackup(
  data: Uint8Array,
  passphrase: string,
): Promise<readonly PasswordVaultNewEntry[]> {
  boundedPassphrase(passphrase)
  if (data.byteLength < MAGIC.length || data.byteLength > MAX_BACKUP_BYTES) {
    throw new Error('Le fichier de sauvegarde est invalide.')
  }
  const source = Buffer.from(data)
  const text = source.toString('utf8')
  source.fill(0)
  if (!text.startsWith(MAGIC)) throw new Error('Le fichier de sauvegarde est invalide.')
  let envelope: BackupEnvelope
  try {
    envelope = JSON.parse(text.slice(MAGIC.length)) as BackupEnvelope
  } catch {
    throw new Error('Le fichier de sauvegarde est invalide.')
  }
  if (
    envelope.version !== 1 ||
    envelope.kdf !== 'scrypt-32768-8-1' ||
    envelope.cipher !== 'aes-256-gcm'
  ) {
    throw new Error('Le format de sauvegarde n’est pas pris en charge.')
  }
  const salt = Buffer.from(envelope.salt, 'base64')
  const iv = Buffer.from(envelope.iv, 'base64')
  const tag = Buffer.from(envelope.tag, 'base64')
  const ciphertext = Buffer.from(envelope.ciphertext, 'base64')
  if (salt.length !== 16 || iv.length !== 12 || tag.length !== 16 || ciphertext.length === 0) {
    throw new Error('Le fichier de sauvegarde est invalide.')
  }
  const key = await deriveKey(passphrase, salt)
  let plaintext: Buffer | undefined
  try {
    const decipher = createDecipheriv('aes-256-gcm', key, iv)
    decipher.setAuthTag(tag)
    plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()])
    const payload = JSON.parse(plaintext.toString('utf8')) as Record<string, unknown>
    if (
      payload.version !== 1 ||
      typeof payload.createdAt !== 'string' ||
      Number.isNaN(Date.parse(payload.createdAt)) ||
      !Array.isArray(payload.entries) ||
      payload.entries.length > MAX_ENTRIES
    ) {
      throw new Error('Le contenu de la sauvegarde est invalide.')
    }
    return Object.freeze(payload.entries.map(strictEntry))
  } catch {
    throw new Error('Phrase secrète incorrecte ou sauvegarde endommagée.')
  } finally {
    key.fill(0)
    plaintext?.fill(0)
  }
}
