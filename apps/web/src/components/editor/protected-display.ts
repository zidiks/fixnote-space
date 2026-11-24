import {
  type ProtectedReference,
  parseProtectedReference,
  protectedReferenceMatches,
} from '@fixnote/core'
import { i18n } from '@fixnote/i18n'
import { type Editor, Extension } from '@tiptap/core'
import type { Node as PmNode } from '@tiptap/pm/model'
import { Plugin, PluginKey, TextSelection } from '@tiptap/pm/state'
import { Decoration, DecorationSet, type EditorView } from '@tiptap/pm/view'
import { ySyncPluginKey } from '@tiptap/y-tiptap'
import { toast } from 'sonner'
import { changedScanRange } from './privacy-scan'

type Load = (ref: ProtectedReference) => Promise<string | null>
interface ProtectedDisplayOptions {
  load: Load
  canEdit: () => boolean
  save?: (ref: ProtectedReference, from: number, text: string) => Promise<void>
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

/** Read plain text from an inline contenteditable span without trailing sentinel <br> noise. */
export function readEditableText(root: HTMLElement): string {
  let out = ''
  const walk = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      out += node.nodeValue ?? ''
      return
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return
    const el = node as HTMLElement
    if (el.tagName === 'BR') {
      if (el.dataset.sentinel !== 'true') out += '\n'
      return
    }
    const isBlock = el.tagName === 'DIV' || el.tagName === 'P'
    if (isBlock && out.length > 0 && !out.endsWith('\n')) out += '\n'
    for (const child of el.childNodes) walk(child)
  }
  for (const child of root.childNodes) walk(child)
  return out.replace(/\r\n?/g, '\n')
}

function removeSentinels(el: HTMLElement) {
  for (const br of el.querySelectorAll('br[data-sentinel="true"]')) br.remove()
}

function ensureTrailingSentinel(el: HTMLElement) {
  removeSentinels(el)
  if (readEditableText(el).endsWith('\n')) {
    const br = document.createElement('br')
    br.dataset.sentinel = 'true'
    el.append(br)
  }
}

function insertPlainText(el: HTMLElement, text: string) {
  const normalized = text.replace(/\r\n?/g, '\n')
  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0 || !el.contains(sel.anchorNode)) {
    el.append(document.createTextNode(normalized))
    ensureTrailingSentinel(el)
    return
  }
  removeSentinels(el)
  const range = sel.getRangeAt(0)
  range.deleteContents()
  const node = document.createTextNode(normalized)
  range.insertNode(node)
  const next = document.createRange()
  next.setStart(node, node.length)
  next.collapse(true)
  sel.removeAllRanges()
  sel.addRange(next)
  ensureTrailingSentinel(el)
}

function isCaretAtEdge(el: HTMLElement, edge: 'start' | 'end'): boolean {
  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0 || !sel.isCollapsed || !el.contains(sel.anchorNode)) {
    return false
  }
  const caret = sel.getRangeAt(0)
  const probe = document.createRange()
  if (edge === 'start') {
    probe.setStart(el, 0)
    probe.setEnd(caret.startContainer, caret.startOffset)
  } else {
    probe.setStart(caret.endContainer, caret.endOffset)
    probe.setEnd(el, el.childNodes.length)
  }
  return probe.toString().length === 0
}

