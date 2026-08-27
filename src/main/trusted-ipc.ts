import type { IpcMain, IpcMainInvokeEvent, WebContents, WebFrameMain } from 'electron'
import { pluginIpcChannel } from '../plugins/core/shared/plugin-contract'
import type { PluginIpcScope } from '../plugins/core/main/plugin-host'

type InvokeEvent = Pick<IpcMainInvokeEvent, 'sender' | 'senderFrame'>
type TrustedContents = Pick<WebContents, 'mainFrame'>

export interface TrustedRendererGuardOptions {
  expectedUrl: string
  getWebContents(): TrustedContents | undefined
}

export class TrustedRendererGuard {
  readonly #expectedUrl: URL
  readonly #getWebContents: () => TrustedContents | undefined

  constructor(options: TrustedRendererGuardOptions) {
    this.#expectedUrl = new URL(options.expectedUrl)
    this.#getWebContents = options.getWebContents
  }

  matchesExpectedUrl(rawUrl: string): boolean {
    try {
      const actual = new URL(rawUrl)
      return actual.href === this.#expectedUrl.href && actual.origin === this.#expectedUrl.origin
    } catch {
      return false
    }
  }

  isTrustedRequest(
    webContents: TrustedContents | null | undefined,
    isMainFrame: boolean,
    requestingUrl: string | undefined,
  ): boolean {
    const trusted = this.#getWebContents()
    return Boolean(
      trusted &&
        webContents === trusted &&
        isMainFrame &&
        typeof requestingUrl === 'string' &&
        this.matchesExpectedUrl(requestingUrl),
    )
  }

  assertTrustedIpc(event: InvokeEvent): void {
    const trusted = this.#getWebContents()
    const frame = event.senderFrame as WebFrameMain | null
    if (
      !trusted ||
      event.sender !== trusted ||
      !frame ||
      frame !== trusted.mainFrame ||
      !this.matchesExpectedUrl(frame.url)
    ) {
      throw new Error('Requête IPC refusée.')
    }
  }
}

type TrustedHandler<Arguments extends unknown[], Result> = (
  ...args: Arguments
) => Result | Promise<Result>

interface IpcMainLike {
  handle(channel: string, listener: (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown): void
  removeHandler(channel: string): void
}

export class TrustedIpcMain {
  readonly #ipcMain: IpcMainLike
  readonly #guard: TrustedRendererGuard
  readonly #channels = new Set<string>()

  constructor(ipcMain: Pick<IpcMain, 'handle' | 'removeHandler'>, guard: TrustedRendererGuard) {
    this.#ipcMain = ipcMain as IpcMainLike
    this.#guard = guard
  }

  handle<Arguments extends unknown[], Result>(
    channel: string,
    listener: TrustedHandler<Arguments, Result>,
  ): () => void {
    if (this.#channels.has(channel)) throw new Error(`Canal IPC déjà enregistré : ${channel}.`)
    this.#channels.add(channel)
    this.#ipcMain.handle(channel, (event, ...args) => {
      this.#guard.assertTrustedIpc(event)
      return listener(...(args as Arguments))
    })
    let active = true
    return () => {
      if (!active) return
      active = false
      this.#channels.delete(channel)
      this.#ipcMain.removeHandler(channel)
    }
  }

  createPluginScope(pluginId: string): PluginIpcScope {
    const disposers = new Set<() => void>()
    let active = true
    return {
      handle: (method, listener) => {
        if (!active) throw new Error(`Le scope IPC du plugin ${pluginId} est fermé.`)
        const dispose = this.handle(pluginIpcChannel(pluginId, method), listener)
        disposers.add(dispose)
      },
      dispose: () => {
        if (!active) return
        active = false
        for (const dispose of [...disposers].reverse()) dispose()
        disposers.clear()
      },
    }
  }

  dispose(): void {
    for (const channel of [...this.#channels]) this.#ipcMain.removeHandler(channel)
    this.#channels.clear()
  }
}
