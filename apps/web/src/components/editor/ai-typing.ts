import { Extension } from '@tiptap/core'
import type { Node as PmNode } from '@tiptap/pm/model'
import { type EditorState, Plugin, PluginKey, type Transaction } from '@tiptap/pm/state'
import { Decoration, DecorationSet, type EditorView } from '@tiptap/pm/view'
import { ySyncPluginKey } from '@tiptap/y-tiptap'

/** How long the whole range takes to type in, at most, and per character. */
const MAX_TYPE_MS = 1400
const PER_CHAR_MS = 14
/** How long the typed text stays marked once it is all there. */
const HOLD_MS = 1600
/** Bigger changes (a note rewritten) are marked, not typed. */
const MAX_TYPED = 3000
const TICK_MS = 30

interface Typing {
  from: number
  to: number
  /** Characters shown so far (positions from `from`). */
  shown: number
  step: number
  /** When the mark goes, once everything is shown. */
  until: number | null
}

type Meta = { start: { from: number; to: number } } | 'tick'

export const aiTypingKey = new PluginKey<Typing[]>('aiTyping')

const reducedMotion = () =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

/** A new range to type in: where the change is and how fast it goes. */
function typing(from: number, to: number): Typing {
  const length = to - from
  const instant = length > MAX_TYPED || reducedMotion()
  const ticks = Math.max(1, Math.round(Math.min(MAX_TYPE_MS, length * PER_CHAR_MS) / TICK_MS))
  return {
    from,
    to,
    shown: instant ? length : 0,
    step: Math.max(1, Math.ceil(length / ticks)),
    until: instant ? Date.now() + HOLD_MS : null,
  }
}

function decorations(doc: PmNode, list: Typing[]): DecorationSet {
  const out: Decoration[] = []
  for (const t of list) {
    const edge = Math.min(t.to, t.from + t.shown)
    if (edge > t.from)
      out.push(Decoration.inline(t.from, edge, { class: t.until ? 'ai-typed' : 'ai-typing' }))
    if (t.to > edge) out.push(Decoration.inline(edge, t.to, { class: 'ai-untyped' }))
  }
  return DecorationSet.create(doc, out)
}

/**
 * Text the assistant writes into the open note types itself in and stays marked for a moment,
 * so the change is seen where it happens instead of the note jumping to its new state. The text
 * is in the document at once (saved, undoable); only its showing is gradual.
 */
export const AiTyping = Extension.create<{
  /**
   * In a shared note: the change the room brings now is the assistant's (this person's, being
   * written into the live document, or someone else's), so it types in too.
   */
  aiWriting: () => boolean
}>({
  name: 'aiTyping',
  addOptions: () => ({ aiWriting: () => false }),
  addProseMirrorPlugins() {
    const { aiWriting } = this.options
    return [
      new Plugin<Typing[]>({
        key: aiTypingKey,
        state: {
          init: () => [],
          apply(tr: Transaction, list: Typing[], oldState: EditorState, newState: EditorState) {
            const meta = tr.getMeta(aiTypingKey) as Meta | undefined
            let next = list
              .map((t) => ({ ...t, from: tr.mapping.map(t.from, 1), to: tr.mapping.map(t.to, -1) }))
              .filter((t) => t.to > t.from)
            if (meta === 'tick') {
              const now = Date.now()
              next = next
                .filter((t) => t.until === null || t.until > now)
                .map((t) => {
                  if (t.until !== null) return t
                  const shown = Math.min(t.to - t.from, t.shown + t.step)
                  return { ...t, shown, until: shown >= t.to - t.from ? now + HOLD_MS : null }
                })
            } else if (meta?.start && meta.start.to > meta.start.from) {
              next = [...next, typing(meta.start.from, meta.start.to)]
            } else if (
              tr.docChanged &&
              tr.getMeta(ySyncPluginKey)?.isChangeOrigin === true &&
              aiWriting()
            ) {
              const range = changedRange(oldState.doc, newState.doc)
              if (range && range.toAfter > range.from)
                next = [...next, typing(range.from, range.toAfter)]
            }
            return next
          },
        },
        props: {
          decorations: (state: EditorState) => {
            const list = aiTypingKey.getState(state)
            return list?.length ? decorations(state.doc, list) : DecorationSet.empty
          },
        },
        view: () => {
          let timer: ReturnType<typeof setTimeout> | undefined
          return {
            update(view: EditorView) {
              if (timer || !aiTypingKey.getState(view.state)?.length) return
              timer = setTimeout(() => {
                timer = undefined
                if (!view.isDestroyed) view.dispatch(view.state.tr.setMeta(aiTypingKey, 'tick'))
              }, TICK_MS)
            },
            destroy: () => clearTimeout(timer),
          }
        },
      }),
    ]
  },
})

/** Where two versions of a document differ: one range in each. Null when they are the same. */
export function changedRange(
  before: PmNode,
  after: PmNode,
): { from: number; toBefore: number; toAfter: number } | null {
  const start = before.content.findDiffStart(after.content)
  if (start == null) return null
  const end = before.content.findDiffEnd(after.content) ?? {
    a: before.content.size,
    b: after.content.size,
  }
  // Repeated text around the change can make the ends overlap the start: keep them after it.
  const overlap = Math.max(0, start - Math.min(end.a, end.b))
  return { from: start, toBefore: end.a + overlap, toAfter: end.b + overlap }
}

/** Types in the text between `from` and `to` (a change already in the document) and shows it. */
export function startAiTyping(view: EditorView, from: number, to: number) {
  if (to <= from) return
  view.dispatch(view.state.tr.setMeta(aiTypingKey, { start: { from, to } }))
  revealRange(view, from)
}

/** Scrolls the change into view when it is off screen, without jumping when it is visible. */
export function revealRange(view: EditorView, pos: number) {
  try {
    const { node } = view.domAtPos(pos)
    const el = node instanceof Element ? node : node.parentElement
    el?.scrollIntoView({ block: 'nearest', behavior: reducedMotion() ? 'auto' : 'smooth' })
  } catch {
    // Position outside the document now: nothing to show.
  }
}
