import type { LocalModels } from '@fixnote/core'

/**
 * Where model files are kept: transformers.js's cache (its `env.cacheKey`, shared by all
 * workers) and the text recognition data (ocr/client.ts).
 */
const CACHES = ['transformers-cache', 'fixnote-ocr']

const filesOf = async (modelId: string) => {
  if (!('caches' in globalThis)) return null
  const out: { cache: Cache; request: Request }[] = []
  for (const name of CACHES) {
    const cache = await caches.open(name)
    for (const request of await cache.keys())
      if (request.url.includes(`/${modelId}/`)) out.push({ cache, request })
  }
  return out
}

export const localModels: LocalModels = {
  async size(modelId) {
    const found = await filesOf(modelId)
    if (!found) return 0
    // In parallel: a file cached without its length is measured by reading it, which takes a
    // moment for hundreds of megabytes.
    const sizes = await Promise.all(
      found.map(async ({ cache, request }) => {
        const response = await cache.match(request)
        if (!response) return 0
        const length = Number(response.headers.get('content-length'))
        return length > 0 ? length : (await response.blob()).size
      }),
    )
    return sizes.reduce((a, b) => a + b, 0)
  },
  async remove(modelId) {
    for (const { cache, request } of (await filesOf(modelId)) ?? []) await cache.delete(request)
  },
}
