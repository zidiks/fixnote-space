import { type Attachments, ImageTexts, type SqlDriver, type TextRecognizer } from '@fixnote/core'
import { attachmentSource } from './account/account'
import { platform } from './platform'

/** A pause between images, so reading them never makes the app feel busy. */
const GAP_MS = 1500
/** How often the background looks for new images. */
const EVERY_MS = 30_000

interface Deps {
  db: SqlDriver
  attachments: Attachments
  /** New text was read: search results may change. */
  onRead: () => void
}

let deps: Deps | null = null
let running: Promise<void> | null = null
let timer: ReturnType<typeof setInterval> | undefined
/** Images that could not be read this session (not on this device yet, broken): tried later. */
const skipped = new Set<string>()

/** Reads the text of an image, now (the dialog), storing it for search. */
export async function readImageText(id: string, onProgress?: (p: number) => void): Promise<string> {
  const d = deps
  if (!d || !platform.ocr) throw new Error('Text recognition is not available here')
  const texts = new ImageTexts(d.db)
  const known = await texts.get(id)
  if (known !== null) return known
  const blob = await d.attachments.load(id, attachmentSource())
  if (!blob) throw new Error('The image is not on this device yet')
  const recognizer = await platform.ocr()
  await recognizer.ready(onProgress)
  const text = await recognizer.recognize(blob)
  await texts.set(id, text)
  d.onRead()
  return text
}

async function readPending(recognizer: TextRecognizer, d: Deps) {
  const texts = new ImageTexts(d.db)
  for (;;) {
    const id = (await texts.pending(20)).find((x) => !skipped.has(x))
    if (!id) return
    try {
      // Only what is on this device: reading never downloads the images of other devices.
      const blob = await d.attachments.load(id)
      if (!blob) {
        skipped.add(id)
        continue
      }
      await recognizer.ready()
      await texts.set(id, await recognizer.recognize(blob))
      d.onRead()
    } catch {
      skipped.add(id)
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
      if (!(await new ImageTexts(d.db).pending(20)).some((x) => !skipped.has(x))) return
      await readPending(await ocr(), d)
    } catch {
      // The data could not be downloaded (offline): the next round tries again.
    } finally {
      running = null
    }
  })()
}

/** Starts reading images in the background: now and then, and on request. */
export function initOcr(d: Deps) {
  deps = d
  clearInterval(timer)
  timer = setInterval(readImagesSoon, EVERY_MS)
  setTimeout(readImagesSoon, 10_000)
}
