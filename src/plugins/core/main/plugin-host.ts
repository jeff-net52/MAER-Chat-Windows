import {
  isVersionAtLeast,
  parsePluginManifest,
  type PluginManifest,
} from '../shared/plugin-contract'

export interface PluginIpcScope {
  handle<Arguments extends unknown[], Result>(
    method: string,
    listener: (...args: Arguments) => Result | Promise<Result>,
  ): void
  dispose(): void
}

export interface MainPluginContext {
  manifest: PluginManifest
  ipc: PluginIpcScope
}

export type PluginDeactivation = () => void | Promise<void>

export interface MainPluginDefinition {
  manifest: unknown
  activate(
    context: MainPluginContext,
  ): void | PluginDeactivation | Promise<void | PluginDeactivation>
}

export interface PluginFailure {
  pluginId: string
  phase: 'manifest' | 'activation' | 'deactivation'
  message: string
}

export interface PluginActivationReport {
  active: readonly string[]
  failures: readonly PluginFailure[]
}

export interface MainPluginHostOptions {
  appVersion: string
  plugins: readonly MainPluginDefinition[]
  createIpcScope(pluginId: string): PluginIpcScope
  onFailure?(failure: PluginFailure): void
}

interface ActivePlugin {
  definition: MainPluginDefinition
  manifest: PluginManifest
  ipc: PluginIpcScope
  deactivate?: PluginDeactivation
}

function failureMessage(value: unknown): string {
  return value instanceof Error && value.message ? value.message : 'Erreur de plugin inconnue.'
}

function disabledIpcScope(pluginId: string, scope: PluginIpcScope): PluginIpcScope {
  return {
    handle() {
      throw new Error(`Le plugin ${pluginId} ne déclare pas la capacité main.ipc.`)
    },
    dispose: () => scope.dispose(),
  }
}

export class MainPluginHost {
  readonly #options: MainPluginHostOptions
  readonly #active = new Map<string, ActivePlugin>()
  #lastFailures: PluginFailure[] = []

  constructor(options: MainPluginHostOptions) {
    this.#options = options
  }

  get report(): PluginActivationReport {
    return Object.freeze({
      active: Object.freeze([...this.#active.keys()]),
      failures: Object.freeze([...this.#lastFailures]),
    })
  }

  #record(failure: PluginFailure): void {
    this.#lastFailures.push(Object.freeze(failure))
    try {
      this.#options.onFailure?.(failure)
    } catch {
      // A diagnostic callback must never break plugin isolation.
    }
  }

  async activateAll(): Promise<PluginActivationReport> {
    this.#lastFailures = []
    const seen = new Set<string>()
    for (const definition of this.#options.plugins) {
      let manifest: PluginManifest
      try {
        manifest = parsePluginManifest(definition.manifest)
        if (!isVersionAtLeast(this.#options.appVersion, manifest.minAppVersion)) {
          throw new Error(
            `${manifest.displayName} exige MAER Chat ${manifest.minAppVersion} ou version ultérieure.`,
          )
        }
        if (seen.has(manifest.id)) throw new Error(`Plugin dupliqué : ${manifest.id}.`)
        seen.add(manifest.id)
      } catch (error) {
        this.#record({
          pluginId:
            typeof (definition.manifest as { id?: unknown })?.id === 'string'
              ? (definition.manifest as { id: string }).id
              : '<inconnu>',
          phase: 'manifest',
          message: failureMessage(error),
        })
        continue
      }

      const existing = this.#active.get(manifest.id)
      if (existing?.definition === definition) continue
      if (existing) {
        this.#record({
          pluginId: manifest.id,
          phase: 'manifest',
          message: `Une autre définition du plugin ${manifest.id} est déjà active.`,
        })
        continue
      }

      const rawIpc = this.#options.createIpcScope(manifest.id)
      const ipc = manifest.capabilities.includes('main.ipc')
        ? rawIpc
        : disabledIpcScope(manifest.id, rawIpc)
      try {
        const deactivate = await definition.activate({ manifest, ipc })
        this.#active.set(manifest.id, {
          definition,
          manifest,
          ipc: rawIpc,
          ...(typeof deactivate === 'function' ? { deactivate } : {}),
        })
      } catch (error) {
        rawIpc.dispose()
        this.#record({
          pluginId: manifest.id,
          phase: 'activation',
          message: failureMessage(error),
        })
      }
    }
    return this.report
  }

  async deactivateAll(): Promise<PluginActivationReport> {
    this.#lastFailures = []
    for (const [pluginId, active] of [...this.#active.entries()].reverse()) {
      try {
        await active.deactivate?.()
      } catch (error) {
        this.#record({
          pluginId,
          phase: 'deactivation',
          message: failureMessage(error),
        })
      } finally {
        active.ipc.dispose()
        this.#active.delete(pluginId)
      }
    }
    return this.report
  }
}
