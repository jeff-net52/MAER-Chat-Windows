import type { MainPluginDefinition } from './core/main/plugin-host'
import {
  createPasswordVaultMainPlugin,
  type PasswordVaultMainPluginOptions,
} from './password-vault/main/plugin'

export interface FirstPartyMainPluginOptions {
  passwordVault: PasswordVaultMainPluginOptions
}

export function createFirstPartyMainPlugins(
  options: FirstPartyMainPluginOptions,
): readonly MainPluginDefinition[] {
  return Object.freeze([createPasswordVaultMainPlugin(options.passwordVault)])
}
