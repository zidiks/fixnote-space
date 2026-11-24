import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createSpeechTranscriber } from './client'
import type { SpeechRequest, SpeechResponse } from './protocol'

class MockWorker {
  static instances: MockWorker[] = []
  onmessage: ((e: MessageEvent<SpeechResponse>) => void) | null = null
  onerror: ((e: ErrorEvent) => void) | null = null
  readonly posted: { data: SpeechRequest; transfer?: Transferable[] }[] = []
  terminated = false

  constructor() {
    MockWorker.instances.push(this)
  }

  postMessage(data: SpeechRequest, transfer?: Transferable[]) {
    this.posted.push({ data, ...(transfer ? { transfer } : {}) })
    queueMicrotask(() => {
      if (this.terminated) return
      if (data.op === 'transcribe') {
        this.onmessage?.({
          data: { kind: 'result', id: data.id, ok: true, text: 'hello', language: 'en' },
        } as MessageEvent<SpeechResponse>)
      } else {
        this.onmessage?.({
          data: { kind: 'result', id: data.id, ok: true },
        } as MessageEvent<SpeechResponse>)
      }
    })
  }

  terminate() {
    this.terminated = true
  }
}

describe('createSpeechTranscriber', () => {
  beforeEach(() => {
    MockWorker.instances = []
    vi.useFakeTimers()
    vi.stubGlobal('Worker', MockWorker)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('passes Float32Array PCM directly without instantiating OfflineAudioContext', async () => {
    const offlineCtor = vi.fn()
    vi.stubGlobal('OfflineAudioContext', offlineCtor)

    const transcriber = createSpeechTranscriber()
    const pcm = new Float32Array([0.1, -0.2, 0.3, -0.4])
    const res = await transcriber.transcribe(pcm, { language: 'en' })

    expect(offlineCtor).not.toHaveBeenCalled()
    expect(res.text).toBe('hello')
    expect(res.language).toBe('en')
    // Caller's buffer was copied before transfer, not detached.
    expect(pcm.length).toBe(4)
    const worker = MockWorker.instances[0]
    expect(worker?.posted[0]?.data.op).toBe('transcribe')
    if (worker?.posted[0]?.data.op === 'transcribe') {
      expect(worker.posted[0].data.audio).toBeInstanceOf(Float32Array)
      expect(Array.from(worker.posted[0].data.audio)).toEqual(Array.from(pcm))
      expect(worker.posted[0].transfer).toEqual([worker.posted[0].data.audio.buffer])
    }

    // Idle auto-unload after 8 minutes terminates worker.
    vi.advanceTimersByTime(8 * 60_000 - 1)
    expect(worker?.terminated).toBe(false)
    vi.advanceTimersByTime(1)
    expect(worker?.terminated).toBe(true)
  })
})
