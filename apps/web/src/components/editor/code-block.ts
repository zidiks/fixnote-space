import { redactProtectedReferences } from '@fixnote/core'
import { i18n } from '@fixnote/i18n'
import { type Editor, getMarkRange } from '@tiptap/core'
import CodeBlock from '@tiptap/extension-code-block'
import type { Node as PmNode } from '@tiptap/pm/model'
import { Plugin, PluginKey, TextSelection, type Transaction } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import { common, createLowlight } from 'lowlight'

let lowlightInstance: ReturnType<typeof createLowlight> | null = null
function getLowlight() {
  lowlightInstance ??= createLowlight(common)
  return lowlightInstance
}

const highlightKey = new PluginKey<{
  decorations: DecorationSet
  detected: Map<number, string | null>
}>('codeBlockHighlight')

const REDETECT_META = 'fixnote.codeBlock.redetect'
const REDETECT_DELAY_MS = 350
/** Minimum highlight.js auto-detection relevance so short prose is not mislabeled as code. */
const MIN_AUTO_RELEVANCE = 3
const MAX_CACHE = 64
const MAX_CACHE_CHARS = 50_000

interface HighlightToken {
  from: number
  to: number
  classes: string[]
}

interface HighlightResult {
  language: string | null
  tokens: HighlightToken[]
}

type HastNode =
  | { type: 'text'; value: string }
  | { type: 'element'; properties?: { className?: string[] }; children?: HastNode[] }
  | { type: string; children?: HastNode[] }

function collectTokens(
  nodes: readonly HastNode[],
  offset: number,
  inherited: string[],
  out: HighlightToken[],
): number {
  let cursor = offset
  for (const node of nodes) {
    if (node.type === 'text' && 'value' in node) {
      const end = cursor + node.value.length
      if (inherited.length > 0 && end > cursor) {
        out.push({ from: cursor, to: end, classes: inherited })
      }
      cursor = end
    } else if ('children' in node && node.children) {
      const own =
        node.type === 'element' && 'properties' in node && Array.isArray(node.properties?.className)
          ? node.properties.className
          : []
      const classes = own.length > 0 ? [...inherited, ...own] : inherited
      cursor = collectTokens(node.children, cursor, classes, out)
    }
  }
  return cursor
}

const highlightCache = new Map<string, HighlightResult>()

export function highlightCode(code: string, explicitLanguage?: string | null): HighlightResult {
  const explicit = explicitLanguage?.trim().toLowerCase() || null
  const cacheable = code.length <= MAX_CACHE_CHARS
  const cacheKey = cacheable ? `${explicit ?? ''}\u0000${code}` : null
  if (cacheKey) {
    const cached = highlightCache.get(cacheKey)
    if (cached) {
      // Refresh LRU order on hit.
      highlightCache.delete(cacheKey)
      highlightCache.set(cacheKey, cached)
      return cached
    }
  }

  let result: HighlightResult = { language: explicit, tokens: [] }
  if (code.length > 0) {
    const ll = getLowlight()
    if (explicit && ll.registered(explicit)) {
      const tree = ll.highlight(explicit, code)
      const tokens: HighlightToken[] = []
      collectTokens(tree.children as readonly HastNode[], 0, [], tokens)
      result = { language: explicit, tokens }
    } else if (!explicit && code.trim().length >= 3) {
      const tree = ll.highlightAuto(code)
      const detected = tree.data?.language ?? null
      const relevance = tree.data?.relevance ?? 0
      if (detected && relevance >= MIN_AUTO_RELEVANCE) {
        const tokens: HighlightToken[] = []
        collectTokens(tree.children as readonly HastNode[], 0, [], tokens)
        result = { language: detected, tokens }
      }
    }
  }

  if (cacheKey) {
    if (highlightCache.size >= MAX_CACHE) {
      const oldest = highlightCache.keys().next().value
      if (oldest !== undefined) highlightCache.delete(oldest)
    }
    highlightCache.set(cacheKey, result)
  }
  return result
}

