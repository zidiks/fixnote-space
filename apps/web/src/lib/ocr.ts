import {
  type Attachments,
  ImageTexts,
  OCR_MODEL,
  type SqlDriver,
  type TextRecognizer,
} from '@fixnote/core'
import { attachmentSource } from './account/account'
import { useLlm } from './assistant/llm'
import { extractAttachmentText } from './attachment-text'
import { platform } from './platform'

/** A pause between attachments, so reading them never makes the app feel busy. */
const GAP_MS = 1200
/** Retry attachments that weren't locally downloaded or failed after 30 minutes. */
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
/** Attachments that could not be read recently (not on this device yet, broken): retried after TTL. */
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

async function lazyOcr(
  onProgress?: (p: number) => void,
): Promise<((image: Blob) => Promise<string>) | undefined> {
  if (!platform.ocr) return undefined
  if (!(await canRunOcrWithoutNetwork())) return undefined
  let ready: Promise<TextRecognizer> | null = null
  const getRecognizer = () => {
    if (!ready) {
      ready = (async () => {
        const recognizer = await platform.ocr?.()
        if (!recognizer) throw new Error('Text recognition is not available here')
        activeRecognizer = recognizer
        await recognizer.ready(onProgress)
        return recognizer
      })()
    }
    return ready
  }
  return async (image: Blob) => {
    const recognizer = await getRecognizer()
    return recognizer.recognize(image)
  }
}

/** Reads the text of an attachment (image OCR, multi-page PDF + OCR, DOCX, XLSX, text), storing it for search. */
export async function readImageText(
  id: string,
  onProgress?: (p: number) => void,
  opts: { name?: string; force?: boolean } = {},
): Promise<string> {
  const d = deps
  if (!d) throw new Error('Text extraction is not available here')
  const texts = new ImageTexts(d.db)
  if (!opts.force) {
    const known = await texts.get(id)
    if (known !== null) return known
  }
  const blob = await d.attachments.load(id, attachmentSource())
  if (!blob) throw new Error('The file is not on this device yet')
  const isImage = blob.type.startsWith('image/')
  if (isImage && !platform.ocr) throw new Error('Text recognition is not available here')
  if (isImage && !(await canRunOcrWithoutNetwork())) {
    throw new Error('OCR language data is not downloaded in local-only mode')
  }
  skipped.delete(id)
  const ocr = await lazyOcr(onProgress)
  const { text } = await extractAttachmentText(blob, {
    name: opts.name,
    mime: blob.type,
    ocr,
    maxOcrPages: 40,
    onProgress,
  })
  await texts.set(id, text)
  d.onRead()
  return text
}

async function readPending(d: Deps) {
  const texts = new ImageTexts(d.db)
  const ocr = await lazyOcr()
  for (;;) {
    if (document.hidden) return
    const id = (await texts.pending(20)).find((x) => !isSkipped(x))
    if (!id) return
    try {
      // Only what is on this device: reading never downloads files of other devices.
      const blob = await d.attachments.load(id)
      if (!blob) {
        markSkipped(id)
        continue
      }
      if (document.hidden) return
      const isImage = blob.type.startsWith('image/')
      if (isImage && !ocr) {
        markSkipped(id)
        continue
      }
      const { text } = await extractAttachmentText(blob, {
        mime: blob.type,
        ocr,
        maxOcrPages: 25,
        shouldAbort: () => document.hidden,
      })
      if (document.hidden) return
      await texts.set(id, text)
      d.onRead()
    } catch {
      markSkipped(id)
    }
    await new Promise((r) => setTimeout(r, GAP_MS))
  }
}

/** Reads attachments waiting for indexing/OCR, one at a time, when the window is in use. */
export function readImagesSoon() {
  const d = deps
  if (!d || running || document.hidden) return
  running = (async () => {
    try {
      if (!(await new ImageTexts(d.db).pending(20)).some((x) => !isSkipped(x))) return
      await readPending(d)
    } catch {
      // The data could not be downloaded (offline): the next event tries again.
    } finally {
      running = null
    }
  })()
}

/** Event-driven background indexing & OCR: once after start, when files are added/synced, and on request. */
export function initOcr(d: Deps) {
  deps = d
  clearTimeout(startTimer)
  startTimer = setTimeout(readImagesSoon, 8_000)
  if (!visibilityWired && typeof document !== 'undefined') {
    visibilityWired = true
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        activeRecognizer?.sleep?.()
      }
    })
  }
}
