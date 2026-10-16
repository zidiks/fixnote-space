/**
 * Model files fetched once from Hugging Face and kept in the same Cache Storage as
 * transformers.js's (so Settings → Advanced measures and removes them the same way).
 */
const CACHE = 'transformers-cache'

export const hubUrl = (model: string, file: string) =>
  `https://huggingface.co/${model}/resolve/main/${file}`

/** Bytes of all files of one download so far, so one bar covers them and only moves forward. */
export type FileProgress = (url: string, loaded: number, total: number) => void

async function open(): Promise<Cache | null> {
  try {
    return 'caches' in globalThis ? await caches.open(CACHE) : null
  } catch {
    return null
  }
}

export async function fetchFile(url: string, onProgress?: FileProgress): Promise<Uint8Array> {
  const cache = await open()
  const cached = await cache?.match(url)
  if (cached) {
    const bytes = new Uint8Array(await cached.arrayBuffer())
    onProgress?.(url, bytes.length, bytes.length)
    return bytes
  }
  const response = await fetch(url)
  if (!response.ok || !response.body)
    throw new Error(`Could not download ${url} (${response.status})`)
  const total = Number(response.headers.get('content-length')) || 0
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let loaded = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
    loaded += value.length
    onProgress?.(url, loaded, Math.max(total, loaded))
  }
  const bytes = new Uint8Array(loaded)
  let at = 0
  for (const chunk of chunks) {
    bytes.set(chunk, at)
    at += chunk.length
  }
  try {
    await cache?.put(
      url,
      new Response(bytes, { headers: { 'content-length': String(bytes.length) } }),
    )
  } catch {
    // Storage full or not allowed: it works now and downloads again next time.
  }
  return bytes
}
