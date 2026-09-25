import type { Platform } from '@fixnote/core'
import { createTauriPlatform, isTauri } from '@fixnote/platform-tauri'
import { createWebPlatform } from '@fixnote/platform-web'
import { createContext, type ReactNode, useContext } from 'react'

export const platform: Platform = isTauri() ? createTauriPlatform() : createWebPlatform()

const PlatformContext = createContext<Platform>(platform)

export function PlatformProvider({ children }: { children: ReactNode }) {
  return <PlatformContext.Provider value={platform}>{children}</PlatformContext.Provider>
}

export const usePlatform = () => useContext(PlatformContext)
