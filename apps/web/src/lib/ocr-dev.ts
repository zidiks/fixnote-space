import type { TextRecognizer } from '@fixnote/core'

/**
 * Development-only stand-in for Tesseract (`?dev-backend` in `pnpm dev`): the sandboxed browsers
 * we test in cannot download its language data. Pretends to download once, then "reads" a fixed
 * receipt from any image.
 */
export function devRecognizer(): TextRecognizer {
  let loaded = false
  return {
    modelId: 'dev-ocr',
    async ready(onProgress) {
      if (loaded) return
      for (const p of [0.3, 0.7, 1]) {
        await new Promise((r) => setTimeout(r, 150))
        onProgress?.(p)
      }
      loaded = true
    },
    async recognize() {
      await this.ready()
      await new Promise((r) => setTimeout(r, 300))
      return 'Кафе «Лето»\nКапучино 250\nЧизкейк 320\nИтого 570'
    },
    unload() {
      loaded = false
    },
  }
}
