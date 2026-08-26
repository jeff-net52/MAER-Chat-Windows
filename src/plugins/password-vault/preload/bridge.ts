import { pluginIpcChannel } from '../../core/shared/plugin-contract'
import { PASSWORD_VAULT_PLUGIN_ID } from '../manifest'
import {
  parsePasswordVaultStatus,
  type PasswordVaultStatus,
} from '../shared/status'

export interface PasswordVaultBridge {
  getStatus(): Promise<PasswordVaultStatus>
}

export type PluginIpcInvoker = (channel: string) => Promise<unknown>

export function createPasswordVaultBridge(invoke: PluginIpcInvoker): PasswordVaultBridge {
  return Object.freeze({
    async getStatus() {
      return parsePasswordVaultStatus(
        await invoke(pluginIpcChannel(PASSWORD_VAULT_PLUGIN_ID, 'status')),
      )
    },
  })
}
