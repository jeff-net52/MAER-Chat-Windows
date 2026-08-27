import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const read = async (path) => readFile(join(root, path), 'utf8')
const readJson = async (path) => JSON.parse(await read(path))

function supportsWindowsX64(entry) {
  return (
    entry.dev !== true &&
    (!entry.os || entry.os.includes('win32')) &&
    (!entry.cpu || entry.cpu.includes('x64'))
  )
}

function runtimeComponents(packageLock) {
  return Object.entries(packageLock.packages)
    .filter(([path, entry]) => path.startsWith('node_modules/') && supportsWindowsX64(entry))
    .map(([path, entry]) => {
      const name = path.slice('node_modules/'.length)
      const version = entry.version ?? (name === '@converse/log' ? 'workspace' : undefined)
      assert.ok(version, `Runtime dependency without a version: ${name}`)
      return `${name}@${version}`
    })
    .sort()
}

function documentedComponents(markdown) {
  return markdown
    .split(/\r?\n/u)
    .filter((line) => line.startsWith('- `') && line.endsWith('`'))
    .map((line) => line.slice(3, -1))
    .sort()
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex')
}

const [
  packageMetadata,
  packageLock,
  notices,
  inventory,
  sourceLock,
  sourcePolicy,
  releasePolicy,
  rootLicense,
  workflow,
] = await Promise.all([
  readJson('package.json'),
  readJson('package-lock.json'),
  read('THIRD_PARTY_NOTICES.md'),
  read('THIRD_PARTY_LICENSES/runtime-components.md'),
  readJson('THIRD_PARTY_LICENSES/corresponding-sources.lock.json'),
  read('THIRD_PARTY_LICENSES/CORRESPONDING_SOURCE.md'),
  read('docs/RELEASE_POLICY.md'),
  read('LICENSE'),
  read('.github/workflows/windows-source.yml'),
])

assert.deepEqual(
  documentedComponents(inventory),
  runtimeComponents(packageLock),
  'runtime-components.md is not synchronized with package-lock.json for win32/x64',
)

for (const requiredPackagedFile of [
  'LICENSE',
  'THIRD_PARTY_NOTICES.md',
  'THIRD_PARTY_LICENSES/**/*',
]) {
  assert.ok(
    packageMetadata.build?.files?.includes(requiredPackagedFile),
    `${requiredPackagedFile} is missing from electron-builder files`,
  )
}

for (const [from, to] of [
  ['LICENSE', 'licenses/LICENSE'],
  ['THIRD_PARTY_NOTICES.md', 'licenses/THIRD_PARTY_NOTICES.md'],
  ['THIRD_PARTY_LICENSES', 'licenses/THIRD_PARTY_LICENSES'],
]) {
  assert.ok(
    packageMetadata.build?.extraResources?.some(
      (resource) => resource.from === from && resource.to === to,
    ),
    `${from} is not exposed as ${to} in the unpacked application`,
  )
}

for (const [name, version, license] of [
  ['Converse.js', '14.0.0', 'MPL-2.0'],
  ['libomemo.js', '2.0.2', 'GPL-3.0-only'],
  ['Electron', '43.4.1', 'MIT'],
  ['@napi-rs/keyring', '1.3.0', 'MIT'],
  ['qrcode', '1.5.4', 'MIT'],
]) {
  assert.match(notices, new RegExp(name.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&'), 'u'))
  assert.ok(notices.includes(version), `${name} version is missing from notices`)
  assert.ok(notices.includes(license), `${name} license is missing from notices`)
}

assert.match(rootLicense, /GNU GENERAL PUBLIC LICENSE[\s\S]*Version 3/u)
for (const [path, minimumLength] of [
  ['THIRD_PARTY_LICENSES/converse-MPL-2.0.txt', 15_000],
  ['THIRD_PARTY_LICENSES/electron-MIT.txt', 900],
  ['THIRD_PARTY_LICENSES/keyring-MIT.txt', 900],
  ['THIRD_PARTY_LICENSES/qrcode-MIT.txt', 900],
  ['THIRD_PARTY_LICENSES/libomemo-NOTICE.txt', 500],
]) {
  assert.ok((await read(path)).length >= minimumLength, `${path} is incomplete`)
}

assert.equal(sourceLock.schemaVersion, 1)
const converse = sourceLock.components.find((component) => component.name === 'converse.js')
const libomemo = sourceLock.components.find((component) => component.name === 'libomemo.js')
assert.equal(converse?.version, packageMetadata.dependencies['converse.js'])
assert.equal(
  converse?.npm.integrity,
  packageLock.packages['node_modules/converse.js'].integrity,
)
assert.equal(libomemo?.version, '2.0.2')
assert.match(libomemo?.source.commit ?? '', /^[a-f0-9]{40}$/u)
assert.match(libomemo?.source.archiveSha256 ?? '', /^sha256-[a-f0-9]{64}$/u)
assert.equal(libomemo?.npm.gitHead, libomemo?.source.commit)
assert.match(sourcePolicy, /m[eê]me[\s\S]*emplacement/iu)
assert.match(sourcePolicy, /scripts\/prepare-corresponding-sources\.mjs/u)

for (const [path, expected] of Object.entries(libomemo.bundledFiles)) {
  const bytes = await readFile(join(root, path))
  assert.equal(`sha256-${sha256(bytes)}`, expected, `${path} differs from the source lock`)
}
const converseChanges = await read('node_modules/converse.js/CHANGES.md')
assert.match(converseChanges, /Bump libomemo\.js to version 2\.0\.2/u)

assert.match(releasePolicy, /non signe|non signee|absence de signature/iu)
assert.match(releasePolicy, /logo[\s\S]*(bloqu|interdit|no-go)/iu)
assert.match(workflow, /npm run verify:licenses/u)
assert.equal(packageMetadata.scripts?.['generate:sbom'], 'node scripts/generate-sboms.mjs')
assert.match(workflow, /npm run generate:sbom/u)
assert.match(workflow, /npm run test:visual/u)
assert.match(workflow, /npm run verify:licenses:packaged/u)
assert.equal(
  packageMetadata.scripts?.['test:e2e:packaged'],
  'node scripts/smoke.mjs --executable "dist/win-unpacked/MAER Chat.exe"',
)
assert.match(workflow, /npm run test:e2e:packaged/u)
assert.match(workflow, /electron-builder --win --dir/u)

console.log(JSON.stringify({
  ok: true,
  runtimeComponents: runtimeComponents(packageLock).length,
  correspondingSources: sourceLock.components.map(({ name, version }) => `${name}@${version}`),
}))
