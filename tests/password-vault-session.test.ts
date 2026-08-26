import { afterEach, describe, expect, it } from 'vitest'
import {
  PASSWORD_VAULT_IDLE_TIMEOUT_MS,
  PasswordVaultSessionError,
  VaultSession,
  type VaultDatabaseLifecycle,
  type VaultPowerLockSource,
  type VaultSessionClock,
  type VaultSessionKeyStore,
  type VaultSessionStorage,
  type VaultTimerHandle,
} from '../src/plugins/password-vault/main/vault-session'

interface FakeDatabase {
  entries: number
  disposed: boolean
}

class FakeKeyStore implements VaultSessionKeyStore {
  value: Uint8Array | undefined
  lastIssued: Uint8Array | undefined

  async load(): Promise<Uint8Array | undefined> {
    this.lastIssued = this.value?.slice()
    return this.lastIssued
  }

  async create(): Promise<Uint8Array> {
    if (this.value) throw new Error('already created')
    this.value = new Uint8Array(32).fill(0x51)
    this.lastIssued = this.value.slice()
    return this.lastIssued
  }
}

class FakeStorage implements VaultSessionStorage<FakeDatabase> {
  stored: FakeDatabase | undefined
  hasExtraArtifact = false
  writes = 0
  failWrite = false

  async hasArtifacts(): Promise<boolean> {
    return this.stored !== undefined || this.hasExtraArtifact
  }

  async recover(): Promise<FakeDatabase | undefined> {
    return this.stored
      ? { entries: this.stored.entries, disposed: false }
      : undefined
  }

  async write(value: FakeDatabase): Promise<void> {
    this.writes += 1
    if (this.failWrite) throw new Error('simulated storage failure')
    this.stored = { entries: value.entries, disposed: false }
  }
}

class FakePowerMonitor implements VaultPowerLockSource {
  private readonly listeners = new Map<'lock-screen' | 'suspend', Set<() => void>>([
    ['lock-screen', new Set()],
    ['suspend', new Set()],
  ])

  on(event: 'lock-screen' | 'suspend', listener: () => void): this {
    this.listeners.get(event)?.add(listener)
    return this
  }

  removeListener(event: 'lock-screen' | 'suspend', listener: () => void): this {
    this.listeners.get(event)?.delete(listener)
    return this
  }

  emit(event: 'lock-screen' | 'suspend'): void {
    for (const listener of this.listeners.get(event) ?? []) listener()
  }

  listenerCount(event: 'lock-screen' | 'suspend'): number {
    return this.listeners.get(event)?.size ?? 0
  }
}

class FakeClock implements VaultSessionClock {
  private time = 0
  private nextId = 1
  private readonly timers = new Map<number, { at: number; callback: () => void }>()

  now(): number {
    return this.time
  }

  setTimeout(callback: () => void, delayMs: number): VaultTimerHandle {
    const id = this.nextId
    this.nextId += 1
    this.timers.set(id, { at: this.time + delayMs, callback })
    return id as unknown as VaultTimerHandle
  }

  clearTimeout(handle: VaultTimerHandle): void {
    this.timers.delete(handle as unknown as number)
  }

  advance(milliseconds: number): void {
    this.time += milliseconds
    const due = [...this.timers.entries()]
      .filter(([, timer]) => timer.at <= this.time)
      .sort((left, right) => left[1].at - right[1].at)
    for (const [id, timer] of due) {
      this.timers.delete(id)
      timer.callback()
    }
  }
}

const lifecycle: VaultDatabaseLifecycle<FakeDatabase> = {
  async create() {
    return { entries: 0, disposed: false }
  },
  entryCount(database) {
    return database.entries
  },
  dispose(database) {
    database.entries = 0
    database.disposed = true
  },
}

interface TestContext {
  session: VaultSession<FakeDatabase>
  keys: FakeKeyStore
  storage: FakeStorage
  power: FakePowerMonitor
  clock: FakeClock
}

const sessions: VaultSession<FakeDatabase>[] = []

function createContext(): TestContext {
  const keys = new FakeKeyStore()
  const storage = new FakeStorage()
  const power = new FakePowerMonitor()
  const clock = new FakeClock()
  const session = new VaultSession({
    keyStore: keys,
    storage,
    lifecycle,
    powerMonitor: power,
    clock,
  })
  sessions.push(session)
  return { session, keys, storage, power, clock }
}

afterEach(async () => {
  await Promise.all(sessions.splice(0).map((session) => session.dispose()))
})

