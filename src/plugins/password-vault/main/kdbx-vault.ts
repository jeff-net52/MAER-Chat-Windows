import {
  ByteUtils,
  Consts,
  Int64,
  Kdbx,
  KdbxCredentials,
  KdbxUuid,
  ProtectedValue,
  VarDictionary,
} from 'kdbxweb'
import {
  PASSWORD_VAULT_ARGON2_PROFILE,
  installPasswordVaultArgon2,
} from './argon2-adapter'

export const PASSWORD_VAULT_FILE_LIMIT = 16 * 1024 * 1024
export const PASSWORD_VAULT_ENTRY_LIMIT = 10_000
export const PASSWORD_VAULT_SECRET_LENGTH = 32

const KDBX_VERSION_MAJOR = 4
const KDBX_VERSION_MINOR = 1
const KDF_MEMORY_BYTES = PASSWORD_VAULT_ARGON2_PROFILE.memoryKiB * 1024
const REQUIRED_KDF_KEYS = new Set(['$UUID', 'S', 'P', 'I', 'M', 'V'])

function exactArrayBuffer(value: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(value.byteLength)
  copy.set(value)
  return copy.buffer
}

function validatedSecret(secret: Uint8Array): Uint8Array<ArrayBuffer> {
  if (!(secret instanceof Uint8Array) || secret.byteLength !== PASSWORD_VAULT_SECRET_LENGTH) {
    throw new Error('La clé du coffre doit contenir exactement 32 octets.')
  }
  return new Uint8Array(exactArrayBuffer(secret))
}

async function credentialsFromSecret(secret: Uint8Array): Promise<KdbxCredentials> {
  const ownedSecret = validatedSecret(secret)
  const credentials = new KdbxCredentials(ProtectedValue.fromBinary(ownedSecret.buffer))
  await credentials.ready
  return credentials
}

function int64Parameter(value: unknown, label: string): number {
  if (!(value instanceof Int64)) throw new Error(`Le paramètre KDBX ${label} est invalide.`)
  return value.value
}

function assertKdfProfile(database: Kdbx): void {
  const parameters = database.header.kdfParameters
  if (!parameters) throw new Error('Les paramètres KDF du coffre sont absents.')
  if (
    parameters.keys().length !== REQUIRED_KDF_KEYS.size ||
    parameters.keys().some((key) => !REQUIRED_KDF_KEYS.has(key))
  ) {
    throw new Error('Les paramètres KDF du coffre ne correspondent pas au profil MAER.')
  }
  const uuid = parameters.get('$UUID')
  if (!(uuid instanceof ArrayBuffer) || ByteUtils.bytesToBase64(uuid) !== Consts.KdfId.Argon2id) {
    throw new Error('Le coffre n’utilise pas Argon2id.')
  }
  if (parameters.get('V') !== PASSWORD_VAULT_ARGON2_PROFILE.version) {
    throw new Error('La version Argon2id du coffre est invalide.')
  }
  if (parameters.get('P') !== PASSWORD_VAULT_ARGON2_PROFILE.parallelism) {
    throw new Error('Le parallélisme Argon2id du coffre est invalide.')
  }
  if (
    int64Parameter(parameters.get('I'), 'I') !==
    PASSWORD_VAULT_ARGON2_PROFILE.iterations
  ) {
    throw new Error("Le nombre d’itérations Argon2id du coffre est invalide.")
  }
  if (int64Parameter(parameters.get('M'), 'M') !== KDF_MEMORY_BYTES) {
    throw new Error('La mémoire Argon2id du coffre est invalide.')
  }
  const salt = parameters.get('S')
  if (!(salt instanceof ArrayBuffer) || salt.byteLength !== 32) {
    throw new Error('Le sel Argon2id du coffre est invalide.')
  }
}

function activeEntryCount(database: Kdbx): number {
  let count = 0
  const recycleBinId = database.meta.recycleBinUuid?.id
  for (const entry of database.getDefaultGroup().allEntries()) {
    let parent = entry.parentGroup
    let recycled = false
    while (parent) {
      if (parent.uuid.id === recycleBinId) {
        recycled = true
        break
      }
      parent = parent.parentGroup
    }
    if (!recycled) count += 1
  }
  return count
}

export function passwordVaultEntryCount(database: Kdbx): number {
  return activeEntryCount(database)
}

