import type { Platform, TextRecognizer, Transcriber } from '@fixnote/core'
import { createTauriPlatform, isTauri } from '@fixnote/platform-tauri'
import { createWebPlatform } from '@fixnote/platform-web'
import { createContext, type ReactNode, useContext } from 'react'

const base: Platform = isTauri() ? createTauriPlatform() : createWebPlatform()
const devTranscriber = () => import('./voice/dev-transcriber').then((m) => m.devTranscriber)
let dev: Promise<Transcriber> | null = null
let devOcr: Promise<TextRecognizer> | null = null

/** `?dev-backend` in `pnpm dev` also fakes speech and text recognition (dev-transcriber.ts, ocr-dev.ts). */
export const platform: Platform =
  import.meta.env.DEV && new URLSearchParams(location.search).has('dev-backend')
    ? {
        ...base,
        transcriber: () => {
          dev ??= devTranscriber().then((create) => create())
          return dev
        },
        ocr: () => {
          devOcr ??= import('./ocr-dev').then((m) => m.devRecognizer())
          return devOcr
        },
      }
    : base

const PlatformContext = createContext<Platform>(platform)

export function PlatformProvider({ children }: { children: ReactNode }) {
  return <PlatformContext.Provider value={platform}>{children}</PlatformContext.Provider>
}

export const usePlatform = () => useContext(PlatformContext)
