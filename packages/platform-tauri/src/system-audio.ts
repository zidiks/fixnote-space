import type { SystemAudio } from '@fixnote/core'
import { Channel, invoke } from '@tauri-apps/api/core'

type Event = { kind: 'chunk'; data: string } | { kind: 'error'; message: string }

/** 16-bit little-endian PCM (base64) as samples in -1..1. */
export function decodePcm(base64: string): Float32Array {
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))
  const view = new DataView(bytes.buffer)
  const out = new Float32Array(bytes.length >> 1)
  for (let i = 0; i < out.length; i++) out[i] = view.getInt16(i * 2, true) / 32768
  return out
}

/** Loopback recording of the default output device (system_audio.rs). */
export const systemAudio: SystemAudio = {
  start: async (onAudio, onError) => {
    const events = new Channel<Event>()
    events.onmessage = (e) => {
      if (e.kind === 'chunk') onAudio(decodePcm(e.data))
      else onError(e.message)
    }
    await invoke('system_audio_start', { events })
  },
  stop: () => invoke('system_audio_stop'),
}
