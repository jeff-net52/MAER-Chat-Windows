import { describe, expect, it } from 'vitest'
import {
  ClipboardLease,
  generatePassword,
  type ClipboardLeaseClock,
} from '../src/plugins/password-vault/main/password-tools'

class FakeClock implements ClipboardLeaseClock {
  private nextId = 1
  private readonly timers = new Map<number, () => void>()

  setTimeout(callback: () => void): ReturnType<typeof setTimeout> {
    const id = this.nextId++
    this.timers.set(id, callback)
    return id as unknown as ReturnType<typeof setTimeout>
  }

  clearTimeout(handle: ReturnType<typeof setTimeout>): void {
    this.timers.delete(handle as unknown as number)
  }

  fire(): void {
    for (const [id, callback] of [...this.timers]) {
      this.timers.delete(id)
      callback()
    }
  }
}

describe('Password Vault password tools', () => {
  it('generates bounded passwords with every required character family', () => {
    let counter = 0
    const generated = generatePassword(24, (maximum) => counter++ % maximum)

    expect(generated).toHaveLength(24)
    expect(generated).toMatch(/[a-z]/u)
    expect(generated).toMatch(/[A-Z]/u)
    expect(generated).toMatch(/[0-9]/u)
    expect(generated).toMatch(/[!@#$%&*+\-=?_]/u)
    expect(() => generatePassword(8)).toThrow(/longueur/i)
    expect(() => generatePassword(129)).toThrow(/longueur/i)
  })

  it('clears only the clipboard value owned by the expiring lease', () => {
    const clock = new FakeClock()
    let clipboard = ''
    const lease = new ClipboardLease(
      {
        writeText(value) { clipboard = value },
        readText() { return clipboard },
        clear() { clipboard = '' },
      },
      clock,
    )

    lease.copy('Transient-Secret-1')
    expect(clipboard).toBe('Transient-Secret-1')
    clock.fire()
    expect(clipboard).toBe('')

    lease.copy('Transient-Secret-2')
    clipboard = 'user copied something else'
    clock.fire()
    expect(clipboard).toBe('user copied something else')
  })

  it('purges an owned clipboard value immediately on shutdown', () => {
    const clock = new FakeClock()
    let clipboard = ''
    const lease = new ClipboardLease(
      {
        writeText(value) { clipboard = value },
        readText() { return clipboard },
        clear() { clipboard = '' },
      },
      clock,
    )
    lease.copy('Shutdown-Secret')

    lease.dispose()

    expect(clipboard).toBe('')
    clock.fire()
    expect(clipboard).toBe('')
  })
})
