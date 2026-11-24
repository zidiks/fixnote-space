import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createTransformersEmbedder } from './client'
import type { EmbedRequest, EmbedResponse } from './protocol'

class MockEmbedWorker {
  static instances: MockEmbedWorker[] = []
  onmessage: ((e: MessageEvent<EmbedResponse>) => void) | null = null
  onerror: ((e: ErrorEvent) => void) | null = null
  terminated = false

  constructor() {
    MockEmbedWorker.instances.push(this)
  }

  postMessage(data: EmbedRequest) {
    queueMicrotask(() => {
      if (this.terminated) return
      this.onmessage?.({
        data: { kind: 'received', id: data.id },
      } as MessageEvent<EmbedResponse>)
      this.onmessage?.({
        data: {
          kind: 'result',
          id: data.id,
          ok: true,
          ...(data.op === 'embed'
            ? { vectors: data.texts.map(() => new Float32Array([1, 0])) }
            : {}),
        },
      } as MessageEvent<EmbedResponse>)
    })
  }

  terminate() {
    this.terminated = true
  }
}

describe('createTransformersEmbedder idle lifecycle', () => {
  beforeEach(() => {
    MockEmbedWorker.instances = []
    vi.useFakeTimers()
    vi.stubGlobal('Worker', MockEmbedWorker)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('auto-unloads after 4 minutes visible and seamlessly re-spawns on next embed', async () => {
    const embedder = createTransformersEmbedder()
    const first = await embedder.embed(['hello'], 'query')
    expect(first).toHaveLength(1)
    expect(MockEmbedWorker.instances).toHaveLength(1)
    expect(MockEmbedWorker.instances[0]?.terminated).toBe(false)

    vi.advanceTimersByTime(4 * 60_000 - 1)
    expect(MockEmbedWorker.instances[0]?.terminated).toBe(false)
    vi.advanceTimersByTime(1)
    expect(MockEmbedWorker.instances[0]?.terminated).toBe(true)

    const second = await embedder.embed(['world'], 'passage')
    expect(second).toHaveLength(1)
    expect(MockEmbedWorker.instances).toHaveLength(2)
    expect(MockEmbedWorker.instances[1]?.terminated).toBe(false)
  })
})
