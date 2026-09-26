import type { JSONContent, MarkdownToken } from '@tiptap/core'
import Paragraph from '@tiptap/extension-paragraph'

const ANGLE_URL = /^<(https?:\/\/[^\s<>]+)>$/
/** Stands in for "://" in plain (unlinked) text while rendering; see renderMarkdown. */
const SCHEME_SEP = ''

type Inline = { type?: string; text?: string; marks?: readonly unknown[] }
const isLinkMark = (m: unknown): m is { type: 'link'; attrs?: { href?: string } } =>
  typeof m === 'object' && m !== null && 'type' in m && m.type === 'link'

/** The URL of a paragraph that holds nothing but one link whose text is that URL. */
export function onlyLink(node: { content?: readonly Inline[] }): string | null {
  const content = node.content ?? []
  const child = content[0]
  if (content.length !== 1 || child?.type !== 'text') return null
  const href = child.marks?.find(isLinkMark)?.attrs?.href
  return href && /^https?:\/\//i.test(href) && child.text?.trim() === href ? href : null
}

const EMPTY = new Set(['&nbsp;', ' '])

/**
 * Paragraph whose Markdown parsing keeps images: images are blocks here, so a line mixing text
 * and ![](…) becomes paragraph, image, paragraph instead of losing the image. Everything else
 * parses as in Tiptap's own paragraph.
 *
 * A line that is only a link shows a card (see link-cards.ts), unless it was pasted "as a link":
 * then the paragraph carries `plainLink` and is stored as `<https://…>`.
 */
export const ImageAwareParagraph = Paragraph.extend({
  addAttributes() {
    return {
      plainLink: {
        default: false,
        keepOnSplit: false,
        parseHTML: (el) => el.hasAttribute('data-plain-link'),
        renderHTML: (attrs) => (attrs.plainLink ? { 'data-plain-link': '' } : {}),
      },
    }
  },
  parseMarkdown: (token, helpers) => {
    const tokens = token.tokens ?? []
    const paragraph = (run: MarkdownToken[]) =>
      helpers.createNode('paragraph', undefined, helpers.parseInline(run))
    if (ANGLE_URL.test((token.raw ?? '').trim())) {
      return helpers.createNode('paragraph', { plainLink: true }, helpers.parseInline(tokens))
    }
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
  renderMarkdown(node, helpers, context) {
    const url = node.attrs?.plainLink ? onlyLink(node) : null
    if (url) return `<${url}>`
    // A URL pasted as plain text would come back as a link (Markdown autolinks bare URLs), so its
    // "://" is stored escaped: `https:\/\/…` reads as the same text but is not a link.
    const content = node.content?.map((child) =>
      child.type === 'text' && child.text && !child.marks?.some(isLinkMark)
        ? { ...child, text: child.text.replace(/\b(https?|ftp):\/\//gi, `$1${SCHEME_SEP}`) }
        : child,
    )
    const out =
      Paragraph.config.renderMarkdown?.call(this, { ...node, content }, helpers, context) ?? ''
    return out.replaceAll(SCHEME_SEP, ':\\/\\/')
  },
})
