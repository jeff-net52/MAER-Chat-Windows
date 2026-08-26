import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { ProtectedValue } from 'kdbxweb'
import { AtomicVaultStorage } from '../src/plugins/password-vault/main/atomic-vault-storage'
import {
  createPasswordVaultDatabase,
  wipePasswordVaultDatabase,
} from '../src/plugins/password-vault/main/kdbx-vault'

it('atomically writes and cryptographically reloads a real MAER KDBX file', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'maer-vault-kdbx-'))
  const vaultPath = join(directory, 'passwords.kdbx')
  const secret = new Uint8Array(32).fill(0x6b)
  const plaintext = 'atomic-kdbx-secret-must-not-appear'
  const database = await createPasswordVaultDatabase(secret)
  const entry = database.createEntry(database.getDefaultGroup())
  entry.fields.set('Title', 'Atomic test')
  entry.fields.set('Password', ProtectedValue.fromString(plaintext))
  const storage = new AtomicVaultStorage(vaultPath)
  let recovered: Awaited<ReturnType<typeof storage.recover>> = undefined

  try {
    await storage.write(database, secret)
    recovered = await storage.recover(secret)

    expect(recovered).toBeDefined()
    const password = recovered
      ? [...recovered.getDefaultGroup().allEntries()][0]?.fields.get('Password')
      : undefined
    expect(password).toBeInstanceOf(ProtectedValue)
    expect(password instanceof ProtectedValue ? password.getText() : undefined).toBe(plaintext)
    expect(new TextDecoder().decode(await readFile(vaultPath))).not.toContain(plaintext)
  } finally {
    if (recovered) wipePasswordVaultDatabase(recovered)
    wipePasswordVaultDatabase(database)
    secret.fill(0)
    const safePrefix = join(tmpdir(), 'maer-vault-kdbx-')
    if (directory.startsWith(safePrefix)) {
      await rm(directory, { recursive: true, force: true })
    }
  }
}, 30_000)
