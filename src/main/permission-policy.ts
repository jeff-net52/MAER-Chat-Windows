import type { Session, WebContents } from 'electron'
import { TrustedRendererGuard } from './trusted-ipc'

export const DEFAULT_RENDERER_PERMISSIONS = ['media', 'notifications'] as const

type RendererPermission = (typeof DEFAULT_RENDERER_PERMISSIONS)[number]

interface PermissionSession {
  setPermissionCheckHandler(
    handler: (
      webContents: WebContents | null,
      permission: string,
      requestingOrigin: string,
      details: { isMainFrame: boolean; requestingUrl?: string },
    ) => boolean,
  ): void
  setPermissionRequestHandler(
    handler: (
      webContents: WebContents,
      permission: string,
      callback: (granted: boolean) => void,
      details: { isMainFrame: boolean; requestingUrl: string },
    ) => void,
  ): void
}

export function installDenyByDefaultPermissionPolicy(
  session: Pick<Session, 'setPermissionCheckHandler' | 'setPermissionRequestHandler'>,
  guard: TrustedRendererGuard,
  allowed: readonly RendererPermission[] = DEFAULT_RENDERER_PERMISSIONS,
): void {
  const allowedPermissions = new Set<string>(allowed)
  const target = session as PermissionSession
  target.setPermissionCheckHandler((webContents, permission, _origin, details) => {
    return (
      allowedPermissions.has(permission) &&
      guard.isTrustedRequest(webContents, details.isMainFrame, details.requestingUrl)
    )
  })
  target.setPermissionRequestHandler((webContents, permission, callback, details) => {
    callback(
      allowedPermissions.has(permission) &&
        guard.isTrustedRequest(webContents, details.isMainFrame, details.requestingUrl),
    )
  })
}
