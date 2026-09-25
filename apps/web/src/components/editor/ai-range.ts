import type { Editor } from '@tiptap/core'
import { Extension } from '@tiptap/core'
import { Node as PmNode, Slice } from '@tiptap/pm/model'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'

export interface AiRange {
  from: number
  to: number
}

type Meta = { set: AiRange } | { clear: true }

interface AiRangeState {
  range: AiRange | null
  decorations: DecorationSet
}

const key = new PluginKey<AiRangeState>('aiRange')

/**
 * Keeps the text the AI is working on highlighted while focus is in the popover, and keeps its
 * position current if the document changes meanwhile (sync, another edit).
 */
export const AiRangeExtension = Extension.create({
  name: 'aiRange',
  addProseMirrorPlugins() {
    return [
      new Plugin<AiRangeState>({
        key,
        state: {
          init: (): AiRangeState => ({ range: null, decorations: DecorationSet.empty }),
          apply(tr, prev): AiRangeState {
            const meta = tr.getMeta(key) as Meta | undefined
            if (meta && 'clear' in meta) return { range: null, decorations: DecorationSet.empty }
            if (meta && 'set' in meta) {
              const { from, to } = meta.set
              const decorations =
                from < to
                  ? DecorationSet.create(tr.doc, [
                      Decoration.inline(from, to, { class: 'fixnote-ai-range' }),
                    ])
                  : DecorationSet.empty
              return { range: meta.set, decorations }
            }
            if (!prev.range || !tr.docChanged) return prev
            const from = tr.mapping.map(prev.range.from, 1)
            const to = tr.mapping.map(prev.range.to, -1)
            return {
              range: { from, to: Math.max(from, to) },
              decorations: prev.decorations.map(tr.mapping, tr.doc),
            }
          },
        },
        props: {
          decorations: (state) => key.getState(state)?.decorations,
        },
      }),
    ]
  },
})

export function setAiRange(editor: Editor, range: AiRange | null) {
  editor.view.dispatch(
    editor.state.tr
      .setMeta(key, range ? { set: range } : { clear: true })
      .setMeta('addToHistory', false),
  )
}

export function getAiRange(editor: Editor): AiRange | null {
  return key.getState(editor.state)?.range ?? null
}

/** The Markdown of a document range, as the note stores it. */
export function rangeMarkdown(editor: Editor, { from, to }: AiRange): string {
  const manager = editor.markdown
  if (!manager) return editor.state.doc.textBetween(from, to, '\n\n')
  const slice = editor.state.doc.slice(from, to)
  return manager.serialize({ type: 'doc', content: slice.content.toJSON() ?? [] }).trim()
}

/**
 * Replaces a range with Markdown, as one undoable step. When the range covers whole blocks, the
 * blocks are swapped (a paragraph can become a list without leaving empty lines behind); a phrase
 * inside a paragraph merges into the text around it.
 */
export function replaceWithMarkdown(editor: Editor, range: AiRange, markdown: string) {
  const manager = editor.markdown
  const { schema, doc } = editor.state
  const parsed = manager?.parse(markdown) ?? {
    type: 'doc',
    content: [{ type: 'paragraph', content: markdown ? [{ type: 'text', text: markdown }] : [] }],
  }
  const content = PmNode.fromJSON(schema, parsed).content
  let { from, to } = range
  const $from = doc.resolve(from)
  const $to = doc.resolve(to)
  const wholeBlocks =
    $from.parent.isTextblock &&
    $to.parent.isTextblock &&
    $from.parentOffset === 0 &&
    $to.parentOffset === $to.parent.content.size &&
    $from.depth === $to.depth
  let slice: Slice
  if (wholeBlocks || from === 0) {
    if ($from.depth > 0) from = $from.before()
    if ($to.depth > 0) to = $to.after()
    slice = new Slice(content, 0, 0)
  } else {
    const first = content.firstChild
    const last = content.lastChild
    slice = new Slice(content, first?.isTextblock ? 1 : 0, last?.isTextblock ? 1 : 0)
  }
  const tr = editor.state.tr.replaceRange(from, to, slice)
  editor.view.dispatch(tr.setMeta(key, { clear: true }).scrollIntoView())
}
