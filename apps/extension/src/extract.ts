/**
 * What is saved of a page, read in the page itself (so pages behind a login and posts on social
 * networks work, and our server fetches nothing). Injected with `chrome.scripting.executeScript`,
 * so the function must not use anything from outside its own body.
 */
export interface PageCapture {
  url: string
  title: string
  description: string
  site: string
  text: string
  selection: string
}

export function readPage(): PageCapture {
  const meta = (...names: string[]) => {
    for (const name of names) {
      const el = document.querySelector<HTMLMetaElement>(
        `meta[property="${name}"], meta[name="${name}"]`,
      )
      const value = el?.content?.trim()
      if (value) return value
    }
    return ''
  }
  const canonical = document.querySelector<HTMLLinkElement>('link[rel="canonical"]')?.href
  const url =
    canonical && /^https?:/.test(canonical) && new URL(canonical).host === location.host
      ? canonical
      : location.href

  // The readable part: the article if the page marks one, else the main content, else the body,
  // without navigation, headers, footers, forms and scripts.
  const root =
    document.querySelector('article') ??
    document.querySelector('main, [role="main"]') ??
    document.body
  const copy = root.cloneNode(true) as HTMLElement
  for (const el of copy.querySelectorAll(
    'script, style, noscript, nav, header, footer, aside, form, iframe, svg, button, [aria-hidden="true"], [hidden]',
  )) {
    el.remove()
  }
  // innerText needs layout; on a detached copy textContent with block breaks is close enough.
  for (const el of copy.querySelectorAll(
    'p, div, li, h1, h2, h3, h4, h5, h6, br, tr, pre, blockquote',
  )) {
    el.append('\n')
  }
  const text = (copy.textContent ?? '')
    .replace(/[ \t ]+/g, ' ')
    .replace(/\n\s*\n\s*/g, '\n\n')
    .trim()
    .slice(0, 150_000)

  return {
    url,
    title: meta('og:title', 'twitter:title') || document.title || location.hostname,
    description: meta('og:description', 'twitter:description', 'description'),
    site: meta('og:site_name') || location.hostname.replace(/^www\./, ''),
    text,
    selection: (getSelection()?.toString() ?? '').trim().slice(0, 10_000),
  }
}
