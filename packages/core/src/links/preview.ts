import type { SqlDriver } from '../platform'

/** What a link card shows. `none`: nothing useful was found; the link stays a plain link. */
export interface LinkPreview {
  url: string
  kind: 'page' | 'image' | 'video' | 'none'
  title?: string
  description?: string
  /** Absolute image URL (og:image, a video thumbnail, or the link itself for images). */
  image?: string
  /** Site name, or the host when the page has none. */
  site?: string
}

/** A fetched page: enough of the HTML to read its metadata. */
export interface FetchedPage {
  /** Final URL after redirects. */
  url: string
  contentType: string
  /** The page's <head> (or its first part), for text/html only. */
  html?: string
}

export type PageFetcher = (url: string) => Promise<FetchedPage>

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  mdash: '—',
  ndash: '–',
  hellip: '…',
  laquo: '«',
  raquo: '»',
}

function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, code: string) => {
    if (code[0] === '#') {
      const n =
        code[1] === 'x' || code[1] === 'X'
          ? Number.parseInt(code.slice(2), 16)
          : Number(code.slice(1))
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : m
    }
    return ENTITIES[code.toLowerCase()] ?? m
  })
}

const clean = (v: string | undefined, max: number) => {
  const text = v ? decodeEntities(v).replace(/\s+/g, ' ').trim() : ''
  return text ? (text.length > max ? `${text.slice(0, max - 1)}…` : text) : undefined
}

/** Attributes of every <meta> tag, lowercased names. */
function metaTags(html: string): Record<string, string>[] {
  const tags: Record<string, string>[] = []
  for (const [tag] of html.matchAll(/<meta\b[^>]*>/gi)) {
    const attrs: Record<string, string> = {}
    for (const m of tag.matchAll(/([a-z:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/gi)) {
      attrs[(m[1] as string).toLowerCase()] = m[2] ?? m[3] ?? m[4] ?? ''
    }
    tags.push(attrs)
  }
  return tags
}

function absolute(url: string | undefined, base: string): string | undefined {
  if (!url) return undefined
  try {
    const u = new URL(decodeEntities(url.trim()), base)
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.href : undefined
  } catch {
    return undefined
  }
}

const host = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return undefined
  }
}

/** YouTube video id from watch, short, embed and youtu.be links. */
export function youtubeId(url: string): string | null {
  try {
    const u = new URL(url)
    const h = u.hostname.replace(/^(www|m|music)\./, '')
    if (h === 'youtu.be') return u.pathname.slice(1).split('/')[0] || null
    if (h !== 'youtube.com') return null
    if (u.pathname === '/watch') return u.searchParams.get('v')
    const m = u.pathname.match(/^\/(?:shorts|embed|live)\/([\w-]+)/)
    return m?.[1] ?? null
  } catch {
    return null
  }
}

/** Reads Open Graph / Twitter / plain HTML metadata from a fetched page. */
export function previewFromPage(requested: string, page: FetchedPage): LinkPreview {
  const url = page.url || requested
  const type = page.contentType.toLowerCase()
  if (type.startsWith('image/'))
    return { url: requested, kind: 'image', image: url, site: host(url) }
  const video = youtubeId(requested) ?? youtubeId(url)
  const html = page.html ?? ''
  const meta = metaTags(html)
  const get = (...names: string[]) => {
    for (const name of names) {
      const hit = meta.find((m) => (m.property ?? m.name)?.toLowerCase() === name)
      if (hit?.content) return hit.content
    }
    return undefined
  }
  const titleTag = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]
  const title = clean(get('og:title', 'twitter:title') ?? titleTag, 200)
  const description = clean(get('og:description', 'twitter:description', 'description'), 300)
  const image =
    absolute(get('og:image:secure_url', 'og:image', 'twitter:image', 'twitter:image:src'), url) ??
    (video ? `https://i.ytimg.com/vi/${video}/hqdefault.jpg` : undefined)
  const site = clean(get('og:site_name'), 80) ?? host(url)
  if (!title && !description && !image) return { url: requested, kind: 'none', site }
  return {
    url: requested,
    kind: video ? 'video' : 'page',
    ...(title ? { title } : {}),
    ...(description ? { description } : {}),
    ...(image ? { image } : {}),
    ...(site ? { site } : {}),
  }
}

/** A URL alone on its line, which the note shows as a card. */
export function standaloneUrl(line: string): string | null {
  const text = line.trim()
  const md = text.match(/^\[([^\]]*)\]\((https?:\/\/[^\s)]+)\)$/)
  if (md && (md[1] === md[2] || !md[1])) return md[2] ?? null
  const bare = text.match(/^<?(https?:\/\/[^\s<>]+)>?$/)
  return bare?.[1] ?? null
}

const WEEK = 7 * 24 * 3600 * 1000
const RETRY_FAILED = 24 * 3600 * 1000

interface PreviewRow {
  url: string
  kind: LinkPreview['kind']
  title: string | null
  description: string | null
  image: string | null
  site: string | null
  fetched_at: number
}

/**
 * Link cards: cached per URL in the local database, fetched at most once a week (failures retried
 * after a day). Concurrent requests for the same URL share one fetch.
 */
export class LinkPreviews {
  private inflight = new Map<string, Promise<LinkPreview | null>>()

  constructor(
    private readonly db: SqlDriver,
    private readonly now: () => number = Date.now,
  ) {}

  async cached(url: string): Promise<LinkPreview | null> {
    const [row] = await this.db.query<PreviewRow & Record<string, string | number | null>>(
      'SELECT * FROM link_previews WHERE url = ?',
      [url],
    )
    return row ? fromRow(row) : null
  }

  /** The preview for `url`, fetching it when missing or stale; null when there is no fetcher. */
  get(url: string, fetcher: PageFetcher | null): Promise<LinkPreview | null> {
    const running = this.inflight.get(url)
    if (running) return running
    const task = (async () => {
      const [row] = await this.db.query<PreviewRow & Record<string, string | number | null>>(
        'SELECT * FROM link_previews WHERE url = ?',
        [url],
      )
      const age = row ? this.now() - Number(row.fetched_at) : Number.POSITIVE_INFINITY
      const fresh = row && age < (row.kind === 'none' ? RETRY_FAILED : WEEK)
      if (fresh || !fetcher) return row ? fromRow(row) : null
      let preview: LinkPreview
      try {
        preview = previewFromPage(url, await fetcher(url))
      } catch {
        // Offline or blocked: keep what we had, or remember the miss for a while.
        if (row) return fromRow(row)
        preview = { url, kind: 'none' }
      }
      await this.db.execute(
        `INSERT INTO link_previews (url, kind, title, description, image, site, fetched_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (url) DO UPDATE SET kind = excluded.kind, title = excluded.title,
           description = excluded.description, image = excluded.image, site = excluded.site,
           fetched_at = excluded.fetched_at`,
        [
          url,
          preview.kind,
          preview.title ?? null,
          preview.description ?? null,
          preview.image ?? null,
          preview.site ?? null,
          this.now(),
        ],
      )
      return preview
    })()
    this.inflight.set(url, task)
    void task.finally(() => this.inflight.delete(url)).catch(() => undefined)
    return task
  }
}

function fromRow(r: PreviewRow): LinkPreview {
  return {
    url: r.url,
    kind: r.kind,
    ...(r.title ? { title: r.title } : {}),
    ...(r.description ? { description: r.description } : {}),
    ...(r.image ? { image: r.image } : {}),
    ...(r.site ? { site: r.site } : {}),
  }
}
