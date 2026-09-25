import type { Transcriber } from '@fixnote/core'

/**
 * Development-only stand-in for Whisper (`?dev-backend` in `pnpm dev`): the sandboxed browsers we
 * test in cannot download the model. Pretends to download once, then returns a fixed transcript.
 */
export function devTranscriber(): Transcriber {
  let loaded = false
  return {
    modelId: 'dev-whisper',
    local: true,
    async ready(onProgress) {
      if (loaded) return
      for (const p of [0.2, 0.6, 1]) {
        await new Promise((r) => setTimeout(r, 150))
        onProgress?.(p)
      }
      loaded = true
    },
    async transcribe(audio) {
      await this.ready()
      await new Promise((r) => setTimeout(r, 300))
      return {
        text: audio.size
          ? 'Надо купить молоко и хлеб, позвонить маме в пятницу, и ещё записать идею про бота в Telegram.'
          : '',
        language: 'ru',
        durationMs: 300,
      }
    },
  }
}
