import { createConnection, type Socket } from 'node:net'
import { Transform, type Readable } from 'node:stream'
import {
  NATIVE_VAULT_MAX_FRAME_BYTES,
  NATIVE_VAULT_SHIM_CONNECT_TIMEOUT_MS,
} from './constants'

const TRANSPORT_TOKEN = /^[a-f0-9]{32}$/u

export interface NativeMessagingShimTransport {
  input: Readable
  output: Socket
  close(): void
}

export interface NativeMessagingShimTransportOptions {
  timeoutMs?: number
  connect?: (path: string) => Socket
}

export function nativeMessagingShimPipePaths(token: string): Readonly<{
  input: string
  output: string
}> {
  if (!TRANSPORT_TOKEN.test(token)) {
    throw new Error('Invalid Native Messaging shim transport')
  }
  return Object.freeze({
    input: `\\\\.\\pipe\\maer-chat-native-in-${token}`,
    output: `\\\\.\\pipe\\maer-chat-native-out-${token}`,
  })
}

function connectPipe(
  path: string,
  timeoutMs: number,
  connect: (path: string) => Socket,
): Promise<Socket> {
  return new Promise<Socket>((resolve, reject) => {
    const socket = connect(path)
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
    const timer = setTimeout(() => {
      cleanup()
      socket.destroy()
      reject(new Error('Native Messaging shim transport timed out'))
    }, timeoutMs)
    socket.once('connect', onConnect)
    socket.once('error', onError)
  })
}

class ShimInputTransform extends Transform {
  private buffered = Buffer.alloc(0)
  private endMarkerReceived = false

  override _transform(
    chunk: Buffer,
    _encoding: BufferEncoding,
    callback: (error?: Error | null) => void,
  ): void {
    try {
      if (this.endMarkerReceived || !(chunk instanceof Uint8Array)) {
        throw new Error('Invalid Native Messaging shim transport')
      }
      this.buffered = Buffer.concat([this.buffered, chunk])
      while (this.buffered.byteLength >= 4) {
        const length = this.buffered.readUInt32LE(0)
        if (length === 0) {
          if (this.buffered.byteLength !== 4) {
            throw new Error('Invalid Native Messaging shim end marker')
          }
          this.buffered.fill(0)
          this.buffered = Buffer.alloc(0)
          this.endMarkerReceived = true
          this.push(null)
          callback()
          return
        }
        if (length > NATIVE_VAULT_MAX_FRAME_BYTES) {
          throw new Error('Invalid Native Messaging shim frame')
        }
        const frameLength = length + 4
        if (this.buffered.byteLength < frameLength) break
        const frame = Buffer.from(this.buffered.subarray(0, frameLength))
        const remaining = Buffer.from(this.buffered.subarray(frameLength))
        this.buffered.fill(0)
        this.buffered = remaining
        this.push(frame)
      }
      callback()
    } catch (error) {
      this.buffered.fill(0)
      this.buffered = Buffer.alloc(0)
      callback(error as Error)
    }
  }

  override _flush(callback: (error?: Error | null) => void): void {
    this.buffered.fill(0)
    this.buffered = Buffer.alloc(0)
    callback(
      this.endMarkerReceived
        ? undefined
        : new Error('Native Messaging shim transport ended without a marker'),
    )
  }
}

export async function connectNativeMessagingShimTransport(
  token: string,
  options: NativeMessagingShimTransportOptions = {},
): Promise<NativeMessagingShimTransport> {
  const paths = nativeMessagingShimPipePaths(token)
  const timeoutMs = options.timeoutMs ?? NATIVE_VAULT_SHIM_CONNECT_TIMEOUT_MS
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 30_000) {
    throw new Error('Invalid Native Messaging shim timeout')
  }
  const connect = options.connect ?? ((path: string) => createConnection(path))
  let inputSocket: Socket | undefined
  let input: ShimInputTransform | undefined
  let output: Socket | undefined
  try {
    inputSocket = await connectPipe(paths.input, timeoutMs, connect)
    output = await connectPipe(paths.output, timeoutMs, connect)
    input = inputSocket.pipe(new ShimInputTransform())
    return {
      input,
      output,
      close() {
        inputSocket?.destroy()
        input?.destroy()
        output?.destroy()
      },
    }
  } catch (error) {
    inputSocket?.destroy()
    input?.destroy()
    output?.destroy()
    throw error
  }
}
