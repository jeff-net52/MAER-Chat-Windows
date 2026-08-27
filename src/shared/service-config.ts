export const MAER_ACCOUNT_DOMAIN = 'xmpp.maer.fr'
export const MAER_XMPP_SERVICE_HOST = 'xmpp.maer.fr'
export const MAER_MEETING_ORIGIN = 'https://meet.jit.si'

export const MAER_SERVICE_ENDPOINTS = Object.freeze({
  domain: MAER_ACCOUNT_DOMAIN,
  websocketUrl: `wss://${MAER_XMPP_SERVICE_HOST}/xmpp-websocket`,
  boshServiceUrl: `https://${MAER_XMPP_SERVICE_HOST}/http-bind`,
  pairingApiBaseUrl: `https://${MAER_XMPP_SERVICE_HOST}/maer-pairing/v1`,
})
