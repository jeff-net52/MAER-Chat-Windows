import assert from 'node:assert/strict'
import { resolve } from 'node:path'
import {
  getCurrentFuseWire,
  FuseV1Options,
} from '@electron/fuses'

const executable = resolve(
  process.argv[2] ?? 'dist/win-unpacked/MAER Chat.exe',
)
const wire = await getCurrentFuseWire(executable)
assert.equal(wire.version, '1')

const disabled = 0x30
const enabled = 0x31
const expected = new Map([
  [FuseV1Options.RunAsNode, disabled],
  [FuseV1Options.EnableCookieEncryption, enabled],
  [FuseV1Options.EnableNodeOptionsEnvironmentVariable, disabled],
  [FuseV1Options.EnableNodeCliInspectArguments, disabled],
  [FuseV1Options.EnableEmbeddedAsarIntegrityValidation, enabled],
  [FuseV1Options.OnlyLoadAppFromAsar, enabled],
  [FuseV1Options.LoadBrowserProcessSpecificV8Snapshot, disabled],
  [FuseV1Options.GrantFileProtocolExtraPrivileges, enabled],
  [FuseV1Options.WasmTrapHandlers, enabled],
])

const knownFuseIndexes = Object.values(FuseV1Options)
  .filter((value) => Number.isInteger(value))
  .sort((left, right) => left - right)
assert.deepEqual(knownFuseIndexes, [...expected.keys()])

for (const [index, state] of expected) {
  assert.equal(
    wire[index],
    state,
    `${FuseV1Options[index]} has an unexpected packaged state`,
  )
}

const wireIndexes = Object.keys(wire)
  .filter((key) => /^\d+$/u.test(key))
  .map(Number)
  .sort((left, right) => left - right)
assert.deepEqual(wireIndexes, knownFuseIndexes, 'An unknown Electron fuse is present')

console.log(JSON.stringify({
  ok: true,
  executable,
  fuses: Object.fromEntries(
    [...expected].map(([index, state]) => [
      FuseV1Options[index],
      state === enabled ? 'enabled' : 'disabled',
    ]),
  ),
}))
