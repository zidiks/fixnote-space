import { OCR_MODEL, type ProgressListener, type TextRecognizer } from '@fixnote/core'
import { createWorker, OEM, PSM, type Worker } from 'tesseract.js'
import workerUrl from 'tesseract.js/dist/worker.min.js?url'
import coreUrl from 'tesseract.js-core/tesseract-core-simd-lstm.wasm.js?url'

/** The languages the app speaks; one pass reads all three (and Latin/Cyrillic mixed). */
const LANGS = ['eng', 'rus', 'spa'] as const
/** Where the language data is kept (Settings → Advanced shows and removes it). */
export const OCR_CACHE = 'fixnote-ocr'

/**
 * tesseract.js reads language data from its own cache: idb-keyval's default store, under
 * `<cachePath>/<lang>.traineddata`. The data is put there from ours before the worker starts, so it
 * never downloads anything itself. (Handing it the bytes directly is broken in 7.0.0: it joins
 * the data instead of the codes into the language list.)
 */
const TESS_DB = 'keyval-store'
const TESS_STORE = 'keyval'
const tessKey = (lang: string) => `${OCR_CACHE}/${lang}.traineddata`

function tessStore<T>(run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open(TESS_DB)
    open.onupgradeneeded = () => open.result.createObjectStore(TESS_STORE)
    open.onerror = () => reject(open.error)
    open.onsuccess = () => {
      const db = open.result
      const req = run(db.transaction(TESS_STORE, 'readwrite').objectStore(TESS_STORE))
      req.onsuccess = () => {
        resolve(req.result)
        db.close()
      }
      req.onerror = () => {
        reject(req.error)
        db.close()
      }
    }
  })
}

const dataUrl = (lang: string) =>
  `https://cdn.jsdelivr.net/npm/${OCR_MODEL.id}/${lang}/4.0.0_best_int/${lang}.traineddata.gz`

/** A language's data: from the cache, or downloaded once (reporting the bytes as they come). */
async function languageData(lang: string, onBytes: (loaded: number) => void): Promise<Uint8Array> {
  const url = dataUrl(lang)
  const cache = 'caches' in globalThis ? await caches.open(OCR_CACHE) : null
  const hit = await cache?.match(url)
  if (hit) return new Uint8Array(await hit.arrayBuffer())
  const res = await fetch(url)
  if (!res.ok || !res.body) throw new Error(`Text recognition data: HTTP ${res.status}`)
  const parts: Uint8Array[] = []
  let loaded = 0
  const reader = res.body.getReader()
  for (;;) {
    const { value, done } = await reader.read()
    if (done) break
    parts.push(value)
    loaded += value.length
    onBytes(loaded)
  }
  const bytes = new Uint8Array(loaded)
  let at = 0
  for (const p of parts) {
    bytes.set(p, at)
    at += p.length
  }
  await cache
    ?.put(url, new Response(bytes, { headers: { 'content-length': String(bytes.length) } }))
    .catch(() => undefined)
  return bytes
}

/**
 * Tesseract (tesseract.js, its own worker) reading English, Russian and Spanish. The engine ships
 * with the app; the language data (~8 MB) downloads on first use and stays in the cache.
 */
export function createTesseractRecognizer(): TextRecognizer {
  let worker: Promise<Worker> | null = null
  const listeners = new Set<ProgressListener>()

  const start = () => {
    worker ??= (async () => {
      const loaded = new Map<string, number>()
      const report = () => {
        const done = [...loaded.values()].reduce((a, b) => a + b, 0)
        const progress = Math.min(0.99, done / OCR_MODEL.approxBytes)
        for (const l of listeners) l(progress)
      }
      await Promise.all(
        LANGS.map(async (code) => {
          const data = await languageData(code, (bytes) => {
            loaded.set(code, bytes)
            report()
          })
          await tessStore((store) => store.put(data, tessKey(code)))
        }),
      )
      const w = await createWorker([...LANGS], OEM.LSTM_ONLY, {
        workerPath: new URL(workerUrl, location.href).href,
        corePath: new URL(coreUrl, location.href).href,
        workerBlobURL: false,
        cacheMethod: 'readOnly',
        cachePath: OCR_CACHE,
        legacyCore: false,
        legacyLang: false,
      })
      // A photo or a screenshot: find the text blocks on the page by themselves.
      await w.setParameters({ tessedit_pageseg_mode: PSM.AUTO })
      for (const l of listeners) l(1)
      return w
    })()
    worker.catch(() => {
      worker = null
    })
    return worker
  }

  return {
    modelId: OCR_MODEL.id,
    async ready(onProgress) {
      if (onProgress) listeners.add(onProgress)
      try {
        await start()
      } finally {
        if (onProgress) listeners.delete(onProgress)
      }
    },
    async recognize(image) {
      const w = await start()
      const { data } = await w.recognize(image)
      return clean(data.text)
    },
    unload() {
      const w = worker
      worker = null
      void w?.then((x) => x.terminate()).catch(() => undefined)
      // The files were removed: tesseract.js's copy goes too.
      for (const code of LANGS)
        void tessStore((store) => store.delete(tessKey(code))).catch(() => {})
    },
  }
}

/** Tesseract's text without the noise it reads from textures: lines with a real word in them. */
export function clean(text: string): string {
  return text
    .split('\n')
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter((l) => /[\p{L}\p{N}]{2,}/u.test(l))
    .join('\n')
    .trim()
}
