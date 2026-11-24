import { i18n } from '@fixnote/i18n'
import { Extension } from '@tiptap/core'
import type { Node as PmNode } from '@tiptap/pm/model'
import { Plugin, PluginKey, TextSelection } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import { FOLDED_STORAGE_PREFIX } from '../../lib/folded-storage'

const LIST_TYPES = new Set(['bulletList', 'orderedList', 'taskList'])
const ITEM_TYPES = new Set(['listItem', 'taskItem'])
const SAVE_DEBOUNCE_MS = 500

interface FoldMeta {
  toggle?: number
}

interface FoldedSignature {
  /** Index among all foldable list items in document order. */
  index: number
  /** First-line text snippet to avoid mis-restoring after edits. */
  text: string
}

interface CollapsibleState {
  folded: Set<number>
  decorations: DecorationSet
  /** Monotonic version incremented whenever `folded` needs persisting. */
  saveVersion: number
}

export const collapsibleListsKey = new PluginKey<CollapsibleState>('collapsibleLists')

function isListItem(node: PmNode | null | undefined): node is PmNode {
  return Boolean(node && ITEM_TYPES.has(node.type.name))
}

/** True when a list/task item contains at least one nested list child. */
export function hasNestedList(node: PmNode): boolean {
  if (!isListItem(node)) return false
  for (let i = 0; i < node.childCount; i++) {
    if (LIST_TYPES.has(node.child(i).type.name)) return true
  }
  return false
}

/** Counts all descendant list/task items inside the nested lists of `node`. */
function countDescendantItems(node: PmNode): number {
  let count = 0
  node.descendants((child) => {
    if (ITEM_TYPES.has(child.type.name)) count++
    return true
  })
  return count
}

function itemSummary(node: PmNode): string {
  const first = node.firstChild
  return (first?.textContent ?? '').trim().slice(0, 64)
}

function storageKey(noteId: string) {
  return `${FOLDED_STORAGE_PREFIX}${noteId}`
}

function loadFoldedPositions(doc: PmNode, noteId: string): Set<number> {
  const out = new Set<number>()
  if (!noteId || typeof localStorage === 'undefined') return out
  let saved: FoldedSignature[]
  try {
    const raw = localStorage.getItem(storageKey(noteId))
    if (!raw) return out
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return out
    saved = parsed as FoldedSignature[]
  } catch {
    return out
  }
  if (!saved.length) return out

  const foldable: { pos: number; text: string }[] = []
  doc.descendants((node, pos) => {
    if (hasNestedList(node)) foldable.push({ pos, text: itemSummary(node) })
    return true
  })
  for (const sig of saved) {
    const exact = foldable[sig.index]
    if (exact && exact.text === sig.text) {
      out.add(exact.pos)
      continue
    }
    if (sig.text) {
      const byText = foldable.find((f) => f.text === sig.text && !out.has(f.pos))
      if (byText) out.add(byText.pos)
    }
  }
  return out
}

function saveFoldedPositions(doc: PmNode, noteId: string, folded: Set<number>) {
  if (!noteId || typeof localStorage === 'undefined') return
  try {
    if (!folded.size) {
      localStorage.removeItem(storageKey(noteId))
      return
    }
    const sigs: FoldedSignature[] = []
    let index = 0
    doc.descendants((node, pos) => {
      if (hasNestedList(node)) {
        if (folded.has(pos)) sigs.push({ index, text: itemSummary(node) })
        index++
      }
      return true
    })
    if (sigs.length) localStorage.setItem(storageKey(noteId), JSON.stringify(sigs))
    else localStorage.removeItem(storageKey(noteId))
  } catch {
    // Ignore storage quota or private-mode failures.
  }
}

/** Finds the position of the owning listItem/taskItem for a widget placed inside it. */
function findOwnerItemPos(doc: PmNode, insidePos: number | undefined): number | null {
  if (insidePos === undefined || insidePos < 1 || insidePos > doc.content.size) return null
  const $pos = doc.resolve(insidePos)
  for (let d = $pos.depth; d >= 1; d--) {
    const node = $pos.node(d)
    if (hasNestedList(node)) return $pos.before(d)
  }
  return null
}

