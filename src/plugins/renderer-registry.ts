import type { RendererPluginDefinition } from './core/renderer/plugin-registry'
import { passwordVaultRendererPlugin } from './password-vault/renderer/plugin'

export const FIRST_PARTY_RENDERER_PLUGINS: readonly RendererPluginDefinition[] = Object.freeze([
  passwordVaultRendererPlugin,
])
