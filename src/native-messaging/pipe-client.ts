import { createConnection, type Socket } from 'node:net'
import {
  NATIVE_VAULT_CONNECT_TIMEOUT_MS,
  NATIVE_VAULT_REQUEST_TIMEOUT_MS,
} from './constants'
import { FramedJsonChannel } from './framed-json-channel'
import { authenticateNativeVaultClient } from './ipc-auth'
import {
  createWindowsNativeVaultIpcKeyStore,
  type NativeVaultIpcKeyStore,
} from './ipc-key-store'
import { nativeVaultPipePath } from './pipe-name'
import {
  createNativeVaultPipeRequest,
  parseNativeVaultPipeResponse,
} from './pipe-protocol'
import {
  scrubNativeVaultSecrets,
  type NativeVaultRequest,
  type NativeVaultResponse,
} from './protocol'

export interface NativeVaultRequestTransport {
  request(request: NativeVaultRequest): Promise<NativeVaultResponse>
  close(): void
}

export interface NativeVaultPipeClientOptions {
  pipePath?: string
  keyStore?: NativeVaultIpcKeyStore
  connectTimeoutMs?: number
  requestTimeoutMs?: number
  connect?: (path: string) => Socket
}

function connectSocket(
  pipePath: string,
  timeoutMs: number,
  connect: (path: string) => Socket,
): Promise<Socket> {
  return new Promise<Socket>((resolve, reject) => {
    const socket = connect(pipePath)
    const timer = setTimeout(() => {
      cleanup()
      socket.destroy()
      reject(new Error('Native vault pipe connection timed out'))
    }, timeoutMs)
    const cleanup = (): void => {
      clearTimeout(timer)
      socket.removeListener('connect', onConnect)
      socket.removeListener('error', onError)
    }
    const onConnect = (): void => {
      cleanup()
      socket.setNoDelay(true)
      resolve(socket)
    }
    const onError = (error: Error): void => {
      cleanup()
      socket.destroy()
      reject(error)
    }
    socket.once('connect', onConnect)
    socket.once('error', onError)
  })
}

class AuthenticatedNativeVaultPipeClient implements NativeVaultRequestTransport {
  private sequence = 0
  private busy = false
  private closed = false

  constructor(
    private readonly socket: Socket,
    private readonly channel: FramedJsonChannel,
    private readonly requestTimeoutMs: number,
  ) {}

  async request(request: NativeVaultRequest): Promise<NativeVaultResponse> {
    if (this.closed || this.busy) throw new Error('Native vault pipe is unavailable')
    this.busy = true
    this.sequence += 1
    if (!Number.isSafeInteger(this.sequence)) {
      this.close()
      throw new Error('Native vault pipe sequence exhausted')
    }
    const pipeRequest = createNativeVaultPipeRequest(request, this.sequence)
    try {
      await this.channel.write(pipeRequest, this.requestTimeoutMs)
      const response = parseNativeVaultPipeResponse(
        await this.channel.read(this.requestTimeoutMs),
        this.sequence,
        request,
      )
      return response.response
    } catch (error) {
      this.close()
      throw error
    } finally {
      scrubNativeVaultSecrets(pipeRequest)
      this.busy = false
    }
  }

  close(): void {
    if (this.closed) return
    this.closed = true
    this.socket.destroy()
  }
}

export async function connectAuthenticatedNativeVaultPipe(
  options: NativeVaultPipeClientOptions = {},
): Promise<NativeVaultRequestTransport> {
  const keyStore = options.keyStore ?? createWindowsNativeVaultIpcKeyStore()
  const secret = await keyStore.load()
  if (!secret) throw new Error('Native vault IPC credential is unavailable')

  let socket: Socket | undefined
  try {
    socket = await connectSocket(
      options.pipePath ?? nativeVaultPipePath(),
      options.connectTimeoutMs ?? NATIVE_VAULT_CONNECT_TIMEOUT_MS,
      options.connect ?? ((path) => createConnection(path)),
    )
    const channel = new FramedJsonChannel(socket, socket)
    await authenticateNativeVaultClient(channel, secret)
    return new AuthenticatedNativeVaultPipeClient(
      socket,
      channel,
      options.requestTimeoutMs ?? NATIVE_VAULT_REQUEST_TIMEOUT_MS,
    )
  } catch (error) {
    socket?.destroy()
    throw error
  } finally {
    secret.fill(0)
  }
}