describe('Password Vault main-process session', () => {
  it('starts locked and initializes into a fresh epoch', async () => {
    const { session, storage } = createContext()
    await expect(session.snapshot()).resolves.toEqual({
      state: 'locked',
      entryCount: null,
      epoch: 0,
    })

    const initialized = await session.initialize()

    expect(initialized.state).toBe('unlocked')
    expect(initialized.entryCount).toBe(0)
    expect(initialized.epoch).toBeGreaterThan(0)
    expect(storage.writes).toBe(1)
  })

  it('uses a five-minute idle timeout and zeroes the retained key when it locks', async () => {
    const { session, keys, clock } = createContext()
    const initialized = await session.initialize()
    const retainedKey = keys.lastIssued
    expect(PASSWORD_VAULT_IDLE_TIMEOUT_MS).toBe(300_000)

    clock.advance(PASSWORD_VAULT_IDLE_TIMEOUT_MS - 1)
    await expect(session.snapshot()).resolves.toMatchObject({ state: 'unlocked' })
    clock.advance(1)

    const locked = await session.snapshot()
    expect(locked.state).toBe('locked')
    expect(locked.entryCount).toBeNull()
    expect(locked.epoch).toBeGreaterThan(initialized.epoch)
    expect(retainedKey).toEqual(new Uint8Array(32))
  })

  it('refreshes activity only through an authenticated epoch operation', async () => {
    const { session, clock } = createContext()
    const { epoch } = await session.initialize()
    clock.advance(240_000)
    await expect(session.inspect(epoch, (database) => database.entries)).resolves.toBe(0)
    clock.advance(240_000)
    await expect(session.snapshot()).resolves.toMatchObject({ state: 'unlocked' })
    clock.advance(60_000)
    await expect(session.snapshot()).resolves.toMatchObject({ state: 'locked' })
  })

  it.each(['lock-screen', 'suspend'] as const)(
    'locks and advances the epoch on powerMonitor %s',
    async (event) => {
      const { session, power, keys } = createContext()
      const initialized = await session.initialize()
      const retainedKey = keys.lastIssued

      power.emit(event)

      await expect(session.snapshot()).resolves.toMatchObject({
        state: 'locked',
        entryCount: null,
        epoch: expect.any(Number),
      })
      expect((await session.snapshot()).epoch).toBeGreaterThan(initialized.epoch)
      expect(retainedKey).toEqual(new Uint8Array(32))
    },
  )

  it('serializes mutations and rejects stale epochs after relocking', async () => {
    const { session } = createContext()
    const { epoch } = await session.initialize()
    let releaseFirst: (() => void) | undefined
    let firstStartedResolve: (() => void) | undefined
    const firstStarted = new Promise<void>((resolve) => {
      firstStartedResolve = resolve
    })
    const gate = new Promise<void>((resolve) => {
      releaseFirst = resolve
    })
    const order: string[] = []

    const first = session.mutate(epoch, async (database) => {
      order.push('first-start')
      firstStartedResolve?.()
      await gate
      database.entries += 1
      order.push('first-end')
    })
    const second = session.mutate(epoch, (database) => {
      order.push('second-start')
      database.entries += 1
    })
    await firstStarted
    expect(order).toEqual(['first-start'])
    releaseFirst?.()
    await Promise.all([first, second])
    expect(order).toEqual(['first-start', 'first-end', 'second-start'])
    await expect(session.snapshot()).resolves.toMatchObject({ entryCount: 2 })

    await session.lock()
    await expect(session.inspect(epoch, () => 0)).rejects.toMatchObject({
      code: 'stale-epoch',
    })
  })

  it('locks and wipes state when a mutation or its durable write fails', async () => {
    const { session, storage, keys } = createContext()
    const { epoch } = await session.initialize()
    const retainedKey = keys.lastIssued
    storage.failWrite = true

    await expect(
      session.mutate(epoch, (database) => {
        database.entries += 1
      }),
    ).rejects.toThrow(/storage failure/i)

    await expect(session.snapshot()).resolves.toMatchObject({
      state: 'locked',
      entryCount: null,
    })
    expect(retainedKey).toEqual(new Uint8Array(32))
  })

  it('cancels an in-flight mutation when a power lock is requested', async () => {
    const { session, storage, power } = createContext()
    const { epoch } = await session.initialize()
    const writesBeforeMutation = storage.writes
    let release: (() => void) | undefined
    let startedResolve: (() => void) | undefined
    const started = new Promise<void>((resolve) => {
      startedResolve = resolve
    })
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const mutation = session.mutate(epoch, async (database) => {
      startedResolve?.()
      await gate
      database.entries += 1
    })
    await started

    power.emit('lock-screen')
    release?.()

    await expect(mutation).rejects.toMatchObject({ code: 'locked' })
    await expect(session.snapshot()).resolves.toMatchObject({ state: 'locked' })
    expect(storage.writes).toBe(writesBeforeMutation)
  })

  it('reports uninitialized and recovery-required states without creating fallback keys', async () => {
    const empty = createContext()
    await expect(empty.session.unlock()).rejects.toMatchObject({ code: 'uninitialized' })
    await expect(empty.session.snapshot()).resolves.toMatchObject({ state: 'uninitialized' })

    const orphan = createContext()
    orphan.storage.hasExtraArtifact = true
    await expect(orphan.session.unlock()).rejects.toMatchObject({
      code: 'recovery-required',
    })
    await expect(orphan.session.snapshot()).resolves.toMatchObject({
      state: 'recovery-required',
    })
  })

  it('removes powerMonitor listeners and stays locked on disposal', async () => {
    const { session, power } = createContext()
    await session.initialize()
    expect(power.listenerCount('lock-screen')).toBe(1)
    expect(power.listenerCount('suspend')).toBe(1)

    await session.dispose()

    expect(power.listenerCount('lock-screen')).toBe(0)
    expect(power.listenerCount('suspend')).toBe(0)
    await expect(session.snapshot()).rejects.toBeInstanceOf(PasswordVaultSessionError)
  })
})
