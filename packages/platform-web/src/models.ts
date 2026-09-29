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
    let total = 0
    for (const { cache, request } of found) {
      const response = await cache.match(request)
      if (!response) continue
      const length = Number(response.headers.get('content-length'))
      total += length > 0 ? length : (await response.blob()).size
    }
    return total
  },
  async remove(modelId) {
    for (const { cache, request } of (await filesOf(modelId)) ?? []) await cache.delete(request)
  },
}
