import {
  app,
  BrowserWindow,
  ipcMain,
  Menu,
  nativeImage,
  shell,
  Tray,
} from 'electron'
import { hostname } from 'node:os'
import { join } from 'node:path'
import { createApprovalUri } from '../shared/pairing-protocol'
import { IPC } from '../shared/ipc-channels'
import { CredentialStore, WindowsCredentialBackend } from './credential-store'
import { createDesktopHandlers } from './ipc-handlers'
import { PairingApiClient } from './pairing-api'
import { PairingSessionManager } from './pairing-session-manager'

const DOMAIN = 'contacts.chaumont.me'
const ENDPOINTS = {
  domain: DOMAIN,
  websocketUrl: `wss://${DOMAIN}/xmpp-websocket`,
  boshServiceUrl: `https://${DOMAIN}/http-bind`,
  pairingApiBaseUrl: `https://${DOMAIN}/maer-pair/v1`,
}

let mainWindow: BrowserWindow | undefined
let tray: Tray | undefined
let quitting = false

function iconPath(): string {
  return app.isPackaged
    ? join(process.resourcesPath, 'assets', 'icon.png')
    : join(__dirname, '../../assets/icon.png')
}

function pairingManager(): PairingSessionManager {
  return new PairingSessionManager((signer) => {
    const api = new PairingApiClient(ENDPOINTS.pairingApiBaseUrl)
    return {
      async createSession(deviceName) {
        const session = await api.createSession(signer, deviceName, app.getVersion())
        return {
          session,
          approvalUri: createApprovalUri(session, DOMAIN),
        }
      },
      poll(session) {
        return api.poll(signer, session.sessionId, session.pollNonce)
      },
      cancel(session) {
        return api.cancel(signer, session.sessionId, session.pollNonce)
      },
    }
  })
}

function registerIpc(): PairingSessionManager {
  const pairing = pairingManager()
  const handlers = createDesktopHandlers({
    appVersion: app.getVersion(),
    deviceName: hostname().slice(0, 80) || 'PC Windows',
    endpoints: ENDPOINTS,
    credentials: new CredentialStore(new WindowsCredentialBackend()),
    pairing,
  })

  ipcMain.handle(IPC.bootstrap, () => handlers.bootstrap())
  ipcMain.handle(IPC.preparePasswordLogin, (_event, input: unknown) =>
    handlers.preparePasswordLogin(input),
  )
  ipcMain.handle(IPC.loadCredential, (_event, input: unknown) =>
    handlers.loadCredential(input),
  )
  ipcMain.handle(IPC.saveValidatedCredential, (_event, input: unknown) =>
    handlers.saveValidatedCredential(input),
  )
  ipcMain.handle(IPC.forgetCredential, (_event, input: unknown) =>
    handlers.forgetCredential(input),
  )
  ipcMain.handle(IPC.beginPairing, () => handlers.beginPairing())
  ipcMain.handle(IPC.pollPairing, (_event, input: unknown) =>
    handlers.pollPairing(input),
  )
  ipcMain.handle(IPC.cancelPairing, (_event, input: unknown) =>
    handlers.cancelPairing(input),
  )
  return pairing
}

function createWindow(): BrowserWindow {
  const window = new BrowserWindow({
    title: 'MAER Chat',
    width: 1280,
    height: 820,
    minWidth: 720,
    minHeight: 560,
    backgroundColor: '#F7FAFF',
    show: false,
    autoHideMenuBar: true,
    icon: iconPath(),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      spellcheck: true,
    },
  })

  window.webContents.setWindowOpenHandler(({ url }) => {
    try {
      const target = new URL(url)
      if (target.protocol === 'https:' || target.protocol === 'mailto:') {
        void shell.openExternal(url)
      }
    } catch {
      // Malformed links remain blocked.
    }
    return { action: 'deny' }
  })
  window.webContents.on('will-navigate', (event, url) => {
    const current = window.webContents.getURL()
    if (url !== current) event.preventDefault()
  })
  window.webContents.on('will-attach-webview', (event) => event.preventDefault())

  window.once('ready-to-show', () => window.show())
  window.on('close', (event) => {
    if (!quitting) {
      event.preventDefault()
      window.hide()
    }
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    void window.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void window.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return window
}

function createTray(): Tray {
  const icon = nativeImage.createFromPath(iconPath()).resize({ width: 20, height: 20 })
  const result = new Tray(icon)
  result.setToolTip('MAER Chat')
  result.setContextMenu(
    Menu.buildFromTemplate([
      {
        label: 'Ouvrir MAER Chat',
        click: () => {
          mainWindow?.show()
          mainWindow?.focus()
        },
      },
      { type: 'separator' },
      {
        label: 'Quitter',
        click: () => {
          quitting = true
          app.quit()
        },
      },
    ]),
  )
  result.on('double-click', () => {
    mainWindow?.show()
    mainWindow?.focus()
  })
  return result
}

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.show()
    mainWindow.focus()
  })

  void app.whenReady().then(() => {
    app.setAppUserModelId('fr.maer.chat.desktop')
    Menu.setApplicationMenu(null)
    const pairing = registerIpc()
    mainWindow = createWindow()
    tray = createTray()

    app.on('before-quit', () => {
      quitting = true
      void pairing.cancelAll()
    })
    app.on('activate', () => {
      if (!mainWindow || mainWindow.isDestroyed()) {
        mainWindow = createWindow()
      } else {
        mainWindow.show()
      }
    })
  })
}

app.on('window-all-closed', () => {
  // Keep running in the notification area on Windows.
})
