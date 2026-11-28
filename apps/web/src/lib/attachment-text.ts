import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { type AttachmentKind, sniffAttachmentKind } from './attachment-kind'

/** Cap extracted text per attachment so FTS stays fast even on huge workbooks or logs. */
const MAX_INDEXED_CHARS = 250_000
/** Maximum PDF pages scanned for embedded text in one pass. */
const MAX_PDF_TEXT_PAGES = 200
/** Maximum scanned PDF pages sent to Tesseract OCR per document. */
const DEFAULT_MAX_OCR_PAGES = 25
/** A PDF page with fewer non-space chars than this is treated as scanned and sent to OCR. */
const SCANNED_PAGE_THRESHOLD = 25
/** Max pixel dimension when rasterizing a PDF page for OCR. */
const MAX_OCR_CANVAS_PX = 2000

let pdfJsPromise: Promise<typeof import('pdfjs-dist')> | null = null

export async function loadPdfJs() {
  if (!pdfJsPromise) {
    pdfJsPromise = import('pdfjs-dist').then((pdfjs) => {
      pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl
      return pdfjs
    })
  }
  return pdfJsPromise
}

export interface ExtractAttachmentOptions {
  name?: string
  mime?: string
  /** Optional on-device OCR callback (lazy: only called for images and scanned PDF pages). */
  ocr?: (image: Blob) => Promise<string>
  maxOcrPages?: number
  onProgress?: (progress: number) => void
  shouldAbort?: () => boolean
}

function clampText(text: string): string {
  const cleaned = text.replace(/\0/g, '').trim()
  return cleaned.length > MAX_INDEXED_CHARS ? cleaned.slice(0, MAX_INDEXED_CHARS) : cleaned
}

function stripRtf(rtf: string): string {
  return rtf
    .replace(/\\par[d]?/g, '\n')
    .replace(/\\tab/g, '\t')
    .replace(/\\'([0-9a-fA-F]{2})/g, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/\\u(-?\d+)\??/g, (_, code: string) => {
      const n = parseInt(code, 10)
      return String.fromCharCode(n < 0 ? n + 65536 : n)
    })
    .replace(/\\[a-z]+-?\d* ?/gi, '')
    .replace(/[{}]/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

async function renderPdfPageToBlob(page: import('pdfjs-dist').PDFPageProxy): Promise<Blob | null> {
  if (typeof document === 'undefined') return null
  const baseViewport = page.getViewport({ scale: 1 })
  const maxDim = Math.max(baseViewport.width, baseViewport.height, 1)
  const scale = Math.min(1.75, MAX_OCR_CANVAS_PX / maxDim)
  const viewport = page.getViewport({ scale })
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.floor(viewport.width))
  canvas.height = Math.max(1, Math.floor(viewport.height))
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  try {
    await page.render({ canvas, canvasContext: ctx, viewport }).promise
    return await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
  } finally {
    canvas.width = 0
    canvas.height = 0
  }
}

export async function extractPdfText(
  blob: Blob,
  opts: {
    ocr?: (image: Blob) => Promise<string>
    maxOcrPages?: number
    onProgress?: (progress: number) => void
    shouldAbort?: () => boolean
  } = {},
): Promise<string> {
  const pdfjs = await loadPdfJs()
  const data = new Uint8Array(await blob.arrayBuffer())
  const task = pdfjs.getDocument({ data, useSystemFonts: true })
  const doc = await task.promise
  const totalPages = Math.min(doc.numPages, MAX_PDF_TEXT_PAGES)
  const maxOcrPages = opts.maxOcrPages ?? DEFAULT_MAX_OCR_PAGES
  const pages: string[] = []
  let ocrCount = 0
  let totalChars = 0

  try {
    for (let i = 1; i <= totalPages; i++) {
      if (opts.shouldAbort?.()) break
      const page = await doc.getPage(i)
      let pageText = ''
      try {
        const content = await page.getTextContent()
        const parts: string[] = []
        for (const item of content.items) {
          if (!('str' in item)) continue
          parts.push(item.str)
          if (item.hasEOL) parts.push('\n')
          else parts.push(' ')
        }
        pageText = parts
          .join('')
          .replace(/[ \t]+\n/g, '\n')
          .replace(/[ \t]{2,}/g, ' ')
          .replace(/\n{3,}/g, '\n\n')
          .trim()

        // Scanned PDF page: little or no embedded text -> rasterize and run on-device OCR.
        const denseLen = pageText.replace(/\s+/g, '').length
        if (denseLen < SCANNED_PAGE_THRESHOLD && opts.ocr && ocrCount < maxOcrPages) {
          const imgBlob = await renderPdfPageToBlob(page)
          if (imgBlob && !opts.shouldAbort?.()) {
            ocrCount++
            const ocrText = (await opts.ocr(imgBlob)).trim()
            if (ocrText.length > pageText.length) pageText = ocrText
          }
        }
      } finally {
        page.cleanup()
      }

      if (pageText) {
        const formatted = doc.numPages > 1 ? `[Page ${i}]\n${pageText}` : pageText
        pages.push(formatted)
        totalChars += formatted.length
        if (totalChars >= MAX_INDEXED_CHARS) break
      }
      opts.onProgress?.(i / totalPages)
    }
  } finally {
    await task.destroy().catch(() => undefined)
  }

  return clampText(pages.join('\n\n'))
}

