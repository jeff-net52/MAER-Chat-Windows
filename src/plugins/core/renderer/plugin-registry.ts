import {
  isVersionAtLeast,
  parsePluginManifest,
  type CommandContributionManifest,
  type PanelContributionManifest,
  type PluginManifest,
  type RailContributionManifest,
  type SettingsContributionManifest,
} from '../shared/plugin-contract'

export type RendererContributionCleanup = () => void
export type RendererContributionMount = (
  root: HTMLElement,
) => void | RendererContributionCleanup
export type RendererCommandHandler = () => void | Promise<void>

export interface RendererPluginContext {
  manifest: PluginManifest
  registerPanel(id: string, mount: RendererContributionMount): void
  registerSettings(id: string, mount: RendererContributionMount): void
  registerCommand(id: string, run: RendererCommandHandler): void
}

export interface RendererPluginDefinition {
  manifest: unknown
  activate(
    context: RendererPluginContext,
  ): void | RendererContributionCleanup | Promise<void | RendererContributionCleanup>
}

export interface RegisteredRailContribution extends RailContributionManifest {
  pluginId: string
  key: string
}

export interface RegisteredSettingsContribution extends SettingsContributionManifest {
  pluginId: string
  key: string
}

export interface RegisteredCommandContribution extends CommandContributionManifest {
  pluginId: string
  key: string
}

export interface RendererPluginFailure {
  pluginId: string
  phase: 'manifest' | 'activation' | 'render' | 'command' | 'deactivation'
  message: string
}

export interface RendererPluginReport {
  active: readonly string[]
  failures: readonly RendererPluginFailure[]
}

export interface RendererPluginRegistryOptions {
  appVersion: string
  plugins: readonly RendererPluginDefinition[]
  onFailure?(failure: RendererPluginFailure): void
}

interface StagedContributions {
  panels: Map<string, RendererContributionMount>
  settings: Map<string, RendererContributionMount>
  commands: Map<string, RendererCommandHandler>
}

interface ActiveRendererPlugin extends StagedContributions {
  definition: RendererPluginDefinition
  manifest: PluginManifest
  deactivate?: RendererContributionCleanup
  mounts: Set<RendererContributionCleanup>
}

function failureMessage(value: unknown): string {
  return value instanceof Error && value.message ? value.message : 'Erreur de plugin inconnue.'
}

function contributionKey(pluginId: string, contributionId: string): string {
  return `${pluginId}:${contributionId}`
}

function descriptor<T extends PanelContributionManifest | SettingsContributionManifest | CommandContributionManifest>(
  manifest: PluginManifest,
  kind: T['kind'],
  id: string,
): T | undefined {
  return manifest.contributions.find(
    (contribution): contribution is T => contribution.kind === kind && contribution.id === id,
  )
}

function registerRuntimeContribution<Value>(
  manifest: PluginManifest,
  kind: 'panel' | 'settings' | 'command',
  id: string,
  value: Value,
  target: Map<string, Value>,
): void {
  if (!descriptor(manifest, kind, id)) {
    throw new Error(`Contribution renderer non déclarée : ${kind}:${id}.`)
  }
  if (target.has(id)) throw new Error(`Contribution renderer dupliquée : ${kind}:${id}.`)
  target.set(id, value)
}

function verifyRuntimeContributions(manifest: PluginManifest, staged: StagedContributions): void {
  for (const contribution of manifest.contributions) {
    if (contribution.kind === 'panel' && !staged.panels.has(contribution.id)) {
      throw new Error(`Le panneau ${contribution.id} n’a pas de fonction de rendu.`)
    }
    if (contribution.kind === 'settings' && !staged.settings.has(contribution.id)) {
      throw new Error(`La section ${contribution.id} n’a pas de fonction de rendu.`)
    }
    if (contribution.kind === 'command' && !staged.commands.has(contribution.id)) {
      throw new Error(`La commande ${contribution.id} n’a pas de fonction d’exécution.`)
    }
  }
}

export class RendererPluginRegistry {
  readonly #options: RendererPluginRegistryOptions
  readonly #active = new Map<string, ActiveRendererPlugin>()
  #lastFailures: RendererPluginFailure[] = []

  constructor(options: RendererPluginRegistryOptions) {
    this.#options = options
  }

