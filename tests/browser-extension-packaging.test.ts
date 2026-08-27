import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const repository = resolve(import.meta.dirname, '..')

function readJson(path: string): Record<string, unknown> {
  return JSON.parse(readFileSync(resolve(repository, path), 'utf8')) as Record<string, unknown>
}

describe('browser-extension autonomous packaging', () => {
  it('regenerates both extensions before every root build', () => {
    const packageJson = readJson('package.json') as {
      scripts: Record<string, string>
    }
    expect(packageJson.scripts['build:browser-extensions']).toBe(
      'npm --prefix browser-extensions/maer-password-vault run build',
    )
    expect(packageJson.scripts.build?.split(' && ')[0]).toBe(
      'npm run build:browser-extensions',
    )

    const builder = readFileSync(
      resolve(
        repository,
        'browser-extensions/maer-password-vault/scripts/build.mjs',
      ),
      'utf8',
    )
    expect(builder).toContain('await rm(distributionDirectory, { recursive: true, force: true })')
    expect(builder).toContain("for (const target of ['chromium', 'firefox'])")
  })

  it('embeds only generated Chromium/Firefox trees and the installation guide', () => {
    const packageJson = readJson('package.json') as {
      build: { extraResources: Array<Record<string, unknown>> }
    }
    expect(packageJson.build.extraResources).toContainEqual({
      from: 'browser-extensions/maer-password-vault/dist',
      to: 'browser-extensions/maer-password-vault/dist',
      filter: ['chromium/**/*', 'firefox/**/*'],
    })
    expect(packageJson.build.extraResources).toContainEqual({
      from: 'browser-extensions/maer-password-vault/docs/installation.md',
      to: 'browser-extensions/maer-password-vault/installation.md',
    })

    const extensionMappings = packageJson.build.extraResources.filter(({ to }) =>
      typeof to === 'string' && to.startsWith('browser-extensions/maer-password-vault'),
    )
    expect(JSON.stringify(extensionMappings)).not.toMatch(/packages|tests|\/src(?:["/])/u)
  })

  it('documents explicit Edge, Chrome and Firefox installation paths', () => {
    const guide = readFileSync(
      resolve(
        repository,
        'browser-extensions/maer-password-vault/docs/installation.md',
      ),
      'utf8',
    )
    for (const instruction of [
      'edge://extensions',
      'chrome://extensions',
      'about:debugging#/runtime/this-firefox',
      'dist/chromium',
      'dist/firefox/manifest.json',
    ]) {
      expect(guide).toContain(instruction)
    }
  })
})
