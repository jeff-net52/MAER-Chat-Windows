import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const npmCli = process.env.npm_execpath

function outputArgument(args) {
  if (args.length === 0) return resolve(root, 'dist', 'sbom')
  if (args.length !== 2 || args[0] !== '--output' || !args[1] || args[1].includes('\0')) {
    throw new Error('Usage: node scripts/generate-sboms.mjs --output <directory>')
  }
  return resolve(args[1])
}

function npmSbom(format) {
  if (!npmCli) {
    throw new Error('Run this generator through `npm run generate:sbom`.')
  }
  const stdout = execFileSync(
    process.env.npm_node_execpath || process.execPath,
    [npmCli, 'sbom', '--sbom-format', format],
    {
      cwd: root,
      encoding: 'utf8',
      maxBuffer: 32 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    },
  )
  return JSON.parse(stdout)
}

function validateCycloneDx(document) {
  if (
    document?.bomFormat !== 'CycloneDX' ||
    document?.specVersion !== '1.5' ||
    !Array.isArray(document.components) ||
    document.components.length === 0
  ) {
    throw new Error('npm produced an invalid or empty CycloneDX SBOM')
  }
}

function validateSpdx(document) {
  if (
    document?.spdxVersion !== 'SPDX-2.3' ||
    document?.dataLicense !== 'CC0-1.0' ||
    !Array.isArray(document.packages) ||
    document.packages.length === 0
  ) {
    throw new Error('npm produced an invalid or empty SPDX SBOM')
  }
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex')
}

const packageMetadata = await import('../package.json', { with: { type: 'json' } })
const version = packageMetadata.default.version
const outputDirectory = outputArgument(process.argv.slice(2))
await mkdir(outputDirectory, { recursive: true })

const cyclonedx = npmSbom('cyclonedx')
const spdx = npmSbom('spdx')
validateCycloneDx(cyclonedx)
validateSpdx(spdx)

const documents = [
  {
    filename: `MAER-Chat-${version}.cdx.json`,
    body: `${JSON.stringify(cyclonedx, null, 2)}\n`,
    format: 'CycloneDX 1.5',
    entries: cyclonedx.components.length,
  },
  {
    filename: `MAER-Chat-${version}.spdx.json`,
    body: `${JSON.stringify(spdx, null, 2)}\n`,
    format: 'SPDX 2.3',
    entries: spdx.packages.length,
  },
]

const manifest = []
for (const document of documents) {
  const bytes = Buffer.from(document.body, 'utf8')
  await writeFile(join(outputDirectory, document.filename), bytes)
  manifest.push({
    filename: document.filename,
    format: document.format,
    entries: document.entries,
    bytes: bytes.byteLength,
    sha256: sha256(bytes),
  })
  bytes.fill(0)
}

await writeFile(
  join(outputDirectory, 'SBOM_MANIFEST.json'),
  `${JSON.stringify({ schemaVersion: 1, version, documents: manifest }, null, 2)}\n`,
  'utf8',
)

console.log(JSON.stringify({ ok: true, outputDirectory, documents: manifest }))
