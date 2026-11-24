import { describe, expect, it } from 'vitest'
import { isOomError, trimTokenIds } from './budget'

describe('local LLM memory budget helpers', () => {
  it('detects ONNX Runtime std::bad_alloc and WASM/WebGPU OOM errors', () => {
    expect(
      isOomError(
        new Error('failed to call OrtRun(). ERROR_CODE: 6, ERROR_MESSAGE: std::bad_alloc'),
      ),
    ).toBe(true)
    expect(isOomError(new Error('WebGPU out of memory'))).toBe(true)
    expect(isOomError(new Error('RangeError: Array buffer allocation failed'))).toBe(true)
    expect(isOomError(new Error('Network request failed'))).toBe(false)
  })

  it('trims overly long prompts from the middle while preserving system head and user tail', () => {
    const ids = BigInt64Array.from({ length: 100 }, (_, i) => BigInt(i))
    expect(trimTokenIds(ids, 200)).toBe(ids)

    const trimmed = trimTokenIds(ids, 20)
    expect(trimmed.length).toBe(20)
    // First 7 tokens (35% of 20) preserved: 0..6
    expect([...trimmed.slice(0, 7)]).toEqual([0n, 1n, 2n, 3n, 4n, 5n, 6n])
    // Last 13 tokens preserved: 87..99
    expect([...trimmed.slice(7)]).toEqual([
      87n,
      88n,
      89n,
      90n,
      91n,
      92n,
      93n,
      94n,
      95n,
      96n,
      97n,
      98n,
      99n,
    ])
  })
})
