import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import { ySyncPluginKey } from '@tiptap/y-tiptap'

/** How long text typed by someone else stays marked (it fades in over that time). */
const FADE_MS = 450
/** Larger changes (a paste, the first load) just appear. */
const MAX_CHARS = 80

const key = new PluginKey<DecorationSet>('remoteFade')

/**
 * Text that arrives from someone else in a shared note fades in instead of popping up, so their
 * typing reads smoothly although it comes in small batches. Only for changes from the room: the
 * sync plugin replaces the whole document then, so the new range is found by diffing it.
 */
export const RemoteFade = Extension.create<{
  /** The assistant is writing: its text types in (ai-typing.ts) instead of fading. */
  aiWriting: () => boolean
}>({
  name: 'remoteFade',
  addOptions: () => ({ aiWriting: () => false }),
  addProseMirrorPlugins() {
    const { aiWriting } = this.options
    return [
      new Plugin<DecorationSet>({
        key,
        state: {
          init: () => DecorationSet.empty,
          apply(tr, set, oldState, newState) {
            let next = set.map(tr.mapping, tr.doc)
            if (tr.getMeta(key) === 'prune') {
              const now = Date.now()
              return next.remove(next.find(undefined, undefined, (spec) => spec.until <= now))
            }
            const remote = tr.getMeta(ySyncPluginKey)?.isChangeOrigin === true
            if (!remote || !tr.docChanged || aiWriting()) return next
            const start = oldState.doc.content.findDiffStart(newState.doc.content)
            const end = oldState.doc.content.findDiffEnd(newState.doc.content)
            if (start == null || !end) return next
            const to = Math.max(end.b, start)
            if (to > start && to - start <= MAX_CHARS)
              next = next.add(newState.doc, [
                Decoration.inline(
                  start,
                  to,
                  { class: 'remote-new' },
                  { until: Date.now() + FADE_MS, inclusiveEnd: false },
                ),
              ])
            return next
          },
        },
        props: {
          decorations: (state) => key.getState(state),
        },
        view: () => {
          let timer: ReturnType<typeof setTimeout> | undefined
          return {
            update(view) {
              const set = key.getState(view.state)
              if (!set || set === DecorationSet.empty || timer) return
              timer = setTimeout(() => {
                timer = undefined
                if (!view.isDestroyed) view.dispatch(view.state.tr.setMeta(key, 'prune'))
              }, FADE_MS)
            },
            destroy: () => clearTimeout(timer),
          }
        },
      }),
    ]
  },
})
