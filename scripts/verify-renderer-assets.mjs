import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const sourcePath = resolve(
  'node_modules',
  'converse.js',
  'dist',
  'curve25519_compiled.wasm',
)
const packagedPath = resolve(
  'out',
  'renderer',
  'curve25519_compiled.wasm',
)

const [source, packaged] = await Promise.all([
  readFile(sourcePath),
  readFile(packagedPath),
])

const digest = (value) => createHash('sha256').update(value).digest('hex')
assert.equal(digest(packaged), digest(source), 'Le module OMEMO livré diffère de Converse.js.')
await WebAssembly.compile(packaged)

console.log(JSON.stringify({
  ok: true,
  asset: 'curve25519_compiled.wasm',
  bytes: packaged.byteLength,
  sha256: digest(packaged),
}))
