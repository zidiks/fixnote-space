import { type CollectionEntry, getCollection } from 'astro:content'
import { isLang, type Lang, localePath } from '../i18n'

export type Post = CollectionEntry<'blog'>

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
  return Object.fromEntries(all.map((p) => [postInfo(p).lang, postPath(p)]))
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
