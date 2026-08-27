import { describe, expect, it, vi } from 'vitest'
import {
  hideMainWindowOnClose,
  revealMainWindow,
} from '../src/main/window-lifecycle'

function fakeWindow(overrides: { destroyed?: boolean; minimized?: boolean } = {}) {
  return {
    isDestroyed: vi.fn(() => overrides.destroyed ?? false),
    isMinimized: vi.fn(() => overrides.minimized ?? false),
    restore: vi.fn(),
    show: vi.fn(),
    focus: vi.fn(),
    hide: vi.fn(),
  }
}

describe('Windows tray lifecycle', () => {
  it('restores, shows and focuses the window for tray and second-instance actions', () => {
    const window = fakeWindow({ minimized: true })
    expect(revealMainWindow(window)).toBe(true)
    expect(window.restore).toHaveBeenCalledOnce()
    expect(window.show).toHaveBeenCalledOnce()
    expect(window.focus).toHaveBeenCalledOnce()
  })

  it('does not touch an absent or destroyed window', () => {
    const destroyed = fakeWindow({ destroyed: true })
    expect(revealMainWindow(undefined)).toBe(false)
    expect(revealMainWindow(destroyed)).toBe(false)
    expect(destroyed.show).not.toHaveBeenCalled()
  })

  it('hides normal closes into the tray but allows an explicit quit', () => {
    const window = fakeWindow()
    const close = { preventDefault: vi.fn() }
    expect(hideMainWindowOnClose(window, close, false)).toBe(true)
    expect(close.preventDefault).toHaveBeenCalledOnce()
    expect(window.hide).toHaveBeenCalledOnce()

    const quit = { preventDefault: vi.fn() }
    expect(hideMainWindowOnClose(window, quit, true)).toBe(false)
    expect(quit.preventDefault).not.toHaveBeenCalled()
  })
})
