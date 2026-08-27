import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, stat } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { _electron as electron, chromium } from 'playwright'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '..')
const expectedAppVersion = JSON.parse(
  await readFile(path.join(root, 'package.json'), 'utf8'),
).version

function packagedExecutableArgument(args) {
  if (args.length === 0) return process.env.MAER_CHAT_EXECUTABLE
  if (args.length === 2 && args[0] === '--executable' && args[1] && !args[1].includes('\0')) {
    return path.resolve(args[1])
  }
  throw new Error('Usage: node scripts/smoke.mjs [--executable <path>]')
}

const packagedExecutablePath = packagedExecutableArgument(process.argv.slice(2))
const connectedSmoke = process.env.MAER_CHAT_CONNECTED_SMOKE === '1'
const connectedJid = process.env.MAER_CHAT_SMOKE_JID
const connectedPassword = process.env.MAER_CHAT_SMOKE_PASSWORD
const connectedContactJid = process.env.MAER_CHAT_SMOKE_CONTACT_JID
if (connectedSmoke && (!connectedJid || !connectedPassword)) {
  throw new Error('Connected smoke requires MAER_CHAT_SMOKE_JID and MAER_CHAT_SMOKE_PASSWORD.')
}
const userDataDirectory = await mkdtemp(path.join(tmpdir(), 'maer-chat-smoke-'))
let electronApp
let cdpBrowser
let packagedProcess
const errors = []
const mainProcessErrors = []

function markPhase(phase) {
  console.log(JSON.stringify({ smokePhase: phase }))
}

async function withDeadline(label, promise, timeoutMs = 30_000) {
  let timer
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`Smoke timeout during ${label}.`)),
          timeoutMs,
        )
      }),
    ])
  } finally {
    clearTimeout(timer)
  }
}

async function reserveLoopbackPort() {
  const server = createServer()
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const address = server.address()
  assert.ok(address && typeof address === 'object')
  await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()))
  })
  return address.port
}

async function waitForCdp(endpoint, child) {
  return new Promise((resolve, reject) => {
    let settled = false
    let timer
    const finish = (error) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      child.removeListener('exit', onExit)
      error ? reject(error) : resolve()
    }
    const onExit = (code, signal) => {
      finish(new Error(`Packaged application exited before CDP (${code ?? signal}).`))
    }
    const probe = async () => {
      if (settled) return
      try {
        const response = await fetch(`${endpoint}/json/version`)
        if (response.ok) {
          finish()
          return
        }
      } catch {
        // The local endpoint is expected to refuse connections during startup.
      }
      timer = setTimeout(probe, 100)
    }
    child.once('exit', onExit)
    void probe()
  })
}

async function launchPackagedApplication(executablePath, environment) {
  const port = await reserveLoopbackPort()
  const endpoint = `http://127.0.0.1:${port}`
  const child = spawn(
    executablePath,
    [
      '--remote-debugging-address=127.0.0.1',
      `--remote-debugging-port=${port}`,
    ],
    {
      cwd: path.dirname(executablePath),
      env: environment,
      stdio: ['ignore', 'ignore', 'pipe'],
      windowsHide: true,
    },
  )
  child.stderr.on('data', (chunk) => {
    mainProcessErrors.push(Buffer.from(chunk).toString('utf8').trim().slice(0, 500))
  })
  try {
    await withDeadline('packaged CDP endpoint', waitForCdp(endpoint, child), 45_000)
    const browser = await chromium.connectOverCDP(endpoint)
    const context = browser.contexts()[0]
    assert.ok(context, 'Packaged application did not expose a browser context')
    const page = context.pages()[0] ?? await context.waitForEvent('page')
    return { browser, child, page }
  } catch (error) {
    if (child.exitCode === null) child.kill()
    throw error
  }
}

async function removeTemporaryProfile() {
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    try {
      await rm(userDataDirectory, { recursive: true, force: true })
      return
    } catch (error) {
      if (!['EBUSY', 'EPERM'].includes(error?.code) || attempt === 5) throw error
      await new Promise((resolve) => setTimeout(resolve, attempt * 200))
    }
  }
}

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

