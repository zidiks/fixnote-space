import type { AppleNotesSource, Platform, TextRecognizer, Transcriber } from '@fixnote/core'
import { createTauriPlatform, isTauri } from '@fixnote/platform-tauri'
import { createWebPlatform } from '@fixnote/platform-web'
import { createContext, type ReactNode, useContext } from 'react'
import { devSystemAudio } from './voice/system-audio-dev'

const base: Platform = isTauri() ? createTauriPlatform() : createWebPlatform()
const devTranscriber = () => import('./voice/dev-transcriber').then((m) => m.devTranscriber)
let dev: Promise<Transcriber> | null = null
let devOcr: Promise<TextRecognizer> | null = null
let devApple: Promise<AppleNotesSource> | null = null
const appleDev = () => {
  devApple ??= import('./apple-notes-dev').then((m) => m.devAppleNotes())
  return devApple
}

/**
 * `?dev-backend` in `pnpm dev` also fakes speech, text recognition, Apple Notes and the
 * computer's sound for call notes (dev-transcriber.ts, ocr-dev.ts, apple-notes-dev.ts,
 * system-audio-dev.ts).
 */
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
        systemAudio: base.systemAudio ?? devSystemAudio(),
        appleNotes: base.appleNotes ?? {
          folders: async () => (await appleDev()).folders(),
          read: async (folder, from, count) => (await appleDev()).read(folder, from, count),
        },
      }
    : base

const PlatformContext = createContext<Platform>(platform)

export function PlatformProvider({ children }: { children: ReactNode }) {
  return <PlatformContext.Provider value={platform}>{children}</PlatformContext.Provider>
}

export const usePlatform = () => useContext(PlatformContext)
