import type { MainPluginDefinition } from './core/main/plugin-host'
import { passwordVaultMainPlugin } from './password-vault/main/plugin'

export const FIRST_PARTY_MAIN_PLUGINS: readonly MainPluginDefinition[] = Object.freeze([
  passwordVaultMainPlugin,
])
