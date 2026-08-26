import type { RendererPluginDefinition } from './core/renderer/plugin-registry'

// Password Vault intentionally has no renderer contribution until its security and UX
// choices are approved. First-party renderer plugins must be imported statically here.
export const FIRST_PARTY_RENDERER_PLUGINS: readonly RendererPluginDefinition[] = Object.freeze([])
