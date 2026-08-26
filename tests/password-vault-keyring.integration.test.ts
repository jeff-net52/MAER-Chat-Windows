import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'

const enabled = process.env.MAER_CHAT_TEST_WINDOWS_KEYRING === '1'

describe.runIf(enabled)('Windows keyring binary integration (opt-in)', () => {
  it('round-trips a binary secret through an isolated test credential', async () => {
    const { AsyncEntry } = await import('@napi-rs/keyring')
    const entry = new AsyncEntry(
      'MAER Chat Password Vault Integration Test',
      `vitest-${randomUUID()}`,
    )
    const secret = new Uint8Array(32).fill(0xa5)
    try {
      await entry.setSecret(secret)
      await expect(entry.getSecret()).resolves.toEqual(secret)
    } finally {
      secret.fill(0)
      await entry.deleteCredential().catch(() => false)
    }
  })
})
