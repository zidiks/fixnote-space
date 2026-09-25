import type { WindowControls } from '@fixnote/core'
import { getCurrentWindow } from '@tauri-apps/api/window'

export function windowControls(): WindowControls {
  const win = getCurrentWindow()
  return {
    minimize: () => win.minimize(),
    toggleMaximize: () => win.toggleMaximize(),
    close: () => win.close(),
    isMaximized: () => win.isMaximized(),
    onResized: (cb) => win.onResized(() => cb()),
  }
}
