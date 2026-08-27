import type { NativeVaultGateway } from '../plugins/password-vault/main/native-vault-gateway'

/**
 * Main-process-only dependency injected into the Native Messaging dispatcher.
 *
 * It intentionally mirrors the password-vault gateway without importing a
 * VaultSession, Electron preload code, or renderer code. Implementations must
 * independently enforce exact origin ownership for reveal and update.
 */
export interface NativeVaultOperations extends NativeVaultGateway {}
