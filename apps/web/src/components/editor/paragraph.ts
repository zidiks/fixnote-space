import type { JSONContent, MarkdownToken } from '@tiptap/core'
import Paragraph from '@tiptap/extension-paragraph'

const EMPTY = new Set(['&nbsp;', ' '])

/**
 * Paragraph whose Markdown parsing keeps images: images are blocks here, so a line mixing text
 * and ![](…) becomes paragraph, image, paragraph instead of losing the image. Everything else
 * parses as in Tiptap's own paragraph.
 */
export const ImageAwareParagraph = Paragraph.extend({
  parseMarkdown: (token, helpers) => {
    const tokens = token.tokens ?? []
    const paragraph = (run: MarkdownToken[]) =>
      helpers.createNode('paragraph', undefined, helpers.parseInline(run))
    if (!tokens.some((t) => t.type === 'image')) {
      const only = tokens[0]
      if (tokens.length === 1 && only?.type === 'text' && EMPTY.has(only.text ?? only.raw ?? '')) {
        return helpers.createNode('paragraph', undefined, [])
      }
      return paragraph(tokens)
    }
    const out: JSONContent[] = []
    let run: MarkdownToken[] = []
    const flush = () => {
      if (run.some((t) => (t.raw ?? t.text ?? '').trim() || t.type === 'br'))
        out.push(paragraph(run))
      run = []
    }
    for (const t of tokens) {
      if (t.type === 'image') {
        flush()
        out.push(...(helpers.parseChildren([t]) as JSONContent[]))
      } else run.push(t)
    }
    flush()
    return out
  },
})
