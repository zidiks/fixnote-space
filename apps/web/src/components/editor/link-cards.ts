import type { LinkPreview } from '@fixnote/core'
import { Extension } from '@tiptap/core'
import type { Node as PmNode } from '@tiptap/pm/model'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet, type EditorView } from '@tiptap/pm/view'
import { onlyLink } from './paragraph'

export interface LinkCardsOptions {
  load: (url: string) => Promise<LinkPreview | null>
  open: (url: string) => void
}

const key = new PluginKey<DecorationSet>('linkCards')

/** Try links without a preview again (e.g. after signing in, the web app can fetch pages). */
export function retryLinkCards(view: EditorView) {
  if (!view.isDestroyed) view.dispatch(view.state.tr.setMeta(key, 'retry'))
}

/**
 * Top-level paragraphs that are just a link (a bookmark): they get a card below. A link pasted
 * "as a link" (`plainLink`) or a URL kept as plain text gets none.
 */
function linkParagraphs(doc: PmNode): { from: number; pos: number; url: string }[] {
  const out: { from: number; pos: number; url: string }[] = []
  doc.forEach((node, offset) => {
    if (node.type.name !== 'paragraph' || node.attrs.plainLink) return
    const url = onlyLink(node.toJSON() as Parameters<typeof onlyLink>[0])
    if (url) out.push({ from: offset, pos: offset + node.nodeSize, url })
  })
  return out
}

/** What a bookmark shows before (or without) a preview: the site and the address. */
function fallbackPreview(url: string): LinkPreview {
  let site = url
  let rest = ''
  try {
    const u = new URL(url)
    site = u.hostname.replace(/^www\./, '')
    rest = decodeURI(u.pathname + u.search).replace(/\/$/, '')
  } catch {
    // Not a URL we can take apart: show it as it is.
  }
  return { url, kind: 'page', title: site, ...(rest ? { description: rest } : {}) }
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string) {
  const node = document.createElement(tag)
  node.className = className
  if (text) node.textContent = text
  return node
}

function renderCard(
  preview: LinkPreview,
  open: (url: string) => void,
  loading = false,
): HTMLElement {
  const card = el('div', `fixnote-link-card is-${preview.kind}${loading ? ' is-loading' : ''}`)
  card.contentEditable = 'false'
  card.setAttribute('role', 'link')
  card.tabIndex = 0
  card.title = preview.url
  const go = (e: Event) => {
    e.preventDefault()
    open(preview.url)
  }
  card.addEventListener('mousedown', (e) => e.preventDefault())
  card.addEventListener('click', go)
  card.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') go(e)
  })
  if (preview.image) {
    const figure = el('div', 'fixnote-link-card-image')
    const img = document.createElement('img')
    img.src = preview.image
    img.alt = ''
    img.loading = 'lazy'
    img.referrerPolicy = 'no-referrer'
    // A broken image should not leave an empty frame.
    img.addEventListener('error', () => figure.remove())
    figure.append(img)
    card.append(figure)
  }
  if (preview.kind !== 'image') {
    const body = el('div', 'fixnote-link-card-body')
    if (preview.site) body.append(el('div', 'fixnote-link-card-site', preview.site))
    if (preview.title) body.append(el('div', 'fixnote-link-card-title', preview.title))
    if (preview.description)
      body.append(el('div', 'fixnote-link-card-description', preview.description))
    card.append(body)
  }
  return card
}

/**
 * Link cards in the editor (paste-to-card): a URL alone on its line shows the page's title,
 * description and image below it, like in a messenger. Previews load lazily and are cached.
 */
export const LinkCards = Extension.create<LinkCardsOptions>({
  name: 'linkCards',
  addOptions: () => ({ load: async () => null, open: () => undefined }),
  addProseMirrorPlugins() {
    const { load, open } = this.options
    const previews = new Map<string, LinkPreview | null | 'loading'>()
    let view: EditorView | null = null

    const request = (url: string) => {
      if (previews.has(url)) return
      previews.set(url, 'loading')
      void load(url)
        .catch(() => null)
        .then((p) => {
          previews.set(url, p)
          if (view && !view.isDestroyed) view.dispatch(view.state.tr.setMeta(key, 'refresh'))
        })
    }

    // A bookmark always shows a card: the page's preview when it loads, else the site and address
    // (pages that give nothing, the web app before signing in). Its URL line becomes a caption.
    const build = (doc: PmNode) => {
      const decorations: Decoration[] = []
      for (const { from, pos, url } of linkParagraphs(doc)) {
        const loaded = previews.get(url)
        if (loaded === undefined) request(url)
        const full = loaded && loaded !== 'loading' && loaded.kind !== 'none'
        const preview = full ? loaded : fallbackPreview(url)
        const state =
          loaded === undefined || loaded === 'loading' ? 'loading' : full ? 'full' : 'bare'
        decorations.push(
          Decoration.node(from, pos, { class: 'fixnote-bookmark-url' }),
          Decoration.widget(pos, () => renderCard(preview, open, state === 'loading'), {
            key: `${url}:${state}:${preview.kind}:${preview.title ?? ''}`,
            side: -1,
            ignoreSelection: true,
          }),
        )
      }
      return DecorationSet.create(doc, decorations)
    }

    return [
      new Plugin<DecorationSet>({
        key,
        view: (v) => {
          view = v
          return {
            destroy: () => {
              view = null
            },
          }
        },
        state: {
          init: (_config, state) => build(state.doc),
          apply: (tr, old) => {
            if (tr.getMeta(key) === 'retry') {
              for (const [url, p] of previews) if (p === null) previews.delete(url)
            }
            return tr.docChanged || tr.getMeta(key) ? build(tr.doc) : old
          },
        },
        props: {
          decorations: (state) => key.getState(state),
        },
      }),
    ]
  },
})
