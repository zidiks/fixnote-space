import { type LinkPreview, standaloneUrl } from '@fixnote/core'
import { Extension } from '@tiptap/core'
import type { Node as PmNode } from '@tiptap/pm/model'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet, type EditorView } from '@tiptap/pm/view'

export interface LinkCardsOptions {
  load: (url: string) => Promise<LinkPreview | null>
  open: (url: string) => void
}

const key = new PluginKey<DecorationSet>('linkCards')

/** Try links without a preview again (e.g. after signing in, the web app can fetch pages). */
export function retryLinkCards(view: EditorView) {
  if (!view.isDestroyed) view.dispatch(view.state.tr.setMeta(key, 'retry'))
}

/** Paragraphs that are just a link: they get a card below, the Markdown stays a plain URL. */
function linkParagraphs(doc: PmNode): { pos: number; url: string }[] {
  const out: { pos: number; url: string }[] = []
  doc.forEach((node, offset) => {
    if (node.type.name !== 'paragraph') return
    const url = standaloneUrl(node.textContent)
    if (url) out.push({ pos: offset + node.nodeSize, url })
  })
  return out
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string) {
  const node = document.createElement(tag)
  node.className = className
  if (text) node.textContent = text
  return node
}

function renderCard(preview: LinkPreview, open: (url: string) => void): HTMLElement {
  const card = el('div', `fixnote-link-card is-${preview.kind}`)
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

    const build = (doc: PmNode) => {
      const decorations: Decoration[] = []
      for (const { pos, url } of linkParagraphs(doc)) {
        const preview = previews.get(url)
        if (preview === undefined) request(url)
        if (!preview || preview === 'loading' || preview.kind === 'none') continue
        decorations.push(
          Decoration.widget(pos, () => renderCard(preview, open), {
            key: `${url}:${preview.kind}:${preview.title ?? ''}`,
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
