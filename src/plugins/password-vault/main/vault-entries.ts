import { Kdbx, KdbxEntry, ProtectedValue } from 'kdbxweb'
import type {
  PasswordVaultEntrySummary,
  PasswordVaultEntryUpdate,
  PasswordVaultNewEntry,
} from '../shared/contract'
import { PASSWORD_VAULT_ENTRY_LIMIT } from './kdbx-vault'

export class PasswordVaultEntryError extends Error {
  constructor(
    message: string,
    readonly code: 'not-found' | 'entry-limit' | 'invalid-entry',
  ) {
    super(message)
    this.name = 'PasswordVaultEntryError'
  }
}

function isRecycled(database: Kdbx, entry: KdbxEntry): boolean {
  const recycleBinId = database.meta.recycleBinUuid?.id
  if (!recycleBinId) return false
  let parent = entry.parentGroup
  while (parent) {
    if (parent.uuid.id === recycleBinId) return true
    parent = parent.parentGroup
  }
  return false
}

function entries(database: Kdbx): KdbxEntry[] {
  return [...database.getDefaultGroup().allEntries()].filter(
    (entry) => !isRecycled(database, entry),
  )
}

function fieldText(entry: KdbxEntry, key: string): string {
  const value = entry.fields.get(key)
  if (typeof value === 'string') return value
  if (value instanceof ProtectedValue) return value.getText()
  throw new PasswordVaultEntryError(
    `Le champ ${key} de l’entrée est invalide.`,
    'invalid-entry',
  )
}

function summary(entry: KdbxEntry): PasswordVaultEntrySummary {
  const updatedAt = entry.times.lastModTime
  if (!updatedAt || Number.isNaN(updatedAt.getTime())) {
    throw new PasswordVaultEntryError(
      "La date de modification de l’entrée est invalide.",
      'invalid-entry',
    )
  }
  const result = {
    id: entry.uuid.id,
    title: fieldText(entry, 'Title'),
    username: fieldText(entry, 'UserName'),
    url: fieldText(entry, 'URL'),
    updatedAt: updatedAt.toISOString(),
  }
  if (!result.title || !result.url.startsWith('https://')) {
    throw new PasswordVaultEntryError(
      "Les champs publics de l’entrée sont invalides.",
      'invalid-entry',
    )
  }
  return Object.freeze(result)
}

function find(database: Kdbx, entryId: string): KdbxEntry {
  const entry = entries(database).find((candidate) => candidate.uuid.id === entryId)
  if (!entry) {
    throw new PasswordVaultEntryError("L’entrée demandée est introuvable.", 'not-found')
  }
  return entry
}

function sortSummaries(
  values: readonly PasswordVaultEntrySummary[],
): readonly PasswordVaultEntrySummary[] {
  return Object.freeze(
    [...values].sort(
      (left, right) =>
        left.title.localeCompare(right.title, 'fr', { sensitivity: 'base' }) ||
        left.username.localeCompare(right.username, 'fr', { sensitivity: 'base' }) ||
        left.id.localeCompare(right.id),
    ),
  )
}

export function listPasswordVaultEntries(
  database: Kdbx,
): readonly PasswordVaultEntrySummary[] {
  return sortSummaries(entries(database).map(summary))
}

export function searchPasswordVaultEntries(
  database: Kdbx,
  query: string,
): readonly PasswordVaultEntrySummary[] {
  const normalized = query.trim().toLocaleLowerCase('fr')
  if (!normalized) return listPasswordVaultEntries(database)
  return sortSummaries(
    entries(database)
      .map(summary)
      .filter((entry) =>
        [entry.title, entry.username, entry.url].some((value) =>
          value.toLocaleLowerCase('fr').includes(normalized),
        ),
      ),
  )
}

export function addPasswordVaultEntry(
  database: Kdbx,
  input: PasswordVaultNewEntry,
): PasswordVaultEntrySummary {
  if (entries(database).length >= PASSWORD_VAULT_ENTRY_LIMIT) {
    throw new PasswordVaultEntryError(
      "Le coffre contient déjà le nombre maximal d’entrées.",
      'entry-limit',
    )
  }
  const entry = database.createEntry(database.getDefaultGroup())
  entry.fields.set('Title', input.title)
  entry.fields.set('UserName', input.username)
  entry.fields.set('URL', input.url)
  entry.fields.set('Password', ProtectedValue.fromString(input.password))
  entry.times.update()
  return summary(entry)
}

export function updatePasswordVaultEntry(
  database: Kdbx,
  input: PasswordVaultEntryUpdate,
): PasswordVaultEntrySummary {
  const entry = find(database, input.id)
  entry.pushHistory()
  entry.fields.set('Title', input.title)
  entry.fields.set('UserName', input.username)
  entry.fields.set('URL', input.url)
  if (input.password.mode === 'replace') {
    entry.fields.set('Password', ProtectedValue.fromString(input.password.value))
  }
  entry.times.update()
  return summary(entry)
}

export function deletePasswordVaultEntry(database: Kdbx, entryId: string): void {
  database.remove(find(database, entryId))
}

/** The plaintext is created only for an immediate main-process clipboard write. */
export function passwordForClipboard(database: Kdbx, entryId: string): string {
  const password = find(database, entryId).fields.get('Password')
  if (!(password instanceof ProtectedValue)) {
    throw new PasswordVaultEntryError(
      "Le mot de passe de l’entrée n’est pas protégé.",
      'invalid-entry',
    )
  }
  return password.getText()
}