export async function extractDocxText(blob: Blob): Promise<string> {
  const mammoth = await import('mammoth')
  const arrayBuffer = await blob.arrayBuffer()
  const { value } = await mammoth.extractRawText({ arrayBuffer })
  return clampText(value)
}

export async function extractSpreadsheetText(blob: Blob): Promise<string> {
  const XLSX = await import('xlsx')
  const arrayBuffer = await blob.arrayBuffer()
  const workbook = XLSX.read(arrayBuffer, { type: 'array' })
  const sections: string[] = []
  let totalChars = 0

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName]
    if (!sheet) continue
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '' })
    const lines: string[] = []
    for (const row of rows) {
      const cells = row
        .map((c) => (c === null || c === undefined ? '' : String(c).trim()))
        .filter(Boolean)
      if (!cells.length) continue
      const line = cells.join(' | ')
      lines.push(line)
      totalChars += line.length
      if (totalChars >= MAX_INDEXED_CHARS) break
    }
    if (lines.length) {
      sections.push(
        workbook.SheetNames.length > 1 ? `[${sheetName}]\n${lines.join('\n')}` : lines.join('\n'),
      )
    }
    if (totalChars >= MAX_INDEXED_CHARS) break
  }

  return clampText(sections.join('\n\n'))
}

export async function extractPlainText(blob: Blob): Promise<string> {
  const raw = await blob.text()
  const text = raw.trimStart().startsWith('{\\rtf') ? stripRtf(raw) : raw
  return clampText(text)
}

/**
 * Extracts searchable text from any supported attachment:
 * - Images: on-device Tesseract OCR
 * - Multi-page PDFs: embedded text layer + automatic OCR fallback on scanned pages
 * - Word (.docx): mammoth text extraction
 * - Spreadsheets (.xlsx, .xls, .ods, .csv, .tsv): SheetJS all-sheets extraction
 * - Plain text / Markdown / JSON / XML / RTF / code: UTF-8 decoding
 */
export async function extractAttachmentText(
  blob: Blob,
  opts: ExtractAttachmentOptions = {},
): Promise<{ kind: AttachmentKind; text: string }> {
  const head = new Uint8Array(await blob.slice(0, 65_536).arrayBuffer())
  const kind = sniffAttachmentKind(head, opts.name ?? '', opts.mime ?? blob.type)
  switch (kind) {
    case 'image':
      if (!opts.ocr || blob.type === 'image/svg+xml') return { kind, text: '' }
      return { kind, text: clampText(await opts.ocr(blob)) }
    case 'pdf':
      return {
        kind,
        text: await extractPdfText(blob, {
          ocr: opts.ocr,
          maxOcrPages: opts.maxOcrPages,
          onProgress: opts.onProgress,
          shouldAbort: opts.shouldAbort,
        }),
      }
    case 'docx':
      return { kind, text: await extractDocxText(blob) }
    case 'spreadsheet':
      return { kind, text: await extractSpreadsheetText(blob) }
    case 'text':
      return { kind, text: await extractPlainText(blob) }
    default:
      return { kind, text: '' }
  }
}