  get report(): RendererPluginReport {
    return Object.freeze({
      active: Object.freeze([...this.#active.keys()]),
      failures: Object.freeze([...this.#lastFailures]),
    })
  }

  #record(failure: RendererPluginFailure): void {
    this.#lastFailures.push(Object.freeze(failure))
    try {
      this.#options.onFailure?.(failure)
    } catch {
      // A diagnostic callback must never break plugin isolation.
    }
  }

  async activateAll(): Promise<RendererPluginReport> {
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

      const staged: StagedContributions = {
        panels: new Map(),
        settings: new Map(),
        commands: new Map(),
      }
      const context: RendererPluginContext = {
        manifest,
        registerPanel: (id, mount) =>
          registerRuntimeContribution(manifest, 'panel', id, mount, staged.panels),
        registerSettings: (id, mount) =>
          registerRuntimeContribution(manifest, 'settings', id, mount, staged.settings),
        registerCommand: (id, run) =>
          registerRuntimeContribution(manifest, 'command', id, run, staged.commands),
      }
      let stagedDeactivate: RendererContributionCleanup | undefined
      try {
        const deactivate = await definition.activate(context)
        if (typeof deactivate === 'function') stagedDeactivate = deactivate
        verifyRuntimeContributions(manifest, staged)
        this.#active.set(manifest.id, {
          definition,
          manifest,
          ...staged,
          mounts: new Set(),
          ...(typeof deactivate === 'function' ? { deactivate } : {}),
        })
      } catch (error) {
        try {
          stagedDeactivate?.()
        } catch {
          // The activation error remains the primary failure reported for this plugin.
        }
        this.#record({
          pluginId: manifest.id,
          phase: 'activation',
          message: failureMessage(error),
        })
      }
    }
    return this.report
  }

  railContributions(): readonly RegisteredRailContribution[] {
    return Object.freeze(
      [...this.#active.values()]
        .flatMap(({ manifest }) =>
          manifest.contributions
            .filter(
              (contribution): contribution is RailContributionManifest =>
                contribution.kind === 'rail',
            )
            .map((contribution) =>
              Object.freeze({
                ...contribution,
                pluginId: manifest.id,
                key: contributionKey(manifest.id, contribution.id),
              }),
            ),
        )
        .sort((left, right) => left.order - right.order || left.key.localeCompare(right.key)),
    )
  }

  settingsContributions(): readonly RegisteredSettingsContribution[] {
    return Object.freeze(
      [...this.#active.values()]
        .flatMap(({ manifest }) =>
          manifest.contributions
            .filter(
              (contribution): contribution is SettingsContributionManifest =>
                contribution.kind === 'settings',
            )
            .map((contribution) =>
              Object.freeze({
                ...contribution,
                pluginId: manifest.id,
                key: contributionKey(manifest.id, contribution.id),
              }),
            ),
        )
        .sort((left, right) => left.order - right.order || left.key.localeCompare(right.key)),
    )
  }

  commandContributions(): readonly RegisteredCommandContribution[] {
    return Object.freeze(
      [...this.#active.values()]
        .flatMap(({ manifest }) =>
          manifest.contributions
            .filter(
              (contribution): contribution is CommandContributionManifest =>
                contribution.kind === 'command',
            )
            .map((contribution) =>
              Object.freeze({
                ...contribution,
                pluginId: manifest.id,
                key: contributionKey(manifest.id, contribution.id),
              }),
            ),
        )
        .sort((left, right) => left.key.localeCompare(right.key)),
    )
  }

  panel(pluginId: string, panelId: string): PanelContributionManifest | undefined {
    return descriptor(this.#active.get(pluginId)?.manifest ?? EMPTY_MANIFEST, 'panel', panelId)
  }

  mountPanel(
    pluginId: string,
    panelId: string,
    root: HTMLElement,
  ): RendererContributionCleanup | undefined {
    return this.#mount(pluginId, panelId, root, 'panel')
  }

  mountSettings(
    pluginId: string,
    settingsId: string,
    root: HTMLElement,
  ): RendererContributionCleanup | undefined {
    return this.#mount(pluginId, settingsId, root, 'settings')
  }

  #mount(
    pluginId: string,
    contributionId: string,
    root: HTMLElement,
    kind: 'panel' | 'settings',
  ): RendererContributionCleanup | undefined {
    const active = this.#active.get(pluginId)
    const mount = kind === 'panel' ? active?.panels.get(contributionId) : active?.settings.get(contributionId)
    if (!active || !mount) return undefined
    try {
      const mountedCleanup = mount(root)
      const cleanup = typeof mountedCleanup === 'function' ? mountedCleanup : () => undefined
      let mounted = true
      const trackedCleanup = () => {
        if (!mounted) return
        mounted = false
        active.mounts.delete(trackedCleanup)
        try {
          cleanup()
        } catch (error) {
          this.#record({
            pluginId,
            phase: 'deactivation',
            message: failureMessage(error),
          })
        }
      }
      active.mounts.add(trackedCleanup)
      return trackedCleanup
    } catch (error) {
      this.#record({
        pluginId,
        phase: 'render',
        message: failureMessage(error),
      })
      return undefined
    }
  }

  async runCommand(pluginId: string, commandId: string): Promise<boolean> {
    const run = this.#active.get(pluginId)?.commands.get(commandId)
    if (!run) return false
    try {
      await run()
      return true
    } catch (error) {
      this.#record({
        pluginId,
        phase: 'command',
        message: failureMessage(error),
      })
      return false
    }
  }

  async deactivateAll(): Promise<RendererPluginReport> {
    this.#lastFailures = []
    for (const [pluginId, active] of [...this.#active.entries()].reverse()) {
      for (const cleanup of [...active.mounts].reverse()) {
        try {
          cleanup()
        } catch (error) {
          this.#record({
            pluginId,
            phase: 'deactivation',
            message: failureMessage(error),
          })
        }
      }
      try {
        await active.deactivate?.()
      } catch (error) {
        this.#record({
          pluginId,
          phase: 'deactivation',
          message: failureMessage(error),
        })
      } finally {
        this.#active.delete(pluginId)
      }
    }
    return this.report
  }
}

const EMPTY_MANIFEST: PluginManifest = Object.freeze({
  id: 'empty',
  displayName: 'Empty',
  version: '0.0.0',
  apiVersion: 1,
  minAppVersion: '0.0.0',
  capabilities: Object.freeze([]),
  contributions: Object.freeze([]),
})
