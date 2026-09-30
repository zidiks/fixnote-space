import { i18n } from '@fixnote/i18n'
import type { JSONContent, MarkdownToken } from '@tiptap/core'
import { Details, DetailsContent, DetailsSummary } from '@tiptap/extension-details'

/**
 * A folded section (a call's transcript under its summary). Kept in Markdown the way GitHub and
 * Obsidian read it, `<details><summary>Title</summary>…</details>`, rather than Tiptap's `:::`
 * blocks, so the note reads the same in any Markdown app and in an export.
 */

const OPEN = /^<details(?:\s+open)?>[ \t]*\n[ \t]*<summary>([^\n]*?)<\/summary>[ \t]*\n/
const TAG = /^<(\/?)details(?:\s+open)?>[ \t]*$/gm

const fromHtml = (s: string) =>
  s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
const toHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

const textOf = (node: JSONContent | undefined): string =>
  (node?.content ?? []).map((c) => c.text ?? textOf(c)).join('')

export const NoteDetails = Details.extend({
  addOptions() {
    return {
      ...Details.options,
      renderToggleButton: ({ element, isOpen }) =>
        element.setAttribute('aria-label', i18n.t(isOpen ? 'note.collapse' : 'note.expand')),
    }
  },
  markdownTokenizer: {
    name: 'details',
    level: 'block',
    start: (src: string) => src.search(/^<details(?:\s+open)?>/m),
    tokenize(src, _tokens, lexer) {
      const open = src.match(OPEN)
      if (!open) return undefined
      const tags = new RegExp(TAG.source, 'gm')
      tags.lastIndex = open[0].length
      let depth = 1
      for (let m = tags.exec(src); m; m = tags.exec(src)) {
        depth += m[1] ? -1 : 1
        if (depth) continue
        const inner = src.slice(open[0].length, m.index)
        return {
          type: 'details',
          raw: src.slice(0, m.index + m[0].length),
          summary: fromHtml(open[1] ?? ''),
          tokens: lexer.blockTokens(inner),
        }
      }
      return undefined
    },
  },
  parseMarkdown: (token: MarkdownToken, h) => {
    const summary = String(token.summary ?? '')
    const body = h.parseChildren(token.tokens ?? [])
    return h.createNode('details', {}, [
      h.createNode('detailsSummary', {}, summary ? [h.createTextNode(summary)] : []),
      h.createNode('detailsContent', {}, body.length ? body : [h.createNode('paragraph')]),
    ])
  },
  renderMarkdown: (node: JSONContent, h) => {
    const [summary, content] = node.content ?? []
    const body = h.renderChildren(content?.content ?? [], '\n\n')
    return `<details>\n<summary>${toHtml(textOf(summary))}</summary>\n\n${body}\n\n</details>`
  },
})

// Their own `:::` syntax is not used: the summary and the body are written by `NoteDetails`.
export const NoteDetailsSummary = DetailsSummary.extend({ markdownTokenizer: undefined })
export const NoteDetailsContent = DetailsContent.extend({ markdownTokenizer: undefined })
