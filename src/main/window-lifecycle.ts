export interface MainWindowVisibility {
  isDestroyed(): boolean
  isMinimized(): boolean
  restore(): void
  show(): void
  focus(): void
  hide(): void
}

export interface PreventableCloseEvent {
  preventDefault(): void
}

export function revealMainWindow(window: MainWindowVisibility | undefined): boolean {
  if (!window || window.isDestroyed()) return false
  if (window.isMinimized()) window.restore()
  window.show()
  window.focus()
  return true
}

export function hideMainWindowOnClose(
  window: MainWindowVisibility,
  event: PreventableCloseEvent,
  quitting: boolean,
): boolean {
  if (quitting) return false
  event.preventDefault()
  window.hide()
  return true
}
