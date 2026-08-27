import {
  parseAccountInput,
  parsePrepareLoginInput,
  parseSaveCredentialInput,
  type DesktopCredential,
} from '../shared/desktop-contract'
import type { StoredCredential } from './credential-store'
import type {
  RendererPairingPollResult,
  RendererPairingSession,
} from './pairing-session-manager'

const SESSION_ID = /^[A-Za-z0-9_-]{16,128}$/u

export interface DesktopEndpoints {
  domain: string
  websocketUrl: string
  boshServiceUrl: string
  pairingApiBaseUrl: string
}

interface CredentialRepository {
  listAccounts(): Promise<string[]>
  load(jid: string): Promise<StoredCredential | undefined>
  save(jid: string, credential: StoredCredential): Promise<void>
  delete(jid: string): Promise<boolean>
}

interface PairingRepository {
  begin(deviceName: string): Promise<RendererPairingSession>
  poll(sessionId: string): Promise<RendererPairingPollResult>
  cancel(sessionId: string): Promise<void>
}

export interface DesktopHandlerDependencies {
  appVersion: string
  deviceName: string
  endpoints: DesktopEndpoints
  credentials: CredentialRepository
  pairing: PairingRepository
}

function sessionId(value: unknown): string {
  if (typeof value !== 'string' || !SESSION_ID.test(value)) {
    throw new Error('Identifiant de session d’association invalide.')
  }
  return value
}

export function createDesktopHandlers(deps: DesktopHandlerDependencies) {
  return {
    async bootstrap() {
      return {
        version: deps.appVersion,
        deviceName: deps.deviceName,
        accounts: await deps.credentials.listAccounts(),
        endpoints: { ...deps.endpoints },
      }
    },

    async preparePasswordLogin(input: unknown) {
      const parsed = parsePrepareLoginInput(input)
      return {
        jid: parsed.jid,
        credential: {
          version: 1 as const,
          authKind: 'password' as const,
          secret: parsed.password,
        },
        remember: parsed.remember,
      }
    },

    async loadCredential(input: unknown) {
      const jid = parseAccountInput(input)
      const credential = await deps.credentials.load(jid)
      if (!credential) {
        throw new Error('Aucun identifiant Windows n’est enregistré pour ce compte.')
      }
      if (credential.expiresAt && Date.parse(credential.expiresAt) <= Date.now()) {
        await deps.credentials.delete(jid)
        throw new Error('La session de cet appareil a expiré. Associez-le de nouveau.')
      }
      return { jid, credential }
    },

    async saveValidatedCredential(input: unknown) {
      const parsed = parseSaveCredentialInput(input)
      if (parsed.remember) {
        await deps.credentials.save(parsed.jid, parsed.credential as DesktopCredential)
      }
    },

    async forgetCredential(input: unknown) {
      const jid = parseAccountInput(input)
      return deps.credentials.delete(jid)
    },

    async beginPairing() {
      return deps.pairing.begin(deps.deviceName)
    },

    async pollPairing(input: unknown) {
      return deps.pairing.poll(sessionId(input))
    },

    async cancelPairing(input: unknown) {
      await deps.pairing.cancel(sessionId(input))
    },
  }
}

export type DesktopHandlers = ReturnType<typeof createDesktopHandlers>
