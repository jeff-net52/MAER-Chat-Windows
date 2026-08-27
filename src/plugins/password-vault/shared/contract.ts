export const PASSWORD_VAULT_PROTOCOL_VERSION = 1 as const

export const PASSWORD_VAULT_ACTIONS = [
  'status',
  'initialize',
  'unlock',
  'lock',
  'list',
  'search',
  'add',
  'update',
  'delete',
  'generate',
  'copy',
] as const

export type PasswordVaultAction = (typeof PASSWORD_VAULT_ACTIONS)[number]
export type PasswordVaultState =
  | 'uninitialized'
  | 'locked'
  | 'unlocked'
  | 'recovery-required'

export type PasswordVaultErrorCode =
  | 'invalid-request'
  | 'uninitialized'
  | 'locked'
  | 'not-found'
  | 'recovery-required'
  | 'storage-unavailable'
  | 'corrupt-vault'
  | 'internal'

export interface PasswordVaultStatus {
  state: PasswordVaultState
  entryCount: number | null
}

export interface PasswordVaultEntrySummary {
  id: string
  title: string
  username: string
  url: string
  updatedAt: string
}

export interface PasswordVaultNewEntry {
  title: string
  username: string
  url: string
  password: string
}

export type PasswordVaultPasswordUpdate =
  | { mode: 'keep' }
  | { mode: 'replace'; value: string }

export interface PasswordVaultEntryUpdate {
  id: string
  title: string
  username: string
  url: string
  password: PasswordVaultPasswordUpdate
}

interface PasswordVaultRequestBase {
  version: typeof PASSWORD_VAULT_PROTOCOL_VERSION
  requestId: string
  action: PasswordVaultAction
}

export type PasswordVaultRequest =
  | (PasswordVaultRequestBase & {
      action: 'status' | 'initialize' | 'unlock' | 'lock' | 'list'
    })
  | (PasswordVaultRequestBase & {
      action: 'search'
      query: string
    })
  | (PasswordVaultRequestBase & {
      action: 'add'
      entry: PasswordVaultNewEntry
    })
  | (PasswordVaultRequestBase & {
      action: 'update'
      entry: PasswordVaultEntryUpdate
    })
  | (PasswordVaultRequestBase & {
      action: 'delete' | 'copy'
      entryId: string
    })
  | (PasswordVaultRequestBase & {
      action: 'generate'
      length: number
    })

export interface PasswordVaultDeleteResult {
  entryId: string
  deleted: true
}

export interface PasswordVaultGeneratedPassword {
  password: string
}

export interface PasswordVaultCopyResult {
  entryId: string
  copied: true
  clearAfterSeconds: number
}

export type PasswordVaultSuccessResult =
  | PasswordVaultStatus
  | PasswordVaultEntrySummary
  | readonly PasswordVaultEntrySummary[]
  | PasswordVaultDeleteResult
  | PasswordVaultGeneratedPassword
  | PasswordVaultCopyResult

export interface PasswordVaultSuccessResponse {
  version: typeof PASSWORD_VAULT_PROTOCOL_VERSION
  requestId: string
  ok: true
  action: PasswordVaultAction
  result: PasswordVaultSuccessResult
}

export interface PasswordVaultFailureResponse {
  version: typeof PASSWORD_VAULT_PROTOCOL_VERSION
  requestId: string
  ok: false
  error: {
    code: PasswordVaultErrorCode
    message: string
  }
}

export type PasswordVaultResponse =
  | PasswordVaultSuccessResponse
  | PasswordVaultFailureResponse

export const PASSWORD_VAULT_MIN_GENERATED_LENGTH = 12
export const PASSWORD_VAULT_MAX_GENERATED_LENGTH = 128
export const PASSWORD_VAULT_CLIPBOARD_CLEAR_SECONDS = 30