function decorationsForBlock(
  node: PmNode,
  pos: number,
  hintLanguage?: string | null,
): { decorations: Decoration[]; language: string | null } {
  const explicit = typeof node.attrs.language === 'string' ? node.attrs.language : null
  const effectiveLang = explicit || hintLanguage || null
  const { language, tokens } = highlightCode(node.textContent, effectiveLang)
  const base = pos + 1
  const decorations = tokens.map((token) =>
    Decoration.inline(base + token.from, base + token.to, {
      class: token.classes.join(' '),
    }),
  )
  return { decorations, language }
}

function buildAllDecorations(doc: PmNode): {
  decorations: DecorationSet
  detected: Map<number, string | null>
} {
  const decorations: Decoration[] = []
  const detected = new Map<number, string | null>()
  doc.descendants((node, pos) => {
    if (node.type.name !== 'codeBlock') return
    const built = decorationsForBlock(node, pos)
    for (const d of built.decorations) decorations.push(d)
    detected.set(pos, built.language)
    return false
  })
  return { decorations: DecorationSet.create(doc, decorations), detected }
}

/** Ranges in `tr.doc` touched by `tr.steps`, so typing in prose skips all code blocks. */
function changedRanges(tr: Transaction): { from: number; to: number }[] {
  const ranges: { from: number; to: number }[] = []
  for (let i = 0; i < tr.mapping.maps.length; i++) {
    const map = tr.mapping.maps[i]
    const rest = tr.mapping.slice(i + 1)
    map?.forEach((_oldStart, _oldEnd, newStart, newEnd) => {
      const from = rest.map(newStart, -1)
      const to = rest.map(newEnd, 1)
      ranges.push({ from: Math.min(from, to), to: Math.max(from, to) })
    })
  }
  return ranges
}

function svgIcon(paths: readonly string[]) {
  const ns = 'http://www.w3.org/2000/svg'
  const icon = document.createElementNS(ns, 'svg')
  icon.setAttribute('viewBox', '0 0 24 24')
  icon.setAttribute('fill', 'none')
  icon.setAttribute('stroke', 'currentColor')
  icon.setAttribute('stroke-width', '2')
  icon.setAttribute('stroke-linecap', 'round')
  icon.setAttribute('stroke-linejoin', 'round')
  icon.setAttribute('aria-hidden', 'true')
  for (const d of paths) {
    const path = document.createElementNS(ns, 'path')
    path.setAttribute('d', d)
    icon.append(path)
  }
  return icon
}

const COPY_PATHS = [
  'M8 8m0 2a2 2 0 0 1 2 -2h8a2 2 0 0 1 2 2v8a2 2 0 0 1 -2 2h-8a2 2 0 0 1 -2 -2z',
  'M16 8v-2a2 2 0 0 0 -2 -2h-8a2 2 0 0 0 -2 2v8a2 2 0 0 0 2 2h2',
]
const CHECK_PATHS = ['M20 6 9 17l-5-5']

/** Turn inline `code` at the caret into a multiline `codeBlock` when pressing Shift+Enter. */
export function promoteInlineCodeToBlock(editor: Editor): boolean {
  const { state, view } = editor
  const { selection, schema, doc } = state
  const { $from, $to } = selection
  const codeMark = schema.marks.code
  const codeBlockType = schema.nodes.codeBlock
  const paragraphType = schema.nodes.paragraph
  if (!codeMark || !codeBlockType || !paragraphType) return false
  if ($from.parent.type.name !== 'paragraph' || $from.parent !== $to.parent) return false
  if (!editor.isActive('code')) return false

  let range = getMarkRange($from, codeMark)
  if (!range && $from.pos > $from.start()) {
    range = getMarkRange(doc.resolve($from.pos - 1), codeMark)
  }
  if (!range) return false
  if ($from.pos < range.from || $to.pos > range.to) return false

  const paraStart = $from.start($from.depth)
  const paraEnd = $from.end($from.depth)
  const parentPos = $from.before($from.depth)
  const parentEnd = $from.after($from.depth)

  const beforeSlice = doc.slice(paraStart, range.from).content
  const afterSlice = doc.slice(range.to, paraEnd).content
  const beforeText = doc.textBetween(range.from, $from.pos, '\n')
  const afterText = doc.textBetween($to.pos, range.to, '\n')
  const codeText = `${beforeText}\n${afterText}`

  const nodes: PmNode[] = []
  let codeBlockOffset = 0
  if (beforeSlice.size > 0) {
    const beforeNode = paragraphType.create(null, beforeSlice)
    nodes.push(beforeNode)
    codeBlockOffset = beforeNode.nodeSize
  }
  nodes.push(codeBlockType.create(null, codeText ? schema.text(codeText) : null))
  if (afterSlice.size > 0) {
    nodes.push(paragraphType.create(null, afterSlice))
  }

  const tr = state.tr.replaceWith(parentPos, parentEnd, nodes)
  const caretPos = parentPos + codeBlockOffset + 1 + beforeText.length + 1
  tr.setSelection(TextSelection.create(tr.doc, caretPos)).scrollIntoView()
  view.dispatch(tr)
  return true
}

