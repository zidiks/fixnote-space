import { i18n } from '@fixnote/i18n'
import { type Editor, getMarkRange } from '@tiptap/core'
import CodeBlock from '@tiptap/extension-code-block'
import type { Node as PmNode } from '@tiptap/pm/model'
import { Plugin, PluginKey, TextSelection } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import { common, createLowlight } from 'lowlight'

const lowlight = createLowlight(common)
const highlightKey = new PluginKey<DecorationSet>('codeBlockHighlight')

/** Minimum highlight.js auto-detection relevance so short prose is not mislabeled as code. */
const MIN_AUTO_RELEVANCE = 3

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
const MAX_CACHE = 64

export function highlightCode(code: string, explicitLanguage?: string | null): HighlightResult {
  const explicit = explicitLanguage?.trim().toLowerCase() || null
  const cacheKey = `${explicit ?? ''}\u0000${code}`
  const cached = highlightCache.get(cacheKey)
  if (cached) return cached

  let result: HighlightResult = { language: explicit, tokens: [] }
  if (code.length > 0) {
    if (explicit && lowlight.registered(explicit)) {
      const tree = lowlight.highlight(explicit, code)
      const tokens: HighlightToken[] = []
      collectTokens(tree.children as readonly HastNode[], 0, [], tokens)
      result = { language: explicit, tokens }
    } else if (!explicit && code.trim().length >= 3) {
      const tree = lowlight.highlightAuto(code)
      const detected = tree.data?.language ?? null
      const relevance = tree.data?.relevance ?? 0
      if (detected && relevance >= MIN_AUTO_RELEVANCE) {
        const tokens: HighlightToken[] = []
        collectTokens(tree.children as readonly HastNode[], 0, [], tokens)
        result = { language: detected, tokens }
      }
    }
  }

  if (highlightCache.size >= MAX_CACHE) {
    const oldest = highlightCache.keys().next().value
    if (oldest !== undefined) highlightCache.delete(oldest)
  }
  highlightCache.set(cacheKey, result)
  return result
}

function buildDecorations(doc: PmNode): DecorationSet {
  const decorations: Decoration[] = []
  doc.descendants((node, pos) => {
    if (node.type.name !== 'codeBlock') return
    const language = typeof node.attrs.language === 'string' ? node.attrs.language : null
    const { tokens } = highlightCode(node.textContent, language)
    const base = pos + 1
    for (const token of tokens) {
      decorations.push(
        Decoration.inline(base + token.from, base + token.to, {
          class: token.classes.join(' '),
        }),
      )
    }
    return false
  })
  return DecorationSet.create(doc, decorations)
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
        void navigator.clipboard
          .writeText(current.textContent)
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

      const syncHeader = (next: PmNode) => {
        const explicit = typeof next.attrs.language === 'string' ? next.attrs.language : null
        const { language } = highlightCode(next.textContent, explicit)
        langEl.textContent = language ?? ''
        langEl.hidden = !language
      }
      syncHeader(current)

      return {
        dom: wrapper,
        contentDOM: code,
        update(updated) {
          if (updated.type !== current.type) return false
          const changed =
            updated.textContent !== current.textContent ||
            updated.attrs.language !== current.attrs.language
          current = updated
          if (changed) syncHeader(current)
          return true
        },
        ignoreMutation(mutation) {
          return header.contains(mutation.target)
        },
        destroy() {
          clearTimeout(copyTimer)
        },
      }
    }
  },

  addProseMirrorPlugins() {
    return [
      ...(this.parent?.() ?? []),
      new Plugin<DecorationSet>({
        key: highlightKey,
        state: {
          init: (_, state) => buildDecorations(state.doc),
          apply(tr, previous) {
            if (!tr.docChanged) return previous
            return buildDecorations(tr.doc)
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
