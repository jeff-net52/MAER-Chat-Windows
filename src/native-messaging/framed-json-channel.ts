import type { Readable, Writable } from 'node:stream'
import {
  encodeNativeMessage,
  NativeMessageFrameDecoder,
  NativeMessageFrameError,
  parseNativeMessageJson,
} from './framing'

async function* framedJsonMessages(input: Readable): AsyncGenerator<unknown> {
  const decoder = new NativeMessageFrameDecoder()
  try {
    for await (const chunk of input) {
      if (!(chunk instanceof Uint8Array)) throw new NativeMessageFrameError()
      for (const payload of decoder.push(chunk)) {
        try {
          yield parseNativeMessageJson(payload)
        } finally {
          payload.fill(0)
        }
      }
    }
    decoder.finish()
  } finally {
    decoder.reset()
  }
}

function deadline<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1) return promise
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new NativeMessageFrameError()), timeoutMs)
    void promise.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (error: unknown) => {
        clearTimeout(timer)
        reject(error)
      },
    )
  })
}

export class FramedJsonChannel {
  private readonly iterator: AsyncIterator<unknown>
  private reading = false
  private writing = false

  constructor(
    input: Readable,
    private readonly output: Writable,
  ) {
    this.iterator = framedJsonMessages(input)[Symbol.asyncIterator]()
  }

  async read(timeoutMs = 0): Promise<unknown | undefined> {
    if (this.reading) throw new NativeMessageFrameError()
    this.reading = true
    try {
      const next = await deadline(this.iterator.next(), timeoutMs)
      return next.done ? undefined : next.value
    } finally {
      this.reading = false
    }
  }

  async write(value: unknown, timeoutMs = 0): Promise<void> {
    if (this.writing) throw new NativeMessageFrameError()
    this.writing = true
    const frame = encodeNativeMessage(value)
    try {
      await deadline(
        new Promise<void>((resolve, reject) => {
          this.output.write(frame, (error?: Error | null) => {
            if (error) reject(error)
            else resolve()
          })
        }),
        timeoutMs,
      )
    } finally {
      frame.fill(0)
      this.writing = false
    }
  }
}
