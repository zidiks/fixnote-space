import type { LinkPreview } from '@fixnote/core'
import { Extension } from '@tiptap/core'
import type { Node as PmNode } from '@tiptap/pm/model'
import { Plugin, PluginKey, type Transaction } from '@tiptap/pm/state'
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

/**
 * Top-level paragraphs that are just a link (a bookmark): they get a card below. A link pasted
 * "as a link" (`plainLink`) or a URL kept as plain text gets none.
 */
function linkParagraphs(
  doc: PmNode,
  from = 0,
  to = doc.content.size,
): { from: number; pos: number; url: string }[] {
  const out: { from: number; pos: number; url: string }[] = []
  doc.nodesBetween(from, to, (node, offset) => {
    if (node.type.name === 'paragraph' && !node.attrs.plainLink && node.childCount === 1) {
      const child = node.firstChild
      const url = child?.marks.find((mark) => mark.type.name === 'link')?.attrs.href
      if (
        child?.isText &&
        typeof url === 'string' &&
        /^https?:\/\//i.test(url) &&
        child.text?.trim() === url
      )
        out.push({ from: offset, pos: offset + node.nodeSize, url })
    }
    // Bookmarks are top-level paragraphs; do not descend into lists, quotes or tables.
    return false
  })
  return out
}

/** Changed step ranges in final-document coordinates, expanded to whole top-level blocks.
 * Neighbours cover widgets at split/join/deletion boundaries. Marks and node attributes may
 * change the document without a StepMap range, so diff that step's before/after documents.
 */
function changedBlocks(tr: Transaction): { from: number; to: number }[] {
  const ranges: { from: number; to: number }[] = []
  const add = (from: number, to: number, step: number) => {
    const mapping = tr.mapping.slice(step + 1)
    const start = mapping.map(from, -1)
    const end = mapping.map(to, 1)
    const left = tr.doc.resolve(Math.max(0, Math.min(start, end) - 1))
    const right = tr.doc.resolve(Math.min(tr.doc.content.size, Math.max(start, end) + 1))
    ranges.push({
      from: left.depth ? left.before(1) : left.pos,
      to: right.depth ? right.after(1) : right.pos,
    })
  }
  tr.mapping.maps.forEach((map, i) => {
    let mapped = false
    map.forEach((_oldFrom, _oldTo, from, to) => {
      mapped = true
      add(from, to, i)
    })
    if (mapped) return
    const before = tr.docs[i]
    const after = tr.docs[i + 1] ?? tr.doc
    if (!before) return
    const from = before.content.findDiffStart(after.content)
    if (from !== null)
      add(from, Math.max(from, before.content.findDiffEnd(after.content)?.b ?? from), i)
  })
  ranges.sort((a, b) => a.from - b.from)
  const merged: typeof ranges = []
  for (const range of ranges) {
    const last = merged.at(-1)
    if (last && range.from <= last.to) last.to = Math.max(last.to, range.to)
    else merged.push(range)
  }
  return merged
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
export function linkCardsPlugin({ load, open }: LinkCardsOptions): Plugin<DecorationSet> {
  const previews = new Map<string, LinkPreview | null | 'loading'>()
  const revisions = new Map<string, number>()
  let view: EditorView | null = null

  const request = (url: string) => {
    if (previews.has(url)) return
    previews.set(url, 'loading')
    void load(url)
      .catch(() => null)
      .then((p) => {
        previews.set(url, p)
        revisions.set(url, (revisions.get(url) ?? 0) + 1)
        if (view && !view.isDestroyed) view.dispatch(view.state.tr.setMeta(key, { refresh: url }))
      })
  }

  // A bookmark always shows a card: the page's preview when it loads, else the site and address
  // (pages that give nothing, the web app before signing in). Its URL line becomes a caption.
  const build = (doc: PmNode, rangeFrom = 0, rangeTo = doc.content.size) => {
    const decorations: Decoration[] = []
    for (const { from, pos, url } of linkParagraphs(doc, rangeFrom, rangeTo)) {
      const loaded = previews.get(url)
      if (loaded === undefined) request(url)
      const full = loaded && loaded !== 'loading' && loaded.kind !== 'none'
      const preview = full ? loaded : fallbackPreview(url)
      const state =
        loaded === undefined || loaded === 'loading' ? 'loading' : full ? 'full' : 'bare'
      decorations.push(
        Decoration.node(
          from,
          pos,
          { class: 'fixnote-bookmark-url' },
          { bookmarkUrl: url, kind: 'caption' },
        ),
        Decoration.widget(pos, () => renderCard(preview, open, state === 'loading'), {
          key: `${url}:${state}:${revisions.get(url) ?? 0}`,
          bookmarkUrl: url,
          kind: 'card',
          side: -1,
          ignoreSelection: true,
        }),
      )
    }
    return decorations
  }

  const refresh = (doc: PmNode, old: DecorationSet, urls: Set<string>) => {
    const removed = old.find(undefined, undefined, (spec) => urls.has(spec.bookmarkUrl))
    if (!removed.length) return old
    const added = removed
      .filter((d) => d.spec.kind === 'caption')
      .flatMap((d) => build(doc, d.from, d.to))
    return old.remove(removed).add(doc, added)
  }

  return new Plugin<DecorationSet>({
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
      init: (_config, state) => DecorationSet.create(state.doc, build(state.doc)),
      apply: (tr, old) => {
        let next = old
        if (tr.docChanged) {
          next = old.map(tr.mapping, tr.doc)
          const removed: Decoration[] = []
          const added: Decoration[] = []
          for (const { from, to } of changedBlocks(tr)) {
            removed.push(
              ...next
                .find(from, to)
                .filter((d) =>
                  d.spec.kind === 'caption'
                    ? d.from >= from && d.from < to
                    : (d.from > from || from === 0) && d.from <= to,
                ),
            )
            added.push(...build(tr.doc, from, to))
          }
          next = next.remove(removed).add(tr.doc, added)
        }
        const meta = tr.getMeta(key)
        if (meta === 'retry') {
          const urls = new Set<string>()
          for (const [url, p] of previews)
            if (p === null) {
              urls.add(url)
              previews.delete(url)
            }
          return refresh(tr.doc, next, urls)
        }
        return meta?.refresh ? refresh(tr.doc, next, new Set([meta.refresh])) : next
      },
    },
    props: {
      decorations: (state) => key.getState(state),
    },
  })
}

export const LinkCards = Extension.create<LinkCardsOptions>({
  name: 'linkCards',
  addOptions: () => ({ load: async () => null, open: () => undefined }),
  addProseMirrorPlugins() {
    return [linkCardsPlugin(this.options)]
  },
})
