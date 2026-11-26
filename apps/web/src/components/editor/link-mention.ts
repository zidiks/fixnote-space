import type { LinkPreview } from '@fixnote/core'
import { Node } from '@tiptap/core'

export interface LinkMentionOptions {
  load?: (url: string) => Promise<LinkPreview | null>
  open?: (url: string) => void
  /** Whether external favicons may be fetched (false in local-only mode). */
  allowExternal?: () => boolean
}

const KNOWN_SITES: Record<string, string> = {
  'instagram.com': 'Instagram',
  'github.com': 'GitHub',
  'youtube.com': 'YouTube',
  'youtu.be': 'YouTube',
  'figma.com': 'Figma',
  'x.com': 'X',
  'twitter.com': 'X',
  'notion.so': 'Notion',
  'notion.site': 'Notion',
  'linkedin.com': 'LinkedIn',
  'reddit.com': 'Reddit',
  'medium.com': 'Medium',
  'docs.google.com': 'Google Docs',
  'drive.google.com': 'Google Drive',
  'linear.app': 'Linear',
  'slack.com': 'Slack',
  't.me': 'Telegram',
  'discord.com': 'Discord',
  'wikipedia.org': 'Wikipedia',
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return ''
  }
}

export function mentionSiteLabel(url: string, previewSite?: string): string {
  if (previewSite && !previewSite.includes('.')) return previewSite
  const h = hostOf(url).toLowerCase()
  if (KNOWN_SITES[h]) return KNOWN_SITES[h]
  for (const [domain, name] of Object.entries(KNOWN_SITES)) {
    if (h.endsWith(`.${domain}`)) return name
  }
  return previewSite || h || url
}

/** Extracts a concise human-readable fallback title from the URL path when no page title is available. */
export function mentionFallbackTitle(url: string, site: string, fallbackLabel?: string): string {
  try {
    const u = new URL(url)
    const path = decodeURI(u.pathname).replace(/^\/+|\/+$/g, '')
    if (path) {
      const compact = path.length > 48 ? `${path.slice(0, 47)}…` : path
      if (compact.toLowerCase() !== site.toLowerCase()) return compact
    }
    const host = u.hostname.replace(/^www\./, '')
    if (host && host.toLowerCase() !== site.toLowerCase()) return host
  } catch {
    // Fall through to fallbackLabel.
  }
  if (fallbackLabel && fallbackLabel.toLowerCase() !== site.toLowerCase()) return fallbackLabel
  return ''
}

function resolveMentionParts(
  url: string,
  fallbackLabel: string,
  preview: LinkPreview | null,
): { site: string; title: string } {
  const full = preview && preview.kind !== 'none' ? preview : null
  const site = mentionSiteLabel(url, full?.site)
  const rawTitle = full?.title?.trim() ?? ''
  const title =
    rawTitle && rawTitle.toLowerCase() !== site.toLowerCase()
      ? rawTitle
      : mentionFallbackTitle(url, site, fallbackLabel)
  return { site, title }
}

function makeGlobe(): SVGSVGElement {
  const svgNS = 'http://www.w3.org/2000/svg'
  const svg = document.createElementNS(svgNS, 'svg')
  svg.setAttribute('viewBox', '0 0 16 16')
  svg.setAttribute('fill', 'none')
  svg.setAttribute('aria-hidden', 'true')
  svg.setAttribute('class', 'fixnote-link-mention-globe')
  const p = document.createElementNS(svgNS, 'path')
  p.setAttribute(
    'd',
    'M8 1.75a6.25 6.25 0 1 0 0 12.5 6.25 6.25 0 0 0 0-12.5ZM2.2 8h11.6M8 1.75c1.65 1.7 2.55 3.9 2.55 6.25S9.65 12.55 8 14.25C6.35 12.55 5.45 10.35 5.45 8S6.35 3.45 8 1.75Z',
  )
  p.setAttribute('stroke', 'currentColor')
  p.setAttribute('stroke-width', '1.25')
  svg.appendChild(p)
  return svg
}

/**
 * Compact inline link chip (`[favicon] Site  Title`), modeled after Notion/Figma link mentions.
 * Stored as standard Markdown `[label](url "mention")` and behaves as a single atomic inline node
 * so typing after it and deleting it with Backspace/Delete work natively.
 */
