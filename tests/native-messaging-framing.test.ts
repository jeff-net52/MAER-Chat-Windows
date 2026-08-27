import { PassThrough } from 'node:stream'
import { describe, expect, it } from 'vitest'
import { FramedJsonChannel } from '../src/native-messaging/framed-json-channel'
import {
  encodeNativeMessage,
  NativeMessageFrameDecoder,
  NativeMessageFrameError,
  parseNativeMessageJson,
} from '../src/native-messaging/framing'

describe('Native Messaging framing', () => {
  it('uses a 32-bit little-endian UTF-8 byte length', () => {
    const frame = encodeNativeMessage({ value: 'é' })
    const payload = frame.subarray(4)
    expect(frame.readUInt32LE(0)).toBe(payload.byteLength)
    expect(parseNativeMessageJson(payload)).toEqual({ value: 'é' })
    frame.fill(0)
  })

  it('decodes fragmented and coalesced frames', () => {
    const first = encodeNativeMessage({ value: 1 })
    const second = encodeNativeMessage({ value: 2 })
    const all = Buffer.concat([first, second])
    const decoder = new NativeMessageFrameDecoder()
    expect(decoder.push(all.subarray(0, 3))).toEqual([])
    const messages = decoder.push(all.subarray(3))
    expect(messages.map(parseNativeMessageJson)).toEqual([{ value: 1 }, { value: 2 }])
    decoder.finish()
    for (const message of messages) message.fill(0)
    first.fill(0)
    second.fill(0)
    all.fill(0)
  })

  it('rejects zero, oversized, truncated, and invalid UTF-8 frames', () => {
    const zero = Buffer.alloc(4)
    expect(() => new NativeMessageFrameDecoder().push(zero)).toThrow(
      NativeMessageFrameError,
    )
    const oversized = Buffer.alloc(4)
    oversized.writeUInt32LE(65_537)
    expect(() => new NativeMessageFrameDecoder().push(oversized)).toThrow(
      NativeMessageFrameError,
    )
    const truncated = new NativeMessageFrameDecoder()
    const header = Buffer.alloc(4)
    header.writeUInt32LE(10)
    truncated.push(Buffer.concat([header, Buffer.from('{}')]))
    expect(() => truncated.finish()).toThrow(NativeMessageFrameError)
    expect(() => parseNativeMessageJson(Buffer.from([0xff]))).toThrow(
      NativeMessageFrameError,
    )
  })

  it('writes only framed JSON to the configured output', async () => {
    const input = new PassThrough()
    const output = new PassThrough()
    const written: Buffer[] = []
    output.on('data', (chunk: Buffer) => written.push(Buffer.from(chunk)))
    const channel = new FramedJsonChannel(input, output)
    await channel.write({ ok: true })
    const frame = Buffer.concat(written)
    expect(frame.readUInt32LE(0)).toBe(frame.byteLength - 4)
    expect(parseNativeMessageJson(frame.subarray(4))).toEqual({ ok: true })
    frame.fill(0)
  })
})
