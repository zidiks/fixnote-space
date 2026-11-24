import { afterEach, describe, expect, it, vi } from 'vitest'
import { localModels } from './models'

describe('localModels.has', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('checks cache keys without calling cache.match() or reading blobs', async () => {
    const match = vi.fn()
    const cachesByName: Record<string, { keys: () => Promise<Request[]>; match: typeof match }> = {
      'transformers-cache': {
        keys: vi.fn(
          async () =>
            [
              {
                url: 'https://huggingface.co/Xenova/multilingual-e5-small/resolve/main/model.onnx',
              },
            ] as Request[],
        ),
        match,
      },
      'fixnote-ocr': {
        keys: vi.fn(
          async () =>
            [
              {
                url: 'https://cdn.jsdelivr.net/npm/tessdata/eng/4.0.0_best_int/eng.traineddata.gz',
              },
            ] as Request[],
        ),
        match,
      },
    }
    vi.stubGlobal('caches', {
      open: vi.fn(async (name: string) => cachesByName[name]),
    })

    expect(await localModels.has?.('Xenova/multilingual-e5-small')).toBe(true)
    // Found in first cache: never opened second cache and never called match().
    expect(cachesByName['fixnote-ocr']?.keys).not.toHaveBeenCalled()
    expect(match).not.toHaveBeenCalled()

    expect(await localModels.has?.('tessdata')).toBe(true)
    expect(await localModels.has?.('missing/model')).toBe(false)
    expect(match).not.toHaveBeenCalled()
  })

  it('returns false when CacheStorage is unavailable', async () => {
    const prev = globalThis.caches
    // @ts-expect-error testing missing global caches
    delete globalThis.caches
    try {
      expect(await localModels.has?.('Xenova/multilingual-e5-small')).toBe(false)
    } finally {
      Object.defineProperty(globalThis, 'caches', { value: prev, configurable: true })
    }
  })
})
