import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('renderer Content Security Policy', () => {
  const html = readFileSync(new URL('../src/renderer/index.html', import.meta.url), 'utf8')

  it('permits only the narrow WebAssembly capability required by Converse OMEMO', () => {
    expect(html).toContain("script-src 'self' 'wasm-unsafe-eval'")
    expect(html).not.toContain("script-src 'self' 'unsafe-eval'")
    expect(html).toContain("object-src 'none'")
    expect(html).toContain("frame-src 'none'")
  })
})

