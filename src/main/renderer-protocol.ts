import { isAbsolute, relative, resolve, sep } from 'node:path'

export const MAER_RENDERER_SCHEME = 'maer-chat'
export const MAER_RENDERER_HOST = 'app'
export const MAER_RENDERER_ORIGIN = `${MAER_RENDERER_SCHEME}://${MAER_RENDERER_HOST}`
export const MAER_RENDERER_URL = `${MAER_RENDERER_ORIGIN}/`

/**
 * Resolves a request from the private renderer origin without allowing the URL
 * to escape the bundled renderer directory.
 */
export function resolveRendererAssetPath(
  rawUrl: string,
  rendererDirectory: string,
): string | undefined {
  if (/%2e/iu.test(rawUrl) || /\/\.\.?(?:[/?#]|$)/u.test(rawUrl)) return undefined
  let url: URL
  try {
    url = new URL(rawUrl)
  } catch {
    return undefined
  }
  if (
    url.protocol !== `${MAER_RENDERER_SCHEME}:` ||
    url.hostname !== MAER_RENDERER_HOST ||
    url.port ||
    url.username ||
    url.password
  ) {
    return undefined
  }

  let pathname: string
  try {
    pathname = decodeURIComponent(url.pathname)
  } catch {
    return undefined
  }
  if (pathname.includes('\0') || pathname.includes('\\')) return undefined

  const requested = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '')
  if (!requested) return undefined
  const root = resolve(rendererDirectory)
  const target = resolve(root, requested)
  const fromRoot = relative(root, target)
  if (!fromRoot || fromRoot === '..' || fromRoot.startsWith(`..${sep}`) || isAbsolute(fromRoot)) {
    return undefined
  }
  return target
}
