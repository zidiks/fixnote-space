import {
  type CommentThread,
  decodeRelativePosition,
  encodeRelativePosition,
  findQuoteRange,
} from '@fixnote/core'
import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import type { Editor } from '@tiptap/react'
import {
  absolutePositionToRelativePosition,
  relativePositionToAbsolutePosition,
  ySyncPluginKey,
} from '@tiptap/y-tiptap'
import { LIVE_FIELD, type LiveEditing } from '../../lib/collab/live'
import { projectScanText } from './privacy-scan'

export interface CommentHighlightRange {
  id: string
  from: number
  to: number
  active: boolean
}

export interface CapturedAnchor {
  quote: string
  contextBefore: string
  contextAfter: string
  from: number
  to: number
  anchorFrom?: string
  anchorTo?: string
}

export const commentsHighlightKey = new PluginKey<CommentHighlightRange[]>('fixnoteComments')

export function setCommentHighlights(editor: Editor, ranges: CommentHighlightRange[]) {
  if (editor.isDestroyed) return
  editor.view.dispatch(editor.state.tr.setMeta(commentsHighlightKey, ranges))
}

/** Captures quote + surrounding context (and Yjs RelativePositions on shared notes) for a selection. */
export function captureSelectionAnchor(
  editor: Editor,
  range: { from: number; to: number },
  live?: LiveEditing,
): CapturedAnchor | null {
  const { doc } = editor.state
  if (range.from >= range.to || range.from < 0 || range.to > doc.content.size) return null
  const proj = projectScanText(doc, 0, doc.content.size)
  const quoteRaw = doc.textBetween(range.from, range.to, '\n').trim()
  if (!quoteRaw) return null

  const beforeText = doc.textBetween(Math.max(0, range.from - 60), range.from, '\n')
  const afterText = doc.textBetween(range.to, Math.min(doc.content.size, range.to + 60), '\n')
  const contextBefore = beforeText.slice(-40)
  const contextAfter = afterText.slice(0, 40)

  // Compute approximate plain-text offset for disambiguating duplicate quotes.
  const hit = findQuoteRange(proj.text, quoteRaw, { contextBefore, contextAfter })
  const from = hit ? hit.from : 0
  const to = hit ? hit.to : quoteRaw.length

  let anchorFrom: string | undefined
  let anchorTo: string | undefined
  if (live) {
    try {
      const ystate = ySyncPluginKey.getState(editor.state)
      const mapping = ystate?.binding?.mapping
      if (mapping) {
        const frag = live.session.doc.getXmlFragment(LIVE_FIELD)
        const relFrom = absolutePositionToRelativePosition(range.from, frag, mapping)
        const relTo = absolutePositionToRelativePosition(range.to, frag, mapping)
        if (relFrom && relTo) {
          anchorFrom = encodeRelativePosition(relFrom)
          anchorTo = encodeRelativePosition(relTo)
        }
      }
    } catch {
      // Quote-based anchor still works if Yjs mapping isn't ready yet.
    }
  }

  return {
    quote: quoteRaw.slice(0, 500),
    contextBefore,
    contextAfter,
    from,
    to,
    ...(anchorFrom && anchorTo ? { anchorFrom, anchorTo } : {}),
  }
}

/** Resolves a comment thread's current ProseMirror [from, to] range in the editor, or null if deleted. */
export function resolveThreadRange(
  editor: Editor,
  thread: CommentThread,
  live?: LiveEditing,
): { from: number; to: number } | null {
  const docSize = editor.state.doc.content.size
  if (live && thread.anchorFrom && thread.anchorTo) {
    try {
      const ystate = ySyncPluginKey.getState(editor.state)
      const mapping = ystate?.binding?.mapping
      if (mapping) {
        const frag = live.session.doc.getXmlFragment(LIVE_FIELD)
        const relFrom = decodeRelativePosition(thread.anchorFrom)
        const relTo = decodeRelativePosition(thread.anchorTo)
        const from = relFrom
          ? relativePositionToAbsolutePosition(live.session.doc, frag, relFrom, mapping)
          : null
        const to = relTo
          ? relativePositionToAbsolutePosition(live.session.doc, frag, relTo, mapping)
          : null
        if (
          typeof from === 'number' &&
          typeof to === 'number' &&
          from >= 0 &&
          to <= docSize &&
          from < to
        ) {
          return { from, to }
        }
      }
    } catch {
      // Fall back to quote search below.
    }
  }

  if (!thread.quote) return null
  const proj = projectScanText(editor.state.doc, 0, docSize)
  const hit = findQuoteRange(proj.text, thread.quote, {
    contextBefore: thread.contextBefore,
    contextAfter: thread.contextAfter,
    from: thread.from,
  })
  if (!hit) return null
  const from = proj.positionAt(hit.from)
  const last = proj.positionAt(hit.to - 1)
  if (from === null || last === null || last < from) return null
  return { from, to: last + 1 }
}

/** Scrolls the editor viewport smoothly to a comment highlight range. */
export function scrollToComment(editor: Editor, range: { from: number; to: number }) {
  if (editor.isDestroyed) return
  try {
    const dom = editor.view.domAtPos(range.from)
    const el = dom.node instanceof Element ? dom.node : dom.node.parentElement
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  } catch {
    // Ignore out-of-range positions if the document just changed.
  }
}

export const CommentsHighlight = Extension.create<{ onSelectThread: (threadId: string) => void }>({
  name: 'commentsHighlight',
  addOptions: () => ({ onSelectThread: () => {} }),
  addProseMirrorPlugins() {
    const onSelect = this.options.onSelectThread
    return [
      new Plugin<CommentHighlightRange[]>({
        key: commentsHighlightKey,
        state: {
          init: () => [],
          apply: (tr, prev) => {
            const next = tr.getMeta(commentsHighlightKey) as CommentHighlightRange[] | undefined
            if (next !== undefined) return next
            if (!tr.docChanged || !prev.length) return prev
            const mapped: CommentHighlightRange[] = []
            for (const r of prev) {
              const from = tr.mapping.map(r.from, 1)
              const to = tr.mapping.map(r.to, -1)
              if (from < to) mapped.push({ ...r, from, to })
            }
            return mapped
          },
        },
        props: {
          decorations: (state) => {
            const ranges = commentsHighlightKey.getState(state) ?? []
            if (!ranges.length) return DecorationSet.empty
            const max = state.doc.content.size
            const decos: Decoration[] = []
            for (const r of ranges) {
              if (r.from < 0 || r.to > max || r.from >= r.to) continue
              decos.push(
                Decoration.inline(r.from, r.to, {
                  class: r.active ? 'fixnote-comment-mark is-active' : 'fixnote-comment-mark',
                  'data-comment-thread': r.id,
                }),
              )
            }
            return DecorationSet.create(state.doc, decos)
          },
          handleClick: (_view, _pos, event) => {
            if (event.button !== 0) return false
            const target = event.target instanceof Element ? event.target : null
            const mark = target?.closest<HTMLElement>('.fixnote-comment-mark[data-comment-thread]')
            const threadId = mark?.dataset.commentThread
            if (!threadId) return false
            onSelect(threadId)
            return false
          },
        },
      }),
    ]
  },
})
