import type { LocalModels } from '@fixnote/core'

/** Where transformers.js keeps model files (its `env.cacheKey`), shared by all workers. */
const CACHE = 'transformers-cache'

const filesOf = async (modelId: string) => {
  if (!('caches' in globalThis)) return null
  const cache = await caches.open(CACHE)
  const requests = (await cache.keys()).filter((r) => r.url.includes(`/${modelId}/`))
  return { cache, requests }
}

export const localModels: LocalModels = {
  async size(modelId) {
    const found = await filesOf(modelId)
    if (!found) return 0
    let total = 0
    for (const request of found.requests) {
      const response = await found.cache.match(request)
      if (!response) continue
      const length = Number(response.headers.get('content-length'))
      total += length > 0 ? length : (await response.blob()).size
    }
    return total
  },
  async remove(modelId) {
    const found = await filesOf(modelId)
    if (!found) return
    for (const request of found.requests) await found.cache.delete(request)
  },
}
