import type { APIContext, GetStaticPaths } from 'astro'
import { isLang } from '../../i18n'
import { blogFeed } from '../../lib/rss'

export const getStaticPaths = (() => [
  { params: { lang: 'en' } },
  { params: { lang: 'es' } },
]) satisfies GetStaticPaths

export function GET(context: APIContext) {
  const { lang } = context.params
  if (!isLang(lang)) throw new Error(`Unknown language: ${lang}`)
  return blogFeed(lang, context)
}
