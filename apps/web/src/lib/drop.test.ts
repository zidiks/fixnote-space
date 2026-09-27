import { readdirSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const TAURI = new URL('../../../desktop/src-tauri/', import.meta.url)

describe('desktop window config', () => {
  // Drops are handled by the web page (DropLayer). With Tauri's own drop handling on, the page
  // gets no drag events at all. Platform configs replace the whole window list, so each file that
  // has one must say it again (macOS and Windows both lost it once).
  it('leaves drag and drop to the web page on every platform', () => {
    const files = readdirSync(TAURI).filter((f) => /^tauri(\.\w+)?\.conf\.json$/.test(f))
    expect(files).toContain('tauri.conf.json')
    for (const file of files) {
      const conf = JSON.parse(readFileSync(new URL(file, TAURI), 'utf8')) as {
        app?: { windows?: { dragDropEnabled?: boolean }[] }
      }
      for (const window of conf.app?.windows ?? []) {
        expect({ file, dragDropEnabled: window.dragDropEnabled }).toEqual({
          file,
          dragDropEnabled: false,
        })
      }
    }
  })
})

describe('desktop window size', () => {
  // Half a 13" laptop screen is ~720pt: the window must fit it (macOS tiling and Split View), and
  // the layout switches to overlay panels below 800px (App.tsx).
  it('can be as narrow as half a small laptop screen on every platform', () => {
    const files = readdirSync(TAURI).filter((f) => /^tauri(\.\w+)?\.conf\.json$/.test(f))
    for (const file of files) {
      const conf = JSON.parse(readFileSync(new URL(file, TAURI), 'utf8')) as {
        app?: { windows?: { minWidth?: number }[] }
      }
      for (const window of conf.app?.windows ?? [])
        expect({ file, fits: (window.minWidth ?? 0) <= 640 }).toEqual({ file, fits: true })
    }
  })
})
