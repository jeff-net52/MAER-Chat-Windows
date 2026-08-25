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
  completeJid: boolean,
  defaultDomain: string,
): string {
  const identifier = requiredTrimmed(input, 'L’identifiant du compte est vide')

  if (!completeJid) {
    if (!LOCAL_PART.test(identifier)) {
      throw new Error('Saisissez uniquement votre identifiant local')
    }
    return `${identifier}@${normalizeDomain(defaultDomain)}`
  }

  if (identifier.includes('/') || identifier.split('@').length !== 2) {
    throw new Error('Une adresse XMPP complète sans ressource est requise')
  }
  const [local, domain] = identifier.split('@')
  if (!local || !LOCAL_PART.test(local) || !domain) {
    throw new Error('L’adresse XMPP est invalide')
  }
  return `${local}@${normalizeDomain(domain)}`
}
