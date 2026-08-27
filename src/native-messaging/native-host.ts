import type { Readable, Writable } from 'node:stream'
import { NATIVE_VAULT_REQUEST_TIMEOUT_MS } from './constants'
import { FramedJsonChannel } from './framed-json-channel'
import {
  connectAuthenticatedNativeVaultPipe,
  type NativeVaultRequestTransport,
} from './pipe-client'
import {
  nativeVaultFailure,
  NativeVaultProtocolError,
  parseNativeVaultRequest,
  scrubNativeVaultSecrets,
} from './protocol'

export interface NativeMessagingHostOptions {
  input: Readable
  output: Writable
  connect?: () => Promise<NativeVaultRequestTransport>
  responseTimeoutMs?: number
}

/**
 * Runs the stdio proxy. The caller must validate the browser launch arguments
 * before invoking this function. It never logs to stdout; stdout contains only
 * length-prefixed protocol frames.
 */
export async function runNativeMessagingHost(
  options: NativeMessagingHostOptions,
): Promise<void> {
  const transport = await (options.connect ?? connectAuthenticatedNativeVaultPipe)()
  const channel = new FramedJsonChannel(options.input, options.output)
  const timeoutMs = options.responseTimeoutMs ?? NATIVE_VAULT_REQUEST_TIMEOUT_MS
  try {
    while (true) {
      const raw = await channel.read()
      if (raw === undefined) return

      let request
      try {
        request = parseNativeVaultRequest(raw)
      } catch (error) {
        scrubNativeVaultSecrets(raw)
        if (error instanceof NativeVaultProtocolError && error.correlation) {
          await channel.write(
            nativeVaultFailure(error.correlation, 'INVALID_REQUEST'),
            timeoutMs,
          )
          continue
        }
        throw error
      }

      let response
      try {
        response = await transport.request(request)
      } catch {
        response = nativeVaultFailure(request, 'LOCKED')
        await channel.write(response, timeoutMs)
        scrubNativeVaultSecrets(request)
        scrubNativeVaultSecrets(response)
        return
      }

      try {
        await channel.write(response, timeoutMs)
      } finally {
        scrubNativeVaultSecrets(request)
        scrubNativeVaultSecrets(response)
      }
    }
  } finally {
    transport.close()
  }
}
