import {
  app,
  BrowserWindow,
  clipboard,
  ipcMain,
  Menu,
  nativeImage,
  powerMonitor,
  shell,
  Tray,
} from 'electron'
import { hostname } from 'node:os'
import { join } from 'node:path'
import { MainPluginHost } from '../plugins/core/main/plugin-host'
import { createFirstPartyMainPlugins } from '../plugins/main-registry'
import type { NativeVaultGateway } from '../plugins/password-vault/main/native-vault-gateway'
import {
  detectNativeMessagingRuntimeLaunch,
  type NativeMessagingRuntimeLaunch,
} from '../native-messaging/launch'
import { runNativeMessagingHost } from '../native-messaging/native-host'
import { NativeVaultPipeServer } from '../native-messaging/pipe-server'
import { connectNativeMessagingShimTransport } from '../native-messaging/shim-transport'
import { createApprovalUri } from '../shared/pairing-protocol'
import { IPC } from '../shared/ipc-channels'
import {
  MAER_SERVICE_ENDPOINTS,
  MAER_XMPP_SERVICE_HOST,
} from '../shared/service-config'
import { CredentialStore, WindowsCredentialBackend } from './credential-store'
import { createBrowserExtensionResourceOpener } from './browser-extension-resources'
import { CoordinatedShutdown } from './coordinated-shutdown'
import { createDesktopHandlers } from './ipc-handlers'
import { PairingApiClient } from './pairing-api'
import { PairingSessionManager } from './pairing-session-manager'
import { installDenyByDefaultPermissionPolicy } from './permission-policy'
import { resolveRendererEntry, type RendererEntry } from './runtime-resources'
import { TrustedIpcMain, TrustedRendererGuard } from './trusted-ipc'

let mainWindow: BrowserWindow | undefined
let tray: Tray | undefined
let quitting = false

const e2eUserDataDirectory = process.env.MAER_CHAT_E2E_USER_DATA_DIR
const e2eMode = process.env.MAER_CHAT_E2E === '1' && Boolean(e2eUserDataDirectory)
if (e2eMode && e2eUserDataDirectory) {
  app.setPath('userData', e2eUserDataDirectory)
}

function iconPath(): string {
  return app.isPackaged
    ? join(process.resourcesPath, 'assets', 'icon.png')
    : join(__dirname, '../../assets/icon.png')
}

function rendererEntry(): RendererEntry {
  return resolveRendererEntry(
    app.isPackaged,
    process.env.ELECTRON_RENDERER_URL,
    join(__dirname, '../renderer/index.html'),
  )
}

