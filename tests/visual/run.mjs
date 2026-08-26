import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { mkdir } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const host = '127.0.0.1'
const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '..', '..')
const viteCli = path.join(root, 'node_modules', 'vite', 'bin', 'vite.js')
const output = path.resolve(
  process.env.MAER_VISUAL_OUTPUT ?? path.join(tmpdir(), 'maer-chat-shell-current.png'),
)

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}

async function reservePort() {
  return new Promise((resolve, reject) => {
    const probe = createServer()
    probe.unref()
    probe.once('error', reject)
    probe.listen(0, host, () => {
      const address = probe.address()
      if (!address || typeof address === 'string') {
        probe.close()
        reject(new Error('Impossible de réserver un port pour le test visuel.'))
        return
      }
      probe.close((error) => {
        if (error) reject(error)
        else resolve(address.port)
      })
    })
  })
}

async function waitForServer(url, server, outputBuffer) {
  const deadline = Date.now() + 30_000
  while (Date.now() < deadline) {
    if (server.exitCode !== null) {
      throw new Error(`Vite s’est arrêté avant le test visuel.\n${outputBuffer()}`)
    }
    try {
      const response = await fetch(url)
      if (response.ok) return
    } catch {
      // Vite is still starting.
    }
    await delay(100)
  }
  throw new Error(`Vite n’a pas démarré dans le délai prévu.\n${outputBuffer()}`)
}

async function stopServer(server) {
  if (server.exitCode !== null) return
  const exited = once(server, 'exit')
  server.kill()
  await Promise.race([exited, delay(5_000)])
}

const port = await reservePort()
const url = `http://${host}:${port}/tests/visual/shell.html`
let serverOutput = ''
const vite = spawn(
  process.execPath,
  [viteCli, '.', '--host', host, '--port', String(port), '--strictPort'],
  {
    cwd: root,
    env: { ...process.env, NO_COLOR: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  },
)
const appendServerOutput = (chunk) => {
  serverOutput = `${serverOutput}${String(chunk)}`.slice(-12_000)
}
vite.stdout.on('data', appendServerOutput)
vite.stderr.on('data', appendServerOutput)

let browser
try {
  await waitForServer(url, vite, () => serverOutput)
  browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({
    viewport: { width: 1366, height: 900 },
    deviceScaleFactor: 1,
  })
  const browserErrors = []
  page.on('console', (message) => {
    if (message.type() === 'error') browserErrors.push(message.text())
  })
  page.on('pageerror', (error) => browserErrors.push(error.message))

  await page.goto(url, { waitUntil: 'networkidle' })
  await page.waitForSelector('#maer-conversation-sidebar')
  const geometry = await page.evaluate(() => {
    const box = (selector) => {
      const rect = document.querySelector(selector)?.getBoundingClientRect()
      return rect && {
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
      }
    }
    const css = getComputedStyle(document.documentElement)
    return {
      rail: box('#maer-app-rail'),
      conversations: box('#controlbox'),
      chat: box('.chatbox:not(#controlbox)'),
      title: box('.maer-conversation-titlebar h1'),
      callButtons: document.querySelectorAll(
        '.maer-audio-call, .maer-video-call, .maer-screen-call',
      ).length,
      sidebar: Boolean(document.querySelector('#maer-conversation-sidebar')),
      pluginButtons: document.querySelectorAll('[data-maer-plugin-key]').length,
      colors: {
        blue: css.getPropertyValue('--maer-blue').trim(),
        cyan: css.getPropertyValue('--maer-cyan').trim(),
      },
    }
  })

  await mkdir(path.dirname(output), { recursive: true })
  await page.screenshot({ path: output, fullPage: true })
  process.stdout.write(`${JSON.stringify({ ok: true, screenshot: output, geometry })}\n`)

  assert.ok(geometry.rail, 'Rail MAER absent')
  assert.ok(geometry.conversations, 'Liste des discussions absente')
  assert.ok(geometry.chat, 'Conversation absente')
  assert.ok(geometry.title, 'Titre de conversation absent')
  assert.equal(geometry.rail.x, 0)
  assert.ok(geometry.rail.width >= 87 && geometry.rail.width <= 90)
  assert.ok(geometry.conversations.x >= 70 && geometry.conversations.x <= 74)
  assert.ok(geometry.conversations.width >= 400 && geometry.conversations.width <= 430)
  assert.ok(geometry.chat.x >= 470)
  assert.ok(geometry.title.x >= geometry.rail.width)
  assert.equal(geometry.callButtons, 3)
  assert.equal(geometry.sidebar, true)
  assert.equal(geometry.pluginButtons, 0)
  assert.deepEqual(geometry.colors, { blue: '#0057b8', cyan: '#0089e6' })
  assert.deepEqual(browserErrors, [], `Erreurs navigateur : ${browserErrors.join(' | ')}`)
} finally {
  await browser?.close()
  await stopServer(vite)
}
