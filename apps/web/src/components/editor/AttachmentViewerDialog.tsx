import { useTranslation } from '@fixnote/i18n'
import {
  Button,
  cn,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  Spinner,
} from '@fixnote/ui'
import {
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  FileSpreadsheet,
  FileText,
  Image as ImageIcon,
  Paperclip,
  RotateCw,
  ScanText,
  Search,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { attachmentSource } from '../../lib/account/account'
import {
  type AttachmentKind,
  attachmentBadge,
  isTextIndexable,
  sniffAttachmentKind,
} from '../../lib/attachment-kind'
import { extractPlainText, loadPdfJs } from '../../lib/attachment-text'
import { fileSize, saveAttachment } from '../../lib/attachments'
import { useDb } from '../../lib/db'
import { readImageText } from '../../lib/ocr'

export interface AttachmentViewerTarget {
  id: string
  name: string
  size?: string
}

interface SpreadsheetData {
  sheets: { name: string; rows: string[][] }[]
}

const MAX_RENDERED_ROWS = 1500
const MAX_RENDERED_COLS = 60

function PdfPageCanvas({
  doc,
  pageNumber,
  scale,
  rotation,
  highlighted,
}: {
  doc: import('pdfjs-dist').PDFDocumentProxy
  pageNumber: number
  scale: number
  rotation: number
  highlighted: boolean
}) {
  const hostRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [visible, setVisible] = useState(pageNumber <= 2)
  const [rendered, setRendered] = useState(false)

  useEffect(() => {
    const el = hostRef.current
    if (!el || visible) return
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible(true)
          io.disconnect()
        }
      },
      { rootMargin: '400px 0px' },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [visible])

  useEffect(() => {
    if (!visible) return
    let cancelled = false
    let renderTask: { cancel: () => void; promise: Promise<void> } | null = null
    void (async () => {
      try {
        const page = await doc.getPage(pageNumber)
        if (cancelled) return
        const viewport = page.getViewport({ scale, rotation })
        const canvas = canvasRef.current
        if (!canvas) return
        const dpr = Math.min(window.devicePixelRatio || 1, 2)
        canvas.width = Math.max(1, Math.floor(viewport.width * dpr))
        canvas.height = Math.max(1, Math.floor(viewport.height * dpr))
        canvas.style.width = `${Math.floor(viewport.width)}px`
        canvas.style.height = `${Math.floor(viewport.height)}px`
        const ctx = canvas.getContext('2d')
        if (!ctx) return
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
        renderTask = page.render({ canvas, canvasContext: ctx, viewport })
        await renderTask.promise
        if (!cancelled) setRendered(true)
      } catch {
        // Cancelled or failed render.
      }
    })()
    return () => {
      cancelled = true
      try {
        renderTask?.cancel()
      } catch {
        // Ignore cancel errors.
      }
    }
  }, [doc, pageNumber, scale, rotation, visible])

  return (
    <div
      ref={hostRef}
      data-pdf-page={pageNumber}
      className={cn(
        'relative mx-auto flex min-h-[360px] flex-col items-center justify-center rounded-lg border bg-white shadow-sm transition-shadow',
        highlighted && 'ring-2 ring-brand',
      )}
    >
      <canvas ref={canvasRef} className={cn('block rounded-lg', !rendered && 'opacity-0')} />
      {!rendered ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <Spinner />
        </div>
      ) : null}
      <span className="pointer-events-none absolute right-2 bottom-2 rounded bg-black/60 px-1.5 py-0.5 text-[11px] font-medium text-white">
        {pageNumber}
      </span>
    </div>
  )
}