function pairingManager(): PairingSessionManager {
  return new PairingSessionManager((signer) => {
    const api = new PairingApiClient(MAER_SERVICE_ENDPOINTS.pairingApiBaseUrl)
    return {
      async createSession(deviceName) {
        const session = await api.createSession(signer, deviceName, app.getVersion())
        return {
          session,
          approvalUri: createApprovalUri(session, MAER_XMPP_SERVICE_HOST),
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

interface MainServices {
  pairing: PairingSessionManager
  plugins: MainPluginHost
  ipc: TrustedIpcMain
  nativeVaultGateway(): NativeVaultGateway | undefined
}

function registerIpc(guard: TrustedRendererGuard): MainServices {
  const pairing = pairingManager()
  const ipc = new TrustedIpcMain(ipcMain, guard)
  let nativeVaultGateway: NativeVaultGateway | undefined
  const handlers = createDesktopHandlers({
    appVersion: app.getVersion(),
    deviceName: hostname().slice(0, 80) || 'PC Windows',
    endpoints: MAER_SERVICE_ENDPOINTS,
    credentials: new CredentialStore(new WindowsCredentialBackend()),
    pairing,
  })
  const browserExtensions = createBrowserExtensionResourceOpener({
    isPackaged: app.isPackaged,
    resourcesPath: process.resourcesPath,
    mainDirectory: __dirname,
    openPath: (target) =>
      e2eMode ? Promise.resolve('') : shell.openPath(target),
    revealPath: (target) => {
      if (!e2eMode) shell.showItemInFolder(target)
    },
  })

  ipc.handle(IPC.bootstrap, () => handlers.bootstrap())
  ipc.handle(IPC.preparePasswordLogin, (input: unknown) => handlers.preparePasswordLogin(input))
  ipc.handle(IPC.loadCredential, (input: unknown) => handlers.loadCredential(input))
  ipc.handle(IPC.saveValidatedCredential, (input: unknown) =>
    handlers.saveValidatedCredential(input),
  )
  ipc.handle(IPC.forgetCredential, (input: unknown) => handlers.forgetCredential(input))
  ipc.handle(IPC.beginPairing, () => handlers.beginPairing())
  ipc.handle(IPC.pollPairing, (input: unknown) => handlers.pollPairing(input))
  ipc.handle(IPC.cancelPairing, (input: unknown) => handlers.cancelPairing(input))

  const plugins = new MainPluginHost({
    appVersion: app.getVersion(),
    plugins: createFirstPartyMainPlugins({
      passwordVault: {
        vaultPath: join(app.getPath('userData'), 'maer-passwords.kdbx'),
        powerMonitor,
        clipboard,
        browserExtensions,
        publishNativeGateway: (gateway) => {
          nativeVaultGateway = gateway
        },
      },
    }),
    createIpcScope: (pluginId) => ipc.createPluginScope(pluginId),
    onFailure: (failure) => {
      console.error(`[plugin:${failure.pluginId}] ${failure.phase}`)
    },
  })
  return {
    pairing,
    plugins,
    ipc,
    nativeVaultGateway: () => nativeVaultGateway,
  }
}

function createWindow(entry: RendererEntry, guard: TrustedRendererGuard): BrowserWindow {
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

  installDenyByDefaultPermissionPolicy(window.webContents.session, guard)

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

  if (entry.source === 'development') {
    void window.loadURL(entry.url)
  } else {
    void window.loadFile(entry.filePath)
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

let nativeMessagingLaunch: NativeMessagingRuntimeLaunch | undefined
let invalidNativeMessagingLaunch = false
try {
  nativeMessagingLaunch = detectNativeMessagingRuntimeLaunch(
    process.argv.slice(1),
    process.env.LOCALAPPDATA,
  )
} catch {
  invalidNativeMessagingLaunch = true
}

if (invalidNativeMessagingLaunch) {
  app.exit(1)
} else if (nativeMessagingLaunch) {
  void connectNativeMessagingShimTransport(nativeMessagingLaunch.transportToken)
    .then(async (transport) => {
      try {
        await runNativeMessagingHost({
          input: transport.input,
          output: transport.output,
        })
      } finally {
        transport.close()
      }
    })
    .then(
      () => app.exit(0),
      () => app.exit(1),
    )
} else {
  const gotLock = e2eMode || app.requestSingleInstanceLock()
  if (!gotLock) {
    app.quit()
  } else {
    app.on('second-instance', () => {
      if (!mainWindow) return
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.show()
      mainWindow.focus()
    })

    void app.whenReady().then(async () => {
      app.setAppUserModelId('fr.maer.chat.desktop')
      Menu.setApplicationMenu(null)
      const entry = rendererEntry()
      const guard = new TrustedRendererGuard({
        expectedUrl: entry.url,
        getWebContents: () => mainWindow?.webContents,
      })
      const services = registerIpc(guard)
      await services.plugins.activateAll()
      const nativeGateway = services.nativeVaultGateway()
      const nativeVaultServer = nativeGateway
        ? new NativeVaultPipeServer({ operations: nativeGateway })
        : undefined
      if (nativeVaultServer) {
        try {
          await nativeVaultServer.start()
        } catch {
          console.error('[native-vault] local bridge unavailable')
        }
      }
      mainWindow = createWindow(entry, guard)
      tray = createTray()

      const shutdown = new CoordinatedShutdown({
        markQuitting: () => {
          quitting = true
        },
        stopNativeVaultBridge: () => nativeVaultServer?.stop(),
        cancelPairing: () => services.pairing.cancelAll(),
        deactivatePlugins: () => services.plugins.deactivateAll().then(() => undefined),
        disposeIpc: () => services.ipc.dispose(),
        exit: (code) => app.exit(code),
      })
      app.on('before-quit', (event) => shutdown.request(event))
      app.on('activate', () => {
        if (!mainWindow || mainWindow.isDestroyed()) {
          mainWindow = createWindow(entry, guard)
        } else {
          mainWindow.show()
        }
      })
    })
  }
}

app.on('window-all-closed', () => {
  // Keep running in the notification area on Windows.
})