/**
 * Code blocks with lowlight syntax highlighting, automatic language detection, a top-right copy
 * button, and Shift+Enter promotion from inline `code` into a full code block.
 */
export const NoteCodeBlock = CodeBlock.extend({
  priority: 200,

  addKeyboardShortcuts() {
    return {
      ...this.parent?.(),
      'Shift-Enter': () => promoteInlineCodeToBlock(this.editor),
    }
  },

  addNodeView() {
    return ({ node }) => {
      let current = node
      let copyTimer: ReturnType<typeof setTimeout> | undefined
      let headerTimer: ReturnType<typeof setTimeout> | undefined
      let detectedLang: string | null = null

      const wrapper = document.createElement('div')
      wrapper.className = 'fixnote-code-block'

      const header = document.createElement('div')
      header.className = 'fixnote-code-header'
      header.contentEditable = 'false'

      const langEl = document.createElement('span')
      langEl.className = 'fixnote-code-lang'

      const copyBtn = document.createElement('button')
      copyBtn.type = 'button'
      copyBtn.className = 'fixnote-code-copy'

      const setCopied = (copied: boolean) => {
        const label = i18n.t(copied ? 'privacy.copied' : 'menu.copy')
        copyBtn.title = label
        copyBtn.setAttribute('aria-label', label)
        copyBtn.classList.toggle('is-copied', copied)
        copyBtn.replaceChildren(svgIcon(copied ? CHECK_PATHS : COPY_PATHS))
      }
      setCopied(false)

      copyBtn.addEventListener('mousedown', (event) => {
        event.preventDefault()
      })
      copyBtn.addEventListener('click', (event) => {
        event.preventDefault()
        event.stopPropagation()
        // Never copy raw protected fragment reference tokens out of a code block.
        const safeText = redactProtectedReferences(current.textContent)
        void navigator.clipboard
          .writeText(safeText)
          .then(() => {
            setCopied(true)
            clearTimeout(copyTimer)
            copyTimer = setTimeout(() => setCopied(false), 1600)
          })
          .catch(() => undefined)
      })

      header.append(langEl, copyBtn)

      const pre = document.createElement('pre')
      const code = document.createElement('code')
      pre.append(code)
      wrapper.append(header, pre)

      const syncHeader = (next: PmNode, allowAuto: boolean) => {
        const explicit = typeof next.attrs.language === 'string' ? next.attrs.language : null
        if (explicit) {
          detectedLang = explicit.trim().toLowerCase() || null
        } else if (allowAuto || detectedLang === null) {
          detectedLang = highlightCode(next.textContent, null).language
        }
        langEl.textContent = detectedLang ?? ''
        langEl.hidden = !detectedLang
      }
      syncHeader(current, true)

      return {
        dom: wrapper,
        contentDOM: code,
        update(updated) {
          if (updated.type !== current.type) return false
          const langChanged = updated.attrs.language !== current.attrs.language
          const textChanged = updated.textContent !== current.textContent
          current = updated
          if (langChanged) {
            clearTimeout(headerTimer)
            syncHeader(current, true)
          } else if (textChanged && !updated.attrs.language) {
            clearTimeout(headerTimer)
            headerTimer = setTimeout(() => syncHeader(current, true), REDETECT_DELAY_MS)
          }
          return true
        },
        ignoreMutation(mutation) {
          return header.contains(mutation.target)
        },
        destroy() {
          clearTimeout(copyTimer)
          clearTimeout(headerTimer)
        },
      }
    }
  },

  addProseMirrorPlugins() {
    return [
      ...(this.parent?.() ?? []),
      new Plugin<{ decorations: DecorationSet; detected: Map<number, string | null> }>({
        key: highlightKey,
        state: {
          init: (_, state) => buildAllDecorations(state.doc),
          apply(tr, previous) {
            const redetectPos = tr.getMeta(REDETECT_META) as number | undefined
            if (redetectPos !== undefined) {
              const node = tr.doc.nodeAt(redetectPos)
              if (node?.type.name !== 'codeBlock' || node.attrs.language) return previous
              const existing = previous.decorations.find(redetectPos, redetectPos + node.nodeSize)
              const built = decorationsForBlock(node, redetectPos)
              const nextDetected = new Map(previous.detected)
              nextDetected.set(redetectPos, built.language)
              return {
                decorations: previous.decorations.remove(existing).add(tr.doc, built.decorations),
                detected: nextDetected,
              }
            }
            if (!tr.docChanged) return previous

            const mappedDecos = previous.decorations.map(tr.mapping, tr.doc)
            const mappedDetected = new Map<number, string | null>()
            for (const [oldPos, lang] of previous.detected) {
              const res = tr.mapping.mapResult(oldPos, 1)
              if (!res.deleted) mappedDetected.set(res.pos, lang)
            }

            const touched = changedRanges(tr)
            if (!touched.length) return { decorations: mappedDecos, detected: mappedDetected }

            // Only re-highlight codeBlock nodes that overlap a changed range.
            const toRehighlight = new Map<number, PmNode>()
            for (const { from, to } of touched) {
              const start = Math.max(0, Math.min(from, tr.doc.content.size))
              const end = Math.max(start, Math.min(to, tr.doc.content.size))
              tr.doc.nodesBetween(start, end, (node, pos) => {
                if (node.type.name === 'codeBlock') {
                  toRehighlight.set(pos, node)
                  return false
                }
                return true
              })
            }
            if (!toRehighlight.size) return { decorations: mappedDecos, detected: mappedDetected }

            let decos = mappedDecos
            for (const [pos, node] of toRehighlight) {
              const existing = decos.find(pos, pos + node.nodeSize)
              const explicit = typeof node.attrs.language === 'string' ? node.attrs.language : null
              // Reuse previously detected language during rapid typing so we highlight with 1
              // grammar instead of running ~37 highlightAuto grammars on every keystroke.
              const prevLang = explicit ? null : (mappedDetected.get(pos) ?? null)
              const built = decorationsForBlock(node, pos, prevLang)
              mappedDetected.set(pos, built.language)
              decos = decos.remove(existing).add(tr.doc, built.decorations)
            }
            return { decorations: decos, detected: mappedDetected }
          },
        },
        view() {
          let timer: ReturnType<typeof setTimeout> | undefined
          return {
            update(view, prevState) {
              if (view.state.doc === prevState.doc) return
              const { $from } = view.state.selection
              if ($from.parent.type.name !== 'codeBlock' || $from.parent.attrs.language) return
              const blockPos = $from.before()
              clearTimeout(timer)
              timer = setTimeout(() => {
                if (view.isDestroyed) return
                const node = view.state.doc.nodeAt(blockPos)
                if (node?.type.name !== 'codeBlock' || node.attrs.language) return
                view.dispatch(
                  view.state.tr.setMeta(REDETECT_META, blockPos).setMeta('addToHistory', false),
                )
              }, REDETECT_DELAY_MS)
            },
            destroy() {
              clearTimeout(timer)
            },
          }
        },
        props: {
          decorations(state) {
            return highlightKey.getState(state)?.decorations ?? DecorationSet.empty
          },
        },
      }),
    ]
  },
})
