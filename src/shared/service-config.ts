export const MAER_XMPP_DOMAIN = 'xmpp.maer.fr'

export const MAER_SERVICE_ENDPOINTS = Object.freeze({
  domain: MAER_XMPP_DOMAIN,
  websocketUrl: `wss://${MAER_XMPP_DOMAIN}/xmpp-websocket`,
  boshServiceUrl: `https://${MAER_XMPP_DOMAIN}/http-bind`,
  pairingApiBaseUrl: `https://${MAER_XMPP_DOMAIN}/maer-pairing/v1`,
})
