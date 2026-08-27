import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const lockPath = join(root, 'THIRD_PARTY_LICENSES', 'corresponding-sources.lock.json')
const MAXIMUM_DOWNLOAD_BYTES = 100 * 1024 * 1024

function outputArgument(args) {
  if (args.length === 0) return resolve(root, 'dist', 'corresponding-source')
  if (args.length !== 2 || args[0] !== '--output' || !args[1] || args[1].includes('\0')) {
    throw new Error('Usage: node scripts/prepare-corresponding-sources.mjs --output <directory>')
  }
  return resolve(args[1])
}

function digest(algorithm, value, encoding = 'hex') {
  return createHash(algorithm).update(value).digest(encoding)
}

function verifyNpmArchive(component, bytes) {
  const [algorithm, expectedBase64] = component.npm.integrity.split('-', 2)
  if (algorithm !== 'sha512' || !expectedBase64) {
    throw new Error(`Unsupported SRI for ${component.name}`)
  }
  const actualBase64 = digest('sha512', bytes, 'base64')
  if (actualBase64 !== expectedBase64) {
    throw new Error(`SHA-512 mismatch for ${component.name}@${component.version}`)
  }
  if (digest('sha1', bytes) !== component.npm.sha1) {
    throw new Error(`SHA-1 provenance mismatch for ${component.name}@${component.version}`)
  }
}

async function downloadNpmArchive(component, outputDirectory) {
  const response = await fetch(component.npm.url, {
    headers: { 'user-agent': 'maer-chat-corresponding-source/1' },
    redirect: 'follow',
  })
  if (!response.ok) {
    throw new Error(`Unable to download ${component.name}@${component.version}`)
  }
  const declaredLength = Number(response.headers.get('content-length') ?? 0)
  if (declaredLength > MAXIMUM_DOWNLOAD_BYTES) {
    throw new Error(`Archive too large for ${component.name}@${component.version}`)
  }
  const bytes = Buffer.from(await response.arrayBuffer())
  if (bytes.byteLength === 0 || bytes.byteLength > MAXIMUM_DOWNLOAD_BYTES) {
    bytes.fill(0)
    throw new Error(`Invalid archive size for ${component.name}@${component.version}`)
  }
  try {
    verifyNpmArchive(component, bytes)
    const filename = basename(new URL(component.npm.url).pathname)
    const target = join(outputDirectory, filename)
    await writeFile(target, bytes)
    return Object.freeze({
      filename,
      bytes: bytes.byteLength,
      sha256: digest('sha256', bytes),
    })
  } finally {
    bytes.fill(0)
  }
}

function git(args, cwd) {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  }).trim()
}

async function archiveLibomemoSource(component, outputDirectory) {
  const temporaryRoot = await mkdtemp(join(tmpdir(), 'maer-libomemo-source-'))
  const checkout = join(temporaryRoot, 'repository')
  try {
    git(['clone', '--filter=blob:none', '--no-checkout', component.source.repository, checkout], root)
    const resolvedCommit = git(['rev-parse', `${component.source.commit}^{commit}`], checkout)
    if (resolvedCommit !== component.source.commit) {
      throw new Error('libomemo source commit does not match the source lock')
    }
    const shortCommit = component.source.commit.slice(0, 12)
    const filename = `libomemo.js-${component.version}-source-${shortCommit}.tar`
    const target = join(outputDirectory, filename)
    git([
      'archive',
      '--format=tar',
      `--prefix=libomemo.js-${component.version}/`,
      `--output=${target}`,
      component.source.commit,
    ], checkout)
    const bytes = await readFile(target)
    try {
      const archiveSha256 = `sha256-${digest('sha256', bytes)}`
      if (archiveSha256 !== component.source.archiveSha256) {
        throw new Error('libomemo source archive differs from the source lock')
      }
      return Object.freeze({
        filename,
        bytes: bytes.byteLength,
        sha256: archiveSha256.slice('sha256-'.length),
        commit: resolvedCommit,
      })
    } finally {
      bytes.fill(0)
    }
  } finally {
    const resolvedTemporaryRoot = resolve(temporaryRoot)
    const allowedRoot = resolve(tmpdir())
    if (!resolvedTemporaryRoot.startsWith(`${allowedRoot}\\`)) {
      throw new Error('Refusing to remove a non-temporary source checkout')
    }
    await rm(resolvedTemporaryRoot, { recursive: true, force: true })
  }
}

const outputDirectory = outputArgument(process.argv.slice(2))
await mkdir(outputDirectory, { recursive: true })
const sourceLockBytes = await readFile(lockPath)
const sourceLock = JSON.parse(sourceLockBytes.toString('utf8'))
if (sourceLock.schemaVersion !== 1 || !Array.isArray(sourceLock.components)) {
  throw new Error('Invalid corresponding-source lock')
}

const artifacts = []
for (const component of sourceLock.components) {
  artifacts.push(await downloadNpmArchive(component, outputDirectory))
}
const libomemo = sourceLock.components.find((component) => component.name === 'libomemo.js')
if (!libomemo?.source) throw new Error('Pinned libomemo source is missing')
artifacts.push(await archiveLibomemoSource(libomemo, outputDirectory))

const manifest = {
  schemaVersion: 1,
  sourceLockSha256: digest('sha256', sourceLockBytes),
  artifacts: artifacts.sort((left, right) => left.filename.localeCompare(right.filename)),
}
sourceLockBytes.fill(0)
await writeFile(
  join(outputDirectory, 'SOURCE_MANIFEST.json'),
  `${JSON.stringify(manifest, null, 2)}\n`,
  'utf8',
)
console.log(JSON.stringify({ ok: true, outputDirectory, artifacts: manifest.artifacts }))
