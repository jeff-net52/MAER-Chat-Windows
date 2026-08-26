import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { createServer } from 'node:net'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { PNG } from 'pngjs'
import { chromium } from 'playwright'

const testRoot = path.dirname(fileURLToPath(import.meta.url))
const repositoryRoot = path.resolve(testRoot, '..', '..')
const baselineRoot = path.join(testRoot, 'baselines')
const outputRoot = path.resolve(repositoryRoot, '..', '.codex-tmp', 'visual')
const updateBaselines = process.env.UPDATE_VISUAL_BASELINES === '1'
const viteCli = path.join(repositoryRoot, 'node_modules', 'vite', 'bin', 'vite.js')
const scenarios = [
  { name: 'shell-light-1366', theme: 'light', width: 1366 },
  { name: 'shell-dark-1366', theme: 'dark', width: 1366 },
  { name: 'shell-light-920', theme: 'light', width: 920 },
  { name: 'shell-dark-920', theme: 'dark', width: 920 },
]
const MAX_CHANGED_PIXEL_RATIO = 0.005
const MAX_MEAN_CHANNEL_DELTA = 0.001
const CHANGED_PIXEL_DELTA = 16

async function availablePort() {
  return await new Promise((resolve, reject) => {
    const server = createServer().unref()
    server.on('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      const port = typeof address === 'object' && address ? address.port : undefined
      server.close((error) => (error ? reject(error) : resolve(port)))
    })
  })
}

async function waitForServer(url, child, output) {
  const deadline = Date.now() + 30_000
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Serveur arrêté (${child.exitCode}).\n${output()}`)
    try {
      if ((await fetch(url)).ok) return
    } catch { /* démarrage en cours */ }
    await new Promise((resolve) => setTimeout(resolve, 150))
  }
  throw new Error(`Le serveur visuel n'a pas démarré.\n${output()}`)
}

async function stopServer(child) {
  if (child.exitCode !== null) return
  child.kill('SIGTERM')
  await Promise.race([
    new Promise((resolve) => child.once('exit', resolve)),
    new Promise((resolve) => setTimeout(resolve, 3_000)),
  ])
  if (child.exitCode === null) child.kill('SIGKILL')
}

function comparePng(actualBuffer, baselineBuffer, name) {
  const actual = PNG.sync.read(actualBuffer)
  const baseline = PNG.sync.read(baselineBuffer)
  assert.equal(actual.width, baseline.width, `${name}: largeur différente`)
  assert.equal(actual.height, baseline.height, `${name}: hauteur différente`)
  let changedPixels = 0
  let channelDelta = 0
  const pixels = actual.width * actual.height
  for (let i = 0; i < actual.data.length; i += 4) {
    const deltas = [0, 1, 2, 3].map((channel) => Math.abs(actual.data[i + channel] - baseline.data[i + channel]))
    channelDelta += deltas.reduce((sum, delta) => sum + delta, 0)
    if (Math.max(...deltas) > CHANGED_PIXEL_DELTA) changedPixels += 1
  }
  const changedPixelRatio = changedPixels / pixels
  const meanChannelDelta = channelDelta / (pixels * 4 * 255)
  assert.ok(changedPixelRatio <= MAX_CHANGED_PIXEL_RATIO,
    `${name}: ${(changedPixelRatio * 100).toFixed(3)} % de pixels modifiés (max 0,5 %)`)
  assert.ok(meanChannelDelta <= MAX_MEAN_CHANNEL_DELTA,
    `${name}: delta moyen ${(meanChannelDelta * 100).toFixed(3)} % (max 0,1 %)`)
  return { changedPixelRatio, meanChannelDelta }
}

const port = await availablePort()
const url = `http://127.0.0.1:${port}/shell.html`
const vite = spawn(process.execPath,
  [viteCli, '.', '--host', '127.0.0.1', '--port', String(port), '--strictPort'],
  { cwd: testRoot, env: { ...process.env, NO_COLOR: '1' }, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true })
let serverOutput = ''
const appendOutput = (chunk) => { serverOutput = `${serverOutput}${String(chunk)}`.slice(-12_000) }
vite.stdout.on('data', appendOutput)
vite.stderr.on('data', appendOutput)

let browser
try {
  await waitForServer(url, vite, () => serverOutput)
  browser = await chromium.launch({ headless: true })
  const results = []
  for (const scenario of scenarios) {
    const page = await browser.newPage({ viewport: { width: scenario.width, height: 900 }, deviceScaleFactor: 1 })
    const browserErrors = []
    page.on('console', (message) => { if (message.type() === 'error') browserErrors.push(message.text()) })
    page.on('pageerror', (error) => browserErrors.push(error.message))
    await page.goto(url, { waitUntil: 'networkidle' })
    await page.evaluate((theme) => { document.documentElement.dataset.maerTheme = theme }, scenario.theme)
    await page.waitForSelector('#maer-conversation-sidebar')
    const geometry = await page.evaluate(() => {
      const box = (selector) => {
        const rect = document.querySelector(selector)?.getBoundingClientRect()
        return rect && { x: rect.x, width: rect.width }
      }
      const css = getComputedStyle(document.documentElement)
      return {
        rail: box('#maer-app-rail'), conversations: box('#controlbox'),
        chat: box('.chatbox:not(#controlbox)'), title: box('.maer-conversation-titlebar h1'),
        callButtons: document.querySelectorAll('.maer-audio-call, .maer-video-call, .maer-screen-call').length,
        sidebar: Boolean(document.querySelector('#maer-conversation-sidebar')),
        pluginButtons: document.querySelectorAll('[data-maer-plugin-key]').length,
        colors: { blue: css.getPropertyValue('--maer-blue').trim(), cyan: css.getPropertyValue('--maer-cyan').trim() },
      }
    })
    assert.ok(geometry.rail && geometry.conversations && geometry.chat && geometry.title, `${scenario.name}: shell incomplet`)
    assert.equal(geometry.rail.x, 0)
    assert.ok(geometry.rail.width >= 87 && geometry.rail.width <= 90)
    assert.ok(geometry.conversations.x >= 70 && geometry.conversations.x <= 74)
    assert.ok(geometry.conversations.width >= 325 && geometry.conversations.width <= 430)
    assert.ok(geometry.chat.x >= 395)
    assert.ok(geometry.title.x >= geometry.rail.width)
    assert.equal(geometry.callButtons, 3)
    assert.equal(geometry.sidebar, true)
    assert.equal(geometry.pluginButtons, 0)
    assert.deepEqual(geometry.colors, scenario.theme === 'light'
      ? { blue: '#0057b8', cyan: '#0089e6' }
      : { blue: '#0089e6', cyan: '#48b7ff' })
    assert.deepEqual(browserErrors, [], `Erreurs navigateur : ${browserErrors.join(' | ')}`)

    await mkdir(outputRoot, { recursive: true })
    const output = path.join(outputRoot, `${scenario.name}.png`)
    const actual = await page.screenshot({ path: output, fullPage: true })
    const baseline = path.join(baselineRoot, `${scenario.name}.png`)
    let comparison = { changedPixelRatio: 0, meanChannelDelta: 0 }
    if (updateBaselines) {
      await mkdir(baselineRoot, { recursive: true })
      await writeFile(baseline, actual)
    } else comparison = comparePng(actual, await readFile(baseline), scenario.name)
    results.push({ ...scenario, output, geometry, comparison })
    await page.close()
  }
  process.stdout.write(`${JSON.stringify({ ok: true, updateBaselines, results })}\n`)
} finally {
  await browser?.close()
  await stopServer(vite)
}
