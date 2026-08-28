import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const sourceDirectory = resolve('node_modules', 'converse.js', 'dist')
const packagedDirectory = resolve('out', 'renderer')
const [source, packaged, sourceEmoji, packagedEmoji] = await Promise.all([
  readFile(resolve(sourceDirectory, 'curve25519_compiled.wasm')),
  readFile(resolve(packagedDirectory, 'curve25519_compiled.wasm')),
  readFile(resolve(sourceDirectory, 'emoji.json')),
  readFile(resolve(packagedDirectory, 'emoji.json')),
])

const digest = (value) => createHash('sha256').update(value).digest('hex')
assert.equal(digest(packaged), digest(source), 'Le module OMEMO livré diffère de Converse.js.')
assert.equal(
  digest(packagedEmoji),
  digest(sourceEmoji),
  'Le catalogue d’emojis livré diffère de Converse.js.',
)
await WebAssembly.compile(packaged)
const emojiCatalog = JSON.parse(packagedEmoji.toString('utf8'))
assert.ok(
  Object.keys(emojiCatalog).length >= 10 && Object.keys(emojiCatalog.smileys ?? {}).length >= 50,
  'Le catalogue d’emojis Converse.js est incomplet.',
)

console.log(JSON.stringify({
  ok: true,
  asset: 'curve25519_compiled.wasm',
  bytes: packaged.byteLength,
  sha256: digest(packaged),
  emojiAsset: 'emoji.json',
  emojiBytes: packagedEmoji.byteLength,
  emojiSha256: digest(packagedEmoji),
}))