function focusEditorAt(view: EditorView, pos: number, splitAfter = false) {
  const clamped = Math.max(0, Math.min(pos, view.state.doc.content.size))
  let tr = view.state.tr.setSelection(TextSelection.create(view.state.doc, clamped))
  if (splitAfter) {
    tr = tr.split(tr.selection.from)
  }
  view.dispatch(tr.scrollIntoView())
  view.focus()
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
      const refLength = match[0].length
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
          (view, getPos) => {
            const block = document.createElement('span')
            block.className = 'fixnote-protected-fragment'
            block.dataset.protectedRef = match[0]
            block.contentEditable = 'false'

            const label = document.createElement('span')
            label.className = 'fixnote-protected-label'
            label.contentEditable = 'false'
            const protectedTitle = i18n.t('privacy.protected')
            label.title = protectedTitle
            label.setAttribute('aria-label', protectedTitle)
            label.append(lockIcon())

            const body = document.createElement('span')
            body.className = 'fixnote-protected-value'
            body.dataset.selectable = 'true'
            body.spellcheck = false
            block.append(label, body)

            label.addEventListener('mousedown', (event) => {
              if (!options.canEdit()) return
              event.preventDefault()
              body.focus()
            })

            let loadedText: string | null = null
            let saving = false

            const syncMultiline = () => {
              const value = readEditableText(body)
              block.classList.toggle('is-multiline', /[\r\n]/.test(value))
            }

            const commit = async (): Promise<boolean> => {
              if (saving || loadedText === null || !options.canEdit()) return false
              const nextText = readEditableText(body)
              if (nextText === loadedText) return false
              const at = getPos()
              if (at === undefined) return false
              if (!nextText.trim()) {
                loadedText = ''
                view.dispatch(view.state.tr.delete(at, at + refLength))
                return true
              }
              if (!options.save) return false
              saving = true
              const previous = loadedText
              loadedText = nextText
              try {
                await options.save(ref, at, nextText)
                return true
              } catch {
                loadedText = previous
                body.textContent = previous
                syncMultiline()
                toast.error(i18n.t('privacy.saveFailed'))
                return false
              } finally {
                saving = false
              }
            }

            const exitToEditor = (where: 'before' | 'after', splitAfter = false) => {
              const at = getPos()
              if (at === undefined) return
              const target = where === 'before' ? at : at + refLength
              if (loadedText !== null && readEditableText(body) !== loadedText) {
                void commit().then(() => {
                  if (!view.isDestroyed) focusEditorAt(view, target, splitAfter)
                })
              } else {
                focusEditorAt(view, target, splitAfter)
              }
            }

            void options.load(ref).then(
              (text) => {
                if (text === null) {
                  body.textContent = i18n.t('privacy.unavailable')
                  body.contentEditable = 'false'
                  return
                }
                loadedText = text
                body.textContent = text
                syncMultiline()
                if (options.canEdit()) {
                  body.contentEditable = 'true'
                }
              },
              () => {
                body.textContent = i18n.t('privacy.unavailable')
                body.contentEditable = 'false'
              },
            )

            body.addEventListener('input', () => {
              removeSentinels(body)
              ensureTrailingSentinel(body)
              syncMultiline()
            })

            body.addEventListener('paste', (event) => {
              if (!options.canEdit()) return
              event.preventDefault()
              const plain = event.clipboardData?.getData('text/plain') ?? ''
              if (plain) {
                insertPlainText(body, plain)
                syncMultiline()
              }
            })

            body.addEventListener('keydown', (event) => {
              if (!options.canEdit()) return
              if (event.key === 'Enter') {
                event.preventDefault()
                if (event.shiftKey) {
                  insertPlainText(body, '\n')
                  syncMultiline()
                  return
                }
                if (!block.classList.contains('is-multiline')) {
                  exitToEditor('after', true)
                  return
                }
                if (event.metaKey || event.ctrlKey) {
                  exitToEditor('after', false)
                  return
                }
                const current = readEditableText(body)
                if (current.endsWith('\n') && isCaretAtEdge(body, 'end')) {
                  body.textContent = current.slice(0, -1)
                  syncMultiline()
                  exitToEditor('after', true)
                  return
                }
                insertPlainText(body, '\n')
                syncMultiline()
                return
              }
              if (event.key === 'Escape') {
                event.preventDefault()
                exitToEditor('after', false)
                return
              }
              if (event.key === 'ArrowLeft' && !event.shiftKey && isCaretAtEdge(body, 'start')) {
                event.preventDefault()
                exitToEditor('before', false)
                return
              }
              if (event.key === 'ArrowRight' && !event.shiftKey && isCaretAtEdge(body, 'end')) {
                event.preventDefault()
                exitToEditor('after', false)
                return
              }
              if (event.key === 'Backspace' && readEditableText(body).length === 0) {
                event.preventDefault()
                const at = getPos()
                if (at !== undefined) {
                  loadedText = ''
                  view.dispatch(view.state.tr.delete(at, at + refLength))
                  view.focus()
                }
              }
            })

            body.addEventListener('blur', () => {
              void commit()
            })

            return block
          },
          {
            key: ref.fragmentId,
            side: 1,
            ignoreSelection: true,
            stopEvent: () => true,
          },
        ),
      )
    }
  })
  return widgets
}

export interface ProtectedTarget {
  from: number
  to: number
  ref: ProtectedReference
  reference: string
}

/** Finds the protected fragment under a pointer target (for right-click → Remove protection). */
export function protectedAt(editor: Editor, target: EventTarget | null): ProtectedTarget | null {
  const el =
    target instanceof Element ? target.closest<HTMLElement>('.fixnote-protected-fragment') : null
  const reference = el?.dataset.protectedRef
  if (!el || !reference) return null
  const ref = parseProtectedReference(reference)
  if (!ref) return null
  const decos = key
    .getState(editor.state)
    ?.find(undefined, undefined, (spec) => spec.reference === reference)
  if (!decos?.length) return null
  if (decos.length === 1) {
    const only = decos[0]
    return only ? { from: only.from, to: only.to, ref, reference } : null
  }
  let pos = -1
  try {
    pos = editor.view.posAtDOM(el, 0)
  } catch {
    pos = -1
  }
  const best =
    pos >= 0
      ? decos.reduce((a, b) => (Math.abs(b.from - pos) < Math.abs(a.from - pos) ? b : a))
      : decos[0]
  return best ? { from: best.from, to: best.to, ref, reference } : null
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
