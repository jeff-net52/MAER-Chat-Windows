import { copyFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import type { Plugin } from 'vite'

const FRENCH_CONVERSE_LOCALES = [
  'fr-LC_MESSAGES-converse-po.js',
  'dayjs/fr-js.js',
] as const

const CONVERSE_RUNTIME_ASSETS = [
  {
    source: ['curve25519_compiled.wasm'],
    target: ['curve25519_compiled.wasm'],
  },
  {
    source: ['emoji.json'],
    target: ['emoji.json'],
  },
  ...FRENCH_CONVERSE_LOCALES.map((locale) => ({
    source: ['chunkjs', 'locales', locale],
    target: ['assets', 'chunkjs', 'locales', locale],
  })),
] as const

function copyConverseRuntimeAssets(): Plugin {
  return {
    name: 'copy-converse-runtime-assets',
    writeBundle(output) {
      if (!output.dir) {
        throw new Error('Le répertoire de sortie du renderer est indisponible.')
      }
      for (const asset of CONVERSE_RUNTIME_ASSETS) {
        const source = resolve('node_modules', 'converse.js', 'dist', ...asset.source)
        const target = resolve(output.dir, ...asset.target)
        mkdirSync(dirname(target), { recursive: true })
        copyFileSync(source, target)
      }
    },
  }
}

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        output: {
          format: 'cjs',
          entryFileNames: 'index.js',
        },
      },
    },
  },
  renderer: {
    root: 'src/renderer',
    plugins: [copyConverseRuntimeAssets()],
    build: {
      rollupOptions: {
        input: 'src/renderer/index.html',
      },
    },
  },
})