export const LinkMention = Node.create<LinkMentionOptions>({
  name: 'linkMention',
  inline: true,
  group: 'inline',
  atom: true,
  selectable: true,

  addOptions() {
    return {
      load: undefined,
      open: undefined,
      allowExternal: () => true,
    }
  },

  addAttributes() {
    return {
      href: {
        default: '',
        parseHTML: (el) => el.getAttribute('href') ?? '',
      },
      label: {
        default: '',
        parseHTML: (el) => el.textContent ?? '',
      },
    }
  },

  parseHTML() {
    return [{ tag: 'a[data-link-mention]' }]
  },

  renderHTML({ HTMLAttributes }) {
    const href = (HTMLAttributes.href as string | undefined) ?? ''
    const label = (HTMLAttributes.label as string | undefined) || href
    return ['a', { 'data-link-mention': '', href }, label]
  },

  markdownTokenizer: {
    name: 'linkMention',
    level: 'inline',
    start: (src) => src.indexOf('['),
    tokenize: (src) => {
      const m = /^\[((?:\\.|[^\]])+)\]\((https?:\/\/[^\s)]+)\s+"mention"\)/.exec(src)
      if (!m) return undefined
      return {
        type: 'linkMention',
        raw: m[0],
        label: (m[1] ?? '').replace(/\\([[\]])/g, '$1'),
        href: m[2] ?? '',
      }
    },
  },

  parseMarkdown(token, helpers) {
    const t = token as { href?: string; label?: string }
    return helpers.createNode('linkMention', {
      href: t.href ?? '',
      label: t.label ?? '',
    })
  },

  renderMarkdown(node) {
    const href = (node.attrs?.href as string | undefined) ?? ''
    const rawLabel = (node.attrs?.label as string | undefined) || href
    const label = rawLabel.replace(/([[\]])/g, '\\$1')
    return `[${label}](${href} "mention")`
  },

  addNodeView() {
    const { load, open, allowExternal } = this.options
    return ({ node }) => {
      const href = (node.attrs.href as string | undefined) ?? ''
      const fallbackLabel = (node.attrs.label as string | undefined) ?? ''

      const dom = document.createElement('span')
      dom.className = 'fixnote-link-mention'
      dom.contentEditable = 'false'
      dom.setAttribute('role', 'link')
      dom.title = href

      const go = (e: Event) => {
        if (e instanceof MouseEvent && e.altKey) return
        e.preventDefault()
        e.stopPropagation()
        if (href) open?.(href)
      }
      dom.addEventListener('click', go)

      const host = hostOf(href)
      const ext = allowExternal ? allowExternal() : true
      if (ext && host) {
        const img = document.createElement('img')
        img.className = 'fixnote-link-mention-icon'
        img.src = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=32`
        img.alt = ''
        img.loading = 'lazy'
        img.draggable = false
        img.referrerPolicy = 'no-referrer'
        img.addEventListener('error', () => img.replaceWith(makeGlobe()))
        dom.append(img)
      } else {
        dom.append(makeGlobe())
      }

      const siteEl = document.createElement('span')
      siteEl.className = 'fixnote-link-mention-site'
      const titleEl = document.createElement('span')
      titleEl.className = 'fixnote-link-mention-title'
      dom.append(siteEl, titleEl)

      const apply = (preview: LinkPreview | null) => {
        const { site, title } = resolveMentionParts(href, fallbackLabel, preview)
        siteEl.textContent = site
        siteEl.style.display = site ? '' : 'none'
        titleEl.textContent = title
        titleEl.style.display = title ? '' : 'none'
      }

      apply(null)

      let destroyed = false
      if (load && href) {
        void load(href)
          .then((preview) => {
            if (!destroyed && preview) apply(preview)
          })
          .catch(() => undefined)
      }

      return {
        dom,
        update: (next) =>
          next.type === node.type &&
          next.attrs.href === node.attrs.href &&
          next.attrs.label === node.attrs.label,
        destroy: () => {
          destroyed = true
        },
      }
    }
  },
})
