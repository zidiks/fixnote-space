import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createLocalLlm, toLocal } from './client'
import type { LlmRequest, LlmResponse } from './protocol'

describe('chat messages for a small on-device model', () => {
  it('keeps the system prompt first and turns tool results into notes from the user', () => {
    expect(
      toLocal([
        { role: 'system', content: 'Be brief.' },
        { role: 'user', content: 'What about Lisbon?' },
        { role: 'assistant', content: '' },
        { role: 'tool', content: '# Lisbon in March\nFlights booked.' },
      ]),
    ).toEqual([
      { role: 'system', content: 'Be brief.' },
      {
        role: 'user',
        content: 'What about Lisbon?\n\nResult from the notes:\n# Lisbon in March\nFlights booked.',
      },
    ])
  })

  it('reads text parts and drops empty turns', () => {
    expect(
      toLocal([
        { role: 'user', content: [{ type: 'text', text: 'Hi' }] },
        { role: 'assistant', content: 'Hello' },
        { role: 'user', content: '   ' },
      ]),
    ).toEqual([
      { role: 'user', content: 'Hi' },
      { role: 'assistant', content: 'Hello' },
    ])
  })
})

class MockLlmWorker {
  static instances: MockLlmWorker[] = []
  onmessage: ((e: MessageEvent<LlmResponse>) => void) | null = null
  onerror: ((e: ErrorEvent) => void) | null = null
  terminated = false

  constructor() {
    MockLlmWorker.instances.push(this)
  }

  postMessage(data: LlmRequest) {
    if (data.op === 'stop') return
    queueMicrotask(() => {
      if (this.terminated) return
      if (data.op === 'generate') {
        this.onmessage?.({
          data: { kind: 'text', id: data.id, text: 'hi' },
        } as MessageEvent<LlmResponse>)
        this.onmessage?.({
          data: { kind: 'result', id: data.id, ok: true, tokens: 10, ms: 500 },
        } as MessageEvent<LlmResponse>)
      } else {
        this.onmessage?.({
          data: { kind: 'result', id: data.id, ok: true },
        } as MessageEvent<LlmResponse>)
      }
    })
  }

  terminate() {
    this.terminated = true
  }
}

describe('createLocalLlm idle lifecycle', () => {
  beforeEach(() => {
    MockLlmWorker.instances = []
    vi.useFakeTimers()
    vi.stubGlobal('Worker', MockLlmWorker)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('unloads 60s after benchmark when no fetch follows', async () => {
    const llm = createLocalLlm()
    const tps = await llm.benchmark('test-model')
    expect(tps).toBe(20)
    expect(MockLlmWorker.instances[0]?.terminated).toBe(false)

    vi.advanceTimersByTime(59_999)
    expect(MockLlmWorker.instances[0]?.terminated).toBe(false)
    vi.advanceTimersByTime(1)
    expect(MockLlmWorker.instances[0]?.terminated).toBe(true)
  })

  it('resets to 12m idle TTL when fetch follows benchmark', async () => {
    const llm = createLocalLlm()
    await llm.benchmark('test-model')
    const res = await llm.fetch('http://local', {
      body: JSON.stringify({ model: 'test-model', messages: [{ role: 'user', content: 'hi' }] }),
    })
    await res.text()

    vi.advanceTimersByTime(60_000)
    expect(MockLlmWorker.instances[0]?.terminated).toBe(false)
    vi.advanceTimersByTime(11 * 60_000 - 1)
    expect(MockLlmWorker.instances[0]?.terminated).toBe(false)
    vi.advanceTimersByTime(1)
    expect(MockLlmWorker.instances[0]?.terminated).toBe(true)
  })
})
