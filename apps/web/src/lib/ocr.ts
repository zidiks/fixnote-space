import {
  type Attachments,
  ImageTexts,
  OCR_MODEL,
  type SqlDriver,
  type TextRecognizer,
} from '@fixnote/core'
import { attachmentSource } from './account/account'
import { useLlm } from './assistant/llm'
import { platform } from './platform'

/** A pause between images, so reading them never makes the app feel busy. */
const GAP_MS = 1500
/** Retry images that weren't locally downloaded or failed after 30 minutes. */
const SKIP_TTL_MS = 30 * 60_000
const MAX_SKIPPED = 512

interface Deps {
  db: SqlDriver
  attachments: Attachments
  /** New text was read: search results may change. */
  onRead: () => void
}

let deps: Deps | null = null
let activeRecognizer: TextRecognizer | null = null
let running: Promise<void> | null = null
let startTimer: ReturnType<typeof setTimeout> | undefined
let visibilityWired = false
/** Images that could not be read recently (not on this device yet, broken): retried after TTL. */
const skipped = new Map<string, number>()

function isSkipped(id: string): boolean {
  const at = skipped.get(id)
  if (at === undefined) return false
  if (Date.now() - at > SKIP_TTL_MS) {
    skipped.delete(id)
    return false
  }
  return true
}

function markSkipped(id: string) {
  if (skipped.size >= MAX_SKIPPED) {
    const oldest = skipped.keys().next().value
    if (oldest !== undefined) skipped.delete(oldest)
  }
  skipped.set(id, Date.now())
}

async function canRunOcrWithoutNetwork(): Promise<boolean> {
  if (!useLlm.getState().localOnly) return true
  if (platform.models?.has) return platform.models.has(OCR_MODEL.id)
  if (platform.models) return (await platform.models.size(OCR_MODEL.id)) > 0
  return false
}

/** Reads the text of an image, now (the dialog), storing it for search. */
export async function readImageText(id: string, onProgress?: (p: number) => void): Promise<string> {
  const d = deps
  if (!d || !platform.ocr) throw new Error('Text recognition is not available here')
  const texts = new ImageTexts(d.db)
  const known = await texts.get(id)
  if (known !== null) return known
  if (!(await canRunOcrWithoutNetwork())) {
    throw new Error('OCR language data is not downloaded in local-only mode')
  }
  const blob = await d.attachments.load(id, attachmentSource())
  if (!blob) throw new Error('The image is not on this device yet')
  skipped.delete(id)
  const recognizer = await platform.ocr()
  activeRecognizer = recognizer
  await recognizer.ready(onProgress)
  const text = await recognizer.recognize(blob)
  await texts.set(id, text)
  d.onRead()
  return text
}

async function readPending(recognizer: TextRecognizer, d: Deps) {
  const texts = new ImageTexts(d.db)
  for (;;) {
    if (document.hidden) return
    const id = (await texts.pending(20)).find((x) => !isSkipped(x))
    if (!id) return
    try {
      // Only what is on this device: reading never downloads the images of other devices.
      const blob = await d.attachments.load(id)
      if (!blob) {
        markSkipped(id)
        continue
      }
      if (document.hidden) return
      await recognizer.ready()
      if (document.hidden) return
      await texts.set(id, await recognizer.recognize(blob))
      d.onRead()
    } catch {
      markSkipped(id)
    }
    await new Promise((r) => setTimeout(r, GAP_MS))
  }
}

/** Reads images waiting for it, one at a time, when the window is in use. */
export function readImagesSoon() {
  const d = deps
  const ocr = platform.ocr
  if (!d || !ocr || running || document.hidden) return
  running = (async () => {
    try {
      if (!(await canRunOcrWithoutNetwork())) return
      if (!(await new ImageTexts(d.db).pending(20)).some((x) => !isSkipped(x))) return
      const recognizer = await ocr()
      activeRecognizer = recognizer
      await readPending(recognizer, d)
    } catch {
      // The data could not be downloaded (offline): the next event tries again.
    } finally {
      running = null
    }
  })()
}

/** Event-driven background OCR: once after start, when images are added/synced, and on request. */
export function initOcr(d: Deps) {
  deps = d
  clearTimeout(startTimer)
  startTimer = setTimeout(readImagesSoon, 10_000)
  if (!visibilityWired && typeof document !== 'undefined') {
    visibilityWired = true
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        activeRecognizer?.sleep?.()
      }
    })
  }
}
