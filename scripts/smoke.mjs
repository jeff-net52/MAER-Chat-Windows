import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { _electron as electron } from 'playwright'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '..')
const executablePath = process.env.MAER_CHAT_EXECUTABLE
const userDataDirectory = await mkdtemp(path.join(tmpdir(), 'maer-chat-smoke-'))
let electronApp
const errors = []

try {
  electronApp = await electron.launch({
    ...(executablePath ? { executablePath } : { args: ['.'], cwd: root }),
    env: {
      ...process.env,
      MAER_CHAT_E2E: '1',
      MAER_CHAT_E2E_USER_DATA_DIR: userDataDirectory,
    },
  })
  const page = await electronApp.firstWindow()
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  page.on('pageerror', (error) => errors.push(error.message))

  const pluginStatus = await page.evaluate(() => window.maerPlugins.passwordVault.getStatus())
  assert.deepEqual(pluginStatus, { version: 1, state: 'placeholder' })

  await page.waitForSelector('[data-action="start"]', { timeout: 15_000 })
  const wordmark = page.locator('img[alt="MAER Chat"]')
  await wordmark.waitFor({ state: 'visible' })
  assert.ok((await wordmark.evaluate((image) => image.naturalWidth)) > 0, 'wordmark not loaded')

  await page.locator('[data-action="start"]').evaluate((element) => element.click())
  await page.waitForTimeout(250)
  if ((await page.locator('[data-action="password"]').count()) === 0) {
    throw new Error(`Start click did not change screen at ${page.url()}: ${(await page.content()).slice(0, 2000)} | console: ${errors.join(' | ')}`)
  }
  await page.locator('[data-action="password"]').evaluate((element) => element.click())
  await page.waitForSelector('form[data-form="credentials"]')

  assert.equal(await page.locator('#account-id').getAttribute('autocomplete'), 'username')
  assert.equal(await page.locator('#account-password').getAttribute('autocomplete'), 'current-password')
  assert.equal(await page.locator('[data-role="domain-suffix"]').isVisible(), true)
  assert.equal(await page.locator('[data-role="domain-suffix"]').textContent(), '@xmpp.maer.fr')
  assert.equal(await page.locator('#advanced-jid').count(), 0)

  await page.fill('#account-id', 'test')
  await page.fill('#account-password', 'temporary-not-a-real-secret')
  await page.click('[data-action="toggle-password"]')
  assert.equal(await page.locator('#account-password').getAttribute('type'), 'text')

  let networkFailureHandled = false
  if (process.env.MAER_CHAT_NETWORK_SMOKE === '1') {
    await page.fill('#account-id', 'maer-client-smoke-nonexistent')
    await page.fill('#account-password', 'not-a-real-account-secret')
    await page.click('button[type="submit"]')
    const connectionError = page.locator('[data-role="form-error"]:not([hidden])')
    await connectionError.waitFor({ state: 'visible', timeout: 45_000 })
    const message = (await connectionError.textContent()) ?? ''
    assert.doesNotMatch(message, /Cannot read properties|reading ['"]listen['"]/i)
    assert.match(message, /connexion|serveur|identifiant|authentification/i)
    networkFailureHandled = true
  }

  const fatalErrors = errors.filter(
    (message) =>
      !message.includes('Autofill') &&
      !message.includes('DevTools') &&
      !(
        message.includes('violates the following Content Security Policy directive') &&
        message.includes('https://conversejs.org/media/logos/')
      ),
  )
  assert.deepEqual(fatalErrors, [], `renderer errors: ${fatalErrors.join(' | ')}`)

  console.log(JSON.stringify({
    ok: true,
    title: await page.title(),
    wordmarkLoaded: true,
    credentialFormAccessible: true,
    pluginPlatformReady: true,
    networkFailureHandled,
  }))
} finally {
  await electronApp?.close()
  await rm(userDataDirectory, { recursive: true, force: true })
}
