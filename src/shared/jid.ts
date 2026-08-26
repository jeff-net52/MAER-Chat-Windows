const LOCAL_PART = /^[^\s@/]+$/u
const DOMAIN = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/iu

function requiredTrimmed(value: string, message: string): string {
  const normalized = value.trim()
  if (!normalized) {
    throw new Error(message)
  }
  return normalized
}

function normalizeDomain(value: string): string {
  const domain = requiredTrimmed(value, 'Le domaine XMPP est vide').toLowerCase()
  if (!DOMAIN.test(domain)) {
    throw new Error('Le domaine XMPP est invalide')
  }
  return domain
}

export function normalizeLoginJid(
  input: string,
  defaultDomain: string,
): string {
  const identifier = requiredTrimmed(input, 'L’identifiant du compte est vide')
  if (!LOCAL_PART.test(identifier)) {
    throw new Error('Saisissez uniquement votre identifiant local')
  }
  return `${identifier}@${normalizeDomain(defaultDomain)}`
}

export function normalizeAccountJid(input: string, expectedDomain: string): string {
  const identifier = requiredTrimmed(input, 'Le compte XMPP est vide')
  if (identifier.includes('/') || identifier.split('@').length !== 2) {
    throw new Error('Le compte XMPP doit être une adresse MAER sans ressource')
  }
  const [local, domain] = identifier.split('@')
  if (!local || !LOCAL_PART.test(local) || !domain) {
    throw new Error('L’adresse XMPP est invalide')
  }
  const normalizedDomain = normalizeDomain(domain)
  const requiredDomain = normalizeDomain(expectedDomain)
  if (normalizedDomain !== requiredDomain) {
    throw new Error(`Le compte XMPP doit utiliser le domaine ${requiredDomain}`)
  }
  return `${local}@${requiredDomain}`
}
