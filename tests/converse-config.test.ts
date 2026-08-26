import { describe, expect, it } from 'vitest'
import { buildConverseConfiguration } from '../src/renderer/converse-connector'

const endpoints = {
  websocketUrl: 'wss://xmpp.maer.fr/xmpp-websocket',
  boshServiceUrl: 'https://xmpp.maer.fr/http-bind',
}

describe('buildConverseConfiguration', () => {
  it('enables Conversations-compatible encrypted messaging and archive sync', () => {
    const config = buildConverseConfiguration({
      jid: 'alice@xmpp.maer.fr',
      secret: 'password-secret',
      authKind: 'password',
      endpoints,
    })

    expect(config).toMatchObject({
      authentication: 'login',
      auto_login: true,
      auto_reconnect: true,
      jid: 'alice@xmpp.maer.fr',
      password: 'password-secret',
      websocket_url: endpoints.websocketUrl,
      bosh_service_url: endpoints.boshServiceUrl,
      omemo_default: true,
      message_archiving: 'always',
      persistent_store: 'IndexedDB',
      persist_credentials: false,
      trusted: true,
      view_mode: 'fullscreen',
      singleton: false,
      i18n: 'fr',
      visible_toolbar_buttons: {
        call: true,
        clear: true,
        emoji: true,
        fileupload: true,
        location: false,
        spoiler: false,
      },
    })
  })

  it('marks OAuth sessions so the connector can force X-OAUTH2', () => {
    expect(
      buildConverseConfiguration({
        jid: 'alice@xmpp.maer.fr',
        secret: 'opaque-token',
        authKind: 'oauth',
        endpoints,
      }).maer_oauth_only,
    ).toBe(true)
  })

  it.each([
    { ...endpoints, websocketUrl: 'ws://xmpp.maer.fr/xmpp-websocket' },
    { ...endpoints, boshServiceUrl: 'http://xmpp.maer.fr/http-bind' },
    { ...endpoints, websocketUrl: 'wss://evil.example/ws' },
    { ...endpoints, boshServiceUrl: 'https://evil.example/http-bind' },
  ])('rejects insecure or cross-domain transports', (invalidEndpoints) => {
    expect(() =>
      buildConverseConfiguration({
        jid: 'alice@xmpp.maer.fr',
        secret: 'secret',
        authKind: 'password',
        endpoints: invalidEndpoints,
      }),
    ).toThrow()
  })
})
