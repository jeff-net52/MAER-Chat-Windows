import type { MainPluginDefinition } from '../../core/main/plugin-host'
import { PASSWORD_VAULT_MANIFEST } from '../manifest'
import { PASSWORD_VAULT_PLACEHOLDER_STATUS } from '../shared/status'

export const passwordVaultMainPlugin: MainPluginDefinition = {
  manifest: PASSWORD_VAULT_MANIFEST,
  activate(context) {
    context.ipc.handle('status', () => PASSWORD_VAULT_PLACEHOLDER_STATUS)
  },
}
