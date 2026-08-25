import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { _electron as electron } from 'playwright'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '..')
const executablePath = process.env.MAER_CHAT_EXECUTABLE
const electronApp = await electron.launch(
  executablePath
    ? { executablePath }
    : { args: ['.'], cwd: root },
)
const errors = []

try {
  const page = await electronApp.firstWindow()
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  page.on('pageerror', (error) => errors.push(error.message))

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

  await page.check('#advanced-jid')
  assert.equal(await page.locator('[data-role="domain-suffix"]').isVisible(), false)
  await page.fill('#account-id', 'test@contacts.chaumont.me')
  await page.fill('#account-password', 'temporary-not-a-real-secret')
  await page.click('[data-action="toggle-password"]')
  assert.equal(await page.locator('#account-password').getAttribute('type'), 'text')

  const fatalErrors = errors.filter(
    (message) => !message.includes('Autofill') && !message.includes('DevTools'),
  )
  assert.deepEqual(fatalErrors, [], `renderer errors: ${fatalErrors.join(' | ')}`)

  console.log(JSON.stringify({
    ok: true,
    title: await page.title(),
    wordmarkLoaded: true,
    credentialFormAccessible: true,
  }))
} finally {
  await electronApp.close()
}
