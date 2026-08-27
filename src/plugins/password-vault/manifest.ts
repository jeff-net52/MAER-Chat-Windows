import { MAER_PLUGIN_API_VERSION } from '../core/shared/plugin-contract'

export const PASSWORD_VAULT_PLUGIN_ID = 'fr.maer.password-vault'

export const PASSWORD_VAULT_MANIFEST = Object.freeze({
  id: PASSWORD_VAULT_PLUGIN_ID,
  displayName: 'Coffre-fort MAER',
  version: '0.2.0',
  apiVersion: MAER_PLUGIN_API_VERSION,
  minAppVersion: '1.1.0',
  capabilities: Object.freeze(['main.ipc', 'ui.rail', 'ui.panel'] as const),
  contributions: Object.freeze([
    Object.freeze({
      kind: 'panel',
      id: 'passwords',
      title: 'Mots de passe',
    }),
    Object.freeze({
      kind: 'rail',
      id: 'open-passwords',
      label: 'Mots de passe',
      iconId: 'vault',
      order: 20,
      placement: 'bottom',
      panelId: 'passwords',
    }),
  ]),
})
