import { createServer, type Server, type Socket } from 'node:net'
import { NATIVE_VAULT_REQUEST_TIMEOUT_MS } from './constants'
import { FramedJsonChannel } from './framed-json-channel'
import { authenticateNativeVaultServer } from './ipc-auth'
import {
  createWindowsNativeVaultIpcKeyStore,
  type NativeVaultIpcKeyStore,
} from './ipc-key-store'
import type { NativeVaultOperations } from './operations'
import { nativeVaultPipePath } from './pipe-name'
import {
  createNativeVaultPipeResponse,
  parseNativeVaultPipeRequest,
} from './pipe-protocol'
import {
  dispatchNativeVaultRequest,
  scrubNativeVaultSecrets,
} from './protocol'

export interface NativeVaultPipeServerOptions {
  operations: NativeVaultOperations
  pipePath?: string
  keyStore?: NativeVaultIpcKeyStore
  requestTimeoutMs?: number
  maximumConnections?: number
}

function listen(server: Server, pipePath: string): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const cleanup = (): void => {
      server.removeListener('listening', onListening)
      server.removeListener('error', onError)
    }
    const onListening = (): void => {
      cleanup()
      resolve()
    }
    const onError = (error: Error): void => {
      cleanup()
      reject(error)
    }
    server.once('listening', onListening)
    server.once('error', onError)
    server.listen({
      path: pipePath,
      exclusive: true,
      readableAll: false,
      writableAll: false,
    })
  })
}

export class NativeVaultPipeServer {
  private readonly keyStore: NativeVaultIpcKeyStore
  private readonly pipePath: string
  private readonly requestTimeoutMs: number
  private readonly maximumConnections: number
  private readonly sockets = new Set<Socket>()
  private server: Server | undefined

  constructor(private readonly options: NativeVaultPipeServerOptions) {
    this.keyStore = options.keyStore ?? createWindowsNativeVaultIpcKeyStore()
    this.pipePath = options.pipePath ?? nativeVaultPipePath()
    this.requestTimeoutMs = options.requestTimeoutMs ?? NATIVE_VAULT_REQUEST_TIMEOUT_MS
    this.maximumConnections = options.maximumConnections ?? 8
    if (
      !Number.isSafeInteger(this.maximumConnections) ||
      this.maximumConnections < 1 ||
      this.maximumConnections > 32
    ) {
      throw new Error('Invalid native vault connection limit')
    }
  }

  async start(): Promise<void> {
    if (this.server) throw new Error('Native vault pipe server is already started')
    await this.keyStore.ensure()
    const server = createServer((socket) => this.accept(socket))
    this.server = server
    try {
      await listen(server, this.pipePath)
    } catch (error) {
      this.server = undefined
      server.close()
      throw error
    }
  }

  async stop(): Promise<void> {
    const server = this.server
    this.server = undefined
    for (const socket of this.sockets) socket.destroy()
    this.sockets.clear()
    if (!server) return
    await new Promise<void>((resolve) => server.close(() => resolve()))
  }

  private accept(socket: Socket): void {
    if (!this.server || this.sockets.size >= this.maximumConnections) {
      socket.destroy()
      return
    }
    this.sockets.add(socket)
    socket.setNoDelay(true)
    void this.handle(socket)
      .catch(() => socket.destroy())
      .finally(() => {
        this.sockets.delete(socket)
        socket.destroy()
      })
  }

  private async handle(socket: Socket): Promise<void> {
    const secret = await this.keyStore.load()
    if (!secret) throw new Error('Native vault IPC credential is unavailable')
    const channel = new FramedJsonChannel(socket, socket)
    try {
      await authenticateNativeVaultServer(channel, secret)
    } finally {
      secret.fill(0)
    }

    let expectedSequence = 1
    while (!socket.destroyed) {
      const value = await channel.read()
      if (value === undefined) return
      const request = parseNativeVaultPipeRequest(value)
      if (request.sequence !== expectedSequence) {
        throw new Error('Invalid native vault pipe sequence')
      }
      expectedSequence += 1
      const response = await dispatchNativeVaultRequest(
        this.options.operations,
        request.request,
      )
      const pipeResponse = createNativeVaultPipeResponse(response, request.sequence)
      try {
        await channel.write(pipeResponse, this.requestTimeoutMs)
      } finally {
        scrubNativeVaultSecrets(request)
        scrubNativeVaultSecrets(pipeResponse)
      }
    }
  }
}