/** True when `pos` falls inside one of the nested lists of the item at `itemPos`. */
function isInsideNestedLists(doc: PmNode, itemPos: number, targetPos: number): boolean {
  const item = doc.nodeAt(itemPos)
  if (!item || !isListItem(item)) return false
  let offset = itemPos + 1
  for (let i = 0; i < item.childCount; i++) {
    const child = item.child(i)
    if (LIST_TYPES.has(child.type.name)) {
      if (targetPos >= offset && targetPos <= offset + child.nodeSize) return true
    }
    offset += child.nodeSize
  }
  return false
}

function buildDecorations(doc: PmNode, folded: Set<number>): DecorationSet {
  const decos: Decoration[] = []
  doc.descendants((node, pos) => {
    if (!hasNestedList(node)) return true
    const isFolded = folded.has(pos)
    decos.push(
      Decoration.node(pos, pos + node.nodeSize, {
        class: isFolded ? 'fixnote-foldable is-folded' : 'fixnote-foldable',
      }),
    )

    // Chevron button placed right at the start of the item (block position, never
    // interfering with inline cursor movement or Backspace at the start of the line).
    decos.push(
      Decoration.widget(
        pos + 1,
        (view, getPos) => {
          const btn = document.createElement('button')
          btn.type = 'button'
          btn.className = 'fixnote-fold-btn'
          btn.contentEditable = 'false'
          btn.tabIndex = -1
          const label = i18n.t(isFolded ? 'outline.expand' : 'outline.collapse')
          btn.setAttribute('aria-label', label)
          btn.setAttribute('aria-expanded', String(!isFolded))
          btn.title = label
          btn.addEventListener('mousedown', (e) => {
            e.preventDefault()
            e.stopPropagation()
            const owner = findOwnerItemPos(view.state.doc, getPos())
            if (owner === null) return
            view.dispatch(
              view.state.tr.setMeta(collapsibleListsKey, {
                toggle: owner,
              } satisfies FoldMeta),
            )
          })
          return btn
        },
        {
          side: -1,
          key: `fold-btn-${isFolded ? 'c' : 'o'}`,
          ignoreSelection: true,
        },
      ),
    )

    // When collapsed, show a subtle clickable "+N" pill at the end of the item's first line.
    if (isFolded) {
      const first = node.firstChild
      if (first?.isTextblock) {
        const hidden = countDescendantItems(node)
        const endOfFirstLine = pos + 1 + first.nodeSize - 1
        decos.push(
          Decoration.widget(
            endOfFirstLine,
            (view, getPos) => {
              const pill = document.createElement('button')
              pill.type = 'button'
              pill.className = 'fixnote-fold-pill'
              pill.contentEditable = 'false'
              pill.tabIndex = -1
              pill.textContent = `+${hidden}`
              const tip = i18n.t('outline.hiddenItems', { count: hidden })
              pill.title = tip
              pill.setAttribute('aria-label', tip)
              pill.addEventListener('mousedown', (e) => {
                e.preventDefault()
                e.stopPropagation()
                const owner = findOwnerItemPos(view.state.doc, getPos())
                if (owner === null) return
                view.dispatch(
                  view.state.tr.setMeta(collapsibleListsKey, {
                    toggle: owner,
                  } satisfies FoldMeta),
                )
              })
              return pill
            },
            {
              side: 1,
              key: `fold-pill-${hidden}`,
              ignoreSelection: true,
            },
          ),
        )
      }
    }

    // Skip recursing into nested children of a folded item (they are display: none).
    return !isFolded
  })

  return decos.length ? DecorationSet.create(doc, decos) : DecorationSet.empty
}

/**
 * Collapsible nested lists (bullet, ordered and task lists). Folded state is purely local UI
 * decorations + debounced per-note localStorage, leaving the underlying Markdown and Yjs state untouched.
 */
