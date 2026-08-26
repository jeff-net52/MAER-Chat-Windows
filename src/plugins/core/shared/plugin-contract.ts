export const MAER_PLUGIN_API_VERSION = 1 as const

export const PLUGIN_CAPABILITIES = [
  'main.ipc',
  'ui.rail',
  'ui.panel',
  'ui.settings',
  'ui.commands',
] as const

export type PluginCapability = (typeof PLUGIN_CAPABILITIES)[number]
export type PluginContributionKind = 'rail' | 'panel' | 'settings' | 'command'
export type PluginIconId = 'extension' | 'tool' | 'vault'

export interface RailContributionManifest {
  kind: 'rail'
  id: string
  label: string
  iconId: PluginIconId
  order: number
  placement: 'main' | 'bottom'
  panelId: string
}

export interface PanelContributionManifest {
  kind: 'panel'
  id: string
  title: string
}

export interface SettingsContributionManifest {
  kind: 'settings'
  id: string
  title: string
  order: number
}

export interface CommandContributionManifest {
  kind: 'command'
  id: string
  title: string
}

export type PluginContributionManifest =
  | RailContributionManifest
  | PanelContributionManifest
  | SettingsContributionManifest
  | CommandContributionManifest

export interface PluginManifest {
  id: string
  displayName: string
  version: string
  apiVersion: typeof MAER_PLUGIN_API_VERSION
  minAppVersion: string
  capabilities: readonly PluginCapability[]
  contributions: readonly PluginContributionManifest[]
}

const PLUGIN_ID = /^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/u
const CONTRIBUTION_ID = /^[a-z][a-z0-9]*(?:[-.][a-z0-9]+)*$/u
const IPC_METHOD = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/u
const SEMVER = /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/u
const MAX_MANIFEST_CONTRIBUTIONS = 64

