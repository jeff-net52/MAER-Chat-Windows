/**
 * Main-process-only port for a future Native Messaging transport.
 *
 * The transport validates framing and bounds first. The implementation must
 * independently enforce exact-origin ownership before reveal or update. This
 * module is never imported by preload or renderer code.
 */

export interface NativeVaultStatus {
  state: 'ready' | 'locked'
}

export interface NativeVaultCredentialSummary {
  credentialId: string
  username: string
  label: string
  updatedAt: number
}

export interface NativeVaultLookupInput {
  origin: string
  usernameHint: string
  formSignature: string
}

export interface NativeVaultRevealInput {
  origin: string
  credentialId: string
}

export interface NativeVaultRevealedCredential {
  credentialId: string
  username: string
  password: string
}

export interface NativeVaultSaveInput {
  origin: string
  credentialId: string
  username: string
  password: string
  label: string
}

export interface NativeVaultSavedCredential {
  credentialId: string
}

export interface NativeVaultGeneratePolicy {
  length: number
  lowercase: boolean
  uppercase: boolean
  digits: boolean
  symbols: boolean
}

export interface NativeVaultGateway {
  status(): Promise<NativeVaultStatus>
  lookup(input: NativeVaultLookupInput): Promise<readonly NativeVaultCredentialSummary[]>
  reveal(input: NativeVaultRevealInput): Promise<NativeVaultRevealedCredential>
  save(input: NativeVaultSaveInput): Promise<NativeVaultSavedCredential>
  generate(policy: NativeVaultGeneratePolicy): Promise<string>
  lock(): Promise<void>
}