async function verifyBrowserExtensionResources(executablePath) {
  const extensionRoot = executablePath
    ? path.join(
        path.dirname(executablePath),
        'resources',
        'browser-extensions',
        'maer-password-vault',
      )
    : path.join(root, 'browser-extensions', 'maer-password-vault')
  const guidePath = executablePath
    ? path.join(extensionRoot, 'installation.md')
    : path.join(extensionRoot, 'docs', 'installation.md')
  const chromiumManifestPath = path.join(extensionRoot, 'dist', 'chromium', 'manifest.json')
  const firefoxManifestPath = path.join(extensionRoot, 'dist', 'firefox', 'manifest.json')
  const requiredFiles = [
    guidePath,
    chromiumManifestPath,
    firefoxManifestPath,
    path.join(extensionRoot, 'dist', 'chromium', 'BUILD-METADATA.json'),
    path.join(extensionRoot, 'dist', 'chromium', 'NOTICE.txt'),
    path.join(extensionRoot, 'dist', 'chromium', 'LICENSE'),
    path.join(extensionRoot, 'dist', 'chromium', 'assets', 'icon-128.png'),
    path.join(extensionRoot, 'dist', 'firefox', 'BUILD-METADATA.json'),
    path.join(extensionRoot, 'dist', 'firefox', 'NOTICE.txt'),
    path.join(extensionRoot, 'dist', 'firefox', 'LICENSE'),
    path.join(extensionRoot, 'dist', 'firefox', 'assets', 'icon-128.png'),
  ]
  for (const requiredFile of requiredFiles) {
    assert.equal((await stat(requiredFile)).isFile(), true, `Missing resource: ${requiredFile}`)
  }

  const [chromiumManifest, firefoxManifest, guide] = await Promise.all([
    readFile(chromiumManifestPath, 'utf8').then(JSON.parse),
    readFile(firefoxManifestPath, 'utf8').then(JSON.parse),
    readFile(guidePath, 'utf8'),
  ])
  assert.equal(chromiumManifest.manifest_version, 3)
  assert.equal(firefoxManifest.manifest_version, 3)
  assert.equal(chromiumManifest.name, 'MAER Chat - Coffre de mots de passe')
  assert.equal(firefoxManifest.name, chromiumManifest.name)
  assert.equal(
    firefoxManifest.browser_specific_settings?.gecko?.id,
    'password-vault@maer.fr',
  )
  for (const instruction of [
    'edge://extensions',
    'chrome://extensions',
    'about:debugging#/runtime/this-firefox',
    'dist/chromium',
    'dist/firefox/manifest.json',
  ]) {
    assert.ok(guide.includes(instruction), `Installation guide lacks ${instruction}`)
  }
  return true
}

