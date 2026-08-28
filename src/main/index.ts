import {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  ipcMain,
  Menu,
  nativeImage,
  net,
  powerMonitor,
  protocol,
  shell,
  Tray,
  type OpenDialogOptions,
  type SaveDialogOptions,
} from 'electron'
import { hostname } from 'node:os'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { readFile, stat, writeFile } from 'node:fs/promises'
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
import {
  createRuntimeCredentialStore,
} from './credential-store'
import { createBrowserExtensionResourceOpener } from './browser-extension-resources'
import { CoordinatedShutdown } from './coordinated-shutdown'
import { createDesktopHandlers } from './ipc-handlers'
import { assertGenericExternalUrlAllowed, isReservedMeetingOrigin } from './external-url-policy'
import { PairingApiClient } from './pairing-api'
import { PairingSessionManager } from './pairing-session-manager'
import { installDenyByDefaultPermissionPolicy } from './permission-policy'
import { MeetingWindowManager } from './meeting-window'
import { resolveRendererEntry, type RendererEntry } from './runtime-resources'
import {
  MAER_RENDERER_SCHEME,
  resolveRendererAssetPath,
} from './renderer-protocol'
import { TrustedIpcMain, TrustedRendererGuard } from './trusted-ipc'
import { hideMainWindowOnClose, revealMainWindow } from './window-lifecycle'

let mainWindow: BrowserWindow | undefined
let tray: Tray | undefined
let quitting = false

protocol.registerSchemesAsPrivileged([
  {
    scheme: MAER_RENDERER_SCHEME,
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
    },
  },
])

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

function installBundledRendererProtocol(entry: RendererEntry): void {
  if (entry.source !== 'bundled') return
  const rendererDirectory = dirname(entry.filePath)
  protocol.handle(MAER_RENDERER_SCHEME, (request) => {
    if (request.method !== 'GET') {
      return new Response(null, {
        status: 405,
        headers: { Allow: 'GET' },
      })
    }
    const filePath = resolveRendererAssetPath(request.url, rendererDirectory)
    if (!filePath) return new Response(null, { status: 404 })
    return net.fetch(pathToFileURL(filePath).href)
  })
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

function registerIpc(
  guard: TrustedRendererGuard,
  meetings: MeetingWindowManager,
): MainServices {
  const pairing = pairingManager()
  const ipc = new TrustedIpcMain(ipcMain, guard)
  let nativeVaultGateway: NativeVaultGateway | undefined
  const handlers = createDesktopHandlers({
    appVersion: app.getVersion(),
    deviceName: hostname().slice(0, 80) || 'PC Windows',
    endpoints: MAER_SERVICE_ENDPOINTS,
    credentials: createRuntimeCredentialStore(e2eMode),
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
  ipc.handle(IPC.openMeeting, (input: unknown) => meetings.open(input))
  ipc.handle(IPC.closeMeeting, () => meetings.close())

  const plugins = new MainPluginHost({
    appVersion: app.getVersion(),
    plugins: createFirstPartyMainPlugins({
      passwordVault: {
        vaultPath: join(app.getPath('userData'), 'maer-passwords.kdbx'),
        powerMonitor,
        clipboard,
        browserExtensions,
        async confirmReveal() {
          const options = {
            type: 'warning' as const,
            title: 'Afficher un mot de passe',
            message: 'Afficher ce mot de passe dans MAER Chat pendant 15 secondes ?',
            detail: 'Vérifiez que personne ne peut voir votre écran. Le mot de passe ne sera pas copié automatiquement.',
            buttons: ['Refuser', 'Afficher'],
            defaultId: 0,
            cancelId: 0,
            noLink: true,
          }
          const result = mainWindow
            ? await dialog.showMessageBox(mainWindow, options)
            : await dialog.showMessageBox(options)
          return result.response === 1
        },
        backupFiles: {
          async save(data) {
            const options: SaveDialogOptions = {
              title: 'Sauvegarder le coffre MAER',
              defaultPath: 'coffre-maer.maervault',
              filters: [{ name: 'Sauvegarde chiffrée MAER', extensions: ['maervault'] }],
              properties: ['createDirectory', 'showOverwriteConfirmation'],
            }
            const result = mainWindow
              ? await dialog.showSaveDialog(mainWindow, options)
              : await dialog.showSaveDialog(options)
            if (result.canceled || !result.filePath) return false
            await writeFile(result.filePath, data, { mode: 0o600, flag: 'w' })
            return true
          },
          async load() {
            const options: OpenDialogOptions = {
              title: 'Restaurer une sauvegarde du coffre MAER',
              filters: [{ name: 'Sauvegarde chiffrée MAER', extensions: ['maervault'] }],
              properties: ['openFile'],
            }
            const result = mainWindow
              ? await dialog.showOpenDialog(mainWindow, options)
              : await dialog.showOpenDialog(options)
            const filePath = result.filePaths[0]
            if (result.canceled || !filePath) return undefined
            const fileStats = await stat(filePath)
            if (!fileStats.isFile() || fileStats.size > 20 * 1024 * 1024) {
              throw new Error('Invalid MAER vault backup file')
            }
            return new Uint8Array(await readFile(filePath))
          },
        },
        externalResources: {
          async openUrl(url) {
            await shell.openExternal(assertGenericExternalUrlAllowed(url).toString())
          },
        },
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
      if (isReservedMeetingOrigin(url)) {
        // A meeting URL is accepted only through the renderer's validated
        // MAER-CALL/1 flow and MeetingWindowManager IPC, never generically.
        return { action: 'deny' }
      }
      void shell.openExternal(assertGenericExternalUrlAllowed(url).toString())
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
    hideMainWindowOnClose(window, event, quitting)
  })

  void window.loadURL(entry.url)

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
        click: () => { revealMainWindow(mainWindow) },
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
  result.on('click', () => { revealMainWindow(mainWindow) })
  result.on('double-click', () => { revealMainWindow(mainWindow) })
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
      revealMainWindow(mainWindow)
    })

    void app.whenReady().then(async () => {
      app.setAppUserModelId('fr.maer.chat.desktop')
      Menu.setApplicationMenu(null)
      const entry = rendererEntry()
      installBundledRendererProtocol(entry)
      const guard = new TrustedRendererGuard({
        expectedUrl: entry.url,
        getWebContents: () => mainWindow?.webContents,
      })
      const meetings = new MeetingWindowManager(() => mainWindow)
      const services = registerIpc(guard, meetings)
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
          void meetings.close()
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
          revealMainWindow(mainWindow)
        }
      })
    })
  }
}

app.on('window-all-closed', () => {
  // Keep running in the notification area on Windows.
})
