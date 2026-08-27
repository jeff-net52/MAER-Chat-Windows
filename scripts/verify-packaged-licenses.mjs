import assert from 'node:assert/strict'
import { stat } from 'node:fs/promises'
import { dirname, join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { extractFile } from '@electron/asar'

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const packagedRoot = resolve(process.argv[2] ?? join(repositoryRoot, 'dist', 'win-unpacked'))
const appAsar = join(packagedRoot, 'resources', 'app.asar')

async function assertExternalFile(relativePath, minimumBytes) {
  const metadata = await stat(join(packagedRoot, relativePath))
  assert.ok(metadata.isFile(), `${relativePath} is not a regular file`)
  assert.ok(metadata.size >= minimumBytes, `${relativePath} is unexpectedly small`)
}

function assertAsarFile(relativePath, minimumBytes) {
  const contents = extractFile(appAsar, relativePath.split('/').join(sep))
  assert.ok(contents.length >= minimumBytes, `${relativePath} is missing or incomplete in app.asar`)
}

await assertExternalFile('LICENSE.electron.txt', 900)
await assertExternalFile('LICENSES.chromium.html', 1_000_000)
await assertExternalFile('resources/licenses/LICENSE', 30_000)
await assertExternalFile('resources/licenses/THIRD_PARTY_NOTICES.md', 2_000)
await assertExternalFile(
  'resources/licenses/THIRD_PARTY_LICENSES/converse-MPL-2.0.txt',
  15_000,
)
await assertExternalFile(
  'resources/licenses/THIRD_PARTY_LICENSES/libomemo-NOTICE.txt',
  500,
)
await assertExternalFile(
  'resources/licenses/THIRD_PARTY_LICENSES/corresponding-sources.lock.json',
  1_000,
)
await assertExternalFile(
  'resources/licenses/THIRD_PARTY_LICENSES/electron-MIT.txt',
  900,
)
await assertExternalFile(
  'resources/licenses/THIRD_PARTY_LICENSES/keyring-MIT.txt',
  900,
)
await assertExternalFile(
  'resources/licenses/THIRD_PARTY_LICENSES/qrcode-MIT.txt',
  900,
)
await assertExternalFile(
  'resources/licenses/THIRD_PARTY_LICENSES/runtime-components.md',
  2_000,
)

for (const [relativePath, minimumBytes] of [
  ['THIRD_PARTY_LICENSES/CORRESPONDING_SOURCE.md', 1_000],
  ['THIRD_PARTY_LICENSES/corresponding-sources.lock.json', 1_000],
  ['THIRD_PARTY_LICENSES/converse-MPL-2.0.txt', 15_000],
  ['THIRD_PARTY_LICENSES/electron-MIT.txt', 900],
  ['THIRD_PARTY_LICENSES/keyring-MIT.txt', 900],
  ['THIRD_PARTY_LICENSES/libomemo-NOTICE.txt', 500],
  ['THIRD_PARTY_LICENSES/qrcode-MIT.txt', 900],
  ['THIRD_PARTY_LICENSES/runtime-components.md', 2_000],
  ['node_modules/converse.js/LICENSE', 15_000],
  ['node_modules/@napi-rs/keyring/LICENSE', 900],
  ['node_modules/qrcode/license', 900],
]) {
  assertAsarFile(relativePath, minimumBytes)
}

console.log(JSON.stringify({
  ok: true,
  packagedRoot,
  electronNotices: ['LICENSE.electron.txt', 'LICENSES.chromium.html'],
  applicationNotices: [
    'resources/licenses/LICENSE',
    'resources/licenses/THIRD_PARTY_NOTICES.md',
    'resources/licenses/THIRD_PARTY_LICENSES',
  ],
}))