try {
  markPhase('launch')
  const smokeEnvironment = {
    ...process.env,
    MAER_CHAT_E2E: '1',
    MAER_CHAT_E2E_USER_DATA_DIR: userDataDirectory,
  }
  let page
  if (packagedExecutablePath) {
    const packaged = await launchPackagedApplication(
      packagedExecutablePath,
      smokeEnvironment,
    )
    cdpBrowser = packaged.browser
    packagedProcess = packaged.child
    page = packaged.page
  } else {
    electronApp = await withDeadline('Electron launch', electron.launch({
      args: ['.'],
      cwd: root,
      env: smokeEnvironment,
    }), 45_000)
    electronApp.process().stderr?.on('data', (chunk) => {
      mainProcessErrors.push(Buffer.from(chunk).toString('utf8').trim().slice(0, 500))
    })
    markPhase('first-window')
    page = await withDeadline('first BrowserWindow', electronApp.firstWindow())
  }
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  page.on('pageerror', (error) => errors.push(error.message))

  markPhase('renderer-origin')
  const rendererLocation = await page.evaluate(() => ({
    href: window.location.href,
    origin: window.location.origin,
    protocol: window.location.protocol,
  }))
  assert.deepEqual(rendererLocation, {
    href: 'maer-chat://app/',
    origin: 'maer-chat://app',
    protocol: 'maer-chat:',
  })
  const runtimeVersion = await page.evaluate(async () => {
    const bootstrap = await window.maerDesktop.getBootstrap()
    return bootstrap.version
  })
  assert.equal(runtimeVersion, expectedAppVersion)

  markPhase('renderer-assets')
  const omemoWasm = await withDeadline('OMEMO WebAssembly verification', page.evaluate(async () => {
    const response = await fetch(new URL('curve25519_compiled.wasm', document.baseURI))
    assertResponse(response)
    const bytes = await response.arrayBuffer()
    await WebAssembly.compile(bytes)
    return bytes.byteLength

    function assertResponse(value) {
      if (!value.ok) throw new Error(`Chargement OMEMO impossible (${value.status}).`)
    }
  }))
  assert.ok(omemoWasm > 80_000, 'OMEMO WebAssembly asset is unexpectedly small')

  markPhase('plugin-status')
  const pluginStatus = await withDeadline(
    'password-vault plugin status',
    page.evaluate(() => window.maerPlugins.passwordVault.status()),
  )
  assert.deepEqual(pluginStatus, { state: 'locked', entryCount: null })
  markPhase('browser-extension-resources')
  const browserExtensionsReady = await withDeadline(
    'browser-extension resource verification',
    verifyBrowserExtensionResources(packagedExecutablePath),
  )
  const browserExtensionActions = await withDeadline(
    'browser-extension main-only actions',
    page.evaluate(async () => Promise.all([
      window.maerPlugins.passwordVault.openExtensionFolder(),
      window.maerPlugins.passwordVault.openExtensionGuide(),
    ])),
  )
  assert.deepEqual(browserExtensionActions, [
    { target: 'folder', opened: true },
    { target: 'guide', opened: true },
  ])
  markPhase('native-messaging')
  const nativeMessagingReady = await withDeadline(
    'packaged Native Messaging verification',
    verifyPackagedNativeMessaging(packagedExecutablePath),
    30_000,
  )

  markPhase('onboarding')
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
  let connectedResult = null
  if (connectedSmoke) {
    const suffix = '@xmpp.maer.fr'
    if (!connectedJid.toLowerCase().endsWith(suffix)) {
      throw new Error('Connected smoke JID must use the configured MAER domain.')
    }
    const identifier = connectedJid.slice(0, -suffix.length)
    if (!identifier || identifier.includes('@')) {
      throw new Error('Connected smoke JID is invalid.')
    }
    await page.fill('#account-id', identifier)
    await page.fill('#account-password', connectedPassword)
    await page.click('button[type="submit"]')
    await page.waitForSelector('body.maer-shell-active #maer-app-rail', { timeout: 45_000 })
    const geometry = await page.evaluate(() => {
      const rail = document.querySelector('#maer-app-rail')?.getBoundingClientRect()
      const sidebar = document.querySelector('#maer-conversation-sidebar')?.getBoundingClientRect()
      if (!rail || !sidebar || rail.width < 40 || sidebar.width < 240) {
        throw new Error('Connected MAER shell geometry is invalid.')
      }
      return {
        rail: { width: Math.round(rail.width), height: Math.round(rail.height) },
        sidebar: { width: Math.round(sidebar.width), height: Math.round(sidebar.height) },
      }
    })
    if (connectedContactJid) {
      const search = page.locator('[data-maer-conversation-search]')
      await search.fill(connectedContactJid)
      const contact = page.getByText(connectedContactJid, { exact: false }).last()
      await contact.click({ timeout: 15_000 })
      await page.waitForSelector('.maer-audio-call, .maer-video-call, .maer-screen-call', { timeout: 15_000 })
    }
    const callButtons = await page.locator('.maer-audio-call, .maer-video-call, .maer-screen-call').count()
    if (connectedContactJid) assert.equal(callButtons, 3, 'Connected conversation must expose three call actions')
    const screenshotPath = path.join(root, '..', '.codex-tmp', 'smoke-connected-windows.png')
    await mkdir(path.dirname(screenshotPath), { recursive: true })
    await page.screenshot({ path: screenshotPath, fullPage: true })
    connectedResult = {
      connected: true,
      geometry,
      callButtons,
      callButtonsVerified: Boolean(connectedContactJid),
      screenshotPath,
    }
  } else if (process.env.MAER_CHAT_NETWORK_SMOKE === '1') {
    await page.fill('#account-id', 'maer-client-smoke-nonexistent')
    await page.fill('#account-password', 'not-a-real-account-secret')
    await page.click('button[type="submit"]')
    const connectionError = page.locator('[data-role="form-error"]:not([hidden])')
    await connectionError.waitFor({ state: 'visible', timeout: 45_000 })
    const message = (await connectionError.textContent()) ?? ''
    assert.doesNotMatch(message, /Cannot read properties|reading ['"]listen['"]/i)
    assert.match(message, /connexion|serveur|identifiant|authentification/i)
    const layering = await page.evaluate(() => {
      const submit = document.querySelector('form[data-form="credentials"] button[type="submit"]')
      const converseRoot = document.querySelector('#conversejs')
      if (!(submit instanceof HTMLElement)) throw new Error('Credential submit button is absent')
      const rect = submit.getBoundingClientRect()
      const top = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2)
      return {
        submitIsTopmost: top === submit || submit.contains(top),
        converseHidden: converseRoot instanceof HTMLElement && converseRoot.hidden,
        connectedClass: document.body.classList.contains('maer-chat-connected'),
      }
    })
    assert.deepEqual(layering, {
      submitIsTopmost: true,
      converseHidden: true,
      connectedClass: false,
    })
    networkFailureHandled = true
  }

  const fatalErrors = errors.filter(
    (message) =>
      !message.includes('Autofill') &&
      !message.includes('DevTools') &&
      !(
        message.includes('violates the following Content Security Policy directive') &&
        message.includes('https://conversejs.org/media/logos/')
      ) &&
      !(
        networkFailureHandled &&
        (
          /WebSocket connection .* failed/iu.test(message) ||
          /Websocket (?:error|closed)/iu.test(message)
        )
      ),
  )
  assert.deepEqual(fatalErrors, [], `renderer errors: ${fatalErrors.join(' | ')}`)

  console.log(JSON.stringify({
    ok: true,
    title: await page.title(),
    runtimeVersion,
    rendererLocation,
    wordmarkLoaded: true,
    credentialFormAccessible: true,
    pluginPlatformReady: true,
    browserExtensionsReady,
    nativeMessagingReady,
    omemoWasmLoaded: true,
    networkFailureHandled,
    connectedResult,
  }))
} finally {
  await cdpBrowser?.close().catch(() => undefined)
  if (packagedProcess?.exitCode === null) {
    packagedProcess.kill()
    await withDeadline(
      'packaged process shutdown',
      new Promise((resolve) => packagedProcess.once('close', resolve)),
      10_000,
    ).catch(() => undefined)
  }
  if (electronApp) {
    try {
      await withDeadline('Electron shutdown', electronApp.close(), 10_000)
    } catch {
      electronApp.process().kill()
    }
  }
  await removeTemporaryProfile()
}
