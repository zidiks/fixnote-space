import type { Lang } from '../i18n'

/**
 * People who write the blog. A post names one in `author:`; posts without it are by
 * DEFAULT_AUTHOR. The byline shows the name and role, and search engines get the article's author
 * as a schema.org Person. Only an author with a `bio` gets a page (/authors/<id>/); without one a
 * page would be empty. Only real people, and only what they agreed to show.
 */
export interface Author {
  name: Record<Lang, string>
  /** What they do at FixNote, e.g. "Co-founder of FixNote". */
  role: Record<Lang, string>
  /** Two or three sentences: who they are and why they write about notes and privacy. */
  bio?: Record<Lang, string>
  /** A square photo in public/authors/, e.g. "/authors/name.jpg". */
  photo?: string
  /** Their own profiles elsewhere (LinkedIn, X, Habr...), for `sameAs`. */
  links?: readonly string[]
}

export const AUTHORS: Record<string, Author> = {
  // Asked to be shown by first name and role only: no bio, photo or profiles.
  vladimir: {
    name: { ru: 'Владимир', en: 'Vladimir', es: 'Vladimir' },
    role: { ru: 'сооснователь FixNote', en: 'co-founder of FixNote', es: 'cofundador de FixNote' },
  },
}

export const DEFAULT_AUTHOR: string | null = 'vladimir'

/** Authors with a page of their own. */
export const AUTHOR_PAGES = Object.entries(AUTHORS).filter(
  (e): e is [string, Author & { bio: Record<Lang, string> }] => Boolean(e[1].bio),
)

export function authorOf(id: string | undefined): { id: string; author: Author } | null {
  const key = id ?? DEFAULT_AUTHOR
  if (!key) return null
  const author = AUTHORS[key]
  if (!author) throw new Error(`Unknown blog author: ${key} (src/data/authors.ts)`)
  return { id: key, author }
}
