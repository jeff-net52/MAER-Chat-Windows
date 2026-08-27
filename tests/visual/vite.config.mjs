import { defineConfig } from 'vite'
import { resolve } from 'node:path'

export default defineConfig({
  publicDir: resolve(import.meta.dirname, '../../src/renderer/public'),
  // Converse's pre-built runtime contains a webpack dynamic-chunk loader.
  // Serving that verified distribution directly mirrors the renderer build;
  // Vite's dependency optimizer otherwise tries to crawl every locale, map,
  // sound and WASM asset as JavaScript.
  optimizeDeps: {
    exclude: ['converse.js'],
  },
})