function record(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${label} doit être un objet.`)
  }
  return value as Record<string, unknown>
}

function exactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
  label: string,
): void {
  const allowed = new Set(expected)
  const unknown = Object.keys(value).find((key) => !allowed.has(key))
  if (unknown) throw new Error(`${label} contient un champ inconnu : ${unknown}.`)
  const missing = expected.find((key) => !(key in value))
  if (missing) throw new Error(`${label} ne contient pas le champ ${missing}.`)
}

function boundedString(value: unknown, label: string, maximum = 100): string {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > maximum ||
    value.trim() !== value
  ) {
    throw new Error(`${label} est invalide.`)
  }
  return value
}

function pluginId(value: unknown): string {
  const result = boundedString(value, "L’identifiant du plugin")
  if (!PLUGIN_ID.test(result)) throw new Error("L’identifiant du plugin est invalide.")
  return result
}

function contributionId(value: unknown, label = 'La contribution'): string {
  const result = boundedString(value, `${label} id`, 80)
  if (!CONTRIBUTION_ID.test(result)) throw new Error(`${label} a un identifiant invalide.`)
  return result
}

function semver(value: unknown, label: string): string {
  const result = boundedString(value, label, 80)
  if (!SEMVER.test(result)) throw new Error(`${label} doit être une version sémantique.`)
  return result
}

function order(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < -10_000 || (value as number) > 10_000) {
    throw new Error(`${label} est invalide.`)
  }
  return value as number
}

function parseContribution(value: unknown): PluginContributionManifest {
  const input = record(value, 'La contribution')
  switch (input.kind) {
    case 'rail': {
      exactKeys(
        input,
        ['kind', 'id', 'label', 'iconId', 'order', 'placement', 'panelId'],
        'La contribution rail',
      )
      if (input.placement !== 'main' && input.placement !== 'bottom') {
        throw new Error('La position de la contribution rail est invalide.')
      }
      if (!PLUGIN_ICON_IDS.has(input.iconId)) {
        throw new Error("L’icône de la contribution rail est invalide.")
      }
      return Object.freeze({
        kind: 'rail',
        id: contributionId(input.id),
        label: boundedString(input.label, 'Le libellé de la contribution rail', 80),
        iconId: input.iconId as PluginIconId,
        order: order(input.order, "L’ordre de la contribution rail"),
        placement: input.placement,
        panelId: contributionId(input.panelId, 'Le panneau associé'),
      })
    }
    case 'panel':
      exactKeys(input, ['kind', 'id', 'title'], 'La contribution panneau')
      return Object.freeze({
        kind: 'panel',
        id: contributionId(input.id),
        title: boundedString(input.title, 'Le titre du panneau', 100),
      })
    case 'settings':
      exactKeys(input, ['kind', 'id', 'title', 'order'], 'La contribution paramètres')
      return Object.freeze({
        kind: 'settings',
        id: contributionId(input.id),
        title: boundedString(input.title, 'Le titre de la section de paramètres', 100),
        order: order(input.order, "L’ordre de la section de paramètres"),
      })
    case 'command':
      exactKeys(input, ['kind', 'id', 'title'], 'La contribution commande')
      return Object.freeze({
        kind: 'command',
        id: contributionId(input.id),
        title: boundedString(input.title, 'Le titre de la commande', 100),
      })
    default:
      throw new Error('Le type de contribution est inconnu.')
  }
}

const PLUGIN_CAPABILITY_SET = new Set<unknown>(PLUGIN_CAPABILITIES)
const PLUGIN_ICON_IDS = new Set<unknown>(['extension', 'tool', 'vault'])
const REQUIRED_CAPABILITY: Record<PluginContributionKind, PluginCapability> = {
  rail: 'ui.rail',
  panel: 'ui.panel',
  settings: 'ui.settings',
  command: 'ui.commands',
}

function parseCapabilities(value: unknown): readonly PluginCapability[] {
  if (!Array.isArray(value) || value.length > PLUGIN_CAPABILITIES.length) {
    throw new Error('Les capacités du plugin sont invalides.')
  }
  const unique = new Set<PluginCapability>()
  for (const capability of value) {
    if (!PLUGIN_CAPABILITY_SET.has(capability)) {
      throw new Error(`Capacité de plugin inconnue : ${String(capability)}.`)
    }
    if (unique.has(capability as PluginCapability)) {
      throw new Error(`Capacité de plugin dupliquée : ${String(capability)}.`)
    }
    unique.add(capability as PluginCapability)
  }
  return Object.freeze([...unique])
}

export function parsePluginManifest(value: unknown): PluginManifest {
  const input = record(value, 'Le manifeste du plugin')
  exactKeys(
    input,
    [
      'id',
      'displayName',
      'version',
      'apiVersion',
      'minAppVersion',
      'capabilities',
      'contributions',
    ],
    'Le manifeste du plugin',
  )
  if (input.apiVersion !== MAER_PLUGIN_API_VERSION) {
    throw new Error(`Version API de plugin non prise en charge : ${String(input.apiVersion)}.`)
  }
  if (!Array.isArray(input.contributions) || input.contributions.length > MAX_MANIFEST_CONTRIBUTIONS) {
    throw new Error('Les contributions du plugin sont invalides.')
  }

  const capabilities = parseCapabilities(input.capabilities)
  const contributions = input.contributions.map(parseContribution)
  const contributionKeys = new Set<string>()
  for (const contribution of contributions) {
    const key = `${contribution.kind}:${contribution.id}`
    if (contributionKeys.has(key)) throw new Error(`Contribution dupliquée : ${key}.`)
    contributionKeys.add(key)
    const capability = REQUIRED_CAPABILITY[contribution.kind]
    if (!capabilities.includes(capability)) {
      throw new Error(`La contribution ${key} exige la capacité ${capability}.`)
    }
  }
  for (const rail of contributions.filter(
    (contribution): contribution is RailContributionManifest => contribution.kind === 'rail',
  )) {
    if (!contributionKeys.has(`panel:${rail.panelId}`)) {
      throw new Error(`Le panneau ${rail.panelId} référencé par le rail est absent.`)
    }
  }

  return Object.freeze({
    id: pluginId(input.id),
    displayName: boundedString(input.displayName, 'Le nom du plugin', 100),
    version: semver(input.version, 'La version du plugin'),
    apiVersion: MAER_PLUGIN_API_VERSION,
    minAppVersion: semver(input.minAppVersion, 'La version minimale de MAER Chat'),
    capabilities,
    contributions: Object.freeze(contributions),
  })
}

export function pluginIpcChannel(rawPluginId: string, rawMethod: string): string {
  const id = pluginId(rawPluginId)
  const method = boundedString(rawMethod, 'La méthode IPC du plugin', 64)
  if (!IPC_METHOD.test(method)) throw new Error('La méthode IPC du plugin est invalide.')
  return `maer:plugin:${id}:${method}`
}

export function isVersionAtLeast(current: string, minimum: string): boolean {
  const currentVersion = versionParts(current, 'La version courante')
  const minimumVersion = versionParts(minimum, 'La version minimale')
  for (let index = 0; index < 3; index += 1) {
    const difference =
      (currentVersion.core[index] ?? 0) - (minimumVersion.core[index] ?? 0)
    if (difference !== 0) return difference > 0
  }
  if (currentVersion.prerelease.length === 0) return true
  if (minimumVersion.prerelease.length === 0) return false
  const maximum = Math.max(
    currentVersion.prerelease.length,
    minimumVersion.prerelease.length,
  )
  for (let index = 0; index < maximum; index += 1) {
    const currentPart = currentVersion.prerelease[index]
    const minimumPart = minimumVersion.prerelease[index]
    if (currentPart === undefined) return false
    if (minimumPart === undefined) return true
    if (currentPart === minimumPart) continue
    const currentNumeric = /^\d+$/u.test(currentPart)
    const minimumNumeric = /^\d+$/u.test(minimumPart)
    if (currentNumeric && minimumNumeric) return Number(currentPart) > Number(minimumPart)
    if (currentNumeric !== minimumNumeric) return !currentNumeric
    return currentPart.localeCompare(minimumPart, 'en') > 0
  }
  return true
}

function versionParts(
  value: string,
  label: string,
): { core: number[]; prerelease: string[] } {
  const valid = semver(value, label)
  const withoutBuild = valid.split('+', 1)[0] ?? valid
  const separator = withoutBuild.indexOf('-')
  const core = separator < 0 ? withoutBuild : withoutBuild.slice(0, separator)
  const prerelease = separator < 0 ? [] : withoutBuild.slice(separator + 1).split('.')
  return { core: core.split('.').map(Number), prerelease }
}
