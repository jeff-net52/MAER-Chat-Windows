import { createServer, type Server, type Socket } from 'node:net'
import { describe, expect, it } from 'vitest'
import {
  connectNativeMessagingShimTransport,
  nativeMessagingShimPipePaths,
} from '../src/native-messaging/shim-transport'

function listen(server: Server, path: string): Promise<void> {
  return new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(path, () => resolve())
  })
}

describe('Native Messaging shim transport', () => {
  it('uses two directionally separate, token-bound pipe names', () => {
    const token = '1'.repeat(32)
    expect(nativeMessagingShimPipePaths(token)).toEqual({
      input: `\\\\.\\pipe\\maer-chat-native-in-${token}`,
      output: `\\\\.\\pipe\\maer-chat-native-out-${token}`,
    })
    expect(() => nativeMessagingShimPipePaths('../invalid')).toThrow()
  })

  it.runIf(process.platform === 'win32')(
    'connects both bounded local channels and closes them together',
    async () => {
      const token = '2'.repeat(32)
      const paths = nativeMessagingShimPipePaths(token)
      const peers: Socket[] = []
      const inputServer = createServer((socket) => peers.push(socket))
      const outputServer = createServer((socket) => peers.push(socket))
      await Promise.all([
        listen(inputServer, paths.input),
        listen(outputServer, paths.output),
      ])
      try {
        const transport = await connectNativeMessagingShimTransport(token, {
          timeoutMs: 500,
        })
        expect(transport.input.destroyed).toBe(false)
        expect(transport.output.destroyed).toBe(false)
        transport.close()
        expect(transport.input.destroyed).toBe(true)
        expect(transport.output.destroyed).toBe(true)
      } finally {
        for (const peer of peers) peer.destroy()
        await Promise.all([
          new Promise<void>((resolve) => inputServer.close(() => resolve())),
          new Promise<void>((resolve) => outputServer.close(() => resolve())),
        ])
      }
    },
  )
})
