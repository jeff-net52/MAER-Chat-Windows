import { createHash, randomInt, timingSafeEqual } from 'node:crypto'
import {
  PASSWORD_VAULT_CLIPBOARD_CLEAR_SECONDS,
  PASSWORD_VAULT_MAX_GENERATED_LENGTH,
  PASSWORD_VAULT_MIN_GENERATED_LENGTH,
} from '../shared/contract'

const LOWERCASE = 'abcdefghijkmnopqrstuvwxyz'
const UPPERCASE = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
const DIGITS = '23456789'
const SYMBOLS = '!@#$%&*+-=?_'
export type SecureRandomIndex = (maximumExclusive: number) => number

export interface PasswordCharacterPolicy {
  length: number
  lowercase: boolean
  uppercase: boolean
  digits: boolean
  symbols: boolean
}

function pick(characters: string, randomIndex: SecureRandomIndex): string {
  const index = randomIndex(characters.length)
  if (!Number.isSafeInteger(index) || index < 0 || index >= characters.length) {
    throw new Error('La source aléatoire du générateur est invalide.')
  }
  return characters[index] ?? ''
}

export function generatePassword(
  length: number,
  randomIndex: SecureRandomIndex = (maximum) => randomInt(maximum),
): string {
  return generatePasswordForPolicy(
    {
      length,
      lowercase: true,
      uppercase: true,
      digits: true,
      symbols: true,
    },
    randomIndex,
  )
}

export function generatePasswordForPolicy(
  policy: PasswordCharacterPolicy,
  randomIndex: SecureRandomIndex = (maximum) => randomInt(maximum),
): string {
  if (
    !Number.isSafeInteger(policy.length) ||
    policy.length < PASSWORD_VAULT_MIN_GENERATED_LENGTH ||
    policy.length > PASSWORD_VAULT_MAX_GENERATED_LENGTH
  ) {
    throw new Error('La longueur du mot de passe généré est invalide.')
  }
  const groups = [
    [policy.lowercase, LOWERCASE],
    [policy.uppercase, UPPERCASE],
    [policy.digits, DIGITS],
    [policy.symbols, SYMBOLS],
  ] as const
  if (groups.some(([enabled]) => typeof enabled !== 'boolean')) {
    throw new Error('La politique du mot de passe généré est invalide.')
  }
  const enabledGroups = groups
    .filter(([enabled]) => enabled)
    .map(([, characters]) => characters)
  if (enabledGroups.length === 0) {
    throw new Error('La politique du mot de passe doit activer au moins un alphabet.')
  }
  const alphabet = enabledGroups.join('')
  const value = enabledGroups.map((characters) => pick(characters, randomIndex))
  while (value.length < policy.length) value.push(pick(alphabet, randomIndex))
  for (let index = value.length - 1; index > 0; index -= 1) {
    const swap = randomIndex(index + 1)
    if (!Number.isSafeInteger(swap) || swap < 0 || swap > index) {
      throw new Error('La source aléatoire du générateur est invalide.')
    }
    const current = value[index]
    value[index] = value[swap] ?? ''
    value[swap] = current ?? ''
  }
  return value.join('')
}

export interface PasswordVaultClipboard {
  writeText(value: string): void
  readText(): string
  clear(): void
}

export interface ClipboardLeaseClock {
  setTimeout(callback: () => void, delayMs: number): ReturnType<typeof setTimeout>
  clearTimeout(handle: ReturnType<typeof setTimeout>): void
}

const SYSTEM_CLOCK: ClipboardLeaseClock = {
  setTimeout: (callback, delayMs) => setTimeout(callback, delayMs),
  clearTimeout: (handle) => clearTimeout(handle),
}

function digest(value: string): Buffer {
  return createHash('sha256').update(value, 'utf8').digest()
}

export class ClipboardLease {
  private expectedDigest: Buffer | undefined
  private timer: ReturnType<typeof setTimeout> | undefined

  constructor(
    private readonly clipboard: PasswordVaultClipboard,
    private readonly clock: ClipboardLeaseClock = SYSTEM_CLOCK,
  ) {}

  copy(value: string): void {
    this.cancelTimer()
    this.clipboard.writeText(value)
    this.expectedDigest = digest(value)
    this.timer = this.clock.setTimeout(() => {
      this.timer = undefined
      this.clearIfOwned()
    }, PASSWORD_VAULT_CLIPBOARD_CLEAR_SECONDS * 1_000)
  }

  dispose(): void {
    this.cancelTimer()
    this.clearIfOwned()
  }

  private cancelTimer(): void {
    if (this.timer) this.clock.clearTimeout(this.timer)
    this.timer = undefined
  }

  private clearIfOwned(): void {
    const expected = this.expectedDigest
    this.expectedDigest = undefined
    if (!expected) return
    const current = digest(this.clipboard.readText())
    try {
      if (current.byteLength === expected.byteLength && timingSafeEqual(current, expected)) {
        this.clipboard.clear()
      }
    } finally {
      current.fill(0)
      expected.fill(0)
    }
  }
}
