import type { DesktopBridge } from './onboarding-controller'
import type { DesktopPluginBridge } from '../plugins/core/preload/plugin-bridge'

declare global {
  interface Window {
    maerDesktop: DesktopBridge
    maerPlugins: DesktopPluginBridge
  }
}

export {}
