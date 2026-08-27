import { spawnSync } from 'node:child_process'
import { constants } from 'node:fs'
import { access, mkdir, readFile, rename, rm } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptPath = fileURLToPath(import.meta.url)

async function firstExisting(paths) {
  for (const path of paths) {
    try {
      await access(path, constants.X_OK)
      return path
    } catch {
      // Continue to the explicitly enumerated 32-bit framework fallback.
    }
  }
  throw new Error('Le compilateur C# Windows Framework est indisponible.')
}

export async function buildNativeHostShim(projectDirectory = process.cwd()) {
  if (process.platform !== 'win32') {
    throw new Error('Le shim Native Messaging Windows doit être compilé sous Windows.')
  }
  const windowsDirectory = process.env.WINDIR
  if (!windowsDirectory) throw new Error('Le répertoire Windows est indisponible.')
  const compiler = await firstExisting([
    join(windowsDirectory, 'Microsoft.NET', 'Framework64', 'v4.0.30319', 'csc.exe'),
    join(windowsDirectory, 'Microsoft.NET', 'Framework', 'v4.0.30319', 'csc.exe'),
  ])
  const root = resolve(projectDirectory)
  const source = join(
    root,
    'resources',
    'native-messaging',
    'host-shim',
    'MaerPasswordVaultNativeHostShim.cs',
  )
  const outputDirectory = join(root, 'resources', 'native-messaging')
  const output = join(outputDirectory, 'maer-password-vault-host.exe')
  const temporary = `${output}.new`
  await mkdir(outputDirectory, { recursive: true })
  await rm(temporary, { force: true })
  const result = spawnSync(
    compiler,
    [
      '/nologo',
      '/target:exe',
      '/platform:x64',
      '/optimize+',
      '/debug-',
      '/checked+',
      `/out:${temporary}`,
      source,
    ],
    { cwd: root, encoding: 'utf8', windowsHide: true },
  )
  if (result.status !== 0) {
    await rm(temporary, { force: true })
    throw new Error(
      `La compilation du shim Native Messaging a échoué (${result.status ?? 'inconnu'}).\n${result.stderr || result.stdout}`,
    )
  }
  const header = (await readFile(temporary)).subarray(0, 2).toString('ascii')
  if (header !== 'MZ') {
    await rm(temporary, { force: true })
    throw new Error('Le shim Native Messaging compilé n’est pas un exécutable PE.')
  }
  await rm(output, { force: true })
  await rename(temporary, output)
  return { compiler, output }
}

export default async function beforePack(context) {
  await buildNativeHostShim(context?.appDir ?? process.cwd())
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(scriptPath)) {
  const result = await buildNativeHostShim()
  process.stdout.write(`${JSON.stringify(result)}\n`)
}
