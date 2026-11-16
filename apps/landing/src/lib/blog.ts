import { type CollectionEntry, getCollection } from 'astro:content'
import type { ImageMetadata } from 'astro'
import { isLang, LANGS, type Lang, localePath } from '../i18n'

export type Post = CollectionEntry<'blog'>

const covers = import.meta.glob<{ default: ImageMetadata }>('../assets/blog/*/*.png', {
  eager: true,
})

/**
 * A post's cover (1200×630, also its og:image): src/assets/blog/<lang>/<slug>.png, made in Figma
 * (tools/figma-bridge/fixnote/blog-covers.mjs). The cover has text, so each language has its own;
 * a post without one gets the generated Open Graph card and no picture.
 */
export const coverOf = (post: Post): ImageMetadata | undefined =>
  covers[`../assets/blog/${post.id}.png`]?.default

/** The language and URL slug of a post, from its path `<lang>/<slug>`. */
export function postInfo(post: Post): { lang: Lang; slug: string } {
  const [lang, slug] = post.id.split('/')
  if (!isLang(lang) || !slug) throw new Error(`Blog post outside a language folder: ${post.id}`)
  return { lang, slug }
}

export const postPath = (post: Post): string => {
  const { lang, slug } = postInfo(post)
  return localePath(lang, `/blog/${slug}/`)
}

/** Published posts in one language, newest first. Drafts show only in `astro dev`. */
export async function getPosts(lang: Lang): Promise<Post[]> {
  const posts = await getCollection(
    'blog',
    (post) => postInfo(post).lang === lang && (import.meta.env.DEV || !post.data.draft),
  )
  return posts.sort((a, b) => b.data.date.getTime() - a.data.date.getTime())
}

/** The same article in every language it exists in, for hreflang and the language switcher. */
export async function translations(post: Post): Promise<Partial<Record<Lang, string>>> {
  const all = await getCollection(
    'blog',
    (p) => p.data.translationKey === post.data.translationKey && !p.data.draft,
  )
  return Object.fromEntries(
    all
      .filter((p) => (LANGS as readonly string[]).includes(postInfo(p).lang))
      .map((p) => [postInfo(p).lang, postPath(p)]),
  )
}

export function readingMinutes(post: Post): number {
  const words = (post.body ?? '').split(/\s+/).filter(Boolean).length
  return Math.max(1, Math.round(words / 190))
}

export const formatDate = (date: Date, lang: Lang): string =>
  new Intl.DateTimeFormat(lang, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date)

/**
 * Where a "Learn more" about a topic leads: the article with this `translationKey` in the page's
 * language, or `fallback` (a site path) where that article is not written yet.
 */
export async function topicHref(lang: Lang, key: string, fallback: string): Promise<string> {
  const post = (await getPosts(lang)).find((p) => p.data.translationKey === key)
  return post ? postPath(post) : localePath(lang, fallback)
}
