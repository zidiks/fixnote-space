import {
  type CommentThread,
  decodeRelativePosition,
  encodeRelativePosition,
  findQuoteRange,
} from '@fixnote/core'
import { i18n } from '@fixnote/i18n'
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
  hovered: boolean
  unread: boolean
  count: number
  authorId: string
  authorEmail: string
}

export interface CapturedAnchor {
  quote: string
  contextBefore: string
  contextAfter: string
  from: number
  to: number
  /** Editor document range at capture time, used to anchor the "Add comment" popover. */
  editorFrom: number
  editorTo: number
  anchorFrom?: string
  anchorTo?: string
}

export interface AnchorRect {
  left: number
  right: number
  top: number
  bottom: number
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

  const MAX_QUOTE_LEN = 4000
  const quote = quoteRaw.slice(0, MAX_QUOTE_LEN)
  const hit = findQuoteRange(proj.text, quote, { contextBefore, contextAfter })
  const from = hit ? hit.from : 0
  const to = hit ? hit.to : quote.length
  const effectiveAfter =
    quoteRaw.length > MAX_QUOTE_LEN && hit ? proj.text.slice(hit.to, hit.to + 40) : contextAfter

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
    quote,
    contextBefore,
    contextAfter: effectiveAfter,
    from,
    to,
    editorFrom: range.from,
    editorTo: range.to,
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

/** Nearest vertical scrolling ancestor of `el`, or null when scrolling happens on the window. */
export function findScrollParent(el: Element | null): HTMLElement | null {
  let parent = el?.parentElement ?? null
  while (parent) {
    const { overflowY } = getComputedStyle(parent)
    if (overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay') return parent
    parent = parent.parentElement
  }
  return null
}

/** Viewport bounding box of a ProseMirror range (works for inline spans and multi-line blocks). */
export function getRangeRect(
  editor: Editor,
  range: { from: number; to: number },
  threadId?: string,
): AnchorRect | null {
  if (editor.isDestroyed) return null
  if (threadId) {
    const marks = editor.view.dom.querySelectorAll<HTMLElement>(
      `.fixnote-comment-mark[data-comment-thread="${CSS.escape(threadId)}"]`,
    )
    if (marks.length > 0) {
      let left = Number.POSITIVE_INFINITY
      let top = Number.POSITIVE_INFINITY
      let right = Number.NEGATIVE_INFINITY
      let bottom = Number.NEGATIVE_INFINITY
      for (const el of marks) {
        const r = el.getBoundingClientRect()
        if (r.width === 0 && r.height === 0) continue
        left = Math.min(left, r.left)
        top = Math.min(top, r.top)
        right = Math.max(right, r.right)
        bottom = Math.max(bottom, r.bottom)
      }
      if (Number.isFinite(left)) return { left, top, right, bottom }
    }
  }
  try {
    const { doc } = editor.state
    const max = doc.content.size
    let from = Math.max(0, Math.min(range.from, max))
    let to = Math.max(from, Math.min(range.to, max))
    // Trim leading/trailing newlines inside multi-line code blocks so end coords stay on the last
    // selected line instead of landing on the following line or block boundary.
    while (from < to - 1 && doc.textBetween(from, from + 1) === '\n') from++
    while (to > from + 1 && doc.textBetween(to - 1, to) === '\n') to--
    const start = editor.view.coordsAtPos(from, 1)
    const end = editor.view.coordsAtPos(to, -1)
    return {
      left: Math.min(start.left, end.left),
      right: Math.max(start.right, end.right),
      top: Math.min(start.top, end.top),
      bottom: Math.max(start.bottom, end.bottom),
    }
  } catch {
    return null
  }
}

/** Scrolls the editor viewport to a comment highlight only when it is completely outside view. */
export function scrollToComment(
  editor: Editor,
  range: { from: number; to: number },
  threadId?: string,
) {
  if (editor.isDestroyed) return
  try {
    const rect = getRangeRect(editor, range, threadId)
    if (!rect) return
    const scroller = findScrollParent(editor.view.dom)
    const sr = scroller
      ? scroller.getBoundingClientRect()
      : { top: 0, bottom: window.innerHeight, height: window.innerHeight }
    const visTop = Math.max(sr.top, 0) + 48
    const visBottom = Math.min(sr.bottom, window.innerHeight) - 80
    // If any part of the commented range is already on screen (common for large code blocks),
    // keep the current scroll position instead of yanking the viewport.
    if (rect.bottom >= visTop && rect.top <= visBottom) return
    if (scroller) {
      const targetTop = scroller.scrollTop + (rect.top - sr.top) - Math.min(180, sr.height * 0.28)
      scroller.scrollTo({ top: Math.max(0, targetTop), behavior: 'smooth' })
    } else {
      window.scrollTo({
        top: Math.max(0, window.scrollY + rect.top - 180),
        behavior: 'smooth',
      })
    }
  } catch {
    // Ignore out-of-range positions if the document just changed.
  }
}

function threadIdFromTarget(target: EventTarget | null): string | null {
  const el = target instanceof Element ? target : null
  const hit = el?.closest<HTMLElement>('[data-comment-thread]')
  return hit?.dataset.commentThread ?? null
}

export const CommentsHighlight = Extension.create<{
  onSelectThread: (threadId: string) => void
  onHoverThread: (threadId: string | null) => void
}>({
  name: 'commentsHighlight',
  addOptions: () => ({
    onSelectThread: () => {},
    onHoverThread: () => {},
  }),
  addProseMirrorPlugins() {
    const onSelect = this.options.onSelectThread
    const onHover = this.options.onHoverThread
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
              const cls = [
                'fixnote-comment-mark',
                r.active && 'is-active',
                r.hovered && 'is-hovered',
                r.unread && 'is-unread',
              ]
                .filter(Boolean)
                .join(' ')
              decos.push(
                Decoration.inline(r.from, r.to, {
                  class: cls,
                  'data-comment-thread': r.id,
                }),
              )

              // Minimal inline badge at the end of the highlighted passage: crisp cap-height circle
              // with a clean comment icon (plus count when > 1), matching FixNote's subtle styling.
              decos.push(
                Decoration.widget(
                  r.to,
                  () => {
                    const pin = document.createElement('button')
                    pin.type = 'button'
                    pin.className = [
                      'fixnote-comment-pin',
                      r.active && 'is-active',
                      r.hovered && 'is-hovered',
                      r.unread && 'is-unread',
                    ]
                      .filter(Boolean)
                      .join(' ')
                    pin.dataset.commentThread = r.id
                    pin.contentEditable = 'false'
                    pin.tabIndex = -1
                    pin.setAttribute('aria-label', i18n.t('comments.title'))

                    const svgNS = 'http://www.w3.org/2000/svg'
                    const icon = document.createElementNS(svgNS, 'svg')
                    icon.setAttribute('viewBox', '0 0 16 16')
                    icon.setAttribute('fill', 'none')
                    icon.setAttribute('aria-hidden', 'true')
                    icon.setAttribute('class', 'fixnote-comment-pin-icon')
                    const path = document.createElementNS(svgNS, 'path')
                    path.setAttribute(
                      'd',
                      'M3.25 3.5h9.5A1.25 1.25 0 0 1 14 4.75v5.5a1.25 1.25 0 0 1-1.25 1.25H6.6L3.6 13.7a.35.35 0 0 1-.55-.28V11.5h-.3A1.25 1.25 0 0 1 1.5 10.25v-5.5A1.25 1.25 0 0 1 2.75 3.5h.5Z',
                    )
                    path.setAttribute('stroke', 'currentColor')
                    path.setAttribute('stroke-width', '1.4')
                    path.setAttribute('stroke-linejoin', 'round')
                    icon.appendChild(path)
                    pin.appendChild(icon)

                    const num = document.createElement('span')
                    num.className = 'fixnote-comment-pin-count'
                    num.textContent = String(r.count)
                    pin.appendChild(num)

                    pin.addEventListener('mousedown', (e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      onSelect(r.id)
                    })
                    return pin
                  },
                  {
                    side: 1,
                    key: `cpin-${r.id}-${r.count}-${r.active ? 1 : 0}-${r.hovered ? 1 : 0}-${r.unread ? 1 : 0}`,
                    ignoreSelection: true,
                  },
                ),
              )
            }
            return DecorationSet.create(state.doc, decos)
          },
          handleClick: (_view, _pos, event) => {
            if (event.button !== 0) return false
            const threadId = threadIdFromTarget(event.target)
            if (!threadId) return false
            onSelect(threadId)
            return false
          },
          handleDOMEvents: {
            mouseover: (_view, event) => {
              const threadId = threadIdFromTarget(event.target)
              if (threadId) onHover(threadId)
              return false
            },
            mouseout: (_view, event) => {
              const fromId = threadIdFromTarget(event.target)
              if (!fromId) return false
              const toId = threadIdFromTarget(event.relatedTarget)
              if (toId !== fromId) onHover(toId)
              return false
            },
          },
        },
      }),
    ]
  },
})
