import { type ProtectedReference, protectedReferenceMatches } from '@fixnote/core'
import { i18n } from '@fixnote/i18n'
import { Extension } from '@tiptap/core'
import type { Node as PmNode } from '@tiptap/pm/model'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import { ySyncPluginKey } from '@tiptap/y-tiptap'
import { changedScanRange } from './privacy-scan'

type Load = (ref: ProtectedReference) => Promise<string | null>
interface ProtectedDisplayOptions {
  load: Load
  canEdit: () => boolean
  edit?: (ref: ProtectedReference, from: number, text: string) => void
}
const key = new PluginKey<DecorationSet>('protectedDisplay')

function lockIcon() {
  const ns = 'http://www.w3.org/2000/svg'
  const icon = document.createElementNS(ns, 'svg')
  icon.setAttribute('viewBox', '0 0 24 24')
  icon.setAttribute('fill', 'none')
  icon.setAttribute('stroke', 'currentColor')
  icon.setAttribute('stroke-width', '2')
  icon.setAttribute('stroke-linecap', 'round')
  icon.setAttribute('stroke-linejoin', 'round')
  icon.setAttribute('aria-hidden', 'true')
  const shackle = document.createElementNS(ns, 'path')
  shackle.setAttribute('d', 'M7 11V7a5 5 0 0 1 10 0v4')
  const body = document.createElementNS(ns, 'rect')
  body.setAttribute('x', '4')
  body.setAttribute('y', '11')
  body.setAttribute('width', '16')
  body.setAttribute('height', '10')
  body.setAttribute('rx', '2')
  icon.append(shackle, body)
  return icon
}

/** The reference stays ordinary text in Markdown and Yjs so older clients keep it. */
function decorations(
  doc: PmNode,
  options: ProtectedDisplayOptions,
  from = 0,
  to = doc.content.size,
) {
  const widgets: Decoration[] = []
  doc.nodesBetween(from, to, (node, pos) => {
    if (!node.text) return
    for (const match of protectedReferenceMatches(node.text)) {
      const start = pos + match.index
      const end = start + match[0].length
      const ref: ProtectedReference = {
        audience: match[1] === 'members' ? 'members' : 'personal',
        fragmentId: match[2] as string,
      }
      widgets.push(
        Decoration.inline(
          start,
          end,
          { class: 'fixnote-private-reference' },
          { reference: match[0] },
        ),
        Decoration.widget(
          start,
          (_view, getPos) => {
            const block = document.createElement('span')
            block.className = 'fixnote-protected-fragment'
            block.contentEditable = 'false'
            const label = document.createElement('span')
            label.className = 'fixnote-protected-label'
            label.append(lockIcon(), i18n.t('privacy.protected'))
            const body = document.createElement('span')
            body.className = 'fixnote-protected-value'
            block.append(label, body)
            void options.load(ref).then(
              (text) => {
                body.textContent = text ?? i18n.t('privacy.unavailable')
                if (text === null) return
                const multiline = /[\r\n]/.test(text)
                const actions = document.createElement('span')
                actions.className = 'fixnote-protected-actions'
                if (multiline) {
                  block.classList.add('is-multiline')
                  const header = document.createElement('span')
                  header.className = 'fixnote-protected-header'
                  header.append(label, actions)
                  block.prepend(header)
                } else block.append(actions)
                const copy = document.createElement('button')
                copy.type = 'button'
                copy.className = 'fixnote-protected-copy'
                copy.textContent = i18n.t(multiline ? 'privacy.copyBlock' : 'menu.copy')
                copy.title = i18n.t(multiline ? 'privacy.copyBlock' : 'privacy.copy')
                copy.addEventListener('click', (event) => {
                  event.stopPropagation()
                  void navigator.clipboard
                    .writeText(text)
                    .then(() => {
                      copy.textContent = i18n.t('privacy.copied')
                    })
                    .catch(() => undefined)
                })
                actions.append(copy)
                if (options.edit && options.canEdit()) {
                  const edit = document.createElement('button')
                  edit.type = 'button'
                  edit.className = 'fixnote-protected-copy'
                  edit.textContent = i18n.t('privacy.edit')
                  edit.addEventListener('click', (event) => {
                    event.stopPropagation()
                    const at = getPos()
                    if (at !== undefined && options.canEdit()) options.edit?.(ref, at, text)
                  })
                  actions.append(edit)
                }
              },
              () => {
                body.textContent = i18n.t('privacy.unavailable')
              },
            )
            return block
          },
          { key: ref.fragmentId, side: 1, ignoreSelection: true },
        ),
      )
    }
  })
  return widgets
}

export const ProtectedDisplay = Extension.create<ProtectedDisplayOptions>({
  name: 'protectedDisplay',
  addOptions: () => ({ load: async () => null, canEdit: () => false }),
  addProseMirrorPlugins() {
    const options = this.options
    return [
      new Plugin<DecorationSet>({
        key,
        state: {
          init: (_, state) => DecorationSet.create(state.doc, decorations(state.doc, options)),
          apply(tr, previous) {
            if (!tr.docChanged) return previous
            const mapped = previous.map(tr.mapping, tr.doc)
            const range = changedScanRange(tr)
            if (!range) return DecorationSet.create(tr.doc, decorations(tr.doc, options))
            const left = tr.doc.resolve(Math.max(0, range.from - 1))
            const right = tr.doc.resolve(Math.min(tr.doc.content.size, range.to + 1))
            const from = left.parent.isTextblock ? left.start() : left.pos
            const to = right.parent.isTextblock ? right.end() : right.pos
            if (from >= to) return mapped
            const found = mapped.find(from, to)
            return mapped.remove(found).add(tr.doc, decorations(tr.doc, options, from, to))
          },
        },
        props: {
          decorations(state) {
            return this.getState(state)
          },
          handleKeyDown(view, event) {
            const { from, empty } = view.state.selection
            if (!view.editable || !empty || (event.key !== 'Backspace' && event.key !== 'Delete'))
              return false
            const ref = key
              .getState(view.state)
              ?.find(from, from, (spec) => Boolean(spec.reference))
              .find((hit) => (event.key === 'Backspace' ? hit.to === from : hit.from === from))
            if (!ref) return false
            view.dispatch(view.state.tr.delete(ref.from, ref.to))
            return true
          },
        },
        filterTransaction(tr, state) {
          if (!tr.docChanged || tr.getMeta(ySyncPluginKey) || tr.getMeta('privacyReferenceChange'))
            return true
          const refs = key
            .getState(state)
            ?.find(undefined, undefined, (spec) => Boolean(spec.reference))
          return (refs ?? []).every((old) => {
            const from = tr.mapping.map(old.from, 1)
            const to = tr.mapping.map(old.to, -1)
            // A deliberate replacement of the whole passage may create a new protected object.
            return (
              from >= to ||
              Boolean(tr.doc.resolve(from).nodeAfter?.text?.startsWith(old.spec.reference))
            )
          })
        },
      }),
    ]
  },
})