function PdfViewer({ blob }: { blob: Blob }) {
  const { t } = useTranslation()
  const [doc, setDoc] = useState<import('pdfjs-dist').PDFDocumentProxy | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [scale, setScale] = useState(1.15)
  const [rotation, setRotation] = useState(0)
  const [currentPage, setCurrentPage] = useState(1)
  const [query, setQuery] = useState('')
  const [pageTexts, setPageTexts] = useState<string[]>([])
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let alive = true
    let loadingTask: import('pdfjs-dist').PDFDocumentLoadingTask | null = null
    setDoc(null)
    setError(null)
    setCurrentPage(1)
    setPageTexts([])

    void (async () => {
      try {
        const pdfjs = await loadPdfJs()
        const data = new Uint8Array(await blob.arrayBuffer())
        loadingTask = pdfjs.getDocument({ data, useSystemFonts: true })
        const loaded = await loadingTask.promise
        if (!alive) {
          await loadingTask.destroy().catch(() => undefined)
          return
        }
        setDoc(loaded)

        // Extract per-page text in background for instant in-viewer search.
        const texts: string[] = []
        const limit = Math.min(loaded.numPages, 200)
        for (let i = 1; i <= limit; i++) {
          if (!alive) break
          const page = await loaded.getPage(i)
          try {
            const tc = await page.getTextContent()
            texts.push(
              tc.items
                .map((it) => ('str' in it ? it.str : ''))
                .join(' ')
                .toLowerCase(),
            )
          } finally {
            page.cleanup()
          }
        }
        if (alive) setPageTexts(texts)
      } catch (err) {
        if (alive) setError(err instanceof Error ? err.message : String(err))
      }
    })()

    return () => {
      alive = false
      void loadingTask?.destroy().catch(() => undefined)
    }
  }, [blob])

  const matchingPages = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q || !pageTexts.length) return []
    const hits: number[] = []
    pageTexts.forEach((txt, idx) => {
      if (txt.includes(q)) hits.push(idx + 1)
    })
    return hits
  }, [query, pageTexts])

  const jumpToPage = useCallback(
    (pageNum: number) => {
      if (!doc) return
      const clamped = Math.max(1, Math.min(doc.numPages, pageNum))
      setCurrentPage(clamped)
      const el = scrollRef.current?.querySelector<HTMLElement>(`[data-pdf-page="${clamped}"]`)
      el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    },
    [doc],
  )

  useEffect(() => {
    if (matchingPages.length > 0 && matchingPages[0]) {
      jumpToPage(matchingPages[0])
    }
  }, [matchingPages, jumpToPage])

  if (error) {
    return (
      <p className="p-8 text-center text-sm text-destructive">
        {t('viewer.failed', { message: error })}
      </p>
    )
  }
  if (!doc) {
    return (
      <div className="flex flex-1 items-center justify-center gap-2 text-sm text-muted-foreground">
        <Spinner />
        {t('viewer.loading')}
      </div>
    )
  }

  const pageNumbers = Array.from({ length: doc.numPages }, (_, i) => i + 1)

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b bg-muted/30 px-4 py-2 text-xs">
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="size-7 p-0"
            disabled={currentPage <= 1}
            onClick={() => jumpToPage(currentPage - 1)}
            aria-label={t('viewer.prevPage')}
          >
            <ChevronLeft className="size-4" />
          </Button>
          <span className="min-w-14 text-center tabular-nums text-muted-foreground">
            {currentPage} / {doc.numPages}
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="size-7 p-0"
            disabled={currentPage >= doc.numPages}
            onClick={() => jumpToPage(currentPage + 1)}
            aria-label={t('viewer.nextPage')}
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>
        <div className="h-4 w-px bg-border" />
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="size-7 p-0"
            disabled={scale <= 0.5}
            onClick={() => setScale((s) => Math.max(0.5, +(s - 0.2).toFixed(2)))}
            aria-label={t('viewer.zoomOut')}
          >
            <ZoomOut className="size-3.5" />
          </Button>
          <span className="min-w-10 text-center tabular-nums text-muted-foreground">
            {Math.round(scale * 100)}%
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="size-7 p-0"
            disabled={scale >= 2.5}
            onClick={() => setScale((s) => Math.min(2.5, +(s + 0.2).toFixed(2)))}
            aria-label={t('viewer.zoomIn')}
          >
            <ZoomIn className="size-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="size-7 p-0"
            onClick={() => setRotation((r) => (r + 90) % 360)}
            aria-label={t('viewer.rotate')}
          >
            <RotateCw className="size-3.5" />
          </Button>
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          <div className="relative flex items-center">
            <Search className="pointer-events-none absolute left-2 size-3.5 text-muted-foreground" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('viewer.searchInFile')}
              className="h-7 w-44 rounded-md border bg-background pr-2 pl-7 text-xs outline-none focus:border-brand sm:w-56"
            />
          </div>
          {query.trim() ? (
            <span className="text-[11px] tabular-nums text-muted-foreground">
              {matchingPages.length
                ? t('viewer.pageMatches', { count: matchingPages.length })
                : t('viewer.noMatches')}
            </span>
          ) : null}
        </div>
      </div>
      <div
        ref={scrollRef}
        className="flex-1 space-y-4 overflow-auto bg-muted/40 p-4 sm:p-6"
        onScroll={(e) => {
          const container = e.currentTarget
          const mid = container.scrollTop + container.clientHeight * 0.35
          const els = container.querySelectorAll<HTMLElement>('[data-pdf-page]')
          for (const el of els) {
            if (el.offsetTop + el.offsetHeight >= mid) {
              const p = Number(el.dataset.pdfPage)
              if (p) setCurrentPage(p)
              break
            }
          }
        }}
      >
        {pageNumbers.map((num) => (
          <PdfPageCanvas
            key={num}
            doc={doc}
            pageNumber={num}
            scale={scale}
            rotation={rotation}
            highlighted={matchingPages.includes(num)}
          />
        ))}
      </div>
    </div>
  )
}

