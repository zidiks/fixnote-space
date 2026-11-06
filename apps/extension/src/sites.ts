/**
 * Saving a post when the person presses a social network's own Save / Bookmark (only on the sites
 * they switched on in the extension). How to recognise the button and find the post differs per
 * site and changes with their layouts, so it is data: `DEFAULT_SITES` ships with the extension and
 * fixnote.space/extension/sites.json (apps/landing/public/extension/sites.json) replaces it, so a
 * broken selector is fixed by updating the site, not by a release.
 */

export interface SiteRule {
  id: string
  /** Shown in the popup. */
  name: string
  hosts: string[]
  /** The clicked element is inside one of these (the Save button while the post is not saved). */
  button: string
  /** Or: a button or menu item whose label (text or aria-label) is one of these. */
  labels?: string[]
  /** The post around the button; the page itself when missing or not found. */
  item?: string
  /** Inside the post: the link to it (`href`); the page's address when missing or not found. */
  link?: string
  /** Inside the post: its text. */
  text?: string
}

export interface SitesConfig {
  v: 1
  sites: SiteRule[]
}

export const DEFAULT_SITES: SitesConfig = {
  v: 1,
  sites: [
    {
      id: 'x',
      name: 'X',
      hosts: ['x.com', 'twitter.com'],
      button: '[data-testid="bookmark"]',
      item: 'article[data-testid="tweet"]',
      link: 'a[href*="/status/"]:has(time)',
      text: '[data-testid="tweetText"]',
    },
    {
      id: 'reddit',
      name: 'Reddit',
      hosts: ['reddit.com', 'www.reddit.com', 'old.reddit.com'],
      button: '.save-button a, [data-testid="save-button"]',
      labels: ['Save', 'Сохранить', 'Guardar'],
      item: 'shreddit-post, .thing.link, [data-testid="post-container"]',
      link: 'a[slot="full-post-link"], a.comments, a[data-click-id="body"]',
      text: '[slot="title"], a.title, h1, h3',
    },
    {
      id: 'youtube',
      name: 'YouTube',
      hosts: ['youtube.com', 'www.youtube.com', 'm.youtube.com'],
      button:
        'button[aria-label^="Save"], button[aria-label^="Сохранить"], button[aria-label^="Guardar"]',
      labels: ['Save', 'Сохранить', 'Guardar', 'Watch later', 'Смотреть позже', 'Ver más tarde'],
      item: 'ytd-rich-item-renderer, ytd-video-renderer, ytd-compact-video-renderer',
      link: 'a#thumbnail, a#video-title, a#video-title-link',
      text: '#video-title, h1.ytd-watch-metadata',
    },
    {
      id: 'instagram',
      name: 'Instagram',
      hosts: ['instagram.com', 'www.instagram.com'],
      button: 'svg[aria-label="Save"], svg[aria-label="Сохранить"], svg[aria-label="Guardar"]',
      item: 'article',
      link: 'a[href*="/p/"], a[href*="/reel/"]',
      text: 'h1, span[dir="auto"]',
    },
  ],
}

/** A config from the site, if it has the right shape; otherwise null (the defaults stay). */
export function parseSites(json: unknown): SitesConfig | null {
  if (typeof json !== 'object' || json === null) return null
  const c = json as { v?: unknown; sites?: unknown }
  if (c.v !== 1 || !Array.isArray(c.sites)) return null
  const str = (v: unknown) => typeof v === 'string' && v.length > 0 && v.length < 500
  const sites = c.sites.filter(
    (s): s is SiteRule =>
      typeof s === 'object' &&
      s !== null &&
      str((s as SiteRule).id) &&
      str((s as SiteRule).name) &&
      str((s as SiteRule).button) &&
      Array.isArray((s as SiteRule).hosts) &&
      (s as SiteRule).hosts.every(str),
  )
  return sites.length ? { v: 1, sites } : null
}

/** The rule for a page's host, if any. */
export function ruleFor(config: SitesConfig, host: string): SiteRule | null {
  const h = host.toLowerCase()
  return config.sites.find((s) => s.hosts.includes(h)) ?? null
}

const label = (el: Element) =>
  (el.getAttribute('aria-label') ?? el.textContent ?? '').replace(/\s+/g, ' ').trim()

/** The Save button the click was on, if it is one (by selector, or by its label). */
export function saveButton(rule: SiteRule, target: Element): Element | null {
  const bySelector = safeClosest(target, rule.button)
  if (bySelector) return bySelector
  if (!rule.labels?.length) return null
  const control = target.closest('button, [role="button"], [role="menuitem"], a')
  return control && rule.labels.includes(label(control)) ? control : null
}

function safeClosest(el: Element, selector: string | undefined): Element | null {
  if (!selector) return null
  try {
    return el.closest(selector)
  } catch {
    return null
  }
}

function safeQuery(el: Element | Document, selector: string | undefined): Element | null {
  if (!selector) return null
  try {
    return el.querySelector(selector)
  } catch {
    return null
  }
}

export interface SavedPost {
  url: string
  title: string
  text: string
}

/** The post around the button: its link and text, or the page when the post cannot be found. */
export function postOf(rule: SiteRule, button: Element, page: Document): SavedPost {
  const item = safeClosest(button, rule.item)
  const scope: Element | Document = item ?? page
  const anchor = item ? safeQuery(item, rule.link) : null
  const href = anchor?.getAttribute('href')
  let url = page.location.href
  if (href) {
    try {
      url = new URL(href, page.location.href).href
    } catch {
      // keep the page
    }
  }
  const text = (safeQuery(scope, rule.text)?.textContent ?? '').replace(/\s+/g, ' ').trim()
  return { url, title: text.slice(0, 120) || page.title, text: text.slice(0, 5000) }
}
