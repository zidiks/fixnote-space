import type { SecretCandidate } from '@fixnote/core/privacy/detect'
import { i18n, useTranslation } from '@fixnote/i18n'
import { Button } from '@fixnote/ui'
import { Extension } from '@tiptap/core'
import { Plugin, type Transaction } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import type { Editor } from '@tiptap/react'
import { Shield, X } from 'lucide-react'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { toast } from 'sonner'
import { useDb } from '../../lib/db'
import { readPrivacyDismissals, secretFingerprint, writePrivacyDismissals } from '../../lib/privacy'
import {
  markNoteScanned,
  registerPrivacyReviewer,
  requestPrivacyReview,
  takePrivacyRequest,
} from '../../lib/privacy-review'
import {
  changedScanRange,
  type NoteCandidate,
  type ScanRange,
  scanContext,
  scanNoteRange,
} from './privacy-scan'
import { protectedRangeText } from './protected-text'

const REVIEW_META = 'fixnote.privacy.review'

export const PrivacyHighlight = Extension.create({
  name: 'privacyHighlight',
  addProseMirrorPlugins() {
    return [
      new Plugin<DecorationSet>({
        state: {
          init: () => DecorationSet.empty,
          apply(tr, decorations) {
            const range = tr.getMeta(REVIEW_META) as ScanRange | null | undefined
            if (range === undefined) return decorations.map(tr.mapping, tr.doc)
            return range
              ? DecorationSet.create(tr.doc, [
                  Decoration.inline(range.from, range.to, { class: 'fixnote-privacy-candidate' }),
                ])
              : DecorationSet.empty
          },
        },
        props: {
          decorations(state) {
            return this.getState(state)
          },
        },
      }),
    ]
  },
})

function highlight(editor: Editor, hit: ScanRange | null) {
  if (editor.isDestroyed) return
  editor.view.dispatch(editor.state.tr.setMeta(REVIEW_META, hit).setMeta('addToHistory', false))
}

interface Finding {
  hit: ScanRange & { kind?: NoteCandidate['kind'] }
  fingerprint?: string
}

const dismissed = new Map<string, Set<string>>()
const announced = new Set<string>()

