import type { SqlDriver } from '../platform'
import { standaloneUrl } from './preview'

/**
 * A saved link is an ordinary note, so search, the assistant, MCP, sync and sharing take it as
 * any other. Its shape:
 *
 *   # Page title
 *
 *   https://example.com/page          ← alone on its line: the editor shows the page's card
 *
 *   > the part of the page that was selected, if any
 *
 *   The page's description.
 *
 *   <details>
 *   <summary>Page text</summary>      ← what the page said when it was saved: searchable, and
 *                                       still there when the page is gone
 *   </details>
 *
 * A note is a link when the line after its title (or its first line) is a URL on its own. That is
 * derived from the text on every device, so no other column, sync field or migration is needed,
 * and older app versions see a normal note.
 */
export interface LinkInput {
  url: string
  title?: string | undefined
  description?: string | undefined
  /** Site name. */
  site?: string | undefined
  /** The page's readable text (from the browser extension). */
  text?: string | undefined
  /** What the person had selected on the page. */
  selection?: string | undefined
}

/** Longest page text kept in a note. */
export const LINK_TEXT_MAX = 60_000

/** Query parameters that only say where a click came from. */
const TRACKING =
  /^(utm_\w+|fbclid|gclid|dclid|gbraid|wbraid|yclid|ysclid|msclkid|mc_cid|mc_eid|igshid|igsh|si|ref_src|ref_url|_hsenc|_hsmi|spm|share_id|from_source|cmpid|s_cid)$/i

/**
 * One form per page, for spotting a link saved twice: https, no `www.`, no fragment, no
 * tracking parameters, the others sorted, no trailing slash. Not for display.
 */
export function normalizeUrl(url: string): string {
  let u: URL
  try {
    u = new URL(url.trim())
  } catch {
    return url.trim()
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return url.trim()
  const host = u.hostname.toLowerCase().replace(/^(www|m|mobile)\./, '')
  const params = [...u.searchParams.entries()]
    .filter(([k]) => !TRACKING.test(k))
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
  const query = params.length ? `?${new URLSearchParams(params).toString()}` : ''
  const path = u.pathname.replace(/\/+$/, '')
  const port = u.port && u.port !== '80' && u.port !== '443' ? `:${u.port}` : ''
  return `https://${host}${port}${path}${query}`
}

/** The address as saved: the same page without the tracking parameters (`utm_*`, `fbclid`…). */
export function cleanUrl(url: string): string {
  let u: URL
  try {
    u = new URL(url.trim())
  } catch {
    return url.trim()
  }
  const drop = [...u.searchParams.keys()].filter((k) => TRACKING.test(k))
  if (!drop.length) return url.trim()
  for (const k of drop) u.searchParams.delete(k)
  return u.href
}

/** The host for display and learning: `youtube.com`. */
export function linkHost(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^(www|m|mobile)\./, '')
  } catch {
    return ''
  }
}

const oneLine = (s: string | undefined, max: number) => {
  const t = (s ?? '').replace(/\s+/g, ' ').trim()
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t
}

/** Characters that would turn the title or a quote into something else in Markdown. */
const escapeInline = (s: string) => s.replace(/([\\`*_[\]<>])/g, '\\$1')

/** Plain text kept as text inside the folded block (no headings, lists or HTML from the page). */
function textBlock(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .split('\n')
    .map((l) => (l ? escapeInline(l).replace(/^([#>+-]|\d+[.)])/, '\\$1') : l))
    .join('\n')
}

/** The note for a saved link (see the shape above). `pageText`: the folded block's label. */
export function linkMarkdown(link: LinkInput, labels: { pageText: string }): string {
  const url = cleanUrl(link.url)
  const title = oneLine(link.title, 200) || linkHost(url) || url
  const parts = [`# ${escapeInline(title)}`, url]
  const selection = link.selection?.trim()
  if (selection) {
    parts.push(
      textBlock(selection.slice(0, 4000))
        .split('\n')
        .map((l) => `> ${l}`)
        .join('\n'),
    )
  }
  const description = oneLine(link.description, 600)
  if (description && description !== title) parts.push(escapeInline(description))
  const text = link.text?.trim()
  if (text) {
    const body = textBlock(text.length > LINK_TEXT_MAX ? `${text.slice(0, LINK_TEXT_MAX)}…` : text)
    if (body)
      parts.push(`<details>\n<summary>${labels.pageText}</summary>\n\n${body}\n\n</details>`)
  }
  return `${parts.join('\n\n')}\n`
}

/** The address of a link note, or null for any other note. */
export function linkUrlOf(markdown: string): string | null {
  const lines = markdown.replace(/^\s+/, '').split('\n')
  const first = lines[0] ?? ''
  const direct = standaloneUrl(first)
  if (direct) return direct
  if (!/^#{1,6}\s/.test(first)) return null
  const next = lines.slice(1).find((l) => l.trim())
  return next ? standaloneUrl(next) : null
}

/**
 * The same test in SQL (on `n.content`), for listing links: the first line is a URL, or the line
 * after a heading is. Coarser than `linkUrlOf` (it does not check that the URL is alone on its
 * line); the app shows what `linkUrlOf` accepts.
 */
export const LINK_SQL = `(
  ltrim(n.content) LIKE 'http://%' OR ltrim(n.content) LIKE 'https://%' OR (
    ltrim(n.content) LIKE '#%' AND (
      ltrim(substr(ltrim(n.content), instr(ltrim(n.content), char(10))), char(10) || char(13) || ' ') LIKE 'http://%'
      OR ltrim(substr(ltrim(n.content), instr(ltrim(n.content), char(10))), char(10) || char(13) || ' ') LIKE 'https://%')))`

export interface SavedLink {
  id: string
  folderId: string | null
}

/** A note that already holds this page (same `normalizeUrl`), if any. */
export async function findLinkNote(db: SqlDriver, url: string): Promise<SavedLink | null> {
  const want = normalizeUrl(url)
  const host = linkHost(url)
  if (!host) return null
  const rows = await db.query<{ id: string; folder_id: string | null; head: string }>(
    `SELECT n.id, n.folder_id, substr(n.content, 1, 2000) AS head FROM notes n
      WHERE n.deleted_at IS NULL AND ${LINK_SQL} AND instr(lower(substr(n.content, 1, 2000)), ?) > 0
      ORDER BY n.updated_at DESC LIMIT 50`,
    [host],
  )
  for (const r of rows) {
    const found = linkUrlOf(r.head)
    if (found && normalizeUrl(found) === want) return { id: r.id, folderId: r.folder_id }
  }
  return null
}
