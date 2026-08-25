import { describe, expect, it } from 'vitest'
import { buildConverseConfiguration } from '../src/renderer/converse-connector'

const endpoints = {
  websocketUrl: 'wss://contacts.chaumont.me/xmpp-websocket',
  boshServiceUrl: 'https://contacts.chaumont.me/http-bind',
}

describe('buildConverseConfiguration', () => {
  it('enables Conversations-compatible encrypted messaging and archive sync', () => {
    const config = buildConverseConfiguration({
      jid: 'alice@contacts.chaumont.me',
      secret: 'password-secret',
      authKind: 'password',
      endpoints,
    })

    expect(config).toMatchObject({
      authentication: 'login',
      auto_login: true,
      auto_reconnect: true,
      jid: 'alice@contacts.chaumont.me',
      password: 'password-secret',
      websocket_url: endpoints.websocketUrl,
      bosh_service_url: endpoints.boshServiceUrl,
      omemo_default: true,
      message_archiving: 'always',
      persistent_store: 'IndexedDB',
      persist_credentials: false,
      trusted: true,
      view_mode: 'fullscreened',
      singleton: true,
      i18n: 'fr',
    })
  })

  it('marks OAuth sessions so the connector can force X-OAUTH2', () => {
    expect(
      buildConverseConfiguration({
        jid: 'alice@contacts.chaumont.me',
        secret: 'opaque-token',
        authKind: 'oauth',
        endpoints,
      }).maer_oauth_only,
    ).toBe(true)
  })

  it.each([
    { ...endpoints, websocketUrl: 'ws://contacts.chaumont.me/xmpp-websocket' },
    { ...endpoints, boshServiceUrl: 'http://contacts.chaumont.me/http-bind' },
    { ...endpoints, websocketUrl: 'wss://evil.example/ws' },
  ])('rejects insecure or cross-domain transports', (invalidEndpoints) => {
    expect(() =>
      buildConverseConfiguration({
        jid: 'alice@contacts.chaumont.me',
        secret: 'secret',
        authKind: 'password',
        endpoints: invalidEndpoints,
      }),
    ).toThrow()
  })
})