export function assertPasswordVaultDatabase(database: Kdbx): void {
  if (
    database.versionMajor !== KDBX_VERSION_MAJOR ||
    database.versionMinor !== KDBX_VERSION_MINOR
  ) {
    throw new Error('Le coffre doit utiliser le format KDBX 4.1.')
  }
  if (database.header.dataCipherUuid?.toString() !== Consts.CipherId.Aes) {
    throw new Error('Le coffre doit utiliser le chiffrement AES-256 KDBX.')
  }
  assertKdfProfile(database)
  if (database.binaries.getAll().length !== 0) {
    throw new Error('Les pièces jointes ne sont pas prises en charge dans ce coffre.')
  }
  if (database.meta.memoryProtection.password !== true) {
    throw new Error('La protection en mémoire des mots de passe du coffre est désactivée.')
  }
  for (const entry of database.getDefaultGroup().allEntries()) {
    if (entry.binaries.size !== 0 || entry.history.some((item) => item.binaries.size !== 0)) {
      throw new Error('Les pièces jointes ne sont pas prises en charge dans ce coffre.')
    }
    for (const candidate of [entry, ...entry.history]) {
      const password = candidate.fields.get('Password')
      if (password !== undefined && !(password instanceof ProtectedValue)) {
        throw new Error('Un mot de passe du coffre n’est pas protégé en mémoire.')
      }
    }
  }
  if (activeEntryCount(database) > PASSWORD_VAULT_ENTRY_LIMIT) {
    throw new Error("Le coffre contient trop d’entrées.")
  }
}

function wipeProtectedValue(value: ProtectedValue | undefined): void {
  if (!value) return
  value.value.fill(0)
  value.salt.fill(0)
}

function wipeBuffer(value: ArrayBuffer | undefined): void {
  if (value) new Uint8Array(value).fill(0)
}

export function wipePasswordVaultDatabase(database: Kdbx): void {
  const bestEffort = (operation: () => void): void => {
    try {
      operation()
    } catch {
      // JavaScript cannot guarantee erasure; continue every available wipe pass.
    }
  }
  bestEffort(() => wipeProtectedValue(database.credentials.passwordHash))
  bestEffort(() => wipeProtectedValue(database.credentials.keyFileHash))
  bestEffort(() => {
    for (const entry of database.getDefaultGroup().allEntries()) {
      for (const candidate of [entry, ...entry.history]) {
        for (const value of candidate.fields.values()) {
          if (value instanceof ProtectedValue) {
            bestEffort(() => wipeProtectedValue(value))
          }
        }
      }
    }
  })
  bestEffort(() => wipeBuffer(database.header.masterSeed))
  bestEffort(() => wipeBuffer(database.header.transformSeed))
  bestEffort(() => wipeBuffer(database.header.encryptionIV))
  bestEffort(() => wipeBuffer(database.header.protectedStreamKey))
  bestEffort(() => wipeBuffer(database.header.streamStartBytes))
}

function configurePasswordVaultDatabase(database: Kdbx): void {
  database.header.versionMajor = KDBX_VERSION_MAJOR
  database.header.versionMinor = KDBX_VERSION_MINOR
  database.header.dataCipherUuid = new KdbxUuid(Consts.CipherId.Aes)
  database.setKdf(Consts.KdfId.Argon2id)
  database.header.versionMinor = KDBX_VERSION_MINOR

  const parameters = database.header.kdfParameters
  if (!parameters) throw new Error('Impossible de configurer les paramètres KDF du coffre.')
  parameters.set('P', VarDictionary.ValueType.UInt32, PASSWORD_VAULT_ARGON2_PROFILE.parallelism)
  parameters.set(
    'I',
    VarDictionary.ValueType.UInt64,
    Int64.from(PASSWORD_VAULT_ARGON2_PROFILE.iterations),
  )
  parameters.set('M', VarDictionary.ValueType.UInt64, Int64.from(KDF_MEMORY_BYTES))
  parameters.set('V', VarDictionary.ValueType.UInt32, PASSWORD_VAULT_ARGON2_PROFILE.version)
  database.meta.memoryProtection.password = true
}

export async function createPasswordVaultDatabase(secret: Uint8Array): Promise<Kdbx> {
  installPasswordVaultArgon2()
  const database = Kdbx.create(await credentialsFromSecret(secret), 'MAER Password Vault')
  try {
    configurePasswordVaultDatabase(database)
    assertPasswordVaultDatabase(database)
    return database
  } catch (error) {
    wipePasswordVaultDatabase(database)
    throw error
  }
}

export async function savePasswordVaultDatabase(database: Kdbx): Promise<ArrayBuffer> {
  installPasswordVaultArgon2()
  assertPasswordVaultDatabase(database)
  const data = await database.save()
  if (data.byteLength === 0 || data.byteLength > PASSWORD_VAULT_FILE_LIMIT) {
    new Uint8Array(data).fill(0)
    throw new Error('La taille du coffre KDBX est invalide.')
  }
  return data
}

export async function loadPasswordVaultDatabase(
  data: ArrayBuffer,
  secret: Uint8Array,
): Promise<Kdbx> {
  if (!(data instanceof ArrayBuffer) || data.byteLength === 0 || data.byteLength > PASSWORD_VAULT_FILE_LIMIT) {
    throw new Error('La taille du coffre KDBX est invalide.')
  }
  installPasswordVaultArgon2()
  const database = await Kdbx.load(data, await credentialsFromSecret(secret))
  try {
    assertPasswordVaultDatabase(database)
    return database
  } catch (error) {
    wipePasswordVaultDatabase(database)
    throw error
  }
}
