import { NATIVE_VAULT_MAX_FRAME_BYTES } from './constants'

export class NativeMessageFrameError extends Error {
  constructor() {
    super('Invalid Native Messaging frame')
    this.name = 'NativeMessageFrameError'
  }
}

export class NativeMessageFrameDecoder {
  private pending = Buffer.alloc(0)

  push(chunk: Uint8Array): readonly Buffer[] {
    if (!(chunk instanceof Uint8Array) || chunk.byteLength === 0) return []
    const incoming = Buffer.from(chunk.buffer, chunk.byteOffset, chunk.byteLength)
    this.pending =
      this.pending.byteLength === 0
        ? Buffer.from(incoming)
        : Buffer.concat([this.pending, incoming], this.pending.byteLength + incoming.byteLength)

    const messages: Buffer[] = []
    while (this.pending.byteLength >= 4) {
      const length = this.pending.readUInt32LE(0)
      if (length === 0 || length > NATIVE_VAULT_MAX_FRAME_BYTES) {
        this.reset()
        throw new NativeMessageFrameError()
      }
      if (this.pending.byteLength < length + 4) {
        if (this.pending.byteLength > NATIVE_VAULT_MAX_FRAME_BYTES + 4) {
          this.reset()
          throw new NativeMessageFrameError()
        }
        break
      }
      messages.push(Buffer.from(this.pending.subarray(4, length + 4)))
      this.pending = Buffer.from(this.pending.subarray(length + 4))
    }
    return messages
  }

  finish(): void {
    if (this.pending.byteLength !== 0) {
      this.reset()
      throw new NativeMessageFrameError()
    }
  }

  reset(): void {
    this.pending.fill(0)
    this.pending = Buffer.alloc(0)
  }
}

export function encodeNativeMessage(value: unknown): Buffer {
  let serialized: string
  try {
    serialized = JSON.stringify(value)
  } catch {
    throw new NativeMessageFrameError()
  }
  const payload = Buffer.from(serialized, 'utf8')
  if (payload.byteLength === 0 || payload.byteLength > NATIVE_VAULT_MAX_FRAME_BYTES) {
    payload.fill(0)
    throw new NativeMessageFrameError()
  }
  const frame = Buffer.allocUnsafe(payload.byteLength + 4)
  frame.writeUInt32LE(payload.byteLength, 0)
  payload.copy(frame, 4)
  payload.fill(0)
  return frame
}

export function parseNativeMessageJson(payload: Uint8Array): unknown {
  if (!(payload instanceof Uint8Array) || payload.byteLength === 0) {
    throw new NativeMessageFrameError()
  }
  let decoded: string
  try {
    decoded = new TextDecoder('utf-8', { fatal: true }).decode(payload)
    return JSON.parse(decoded) as unknown
  } catch {
    throw new NativeMessageFrameError()
  }
}
