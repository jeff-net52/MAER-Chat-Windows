import { MAER_PLUGIN_API_VERSION } from '../core/shared/plugin-contract'

export const PASSWORD_VAULT_PLUGIN_ID = 'fr.maer.password-vault'

export const PASSWORD_VAULT_MANIFEST = Object.freeze({
  id: PASSWORD_VAULT_PLUGIN_ID,
  displayName: 'MAER Password Vault',
  version: '0.1.0',
  apiVersion: MAER_PLUGIN_API_VERSION,
  minAppVersion: '1.1.0',
  capabilities: Object.freeze(['main.ipc'] as const),
  contributions: Object.freeze([]),
})
