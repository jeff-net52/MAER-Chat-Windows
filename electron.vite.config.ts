import { copyFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import type { Plugin } from 'vite'

const FRENCH_CONVERSE_LOCALES = [
  'fr-LC_MESSAGES-converse-po.js',
  'dayjs/fr-js.js',
] as const

function copyConverseFrenchLocale(): Plugin {
  return {
    name: 'copy-converse-french-locale',
    writeBundle(output) {
      if (!output.dir) {
        throw new Error('Le répertoire de sortie du renderer est indisponible.')
      }
      for (const locale of FRENCH_CONVERSE_LOCALES) {
        const source = resolve(
          'node_modules',
          'converse.js',
          'dist',
          'chunkjs',
          'locales',
          locale,
        )
        const target = resolve(
          output.dir,
          'assets',
          'chunkjs',
          'locales',
          locale,
        )
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
    plugins: [copyConverseFrenchLocale()],
    build: {
      rollupOptions: {
        input: 'src/renderer/index.html',
      },
    },
  },
})
