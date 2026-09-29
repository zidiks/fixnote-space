import type { Transcriber } from '@fixnote/core'

/**
 * Development-only stand-in for Whisper (`?dev-backend` in `pnpm dev`): the sandboxed browsers we
 * test in cannot download the model. Pretends to download once, then returns a fixed transcript,
 * taking a tenth of the audio's length like a fair computer (`&slow-speech`: a weak one).
 */
export function devTranscriber(): Transcriber {
  const pace = new URLSearchParams(location.search).has('slow-speech') ? 1.5 : 0.1
  let loaded = false
  let model = 'onnx-community/whisper-base'
  return {
    get modelId() {
      return model
    },
    local: true,
    setModel(id) {
      if (id !== model) loaded = false
      model = id
    },
    unload() {
      loaded = false
    },
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
      // A piece of dictation is a 16 kHz WAV; a whole recording (Opus) is taken as a few seconds.
      const seconds = audio.type === 'audio/wav' ? (audio.size - 44) / 32_000 : 3
      await new Promise((r) => setTimeout(r, pace * seconds * 1000))
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