export function PrivacyReview({
  editor,
  noteId,
  shared,
  manual,
  onProtect,
}: {
  editor: Editor
  noteId: string
  shared: boolean
  manual: ScanRange | null
  onProtect: (range: ScanRange, audience: ProtectedReference['audience']) => Promise<void>
}) {
  const { t } = useTranslation()
  const { driver } = useDb()
  const [review, setReview] = useState<Finding | null>(null)
  const [count, setCount] = useState(0)
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null)
  const [audience, setAudience] = useState<ProtectedReference['audience']>(
    shared ? 'members' : 'personal',
  )
  const [busy, setBusy] = useState(false)
  const actions = useRef({
    open() {},
    close() {},
    dismiss() {},
    manual(_range: ScanRange) {},
  })
  const panel = useRef<HTMLDivElement>(null)
  const offer = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!editor.isEditable) return
    const toastId = `privacy:${noteId}`
    const worker = new Worker(new URL('./privacy.worker.ts', import.meta.url), { type: 'module' })
    let alive = true
    let scanId = 0
    let generation = 0
    let timer: ReturnType<typeof setTimeout>
    let pending: ScanRange | null = { from: 0, to: editor.state.doc.content.size }
    let findings: Finding[] = []
    let showing: Finding | null = null
    const jobs = new Map<number, (c: SecretCandidate[]) => void>()
    const exclusions = readPrivacyDismissals(driver, noteId)
      .then((found) => {
        if (!dismissed.has(noteId)) dismissed.set(noteId, found)
      })
      .catch(() => undefined)
    const stop = () => {
      alive = false
      worker.terminate()
      for (const resolve of jobs.values()) resolve([])
      jobs.clear()
    }
    worker.onmessage = (e: MessageEvent<{ id: number; candidates: SecretCandidate[] }>) => {
      jobs.get(e.data.id)?.(e.data.candidates)
      jobs.delete(e.data.id)
    }
    worker.onerror = stop
    const analyze = (text: string) =>
      new Promise<SecretCandidate[]>((resolve) => {
        if (!alive) return resolve([])
        const id = ++scanId
        jobs.set(id, resolve)
        worker.postMessage({ id, text })
      })

    const close = () => {
      showing = null
      highlight(editor, null)
      setReview(null)
    }
    const show = (first: Finding) => {
      if (editor.isDestroyed) return
      takePrivacyRequest(noteId)
      toast.dismiss(toastId)
      showing = first
      highlight(editor, first.hit)
      editor.view.dom
        .querySelector('.fixnote-privacy-candidate')
        ?.scrollIntoView({ block: 'center' })
      setReview(first)
    }
    actions.current = {
      close,
      open() {
        const first = findings[0]
        if (!pending && first) show(first)
      },
      manual(range) {
        if (range.from < range.to && range.to <= editor.state.doc.content.size) show({ hit: range })
      },
      dismiss() {
        if (!showing?.fingerprint) return
        const excluded = dismissed.get(noteId) ?? new Set<string>()
        excluded.add(showing.fingerprint)
        dismissed.set(noteId, excluded)
        void writePrivacyDismissals(driver, noteId, excluded).catch(() => undefined)
        findings = findings.filter((c) => !c.fingerprint || !excluded.has(c.fingerprint))
        setCount(findings.length)
        close()
      },
    }
    const unregister = registerPrivacyReviewer(noteId, actions.current.open)
    const scan = async () => {
      const range = pending
      if (!range || !alive) return
      const doc = editor.state.doc
      const token = ++generation
      const current = () => alive && token === generation && !editor.isDestroyed
      const hits = await scanNoteRange(doc, range, analyze, current)
      await exclusions
      if (!current()) return
      const next: Finding[] = []
      for (const hit of hits) {
        const hash = await secretFingerprint(hit.kind, protectedRangeText(doc, hit))
        if (!current()) return
        if (!dismissed.get(noteId)?.has(hash)) next.push({ hit, fingerprint: hash })
      }
      findings = [
        ...findings.filter(({ hit }) => hit.to <= range.from || hit.from >= range.to),
        ...next,
      ].sort((a, b) => a.hit.from - b.hit.from)
      pending = null
      markNoteScanned(noteId)
      setCount(findings.length)
      if (takePrivacyRequest(noteId)) {
        actions.current.open()
      } else if (findings.length && !announced.has(noteId)) {
        announced.add(noteId)
        toast(i18n.t('privacy.offer'), {
          id: toastId,
          action: {
            label: i18n.t('privacy.open'),
            onClick: () => requestPrivacyReview(noteId),
          },
        })
      }
    }
    const schedule = () => {
      clearTimeout(timer)
      timer = setTimeout(() => void scan().catch(stop), 700)
    }
    const onTransaction = ({ transaction: tr }: { transaction: Transaction }) => {
      if (!tr.docChanged || !alive) return
      const change = changedScanRange(tr)
      if (!change) return
      generation++
      const mapRange = (range: ScanRange) => ({
        from: tr.mapping.map(range.from, -1),
        to: tr.mapping.map(range.to, 1),
      })
      const dirty = scanContext(tr.doc, change)
      const queued = pending ? mapRange(pending) : dirty
      pending = { from: Math.min(queued.from, dirty.from), to: Math.max(queued.to, dirty.to) }
      findings = findings.flatMap((c) => {
        const hit = { ...c.hit, ...mapRange(c.hit) }
        return hit.to <= dirty.from || hit.from >= dirty.to ? [{ ...c, hit }] : []
      })
      if (showing) {
        showing = null
        setReview(null)
        // The transaction must finish before dispatching a change to decorations.
        queueMicrotask(() => {
          if (alive && !showing) highlight(editor, null)
        })
      }
      schedule()
    }
    editor.on('transaction', onTransaction)
    schedule()
    return () => {
      stop()
      clearTimeout(timer)
      unregister()
      editor.off('transaction', onTransaction)
      highlight(editor, null)
    }
  }, [driver, editor, noteId])

  useEffect(() => {
    if (manual) actions.current.manual(manual)
  }, [manual])

  useLayoutEffect(() => {
    if (!review) return
    const update = () => {
      if (editor.isDestroyed) return
      const rect = editor.view.dom
        .querySelector('.fixnote-privacy-candidate')
        ?.getBoundingClientRect()
      if (!rect) return
      const width = Math.min(288, window.innerWidth - 24)
      const height = panel.current?.offsetHeight ?? 112
      setPosition({
        left: Math.max(12, Math.min(rect.left, window.innerWidth - width - 12)),
        top:
          rect.bottom + height + 20 < window.innerHeight
            ? Math.max(12, rect.bottom + 8)
            : Math.max(12, rect.top - height - 8),
      })
    }
    update()
    window.addEventListener('scroll', update, true)
    window.addEventListener('resize', update)
    return () => {
      window.removeEventListener('scroll', update, true)
      window.removeEventListener('resize', update)
    }
  }, [editor, review])

  const visible = Boolean(review && position)
  useLayoutEffect(() => {
    if (visible) panel.current?.focus({ preventScroll: true })
  }, [visible])

  const close = () => {
    actions.current.close()
    requestAnimationFrame(() => offer.current?.focus({ preventScroll: true }))
  }
  const protect = async () => {
    if (!review || busy) return
    setBusy(true)
    try {
      await onProtect(review.hit, audience)
      actions.current.close()
    } catch {
      toast.error(t('privacy.saveFailed'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      {count > 0 && !review ? (
        <button
          ref={offer}
          type="button"
          className="mt-4 inline-flex items-center gap-1.5 rounded-md text-xs text-muted-foreground hover:text-foreground focus-visible:outline"
          onClick={() => actions.current.open()}
        >
          <Shield className="size-3.5" />
          {t('privacy.offer')} · {t('privacy.review', { count })}
        </button>
      ) : null}
      {review && position
        ? createPortal(
            <div
              ref={panel}
              tabIndex={-1}
              role="dialog"
              aria-label={t('privacy.offer')}
              className="fixed z-50 w-72 max-w-[calc(100vw-24px)] rounded-xl border bg-popover p-3 text-popover-foreground shadow-lg"
              style={position}
              onKeyDown={(e) => {
                if (e.key === 'Escape') close()
              }}
            >
              <div className="flex items-start justify-between gap-2">
                <p className="flex items-center gap-2 text-sm font-medium">
                  <Shield className="size-4 shrink-0" />
                  {t('privacy.confirm')}
                </p>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  aria-label={t('common.cancel')}
                  onClick={close}
                >
                  <X />
                </Button>
              </div>
              <p className="mb-2 text-xs text-muted-foreground">
                {review.hit.kind ? t(`privacy.kinds.${review.hit.kind}`) : t('privacy.explain')}
              </p>
              {shared ? (
                <select
                  aria-label={t('privacy.audience')}
                  className="mb-2 w-full rounded-md border bg-background px-2 py-1 text-sm"
                  value={audience}
                  onChange={(e) =>
                    setAudience(e.target.value === 'members' ? 'members' : 'personal')
                  }
                  disabled={busy}
                >
                  <option value="members">{t('privacy.members')}</option>
                  <option value="personal">{t('privacy.personal')}</option>
                </select>
              ) : null}
              <div className="flex flex-wrap gap-2">
                <Button size="sm" loading={busy} onClick={() => void protect()}>
                  {t('privacy.protect')}
                </Button>
                {review.fingerprint ? (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() => actions.current.dismiss()}
                  >
                    {t('privacy.dismiss')}
                  </Button>
                ) : null}
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  )
}

import type { ProtectedReference } from '@fixnote/core'
