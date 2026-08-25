import type { DesktopBridge } from './onboarding-controller'

declare global {
  interface Window {
    maerDesktop: DesktopBridge
  }
}

export {}
