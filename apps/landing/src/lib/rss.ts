import rss from '@astrojs/rss'
import type { APIContext } from 'astro'
import { type Lang, localePath, t } from '../i18n'
import { getPosts, postPath } from './blog'

export async function blogFeed(lang: Lang, context: APIContext): Promise<Response> {
  const d = t(lang).meta.blog
  const posts = await getPosts(lang)
  return rss({
    title: d.title,
    description: d.description,
    site: new URL(localePath(lang, '/blog/'), context.site ?? 'https://fixnote.space'),
    items: posts.map((post) => ({
      title: post.data.title,
      description: post.data.description,
      pubDate: post.data.date,
      link: postPath(post),
    })),
    customData: `<language>${lang}</language>`,
  })
}
