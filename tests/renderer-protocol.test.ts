import { dirname, join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  MAER_RENDERER_ORIGIN,
  MAER_RENDERER_URL,
  resolveRendererAssetPath,
} from '../src/main/renderer-protocol'

describe('private MAER renderer protocol', () => {
  const root = resolve('C:\\MAER Chat\\out\\renderer')

  it('uses a dedicated secure origin instead of the generic file origin', () => {
    expect(MAER_RENDERER_ORIGIN).toBe('maer-chat://app')
    expect(MAER_RENDERER_URL).toBe('maer-chat://app/')
  })

  it.each([
    ['maer-chat://app/', join(root, 'index.html')],
    ['maer-chat://app/assets/index-ABC.js', join(root, 'assets', 'index-ABC.js')],
    ['maer-chat://app/curve25519_compiled.wasm?v=1', join(root, 'curve25519_compiled.wasm')],
  ])('maps a renderer asset without leaving its bundle: %s', (url, expected) => {
    expect(resolveRendererAssetPath(url, root)).toBe(expected)
  })

  it.each([
    'https://app/assets/index.js',
    'maer-chat://evil/assets/index.js',
    'maer-chat://user@app/assets/index.js',
    'maer-chat://app:42/assets/index.js',
    'maer-chat://app/%2e%2e/secret.txt',
    'maer-chat://app/%2e%2e%5csecret.txt',
    'maer-chat://app/%E0%A4%A',
  ])('rejects an untrusted or escaping renderer URL: %s', (url) => {
    expect(resolveRendererAssetPath(url, root)).toBeUndefined()
  })

  it('keeps the resolved asset inside the configured renderer directory', () => {
    const asset = resolveRendererAssetPath('maer-chat://app/assets/app.css', root)
    expect(asset).toBeDefined()
    expect(dirname(dirname(asset!))).toBe(root)
    expect(asset!.startsWith(root)).toBe(true)
  })
})