function SpreadsheetViewer({ blob }: { blob: Blob }) {
  const { t } = useTranslation()
  const [data, setData] = useState<SpreadsheetData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [activeSheet, setActiveSheet] = useState(0)
  const [filter, setFilter] = useState('')

  useEffect(() => {
    let alive = true
    setData(null)
    setError(null)
    setActiveSheet(0)
    void (async () => {
      try {
        const XLSX = await import('xlsx')
        const buf = await blob.arrayBuffer()
        const wb = XLSX.read(buf, { type: 'array' })
        const sheets = wb.SheetNames.map((name) => {
          const sheet = wb.Sheets[name]
          const raw = sheet
            ? XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '' })
            : []
          const rows = raw.map((row) =>
            row
              .slice(0, MAX_RENDERED_COLS)
              .map((cell) => (cell === null || cell === undefined ? '' : String(cell))),
          )
          return { name, rows }
        })
        if (alive) setData({ sheets })
      } catch (err) {
        if (alive) setError(err instanceof Error ? err.message : String(err))
      }
    })()
    return () => {
      alive = false
    }
  }, [blob])

  const sheet = data?.sheets[activeSheet]
  const header = sheet?.rows[0] ?? []
  const bodyRows = useMemo(() => {
    const rows = sheet?.rows.slice(1) ?? []
    const q = filter.trim().toLowerCase()
    if (!q) return rows
    return rows.filter((row) => row.some((cell) => cell.toLowerCase().includes(q)))
  }, [sheet, filter])

  const colCount = useMemo(() => {
    if (!sheet) return 0
    return Math.min(
      MAX_RENDERED_COLS,
      sheet.rows.reduce((max, r) => Math.max(max, r.length), 0),
    )
  }, [sheet])

  if (error) {
    return (
      <p className="p-8 text-center text-sm text-destructive">
        {t('viewer.failed', { message: error })}
      </p>
    )
  }
  if (!data) {
    return (
      <div className="flex flex-1 items-center justify-center gap-2 text-sm text-muted-foreground">
        <Spinner />
        {t('viewer.loading')}
      </div>
    )
  }

  const visibleRows = bodyRows.slice(0, MAX_RENDERED_ROWS)

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b bg-muted/30 px-4 py-2 text-xs">
        {data.sheets.length > 1 ? (
          <div className="flex items-center gap-1 overflow-x-auto">
            {data.sheets.map((s, idx) => (
              <button
                key={s.name}
                type="button"
                onClick={() => setActiveSheet(idx)}
                className={cn(
                  'rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
                  idx === activeSheet
                    ? 'bg-brand text-brand-foreground'
                    : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                )}
              >
                {s.name}
              </button>
            ))}
          </div>
        ) : null}
        <span className="text-muted-foreground tabular-nums">
          {t('viewer.tableStats', {
            rows: Math.max(0, (sheet?.rows.length ?? 0) - 1),
            cols: colCount,
          })}
        </span>
        <div className="relative ml-auto flex items-center">
          <Search className="pointer-events-none absolute left-2 size-3.5 text-muted-foreground" />
          <input
            type="search"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder={t('viewer.filterRows')}
            className="h-7 w-48 rounded-md border bg-background pr-2 pl-7 text-xs outline-none focus:border-brand sm:w-60"
          />
        </div>
      </div>
      <div className="flex-1 overflow-auto bg-background" data-selectable>
        {colCount === 0 ? (
          <p className="p-8 text-center text-sm text-muted-foreground">{t('viewer.emptySheet')}</p>
        ) : (
          <table className="w-full border-collapse text-left text-xs">
            <thead className="sticky top-0 z-10 bg-muted/95 backdrop-blur">
              <tr>
                <th className="w-10 border-r border-b px-2 py-2 text-right font-mono text-[11px] font-normal text-muted-foreground">
                  #
                </th>
                {Array.from({ length: colCount }, (_, c) => (
                  <th
                    // biome-ignore lint/suspicious/noArrayIndexKey: positional spreadsheet columns
                    key={c}
                    className="max-w-72 truncate border-r border-b px-3 py-2 font-semibold text-foreground"
                  >
                    {header[c] || String.fromCharCode(65 + (c % 26))}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((row, rIdx) => (
                <tr
                  // biome-ignore lint/suspicious/noArrayIndexKey: positional spreadsheet rows
                  key={rIdx}
                  className="border-b transition-colors odd:bg-background even:bg-muted/20 hover:bg-accent/40"
                >
                  <td className="border-r px-2 py-1.5 text-right font-mono text-[11px] text-muted-foreground">
                    {rIdx + 2}
                  </td>
                  {Array.from({ length: colCount }, (_, c) => (
                    <td
                      // biome-ignore lint/suspicious/noArrayIndexKey: positional spreadsheet cells
                      key={c}
                      className="max-w-80 border-r px-3 py-1.5 align-top whitespace-pre-wrap break-words"
                    >
                      {row[c] ?? ''}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {bodyRows.length > MAX_RENDERED_ROWS ? (
          <p className="border-t bg-muted/30 px-4 py-2 text-center text-xs text-muted-foreground">
            {t('viewer.rowsTruncated', { shown: MAX_RENDERED_ROWS, total: bodyRows.length })}
          </p>
        ) : null}
      </div>
    </div>
  )
}

function DocxViewer({ blob }: { blob: Blob }) {
  const { t } = useTranslation()
  const bodyRef = useRef<HTMLDivElement>(null)
  const styleRef = useRef<HTMLDivElement>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [zoom, setZoom] = useState(1)

  useEffect(() => {
    let alive = true
    setLoading(true)
    setError(null)
    const bodyEl = bodyRef.current
    const styleEl = styleRef.current
    if (!bodyEl || !styleEl) return
    bodyEl.innerHTML = ''
    styleEl.innerHTML = ''

    void (async () => {
      try {
        const { renderAsync } = await import('docx-preview')
        if (!alive) return
        await renderAsync(blob, bodyEl, styleEl, {
          className: 'fixnote-docx',
          inWrapper: true,
          ignoreWidth: false,
          ignoreHeight: false,
          ignoreFonts: false,
          breakPages: true,
          ignoreLastRenderedPageBreak: true,
          experimental: true,
          trimXmlDeclaration: true,
          useBase64URL: true,
        })
        if (alive) setLoading(false)
      } catch (err) {
        if (alive) {
          setError(err instanceof Error ? err.message : String(err))
          setLoading(false)
        }
      }
    })()

    return () => {
      alive = false
      bodyEl.innerHTML = ''
      styleEl.innerHTML = ''
    }
  }, [blob])

  if (error) {
    return (
      <p className="p-8 text-center text-sm text-destructive">
        {t('viewer.failed', { message: error })}
      </p>
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-center gap-1 border-b bg-muted/30 px-4 py-2 text-xs">
        <Button
          variant="ghost"
          size="sm"
          className="size-7 p-0"
          disabled={zoom <= 0.5}
          onClick={() => setZoom((z) => Math.max(0.5, +(z - 0.15).toFixed(2)))}
          aria-label={t('viewer.zoomOut')}
        >
          <ZoomOut className="size-3.5" />
        </Button>
        <button
          type="button"
          onClick={() => setZoom(1)}
          className="min-w-12 rounded px-1.5 py-0.5 text-center tabular-nums text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          {Math.round(zoom * 100)}%
        </button>
        <Button
          variant="ghost"
          size="sm"
          className="size-7 p-0"
          disabled={zoom >= 2}
          onClick={() => setZoom((z) => Math.min(2, +(z + 0.15).toFixed(2)))}
          aria-label={t('viewer.zoomIn')}
        >
          <ZoomIn className="size-3.5" />
        </Button>
      </div>
      <div className="relative flex-1 overflow-auto p-4 sm:p-6" data-selectable>
        {loading ? (
          <div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground">
            <Spinner />
            {t('viewer.loading')}
          </div>
        ) : null}
        <div ref={styleRef} />
        <div
          ref={bodyRef}
          className="fixnote-docx-host"
          style={{
            zoom,
          }}
        />
      </div>
    </div>
  )
}

function TextViewer({ blob }: { blob: Blob }) {
  const { t } = useTranslation()
  const [text, setText] = useState<string | null>(null)
  const [query, setQuery] = useState('')

  useEffect(() => {
    let alive = true
    setText(null)
    void extractPlainText(blob).then((v) => {
      if (alive) setText(v)
    })
    return () => {
      alive = false
    }
  }, [blob])

  const filtered = useMemo(() => {
    if (text === null) return ''
    const q = query.trim().toLowerCase()
    if (!q) return text
    return text
      .split('\n')
      .filter((line) => line.toLowerCase().includes(q))
      .join('\n')
  }, [text, query])

  if (text === null) {
    return (
      <div className="flex flex-1 items-center justify-center gap-2 text-sm text-muted-foreground">
        <Spinner />
        {t('viewer.loading')}
      </div>
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-2 border-b bg-muted/30 px-4 py-2 text-xs">
        <div className="relative flex items-center">
          <Search className="pointer-events-none absolute left-2 size-3.5 text-muted-foreground" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('viewer.filterLines')}
            className="h-7 w-56 rounded-md border bg-background pr-2 pl-7 text-xs outline-none focus:border-brand"
          />
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="ml-auto h-7 gap-1.5 text-xs"
          onClick={() => {
            void navigator.clipboard.writeText(text)
            toast(t('ocr.copied'))
          }}
        >
          <Copy className="size-3.5" />
          {t('ocr.copy')}
        </Button>
      </div>
      <pre
        data-selectable
        className="flex-1 overflow-auto bg-background p-5 font-mono text-xs leading-relaxed whitespace-pre-wrap break-words"
      >
        {filtered || t('viewer.noMatches')}
      </pre>
    </div>
  )
}

function ImageViewer({ blob, name }: { blob: Blob; name: string }) {
  const { t } = useTranslation()
  const [url, setUrl] = useState<string | null>(null)
  const [zoom, setZoom] = useState(1)
  const [rotation, setRotation] = useState(0)

  useEffect(() => {
    const next = URL.createObjectURL(blob)
    setUrl(next)
    return () => URL.revokeObjectURL(next)
  }, [blob])

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-center gap-1 border-b bg-muted/30 px-4 py-2 text-xs">
        <Button
          variant="ghost"
          size="sm"
          className="size-7 p-0"
          disabled={zoom <= 0.25}
          onClick={() => setZoom((z) => Math.max(0.25, +(z - 0.25).toFixed(2)))}
          aria-label={t('viewer.zoomOut')}
        >
          <ZoomOut className="size-3.5" />
        </Button>
        <button
          type="button"
          onClick={() => {
            setZoom(1)
            setRotation(0)
          }}
          className="min-w-12 rounded px-1.5 py-0.5 text-center tabular-nums text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          {Math.round(zoom * 100)}%
        </button>
        <Button
          variant="ghost"
          size="sm"
          className="size-7 p-0"
          disabled={zoom >= 4}
          onClick={() => setZoom((z) => Math.min(4, +(z + 0.25).toFixed(2)))}
          aria-label={t('viewer.zoomIn')}
        >
          <ZoomIn className="size-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="size-7 p-0"
          onClick={() => setRotation((r) => (r + 90) % 360)}
          aria-label={t('viewer.rotate')}
        >
          <RotateCw className="size-3.5" />
        </Button>
      </div>
      <div className="flex flex-1 items-center justify-center overflow-auto bg-muted/40 p-6">
        {url ? (
          <img
            src={url}
            alt={name}
            style={{
              transform: `scale(${zoom}) rotate(${rotation}deg)`,
              transition: 'transform 140ms var(--ease-apple)',
            }}
            className="max-h-full max-w-full rounded-lg object-contain shadow-sm"
          />
        ) : (
          <Spinner />
        )}
      </div>
    </div>
  )
}

function MediaViewer({ blob, kind }: { blob: Blob; kind: 'audio' | 'video' }) {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    const next = URL.createObjectURL(blob)
    setUrl(next)
    return () => URL.revokeObjectURL(next)
  }, [blob])
  if (!url) return null
  return (
    <div className="flex flex-1 items-center justify-center bg-muted/40 p-8">
      {kind === 'video' ? (
        // biome-ignore lint/a11y/useMediaCaption: user-attached local media file
        <video src={url} controls className="max-h-full max-w-full rounded-lg shadow-sm" />
      ) : (
        // biome-ignore lint/a11y/useMediaCaption: user-attached local media file
        <audio src={url} controls className="w-full max-w-md" />
      )}
    </div>
  )
}

function ExtractedTextPanel({ id, name }: { id: string; name: string }) {
  const { t } = useTranslation()
  const [state, setState] = useState<
    | { phase: 'reading'; progress: number | null }
    | { phase: 'done'; text: string }
    | { phase: 'failed'; message: string }
  >({ phase: 'reading', progress: null })

  useEffect(() => {
    let alive = true
    setState({ phase: 'reading', progress: null })
    readImageText(
      id,
      (p) => {
        if (alive && p < 1) setState({ phase: 'reading', progress: p })
      },
      { name },
    ).then(
      (text) => alive && setState({ phase: 'done', text }),
      (err: unknown) =>
        alive &&
        setState({ phase: 'failed', message: err instanceof Error ? err.message : String(err) }),
    )
    return () => {
      alive = false
    }
  }, [id, name])

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-background">
      <div className="flex items-center justify-between border-b bg-muted/30 px-4 py-2 text-xs text-muted-foreground">
        <span>{t('viewer.ocrHint')}</span>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-1.5 text-xs"
          disabled={state.phase !== 'done' || !state.text}
          onClick={() => {
            if (state.phase !== 'done') return
            void navigator.clipboard.writeText(state.text)
            toast(t('ocr.copied'))
          }}
        >
          <Copy className="size-3.5" />
          {t('ocr.copy')}
        </Button>
      </div>
      <div className="flex-1 overflow-auto p-5">
        {state.phase === 'reading' ? (
          <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
            <Spinner />
            {state.progress === null
              ? t('ocr.reading')
              : t('viewer.extractingProgress', { percent: Math.round(state.progress * 100) })}
          </div>
        ) : state.phase === 'failed' ? (
          <p className="py-6 text-sm text-destructive">
            {t('ocr.failed', { message: state.message })}
          </p>
        ) : state.text ? (
          <pre
            data-selectable
            className="font-sans text-sm leading-relaxed whitespace-pre-wrap break-words"
          >
            {state.text}
          </pre>
        ) : (
          <p className="py-6 text-sm text-muted-foreground">{t('ocr.empty')}</p>
        )}
      </div>
    </div>
  )
}

function KindIcon({ kind }: { kind: AttachmentKind }) {
  switch (kind) {
    case 'spreadsheet':
      return <FileSpreadsheet className="size-4 text-emerald-600 dark:text-emerald-400" />
    case 'pdf':
      return <FileText className="size-4 text-rose-600 dark:text-rose-400" />
    case 'docx':
      return <FileText className="size-4 text-blue-600 dark:text-blue-400" />
    case 'image':
      return <ImageIcon className="size-4 text-amber-600 dark:text-amber-400" />
    case 'text':
      return <FileText className="size-4 text-muted-foreground" />
    default:
      return <Paperclip className="size-4 text-muted-foreground" />
  }
}

/**
 * In-app viewer for attachments: multi-page PDFs, spreadsheets (XLSX/XLS/ODS/CSV), Word docs
 * (DOCX), images (lightbox + zoom/rotate), text/code files, audio/video, plus on-device OCR /
 * extracted text view for deep search.
 */
export function AttachmentViewerDialog({
  target,
  onClose,
}: {
  target: AttachmentViewerTarget
  onClose: () => void
}) {
  const { t } = useTranslation()
  const { attachments } = useDb()
  const [blob, setBlob] = useState<Blob | null>(null)
  const [kind, setKind] = useState<AttachmentKind>('other')
  const [loading, setLoading] = useState(true)
  const [missing, setMissing] = useState(false)
  const [showText, setShowText] = useState(false)

  useEffect(() => {
    let alive = true
    setLoading(true)
    setMissing(false)
    setBlob(null)
    setShowText(false)

    void (async () => {
      try {
        const loaded = await attachments.load(target.id, attachmentSource())
        if (!alive) return
        if (!loaded) {
          setMissing(true)
          setLoading(false)
          return
        }
        const head = new Uint8Array(await loaded.slice(0, 65_536).arrayBuffer())
        if (!alive) return
        setKind(sniffAttachmentKind(head, target.name, loaded.type))
        setBlob(loaded)
        setLoading(false)
      } catch {
        if (alive) {
          setMissing(true)
          setLoading(false)
        }
      }
    })()

    return () => {
      alive = false
    }
  }, [attachments, target.id, target.name])

  const badge = attachmentBadge(target.name, blob?.type)
  const sizeLabel = target.size || (blob ? fileSize(blob.size) : '')
  const canExtractText = isTextIndexable(kind)

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        onOpenAutoFocus={(e) => e.preventDefault()}
        className="top-[5vh] flex h-[88dvh] max-h-[90dvh] w-[calc(100%-2rem)] max-w-5xl flex-col overflow-hidden p-0"
      >
        <div className="flex items-center gap-2.5 border-b px-4 py-3">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted">
            <KindIcon kind={kind} />
          </div>
          <div className="min-w-0 flex-1">
            <DialogTitle className="truncate text-sm font-semibold">{target.name}</DialogTitle>
            <DialogDescription className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] font-medium text-foreground">
                {badge}
              </span>
              {sizeLabel ? <span>{sizeLabel}</span> : null}
            </DialogDescription>
          </div>
          <div className="flex items-center gap-1.5">
            {canExtractText && blob ? (
              <Button
                variant={showText ? 'secondary' : 'ghost'}
                size="sm"
                className="h-8 gap-1.5 text-xs"
                onClick={() => setShowText((v) => !v)}
              >
                <ScanText className="size-3.5" />
                <span className="hidden sm:inline">
                  {showText ? t('viewer.showPreview') : t('viewer.showText')}
                </span>
              </Button>
            ) : null}
            <Button
              variant="ghost"
              size="sm"
              className="h-8 gap-1.5 text-xs"
              onClick={() => void saveAttachment(attachments, target.id, target.name)}
            >
              <Download className="size-3.5" />
              <span className="hidden sm:inline">{t('viewer.download')}</span>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="size-8 p-0"
              onClick={onClose}
              aria-label={t('window.close')}
            >
              <X className="size-4" />
            </Button>
          </div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          {loading ? (
            <div className="flex flex-1 items-center justify-center gap-2 text-sm text-muted-foreground">
              <Spinner />
              {t('viewer.loading')}
            </div>
          ) : missing || !blob ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
              <Paperclip className="size-8 text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground">{t('drop.fileMissing')}</p>
            </div>
          ) : showText ? (
            <ExtractedTextPanel id={target.id} name={target.name} />
          ) : kind === 'pdf' ? (
            <PdfViewer blob={blob} />
          ) : kind === 'spreadsheet' ? (
            <SpreadsheetViewer blob={blob} />
          ) : kind === 'docx' ? (
            <DocxViewer blob={blob} />
          ) : kind === 'image' ? (
            <ImageViewer blob={blob} name={target.name} />
          ) : kind === 'text' ? (
            <TextViewer blob={blob} />
          ) : kind === 'audio' || kind === 'video' ? (
            <MediaViewer blob={blob} kind={kind} />
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
              <div className="flex size-14 items-center justify-center rounded-2xl bg-muted">
                <Paperclip className="size-6 text-muted-foreground" />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-medium">{target.name}</p>
                <p className="text-xs text-muted-foreground">{t('viewer.unsupported')}</p>
              </div>
              <Button onClick={() => void saveAttachment(attachments, target.id, target.name)}>
                <Download className="size-4" />
                {t('viewer.download')}
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
