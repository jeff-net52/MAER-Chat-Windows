import type {
  DesktopBootstrap,
  PairingPollResult,
  PreparedPasswordLogin,
} from '../renderer/onboarding-controller'
import type { DesktopCredential } from '../shared/desktop-contract'

interface MainBootstrap {
  version: string
  deviceName: string
  accounts: string[]
  endpoints: {
    domain: string
    websocketUrl: string
    boshServiceUrl: string
    pairingApiBaseUrl: string
  }
}

interface MainPreparedPasswordLogin {
  jid: string
  credential: DesktopCredential
  remember: boolean
}

type MainPairingPollResult =
  | { status: 'pending'; expiresAt?: string }
  | { status: 'rejected' }
  | { status: 'expired' }
  | { status: 'approved'; jid: string; credential: DesktopCredential }

export function mapBootstrap(value: MainBootstrap): DesktopBootstrap {
  return {
    version: value.version,
    deviceName: value.deviceName,
    accounts: [...value.accounts],
    domain: value.endpoints.domain,
    websocketUrl: value.endpoints.websocketUrl,
    boshServiceUrl: value.endpoints.boshServiceUrl,
    demo: false,
  }
}

export function mapPreparedPasswordLogin(
  value: MainPreparedPasswordLogin,
): PreparedPasswordLogin {
  if (value.credential.authKind !== 'password') {
    throw new Error('Le service local a renvoyé un type d’identifiant inattendu.')
  }
  return {
    jid: value.jid,
    password: value.credential.secret,
    remember: value.remember,
  }
}

export function mapPairingPoll(value: MainPairingPollResult): PairingPollResult {
  if (value.status !== 'approved') {
    return { ...value }
  }
  if (
    value.credential.authKind !== 'oauth' ||
    !value.credential.deviceId ||
    !value.credential.expiresAt
  ) {
    throw new Error('Le service local a renvoyé un jeton d’appareil invalide.')
  }
  return {
    status: 'approved',
    jid: value.jid,
    accessToken: value.credential.secret,
    tokenExpiresAt: value.credential.expiresAt,
    deviceId: value.credential.deviceId,
  }
}