const REQUEST_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu
const KDBX_ENTRY_ID = /^[A-Za-z0-9+/]{22}==$/u
const VAULT_STATES = new Set<unknown>([
  'uninitialized',
  'locked',
  'unlocked',
  'recovery-required',
])
const ERROR_CODES = new Set<unknown>([
  'invalid-request',
  'uninitialized',
  'locked',
  'not-found',
  'recovery-required',
  'storage-unavailable',
  'corrupt-vault',
  'internal',
])
const ACTIONS = new Set<unknown>(PASSWORD_VAULT_ACTIONS)

function record(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${label} doit être un objet.`)
  }
  const prototype = Object.getPrototypeOf(value)
  if (prototype !== Object.prototype && prototype !== null) {
    throw new Error(`${label} doit être un objet simple.`)
  }
  return value as Record<string, unknown>
}

function exactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
  label: string,
): void {
  const allowed = new Set(expected)
  const unknown = Object.keys(value).find((key) => !allowed.has(key))
  if (unknown) throw new Error(`${label} contient un champ inconnu : ${unknown}.`)
  const missing = expected.find((key) => !Object.hasOwn(value, key))
  if (missing) throw new Error(`${label} ne contient pas le champ ${missing}.`)
}

function boundedString(
  value: unknown,
  label: string,
  maximum: number,
  allowEmpty = false,
): string {
  if (
    typeof value !== 'string' ||
    value.length > maximum ||
    (!allowEmpty && value.length === 0)
  ) {
    throw new Error(`${label} est invalide.`)
  }
  return value
}

function requestId(value: unknown): string {
  const parsed = boundedString(value, "L’identifiant de la requête", 36)
  if (!REQUEST_ID.test(parsed)) throw new Error("L’identifiant de la requête est invalide.")
  return parsed.toLowerCase()
}

function entryId(value: unknown): string {
  const parsed = boundedString(value, "L’identifiant de l’entrée", 24)
  if (!KDBX_ENTRY_ID.test(parsed)) throw new Error("L’identifiant de l’entrée est invalide.")
  return parsed
}

function title(value: unknown): string {
  const parsed = boundedString(value, 'Le titre', 160)
  if (parsed.trim() !== parsed) throw new Error('Le titre est invalide.')
  return parsed
}

function username(value: unknown): string {
  return boundedString(value, "Le nom d’utilisateur", 320, true)
}

function httpsUrl(value: unknown): string {
  const parsed = boundedString(value, "L’URL", 2048)
  let url: URL
  try {
    url = new URL(parsed)
  } catch {
    throw new Error("L’URL est invalide.")
  }
  if (url.protocol !== 'https:' || url.username || url.password) {
    throw new Error("L’URL doit être une adresse HTTPS sans identifiants intégrés.")
  }
  return url.href
}

function password(value: unknown): string {
  return boundedString(value, 'Le mot de passe', 4096)
}

function isoDate(value: unknown): string {
  const parsed = boundedString(value, 'La date de modification', 40)
  const date = new Date(parsed)
  if (Number.isNaN(date.getTime()) || date.toISOString() !== parsed) {
    throw new Error('La date de modification est invalide.')
  }
  return parsed
}

function generatedLength(value: unknown): number {
  if (
    !Number.isSafeInteger(value) ||
    (value as number) < PASSWORD_VAULT_MIN_GENERATED_LENGTH ||
    (value as number) > PASSWORD_VAULT_MAX_GENERATED_LENGTH
  ) {
    throw new Error('La longueur du mot de passe généré est invalide.')
  }
  return value as number
}

function parseNewEntry(value: unknown): PasswordVaultNewEntry {
  const input = record(value, "L’entrée du coffre")
  exactKeys(input, ['title', 'username', 'url', 'password'], "L’entrée du coffre")
  return Object.freeze({
    title: title(input.title),
    username: username(input.username),
    url: httpsUrl(input.url),
    password: password(input.password),
  })
}

function parsePasswordUpdate(value: unknown): PasswordVaultPasswordUpdate {
  const input = record(value, 'La mise à jour du mot de passe')
  if (input.mode === 'keep') {
    exactKeys(input, ['mode'], 'La mise à jour du mot de passe')
    return Object.freeze({ mode: 'keep' })
  }
  if (input.mode === 'replace') {
    exactKeys(input, ['mode', 'value'], 'La mise à jour du mot de passe')
    return Object.freeze({ mode: 'replace', value: password(input.value) })
  }
  throw new Error('Le mode de mise à jour du mot de passe est invalide.')
}

function parseEntryUpdate(value: unknown): PasswordVaultEntryUpdate {
  const input = record(value, "La mise à jour de l’entrée")
  exactKeys(input, ['id', 'title', 'username', 'url', 'password'], "La mise à jour de l’entrée")
  return Object.freeze({
    id: entryId(input.id),
    title: title(input.title),
    username: username(input.username),
    url: httpsUrl(input.url),
    password: parsePasswordUpdate(input.password),
  })
}

function parseStatus(value: unknown): PasswordVaultStatus {
  const input = record(value, 'Le statut du coffre')
  exactKeys(input, ['state', 'entryCount'], 'Le statut du coffre')
  if (!VAULT_STATES.has(input.state)) throw new Error('Le statut du coffre est invalide.')
  if (
    input.entryCount !== null &&
    (!Number.isSafeInteger(input.entryCount) ||
      (input.entryCount as number) < 0 ||
      (input.entryCount as number) > 10_000)
  ) {
    throw new Error("Le nombre d’entrées du coffre est invalide.")
  }
  if (
    (input.state === 'unlocked' && input.entryCount === null) ||
    (input.state !== 'unlocked' && input.entryCount !== null)
  ) {
    throw new Error("Le nombre d’entrées ne correspond pas à l’état de verrouillage du coffre.")
  }
  return Object.freeze({
    state: input.state as PasswordVaultState,
    entryCount: input.entryCount as number | null,
  })
}

function parseEntrySummary(value: unknown): PasswordVaultEntrySummary {
  const input = record(value, "Le résumé de l’entrée")
  exactKeys(input, ['id', 'title', 'username', 'url', 'updatedAt'], "Le résumé de l’entrée")
  return Object.freeze({
    id: entryId(input.id),
    title: title(input.title),
    username: username(input.username),
    url: httpsUrl(input.url),
    updatedAt: isoDate(input.updatedAt),
  })
}

function parseSummaryList(value: unknown): readonly PasswordVaultEntrySummary[] {
  if (!Array.isArray(value) || value.length > 10_000) {
    throw new Error("La liste d’entrées du coffre est invalide.")
  }
  return Object.freeze(value.map(parseEntrySummary))
}

export function parsePasswordVaultRequest(value: unknown): PasswordVaultRequest {
  const input = record(value, 'La requête du coffre')
  if (input.version !== PASSWORD_VAULT_PROTOCOL_VERSION) {
    throw new Error('La version du protocole du coffre est invalide.')
  }
  if (!ACTIONS.has(input.action)) throw new Error("L’action du coffre est invalide.")
  const base = {
    version: PASSWORD_VAULT_PROTOCOL_VERSION,
    requestId: requestId(input.requestId),
  } as const

  switch (input.action) {
    case 'status':
    case 'initialize':
    case 'unlock':
    case 'lock':
    case 'list':
      exactKeys(input, ['version', 'requestId', 'action'], 'La requête du coffre')
      return Object.freeze({ ...base, action: input.action })
    case 'search':
      exactKeys(input, ['version', 'requestId', 'action', 'query'], 'La requête du coffre')
      return Object.freeze({
        ...base,
        action: 'search',
        query: boundedString(input.query, 'La recherche', 320, true).trim(),
      })
    case 'add':
      exactKeys(input, ['version', 'requestId', 'action', 'entry'], 'La requête du coffre')
      return Object.freeze({ ...base, action: 'add', entry: parseNewEntry(input.entry) })
    case 'update':
      exactKeys(input, ['version', 'requestId', 'action', 'entry'], 'La requête du coffre')
      return Object.freeze({ ...base, action: 'update', entry: parseEntryUpdate(input.entry) })
    case 'delete':
    case 'copy':
      exactKeys(input, ['version', 'requestId', 'action', 'entryId'], 'La requête du coffre')
      return Object.freeze({ ...base, action: input.action, entryId: entryId(input.entryId) })
    case 'generate':
      exactKeys(input, ['version', 'requestId', 'action', 'length'], 'La requête du coffre')
      return Object.freeze({ ...base, action: 'generate', length: generatedLength(input.length) })
    default:
      throw new Error("L’action du coffre est invalide.")
  }
}

export function parsePasswordVaultResponse(value: unknown): PasswordVaultResponse {
  const input = record(value, 'La réponse du coffre')
  if (input.version !== PASSWORD_VAULT_PROTOCOL_VERSION) {
    throw new Error('La version de la réponse du coffre est invalide.')
  }
  const parsedRequestId = requestId(input.requestId)
  if (input.ok === false) {
    exactKeys(input, ['version', 'requestId', 'ok', 'error'], 'La réponse du coffre')
    const error = record(input.error, "L’erreur du coffre")
    exactKeys(error, ['code', 'message'], "L’erreur du coffre")
    if (!ERROR_CODES.has(error.code)) throw new Error("Le code d’erreur du coffre est invalide.")
    return Object.freeze({
      version: PASSWORD_VAULT_PROTOCOL_VERSION,
      requestId: parsedRequestId,
      ok: false,
      error: Object.freeze({
        code: error.code as PasswordVaultErrorCode,
        message: boundedString(error.message, "Le message d’erreur du coffre", 240),
      }),
    })
  }
  if (input.ok !== true || !ACTIONS.has(input.action)) {
    throw new Error('La réponse du coffre est invalide.')
  }
  exactKeys(input, ['version', 'requestId', 'ok', 'action', 'result'], 'La réponse du coffre')

  let result: PasswordVaultSuccessResult
  switch (input.action) {
    case 'status':
    case 'initialize':
    case 'unlock':
    case 'lock':
      result = parseStatus(input.result)
      break
    case 'list':
    case 'search':
      result = parseSummaryList(input.result)
      break
    case 'add':
    case 'update':
      result = parseEntrySummary(input.result)
      break
    case 'delete': {
      const deletion = record(input.result, 'La suppression du coffre')
      exactKeys(deletion, ['entryId', 'deleted'], 'La suppression du coffre')
      if (deletion.deleted !== true) throw new Error('La suppression du coffre est invalide.')
      result = Object.freeze({ entryId: entryId(deletion.entryId), deleted: true as const })
      break
    }
    case 'generate': {
      const generated = record(input.result, 'Le mot de passe généré')
      exactKeys(generated, ['password'], 'Le mot de passe généré')
      const parsedPassword = password(generated.password)
      if (
        parsedPassword.length < PASSWORD_VAULT_MIN_GENERATED_LENGTH ||
        parsedPassword.length > PASSWORD_VAULT_MAX_GENERATED_LENGTH
      ) {
        throw new Error('Le mot de passe généré est invalide.')
      }
      result = Object.freeze({ password: parsedPassword })
      break
    }
    case 'copy': {
      const copied = record(input.result, 'La copie du mot de passe')
      exactKeys(copied, ['entryId', 'copied', 'clearAfterSeconds'], 'La copie du mot de passe')
      if (
        copied.copied !== true ||
        copied.clearAfterSeconds !== PASSWORD_VAULT_CLIPBOARD_CLEAR_SECONDS
      ) {
        throw new Error('La copie du mot de passe est invalide.')
      }
      result = Object.freeze({
        entryId: entryId(copied.entryId),
        copied: true as const,
        clearAfterSeconds: PASSWORD_VAULT_CLIPBOARD_CLEAR_SECONDS,
      })
      break
    }
    default:
      throw new Error("L’action de la réponse du coffre est invalide.")
  }

  return Object.freeze({
    version: PASSWORD_VAULT_PROTOCOL_VERSION,
    requestId: parsedRequestId,
    ok: true,
    action: input.action as PasswordVaultAction,
    result,
  })
}
