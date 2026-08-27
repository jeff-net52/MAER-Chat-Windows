import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { _electron as electron } from 'playwright'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '..')
const packagedExecutablePath = process.env.MAER_CHAT_EXECUTABLE
const userDataDirectory = await mkdtemp(path.join(tmpdir(), 'maer-chat-smoke-'))
let electronApp
const errors = []
const mainProcessErrors = []

function nativeFrame(value) {
  const payload = Buffer.from(JSON.stringify(value), 'utf8')
  const frame = Buffer.allocUnsafe(payload.byteLength + 4)
  frame.writeUInt32LE(payload.byteLength, 0)
  payload.copy(frame, 4)
  payload.fill(0)
  return frame
}

function decodeCompleteNativeFrames(output) {
  const messages = []
  let offset = 0
  while (offset + 4 <= output.byteLength) {
    const length = output.readUInt32LE(offset)
    assert.ok(length > 0 && length <= 65_536, 'Invalid native frame preface')
    if (offset + 4 + length > output.byteLength) break
    messages.push(JSON.parse(output.subarray(offset + 4, offset + 4 + length).toString('utf8')))
    offset += 4 + length
  }
  return { messages, bytes: offset }
}

async function verifyPackagedNativeMessaging(executablePath) {
  if (!executablePath) return false
  const shimPath = path.join(
    path.dirname(executablePath),
    'resources',
    'native-messaging',
    'maer-password-vault-host.exe',
  )
  const firefoxManifest = path.join(
    process.env.LOCALAPPDATA ?? '',
    'MAER Chat',
    'NativeMessaging',
    'fr.maer.password_vault-firefox.json',
  )
  const launchers = [
    {
      id: 'smoke-native-chromium',
      args: [
        'chrome-extension://afjfndaggdofghcpakcemfkckhiaplkn/',
        '--parent-window=0',
      ],
    },
    {
      id: 'smoke-native-firefox',
      args: [firefoxManifest, 'password-vault@maer.fr'],
    },
  ]

  for (const launcher of launchers) {
    const requests = [1, 2].map((sequence) => ({
      protocol: 'maer.password-vault',
      version: 1,
      id: `${launcher.id}-${sequence}`,
      type: 'vault.status',
      origin: 'https://example.test',
      sentAt: Date.now(),
      payload: {},
    }))
    const frames = requests.map(nativeFrame)

    const child = spawn(shimPath, launcher.args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    })
    const stdout = []
    let stderrBytes = 0
    let browserInputClosed = false
    child.stdout.on('data', (chunk) => {
      stdout.push(Buffer.from(chunk))
      const output = Buffer.concat(stdout)
      try {
        if (
          !browserInputClosed &&
          decodeCompleteNativeFrames(output).messages.length === requests.length
        ) {
          browserInputClosed = true
          child.stdin.end()
        }
      } finally {
        output.fill(0)
      }
    })
    child.stderr.on('data', (chunk) => {
      stderrBytes += chunk.byteLength
    })
    for (const frame of frames) {
      await new Promise((resolve, reject) => {
        child.stdin.write(frame, (error) => (error ? reject(error) : resolve()))
      })
    }
    for (const frame of frames) frame.fill(0)

    const exit = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        child.kill()
        reject(new Error(`Le shim Native Messaging ${launcher.id} ne se termine pas.`))
      }, 10_000)
      child.once('error', (error) => {
        clearTimeout(timer)
        reject(error)
      })
      child.once('close', (code) => {
        clearTimeout(timer)
        resolve(code)
      })
    })
    assert.equal(
      exit,
      0,
      `Native Messaging ${launcher.id} exited ${exit}; responses: ${decodeCompleteNativeFrames(Buffer.concat(stdout)).messages.length}; stderr bytes: ${stderrBytes}; GUI: ${mainProcessErrors.join(' | ')}`,
    )
    const output = Buffer.concat(stdout)
    const decoded = decodeCompleteNativeFrames(output)
    assert.equal(decoded.bytes, output.byteLength, 'Unexpected native stdout bytes')
    assert.equal(decoded.messages.length, requests.length, 'Native responses are missing')
    output.fill(0)
    for (const [index, response] of decoded.messages.entries()) {
      const request = requests[index]
      assert.deepEqual(response, {
        protocol: 'maer.password-vault',
        version: 1,
        id: request.id,
        type: 'response',
        origin: request.origin,
        ok: true,
        payload: {
          state: 'locked',
          capabilities: ['lookup', 'reveal', 'save', 'generate', 'lock'],
        },
      })
    }
  }
  return true
}

try {
  electronApp = await electron.launch({
    args: ['.'],
    cwd: root,
    env: {
      ...process.env,
      MAER_CHAT_E2E: '1',
      MAER_CHAT_E2E_USER_DATA_DIR: userDataDirectory,
    },
  })
  electronApp.process().stderr?.on('data', (chunk) => {
    mainProcessErrors.push(Buffer.from(chunk).toString('utf8').trim().slice(0, 500))
  })
  const page = await electronApp.firstWindow()
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  page.on('pageerror', (error) => errors.push(error.message))

  const omemoWasm = await page.evaluate(async () => {
    const response = await fetch(new URL('curve25519_compiled.wasm', document.baseURI))
    assertResponse(response)
    const bytes = await response.arrayBuffer()
    await WebAssembly.compile(bytes)
    return bytes.byteLength

    function assertResponse(value) {
      if (!value.ok) throw new Error(`Chargement OMEMO impossible (${value.status}).`)
    }
  })
  assert.ok(omemoWasm > 80_000, 'OMEMO WebAssembly asset is unexpectedly small')

  const pluginStatus = await page.evaluate(() => window.maerPlugins.passwordVault.status())
  assert.deepEqual(pluginStatus, { state: 'locked', entryCount: null })
  const nativeMessagingReady = await verifyPackagedNativeMessaging(packagedExecutablePath)

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
    nativeMessagingReady,
    omemoWasmLoaded: true,
    networkFailureHandled,
  }))
} finally {
  await electronApp?.close()
  await rm(userDataDirectory, { recursive: true, force: true })
}
