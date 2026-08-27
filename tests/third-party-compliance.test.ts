import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = resolve(import.meta.dirname, '..')

describe('public open-source release metadata', () => {
  it('keeps runtime notices and pinned corresponding-source metadata synchronized', () => {
    const output = execFileSync(
      process.execPath,
      ['scripts/verify-third-party-compliance.mjs'],
      {
        cwd: root,
        encoding: 'utf8',
        windowsHide: true,
      },
    )
    expect(JSON.parse(output)).toMatchObject({
      ok: true,
      runtimeComponents: 67,
      correspondingSources: ['converse.js@14.0.0', 'libomemo.js@2.0.2'],
    })
  })

  it('uses immutable source revisions instead of a floating branch', () => {
    const lock = JSON.parse(
      readFileSync(
        resolve(root, 'THIRD_PARTY_LICENSES/corresponding-sources.lock.json'),
        'utf8',
      ),
    ) as {
      components: Array<{
        name: string
        npm: { integrity: string; gitHead: string }
        source?: { commit: string }
      }>
    }
    for (const component of lock.components) {
      expect(component.npm.integrity).toMatch(/^sha512-[A-Za-z0-9+/]+={0,2}$/u)
      expect(component.npm.gitHead).toMatch(/^[a-f0-9]{40}$/u)
    }
    const libomemo = lock.components.find((component) => component.name === 'libomemo.js')
    expect(libomemo?.source?.commit).toBe(libomemo?.npm.gitHead)
  })

  it('verifies the license layout of the unpacked Windows application in CI', () => {
    const workflow = readFileSync(
      resolve(root, '.github/workflows/windows-source.yml'),
      'utf8',
    )
    const packagedVerifier = readFileSync(
      resolve(root, 'scripts/verify-packaged-licenses.mjs'),
      'utf8',
    )
    const smoke = readFileSync(resolve(root, 'scripts/smoke.mjs'), 'utf8')

    expect(workflow).toContain('npm run verify:licenses:packaged')
    expect(workflow).toContain('npm run test:e2e:packaged')
    expect(smoke).toContain("'--remote-debugging-address=127.0.0.1'")
    expect(smoke).toContain('chromium.connectOverCDP(endpoint)')
    expect(workflow).toContain('electron-builder --win --dir')
    expect(packagedVerifier).toContain("'LICENSE.electron.txt'")
    expect(packagedVerifier).toContain("'LICENSES.chromium.html'")
    expect(packagedVerifier).toContain("'THIRD_PARTY_LICENSES/converse-MPL-2.0.txt'")
    expect(packagedVerifier).toContain("'THIRD_PARTY_LICENSES/libomemo-NOTICE.txt'")
  })
})
