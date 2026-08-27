import { contextBridge, ipcRenderer } from 'electron'
import type { DesktopBridge } from '../renderer/onboarding-controller'
import type { DesktopCredential } from '../shared/desktop-contract'
import { IPC } from '../shared/ipc-channels'
import {
  mapBootstrap,
  mapPairingPoll,
  mapPreparedPasswordLogin,
} from './bridge-adapter'
import { createDesktopPluginBridge } from '../plugins/core/preload/plugin-bridge'
import { publicIpcError } from './ipc-error'

const bridge: DesktopBridge = {
  async getBootstrap() {
    return mapBootstrap(await ipcRenderer.invoke(IPC.bootstrap))
  },

  async preparePasswordLogin(input) {
    return mapPreparedPasswordLogin(
      await ipcRenderer.invoke(IPC.preparePasswordLogin, input),
    )
  },

  async beginPairing() {
    return ipcRenderer.invoke(IPC.beginPairing)
  },

  async pollPairing(sessionId) {
    return mapPairingPoll(await ipcRenderer.invoke(IPC.pollPairing, sessionId))
  },

  async cancelPairing(sessionId) {
    await ipcRenderer.invoke(IPC.cancelPairing, sessionId)
  },

  async loadCredential(jid) {
    const result = (await ipcRenderer.invoke(IPC.loadCredential, jid)) as {
      jid: string
      credential: DesktopCredential
    }
    return result.credential
  },

  async saveValidatedCredential(input) {
    await ipcRenderer.invoke(IPC.saveValidatedCredential, input)
  },

  async deleteCredential(jid) {
    return ipcRenderer.invoke(IPC.forgetCredential, jid)
  },

  async openMeeting(input) {
    try {
      await ipcRenderer.invoke(IPC.openMeeting, input)
    } catch (error) {
      throw publicIpcError(error, 'Impossible d’ouvrir la réunion MAER.')
    }
  },

  async closeMeeting() {
    await ipcRenderer.invoke(IPC.closeMeeting)
  },
}

contextBridge.exposeInMainWorld('maerDesktop', Object.freeze(bridge))
contextBridge.exposeInMainWorld(
  'maerPlugins',
  createDesktopPluginBridge((channel, request) => ipcRenderer.invoke(channel, request)),
)
