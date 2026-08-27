import { describe, expect, it } from 'vitest'
import {
  mapBootstrap,
  mapPairingPoll,
  mapPreparedPasswordLogin,
} from '../src/preload/bridge-adapter'

describe('preload bridge adapters', () => {
  it('flattens public endpoint configuration for the renderer', () => {
    expect(
      mapBootstrap({
        version: '1.0.0',
        deviceName: 'PC Atelier',
        accounts: ['alice@xmpp.maer.fr'],
        endpoints: {
          domain: 'xmpp.maer.fr',
          websocketUrl: 'wss://xmpp.maer.fr/xmpp-websocket',
          boshServiceUrl: 'https://xmpp.maer.fr/http-bind',
          pairingApiBaseUrl: 'https://xmpp.maer.fr/maer-pairing/v1',
        },
      }),
    ).toMatchObject({
      domain: 'xmpp.maer.fr',
      websocketUrl: 'wss://xmpp.maer.fr/xmpp-websocket',
      boshServiceUrl: 'https://xmpp.maer.fr/http-bind',
      demo: false,
    })
  })

  it('maps a prepared password without adding it to bootstrap state', () => {
    expect(
      mapPreparedPasswordLogin({
        jid: 'alice@xmpp.maer.fr',
        credential: {
          version: 1,
          authKind: 'password',
          secret: 'temporary-secret',
        },
        remember: true,
      }),
    ).toEqual({
      jid: 'alice@xmpp.maer.fr',
      password: 'temporary-secret',
      remember: true,
    })
  })

  it('maps an approved device credential into the renderer pairing result', () => {
    expect(
      mapPairingPoll({
        status: 'approved',
        jid: 'alice@xmpp.maer.fr',
        credential: {
          version: 1,
          authKind: 'oauth',
          secret: 'opaque-token',
          deviceId: 'device-42',
          expiresAt: '2026-09-24T22:12:00.000Z',
        },
      }),
    ).toEqual({
      status: 'approved',
      jid: 'alice@xmpp.maer.fr',
      accessToken: 'opaque-token',
      deviceId: 'device-42',
      tokenExpiresAt: '2026-09-24T22:12:00.000Z',
    })
  })
})
