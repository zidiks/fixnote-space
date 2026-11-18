import { type JSONContent, type MarkdownToken, mergeAttributes, Node } from '@tiptap/core'

/**
 * An Obsidian callout: `> [!info] Title` and quoted lines under it (`[!note]-` folded, `+` open).
 * Kept in Markdown exactly that way, so a note imported from Obsidian reads the same in Obsidian,
 * in an export and to the assistant; in the editor it is a tinted card with its title. The title
 * is part of the Markdown, not of the text you type in (empty: the type's name, as in Obsidian).
 */

const HEAD = /^ {0,3}> ?\[!([\w-]+)\]([+-]?)[ \t]*([^\n]*)(?:\n|$)/
const QUOTED = /^ {0,3}>/

/** The callout types Obsidian draws alike share a tint here (styles.css, `data-tone`). */
const TONES: Record<string, string> = {
  success: 'success',
  check: 'success',
  done: 'success',
  tip: 'success',
  hint: 'success',
  important: 'success',
  warning: 'warning',
  caution: 'warning',
  attention: 'warning',
  todo: 'warning',
  danger: 'danger',
  error: 'danger',
  bug: 'danger',
  failure: 'danger',
  fail: 'danger',
  missing: 'danger',
}

const titleOf = (type: string, title: string) =>
  title.trim() || type.charAt(0).toUpperCase() + type.slice(1)

export const Callout = Node.create({
  name: 'callout',
  group: 'block',
  content: 'block+',
  defining: true,

  addAttributes() {
    return {
      type: { default: 'note' },
      title: { default: '' },
      /** `-` folded, `+` open, '' always shown (Obsidian's markers; kept as they were). */
      fold: { default: '' },
    }
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-callout]',
        contentElement: '[data-callout-body]',
        getAttrs: (el) => ({
          type: el.getAttribute('data-callout') ?? 'note',
          title: el.getAttribute('data-title') ?? '',
          fold: el.getAttribute('data-fold') ?? '',
        }),
      },
    ]
  },

  renderHTML({ node, HTMLAttributes }) {
    const type = String(node.attrs.type)
    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        'data-callout': type,
        'data-tone': TONES[type.toLowerCase()] ?? 'note',
        'data-title': node.attrs.title,
        'data-fold': node.attrs.fold,
      }),
      [
        'div',
        { 'data-callout-title': '', contenteditable: 'false' },
        titleOf(type, node.attrs.title),
      ],
      ['div', { 'data-callout-body': '' }, 0],
    ]
  },

  markdownTokenizer: {
    name: 'callout',
    level: 'block',
    start: (src: string) => src.search(/^ {0,3}> ?\[!/m),
    tokenize(src, _tokens, lexer) {
      const head = src.match(HEAD)
      if (!head) return undefined
      const lines: string[] = []
      let at = head[0].length
      while (at < src.length) {
        const end = src.indexOf('\n', at)
        const line = src.slice(at, end < 0 ? src.length : end)
        if (!QUOTED.test(line)) break
        lines.push(line.replace(/^ {0,3}> ?/, ''))
        at = end < 0 ? src.length : end + 1
      }
      return {
        type: 'callout',
        raw: src.slice(0, at),
        calloutType: head[1] ?? 'note',
        fold: head[2] ?? '',
        title: (head[3] ?? '').trim(),
        tokens: lexer.blockTokens(lines.join('\n')),
      }
    },
  },

  parseMarkdown: (token: MarkdownToken, h) => {
    const body = h.parseChildren(token.tokens ?? [])
    return h.createNode(
      'callout',
      {
        type: String(token.calloutType ?? 'note'),
        title: String(token.title ?? ''),
        fold: String(token.fold ?? ''),
      },
      body.length ? body : [h.createNode('paragraph')],
    )
  },

  renderMarkdown: (node: JSONContent, h) => {
    const { type = 'note', title = '', fold = '' } = node.attrs ?? {}
    const body = h.renderChildren(node.content ?? [], '\n\n')
    const quoted = body
      .split('\n')
      .map((line) => (line ? `> ${line}` : '>'))
      .join('\n')
    return `> [!${type}]${fold}${title ? ` ${title}` : ''}\n${quoted}`
  },
})
