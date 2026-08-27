import {
  createPasswordVaultBridge,
  type PasswordVaultBridge,
  type PluginIpcInvoker,
} from '../../password-vault/preload/bridge'

export interface DesktopPluginBridge {
  passwordVault: PasswordVaultBridge
}

export function createDesktopPluginBridge(invoke: PluginIpcInvoker): DesktopPluginBridge {
  return Object.freeze({
    passwordVault: createPasswordVaultBridge(invoke),
  })
}
