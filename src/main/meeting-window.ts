import { BrowserWindow, session, shell, type Session } from 'electron'
import { randomUUID } from 'node:crypto'
import {
  parseMeetingInput,
} from '../shared/desktop-contract'
import { MAER_MEETING_ORIGIN } from '../shared/service-config'
import { assertGenericExternalUrlAllowed } from './external-url-policy'

function exactMeetingOrigin(value: string): boolean {
  try {
    return new URL(value).origin === new URL(MAER_MEETING_ORIGIN).origin
  } catch {
    return false
  }
}

function installMeetingPermissions(target: Session, getWindow: () => BrowserWindow | undefined): void {
  target.setPermissionCheckHandler((webContents, permission, requestingOrigin) => {
    return Boolean(
      webContents &&
        webContents === getWindow()?.webContents &&
        permission === 'media' &&
        exactMeetingOrigin(requestingOrigin),
    )
  })
  target.setPermissionRequestHandler((webContents, permission, callback, details) => {
    callback(
      webContents === getWindow()?.webContents &&
        permission === 'media' &&
        exactMeetingOrigin(details.requestingUrl),
    )
  })

  // Chromium uses the Windows picker when it is available. The callback is a
  // fail-closed fallback on platforms where no trusted system picker exists.
  target.setDisplayMediaRequestHandler((_request, callback) => callback({}), {
    useSystemPicker: true,
  })
}

export class MeetingWindowManager {
  private window: BrowserWindow | undefined
  private meetingSession: Session | undefined

  constructor(private readonly parent: () => BrowserWindow | undefined) {}

  async open(value: unknown): Promise<void> {
    const request = parseMeetingInput(value)
    await this.close()

    const partition = `maer-meeting-${randomUUID()}`
    const isolatedSession = session.fromPartition(partition, {
      cache: false,
    })
    let child: BrowserWindow | undefined
    installMeetingPermissions(isolatedSession, () => child)
    child = new BrowserWindow({
      parent: this.parent(),
      title: `MAER Chat — ${
        request.mode === 'audio'
          ? 'Appel audio'
          : request.mode === 'video'
            ? 'Appel vidéo'
            : 'Partage d’écran'
      }`,
      width: 1_180,
      height: 780,
      minWidth: 720,
      minHeight: 560,
      show: false,
      autoHideMenuBar: true,
      backgroundColor: '#07141c',
      webPreferences: {
        partition,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        webSecurity: true,
        spellcheck: false,
      },
    })
    this.window = child
    this.meetingSession = isolatedSession

    child.webContents.setWindowOpenHandler(({ url }) => {
      if (exactMeetingOrigin(url)) {
        // Same-origin popups must not bypass the validated MeetingWindow IPC.
        return { action: 'deny' }
      } else {
        try {
          const target = new URL(url)
          if (target.protocol === 'https:') {
            void shell.openExternal(assertGenericExternalUrlAllowed(url).toString())
          }
        } catch {
          // Invalid links remain blocked.
        }
      }
      return { action: 'deny' }
    })
    child.webContents.on('will-navigate', (event, url) => {
      if (!exactMeetingOrigin(url)) event.preventDefault()
    })
    child.webContents.on('will-attach-webview', (event) => event.preventDefault())
    child.once('ready-to-show', () => child?.show())
    child.on('closed', () => {
      if (this.window === child) this.window = undefined
      if (this.meetingSession === isolatedSession) this.meetingSession = undefined
      void isolatedSession.clearStorageData().catch(() => undefined)
      void isolatedSession.clearCache().catch(() => undefined)
    })
    try {
      parseMeetingInput(request)
      await child.loadURL(request.url)
    } catch (error) {
      await this.close()
      throw new Error('Le service de réunion MAER est temporairement indisponible.', {
        cause: error,
      })
    }
  }

  async close(): Promise<void> {
    const current = this.window
    const currentSession = this.meetingSession
    this.window = undefined
    this.meetingSession = undefined
    if (current && !current.isDestroyed()) current.destroy()
    if (currentSession) {
      await Promise.allSettled([
        currentSession.clearStorageData(),
        currentSession.clearCache(),
      ])
    }
  }
}
