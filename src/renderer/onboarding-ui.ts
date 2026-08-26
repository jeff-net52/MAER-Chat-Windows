import { MAER_XMPP_DOMAIN } from '../shared/service-config'

export interface PairingScreenModel {
  qrDataUrl: string
  verificationCode: string
  expiresAt: string
}

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>'"]/gu,
    (character) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        "'": '&#39;',
        '"': '&quot;',
      })[character] ?? character,
  )
}

function avatarLabel(jid: string): string {
  const local = jid.split('@')[0] ?? jid
  return (local[0] ?? '?').toLocaleUpperCase('fr')
}

export function renderWelcomeScreen(accounts: readonly string[]): string {
  const remembered = accounts.length
    ? `<section class="remembered-accounts" aria-labelledby="remembered-title">
        <h2 id="remembered-title">Comptes enregistrés</h2>
        <div class="account-list">
          ${accounts
            .map(
              (account) => `<button class="account-card" type="button" data-account="${escapeHtml(account)}">
                <span class="avatar" aria-hidden="true">${escapeHtml(avatarLabel(account))}</span>
                <span class="account-copy"><strong>${escapeHtml(account.split('@')[0] ?? account)}</strong><small>${escapeHtml(account)}</small></span>
                <span class="chevron" aria-hidden="true">›</span>
              </button>`,
            )
            .join('')}
        </div>
      </section>`
    : ''

  return `<main class="onboarding welcome-screen">
    <section class="welcome-card" aria-labelledby="welcome-title">
      <img class="brand-logo wordmark" src="./maer-chat-wordmark.png" alt="MAER Chat" />
      <h1 id="welcome-title">Bienvenue dans MAER Chat</h1>
      <p class="lead">Retrouvez vos discussions MAER sur votre ordinateur, avec la confidentialité du réseau XMPP.</p>
      ${remembered}
      <button class="primary-button" type="button" data-action="start">Commencer</button>
      <p class="security-note"><span aria-hidden="true">⌁</span> Vos conversations chiffrées restent privées.</p>
    </section>
  </main>`
}

export function renderCredentialsScreen(): string {
  return `<main class="onboarding credentials-screen">
    <button class="back-button" type="button" data-action="back" aria-label="Revenir au choix de connexion">←</button>
    <section class="credentials-card" aria-labelledby="credentials-title">
      <img class="brand-logo compact" src="./maer-chat-mark.png" alt="Logo MAER Chat" />
      <h1 id="credentials-title">Connexion à MAER Chat</h1>
      <p class="lead">Utilisez les mêmes identifiants que sur votre téléphone.</p>
      <form data-form="credentials" novalidate>
        <label for="account-id">Identifiant</label>
        <div class="domain-field">
          <input id="account-id" name="identifier" type="text" required autocomplete="username" spellcheck="false" placeholder="votre.identifiant" />
          <span class="domain-suffix" data-role="domain-suffix">@${MAER_XMPP_DOMAIN}</span>
        </div>
        <label for="account-password">Mot de passe</label>
        <div class="password-field">
          <input id="account-password" name="password" type="password" required autocomplete="current-password" />
          <button type="button" class="reveal-button" data-action="toggle-password" aria-label="Afficher le mot de passe">◉</button>
        </div>
        <label class="check-row" for="remember-account">
          <input id="remember-account" name="remember" type="checkbox" checked />
          <span>Mémoriser ce compte dans le Gestionnaire d’identifiants Windows</span>
        </label>
        <label class="check-row advanced-row" for="advanced-jid">
          <input id="advanced-jid" name="advanced" type="checkbox" />
          <span>Utiliser une adresse XMPP complète</span>
        </label>
        <p class="form-error" role="alert" data-role="form-error" hidden></p>
        <button class="primary-button" type="submit">Se connecter</button>
      </form>
    </section>
  </main>`
}

export function renderConnectionChoiceScreen(): string {
  return `<main class="onboarding choice-screen">
    <button class="back-button" type="button" data-action="back" aria-label="Revenir à l’accueil">←</button>
    <section class="choice-card" aria-labelledby="choice-title">
      <img class="brand-logo compact" src="./maer-chat-mark.png" alt="Logo MAER Chat" />
      <h1 id="choice-title">Connecter MAER Chat</h1>
      <p class="lead">Choisissez comment retrouver vos conversations sur cet ordinateur.</p>
      <div class="connection-options">
        <button class="option-card primary-button" type="button" data-action="pair">
          <span class="option-icon" aria-hidden="true">▦</span>
          <span><strong>Associer avec un QR code</strong><small>Recommandé — aucun mot de passe à saisir</small></span>
        </button>
        <button class="option-card secondary-button" type="button" data-action="password">
          <span class="option-icon" aria-hidden="true">⌨</span>
          <span><strong>Utiliser un identifiant et un mot de passe</strong><small>Connexion XMPP classique</small></span>
        </button>
      </div>
      <p class="security-note">L’association peut être révoquée depuis votre téléphone.</p>
    </section>
  </main>`
}

export function renderLoadingScreen(message: string): string {
  return `<main class="onboarding loading-screen">
    <section class="loading-card">
      <img class="brand-logo compact pulse" src="./maer-chat-mark.png" alt="Logo MAER Chat" />
      <div class="spinner" aria-hidden="true"></div>
      <p role="status">${escapeHtml(message)}</p>
    </section>
  </main>`
}

export function renderErrorScreen(message: string): string {
  return `<main class="onboarding error-screen">
    <section class="error-card" aria-labelledby="error-title">
      <div class="error-icon" aria-hidden="true">!</div>
      <h1 id="error-title">Connexion impossible</h1>
      <p role="alert">${escapeHtml(message)}</p>
      <button class="primary-button" type="button" data-action="retry">Réessayer</button>
      <button class="link-button" type="button" data-action="password">Utiliser un identifiant</button>
    </section>
  </main>`
}

export function renderPairingScreen(model: PairingScreenModel): string {
  const code = `${model.verificationCode.slice(0, 3)} ${model.verificationCode.slice(3)}`
  return `<main class="onboarding pairing-screen">
    <button class="back-button" type="button" data-action="cancel-pairing" aria-label="Annuler l’association">←</button>
    <section class="pairing-card" aria-labelledby="pairing-title">
      <div class="pairing-instructions">
        <img class="brand-logo compact" src="./maer-chat-mark.png" alt="Logo MAER Chat" />
        <h1 id="pairing-title">Associer cet ordinateur</h1>
        <ol>
          <li>Ouvrez <strong>MAER Chat</strong> sur votre téléphone.</li>
          <li>Accédez à <strong>Paramètres</strong>, puis <strong>Appareils liés</strong>.</li>
          <li>Choisissez <strong>Associer un appareil</strong> et scannez ce QR code.</li>
          <li>Vérifiez que le même code apparaît sur les deux appareils.</li>
        </ol>
        <button class="link-button" type="button" data-action="use-password">Se connecter plutôt avec un identifiant</button>
      </div>
      <div class="qr-panel">
        <div class="qr-frame">
          <img data-role="pairing-qr" src="${escapeHtml(model.qrDataUrl)}" alt="QR code sécurisé à scanner avec MAER Chat" />
          <img class="qr-mark" src="./maer-chat-mark.png" alt="" aria-hidden="true" />
        </div>
        <p class="verification-label">Code de vérification</p>
        <output class="verification-code" data-role="verification-code">${escapeHtml(code)}</output>
        <p class="pairing-status" role="status" data-expires-at="${escapeHtml(model.expiresAt)}">
          En attente du téléphone… Ce code expire automatiquement.
        </p>
      </div>
    </section>
  </main>`
}