export const CollapsibleLists = Extension.create<{ noteId: string }>({
  name: 'collapsibleLists',
  addOptions: () => ({ noteId: '' }),

  addKeyboardShortcuts() {
    return {
      // Classic outliner toggle: collapse/expand the nearest foldable list item around the cursor.
      'Mod-.': () => {
        const { state, view } = this.editor
        const pos = findOwnerItemPos(state.doc, state.selection.$head.pos)
        if (pos === null) return false
        const folded = collapsibleListsKey.getState(state)?.folded
        const collapsing = !folded?.has(pos)
        let tr = state.tr.setMeta(collapsibleListsKey, { toggle: pos } satisfies FoldMeta)
        // If folding from inside a nested child, move the caret up to the parent item's first line.
        if (collapsing && isInsideNestedLists(state.doc, pos, state.selection.$head.pos)) {
          const first = state.doc.nodeAt(pos)?.firstChild
          if (first?.isTextblock) {
            tr = tr.setSelection(TextSelection.create(state.doc, pos + 1 + first.nodeSize - 1))
          }
        }
        view.dispatch(tr)
        return true
      },
    }
  },

  addProseMirrorPlugins() {
    const noteId = this.options.noteId
    return [
      new Plugin<CollapsibleState>({
        key: collapsibleListsKey,
        state: {
          init: (_config, state) => {
            const folded = loadFoldedPositions(state.doc, noteId)
            return {
              folded,
              decorations: buildDecorations(state.doc, folded),
              saveVersion: 0,
            }
          },
          apply: (tr, prev, _oldState, newState) => {
            let nextFolded = prev.folded
            let foldChanged = false

            if (tr.docChanged && prev.folded.size > 0) {
              const mapped = new Set<number>()
              for (const pos of prev.folded) {
                const res = tr.mapping.mapResult(pos, 1)
                if (res.deleted) continue
                const node = newState.doc.nodeAt(res.pos)
                if (node && hasNestedList(node)) mapped.add(res.pos)
              }
              nextFolded = mapped
              foldChanged = true
            }

            const meta = tr.getMeta(collapsibleListsKey) as FoldMeta | undefined
            if (meta?.toggle !== undefined) {
              const copy = new Set(nextFolded)
              if (copy.has(meta.toggle)) {
                copy.delete(meta.toggle)
              } else {
                const node = newState.doc.nodeAt(meta.toggle)
                if (node && hasNestedList(node)) copy.add(meta.toggle)
              }
              nextFolded = copy
              foldChanged = true
            }

            // Never trap the text cursor inside a collapsed branch (e.g. search or keyboard nav).
            if (nextFolded.size > 0 && (tr.selectionSet || tr.docChanged)) {
              const head = newState.selection.$head.pos
              let unfolded: Set<number> | null = null
              for (const itemPos of nextFolded) {
                if (isInsideNestedLists(newState.doc, itemPos, head)) {
                  if (!unfolded) unfolded = new Set(nextFolded)
                  unfolded.delete(itemPos)
                }
              }
              if (unfolded) {
                nextFolded = unfolded
                foldChanged = true
              }
            }

            if (!tr.docChanged && !foldChanged) return prev

            return {
              folded: nextFolded,
              decorations: buildDecorations(newState.doc, nextFolded),
              saveVersion: foldChanged ? prev.saveVersion + 1 : prev.saveVersion,
            }
          },
        },
        view() {
          let saveTimer: ReturnType<typeof setTimeout> | undefined
          let lastSavedVersion = 0
          let latest: { doc: PmNode; folded: Set<number> } | null = null
          const flush = () => {
            clearTimeout(saveTimer)
            saveTimer = undefined
            if (latest) {
              saveFoldedPositions(latest.doc, noteId, latest.folded)
              latest = null
            }
          }
          return {
            update(view) {
              const st = collapsibleListsKey.getState(view.state)
              if (!st || st.saveVersion === lastSavedVersion) return
              lastSavedVersion = st.saveVersion
              latest = { doc: view.state.doc, folded: st.folded }
              clearTimeout(saveTimer)
              saveTimer = setTimeout(flush, SAVE_DEBOUNCE_MS)
            },
            destroy() {
              flush()
            },
          }
        },
        props: {
          decorations: (state) =>
            collapsibleListsKey.getState(state)?.decorations ?? DecorationSet.empty,
        },
      }),
    ]
  },
})
