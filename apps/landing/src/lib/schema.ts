import type { Author } from '../data/authors'
import { RELEASES } from '../data/releases'
import { HTML_LANG, type Lang, localePath } from '../i18n'

/**
 * schema.org data shared by every page. The organization, the site and the app have fixed `@id`s,
 * so each page refers to them instead of repeating them, and search engines see one FixNote.
 */
export const SITE = new URL('https://fixnote.space')

export const ORG_ID = `${SITE.href}#organization`
export const APP_ID = `${SITE.href}#app`
const websiteId = (lang: Lang) => `${new URL(localePath(lang, '/'), SITE).href}#website`

/**
 * FixNote's own profiles on other sites (Telegram bot, Microsoft Store, social accounts). Search
 * engines use them to tell this FixNote from others with the same name. No GitHub links here (the
 * site never links there, CLAUDE.md).
 */
export const SAME_AS: readonly string[] = ['https://www.saashub.com/fixnote']

export const organization = () => ({
  '@context': 'https://schema.org',
  '@type': 'Organization',
  '@id': ORG_ID,
  name: 'FixNote',
  url: SITE.href,
  logo: {
    '@type': 'ImageObject',
    url: new URL('/logo.png', SITE).href,
    width: 512,
    height: 512,
  },
  email: 'info@fixnote.space',
  ...(SAME_AS.length ? { sameAs: SAME_AS } : {}),
})

export const website = (lang: Lang, description: string) => ({
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  '@id': websiteId(lang),
  name: 'FixNote',
  url: new URL(localePath(lang, '/'), SITE).href,
  description,
  inLanguage: HTML_LANG[lang],
  publisher: { '@id': ORG_ID },
})

export const app = (lang: Lang, description: string, image: string) => ({
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  '@id': APP_ID,
  name: 'FixNote',
  description,
  applicationCategory: 'ProductivityApplication',
  applicationSubCategory: 'Note-taking',
  operatingSystem: 'Windows 10, Windows 11, macOS, Web',
  softwareVersion: RELEASES[0]?.version,
  url: new URL(localePath(lang, '/'), SITE).href,
  downloadUrl: new URL(localePath(lang, '/download/'), SITE).href,
  installUrl: 'https://app.fixnote.space/',
  image,
  inLanguage: ['en', 'ru', 'es'],
  publisher: { '@id': ORG_ID },
  offers: [
    { '@type': 'Offer', name: 'Free', price: '0', priceCurrency: 'USD' },
    { '@type': 'Offer', name: 'Pro', price: '7', priceCurrency: 'USD' },
  ],
})

/** A page about one part of the site, tied to the site and, when it is about the app, the app. */
export const webPage = (
  lang: Lang,
  url: string,
  name: string,
  description: string,
  image: string,
  aboutApp = true,
) => ({
  '@context': 'https://schema.org',
  '@type': 'WebPage',
  '@id': `${url}#webpage`,
  url,
  name,
  description,
  inLanguage: HTML_LANG[lang],
  isPartOf: { '@id': websiteId(lang) },
  primaryImageOfPage: { '@type': 'ImageObject', url: image, width: 1200, height: 630 },
  ...(aboutApp ? { about: { '@id': APP_ID } } : {}),
})

export const authorPath = (lang: Lang, id: string): string => localePath(lang, `/authors/${id}/`)

export const person = (lang: Lang, id: string, a: Author) => ({
  '@type': 'Person',
  '@id': `${new URL(`/authors/${id}/`, SITE).href}#person`,
  name: a.name[lang],
  jobTitle: a.role[lang],
  ...(a.bio ? { url: new URL(authorPath(lang, id), SITE).href } : {}),
  ...(a.photo ? { image: new URL(a.photo, SITE).href } : {}),
  worksFor: { '@id': ORG_ID },
  ...(a.links?.length ? { sameAs: a.links } : {}),
})

/** The page's Open Graph picture, made after the build by og.mjs. */
export function ogImagePath(lang: Lang, path: string): string {
  const clean = path.replace(/^\/|\/$/g, '')
  return `/og/${lang}/${clean || 'index'}.png`
}

export const breadcrumbs = (items: { name: string; url: string }[]) => ({
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: items.map((x, i) => ({
    '@type': 'ListItem',
    position: i + 1,
    name: x.name,
    item: x.url,
  })),
})

export const faqPage = (items: readonly { q: string; a: string }[]) => ({
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: items.map((x) => ({
    '@type': 'Question',
    name: x.q,
    acceptedAnswer: { '@type': 'Answer', text: x.a },
  })),
})
