import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  MAER_ACCOUNT_DOMAIN,
  MAER_SERVICE_ENDPOINTS,
  MAER_XMPP_SERVICE_HOST,
} from '../src/shared/service-config'

describe('MAER service configuration', () => {
  it('separates the existing account domain from the public transport host', () => {
    expect(MAER_ACCOUNT_DOMAIN).toBe('xmpp.maer.fr')
    expect(MAER_XMPP_SERVICE_HOST).toBe('xmpp.maer.fr')
    expect(MAER_SERVICE_ENDPOINTS).toEqual({
      domain: 'xmpp.maer.fr',
      websocketUrl: 'wss://xmpp.maer.fr/xmpp-websocket',
      boshServiceUrl: 'https://xmpp.maer.fr/http-bind',
      pairingApiBaseUrl: 'https://xmpp.maer.fr/maer-pairing/v1',
    })
    expect(Object.isFrozen(MAER_SERVICE_ENDPOINTS)).toBe(true)
  })

  it('keeps the static renderer CSP aligned with the canonical domain', () => {
    const html = readFileSync(
      new URL('../src/renderer/index.html', import.meta.url),
      'utf8',
    )

    expect(html).toContain('https://xmpp.maer.fr')
    expect(html).toContain('wss://xmpp.maer.fr')
    expect(html).toContain('https://*.xmpp.maer.fr')
    expect(html).not.toContain('https://*.maer.fr')
  })
})
