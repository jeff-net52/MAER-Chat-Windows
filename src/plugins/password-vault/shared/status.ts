export interface PasswordVaultStatus {
  version: 1
  state: 'placeholder'
}

export const PASSWORD_VAULT_PLACEHOLDER_STATUS: PasswordVaultStatus = Object.freeze({
  version: 1,
  state: 'placeholder',
})

export function parsePasswordVaultStatus(value: unknown): PasswordVaultStatus {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('Statut Password Vault invalide.')
  }
  const input = value as Record<string, unknown>
  if (
    Object.keys(input).length !== 2 ||
    input.version !== 1 ||
    input.state !== 'placeholder'
  ) {
    throw new Error('Statut Password Vault invalide.')
  }
  return PASSWORD_VAULT_PLACEHOLDER_STATUS
}
