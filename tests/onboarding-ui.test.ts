// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import {
  renderConnectionChoiceScreen,
  renderCredentialsScreen,
  renderErrorScreen,
  renderLoadingScreen,
  renderPairingScreen,
  renderWelcomeScreen,
} from '../src/renderer/onboarding-ui'

describe('onboarding screens', () => {
  it('renders a focused first-run welcome screen', () => {
    document.body.innerHTML = renderWelcomeScreen([])

    expect(document.querySelector('h1')?.textContent).toContain('MAER Chat')
    expect(document.querySelector('[data-action="start"]')?.textContent).toMatch(/commencer/i)
    expect(document.querySelectorAll('button')).toHaveLength(1)
    expect(document.querySelector('img')?.getAttribute('alt')).toMatch(/MAER Chat/i)
  })

  it('offers remembered accounts without exposing stored secrets', () => {
    document.body.innerHTML = renderWelcomeScreen([
      'alice@example.org',
      'bob@contacts.chaumont.me',
    ])

    const accounts = [...document.querySelectorAll('[data-account]')].map((item) =>
      item.getAttribute('data-account'),
    )
    expect(accounts).toEqual(['alice@example.org', 'bob@contacts.chaumont.me'])
    expect(document.body.textContent).not.toMatch(/password|mot de passe enregistré/i)
  })

  it('renders an accessible password form with an advanced JID mode', () => {
    document.body.innerHTML = renderCredentialsScreen()

    const password = document.querySelector<HTMLInputElement>('input[type="password"]')
    expect(password?.autocomplete).toBe('current-password')
    expect(document.querySelector('label[for="advanced-jid"]')).not.toBeNull()
    expect(document.querySelector('button[type="submit"]')?.textContent).toMatch(/connecter/i)
  })

  it('shows the QR, expiry instructions and matching verification code', () => {
    document.body.innerHTML = renderPairingScreen({
      qrDataUrl: 'data:image/png;base64,abc',
      verificationCode: '482913',
      expiresAt: '2026-08-24T19:12:00.000Z',
    })

    expect(document.querySelector<HTMLImageElement>('[data-role="pairing-qr"]')?.src).toBe(
      'data:image/png;base64,abc',
    )
    expect(document.querySelector('[data-role="verification-code"]')?.textContent).toBe(
      '482 913',
    )
    expect(document.body.textContent).toMatch(/appareils liés/i)
    expect(document.querySelector('[role="status"]')).not.toBeNull()
  })

  it('makes QR pairing the primary connection choice', () => {
    document.body.innerHTML = renderConnectionChoiceScreen()

    expect(document.querySelector('[data-action="pair"]')?.classList).toContain(
      'primary-button',
    )
    expect(document.querySelector('[data-action="password"]')?.textContent).toMatch(
      /identifiant/i,
    )
  })

  it('announces loading and recoverable errors to assistive technology', () => {
    document.body.innerHTML = renderLoadingScreen('Connexion sécurisée en cours…')
    expect(document.querySelector('[role="status"]')?.textContent).toMatch(/connexion/i)

    document.body.innerHTML = renderErrorScreen('Serveur temporairement indisponible')
    expect(document.querySelector('[role="alert"]')?.textContent).toContain(
      'Serveur temporairement indisponible',
    )
    expect(document.querySelector('[data-action="retry"]')).not.toBeNull()
  })
})
