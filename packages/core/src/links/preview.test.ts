import { beforeEach, describe, expect, it } from 'vitest'
import { prepareDatabase } from '../db/migrate'
import type { SqlDriver } from '../platform'
import { createMemoryDriver } from '../testing/memory-driver'
import {
  type FetchedPage,
  LinkPreviews,
  previewFromPage,
  standaloneUrl,
  youtubeId,
} from './preview'

const page = (html: string, url = 'https://example.com/post'): FetchedPage => ({
  url,
  contentType: 'text/html; charset=utf-8',
  html,
})

describe('previewFromPage', () => {
  it('reads Open Graph tags, decodes entities and resolves relative images', () => {
    const p = previewFromPage(
      'https://example.com/post',
      page(`<head><title>Fallback</title>
        <meta property="og:title" content="Как &laquo;писать&raquo; &amp; не бросить">
        <meta content='Короткое описание' name='description'>
        <meta property="og:image" content="/img/cover.png">
        <meta property="og:site_name" content="Example Blog"></head>`),
    )
    expect(p).toEqual({
      url: 'https://example.com/post',
      kind: 'page',
      title: 'Как «писать» & не бросить',
      description: 'Короткое описание',
      image: 'https://example.com/img/cover.png',
      site: 'Example Blog',
    })
  })

  it('falls back to <title> and the host', () => {
    const p = previewFromPage(
      'https://www.site.dev/',
      page('<title> Just a page </title>', 'https://www.site.dev/'),
    )
    expect(p).toEqual({
      url: 'https://www.site.dev/',
      kind: 'page',
      title: 'Just a page',
      site: 'site.dev',
    })
  })

  it('treats images and YouTube specially and gives up on empty pages', () => {
    expect(
      previewFromPage('https://x.io/a.png', {
        url: 'https://x.io/a.png',
        contentType: 'image/png',
      }),
    ).toMatchObject({ kind: 'image', image: 'https://x.io/a.png' })
    const yt = previewFromPage(
      'https://youtu.be/abc123',
      page('<title>Video</title>', 'https://www.youtube.com/watch?v=abc123'),
    )
    expect(yt).toMatchObject({
      kind: 'video',
      title: 'Video',
      image: 'https://i.ytimg.com/vi/abc123/hqdefault.jpg',
    })
    expect(previewFromPage('https://e.com', page('<p>hi</p>', 'https://e.com'))).toEqual({
      url: 'https://e.com',
      kind: 'none',
      site: 'e.com',
    })
  })
})

describe('link helpers', () => {
  it('finds YouTube ids', () => {
    expect(youtubeId('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=1')).toBe('dQw4w9WgXcQ')
    expect(youtubeId('https://youtube.com/shorts/xyz')).toBe('xyz')
    expect(youtubeId('https://example.com/watch?v=1')).toBeNull()
  })

  it('recognizes a URL alone on its line', () => {
    expect(standaloneUrl('https://a.com/x')).toBe('https://a.com/x')
    expect(standaloneUrl('[https://a.com](https://a.com)')).toBe('https://a.com')
    expect(standaloneUrl('see https://a.com')).toBeNull()
    expect(standaloneUrl('[Title](https://a.com)')).toBeNull()
  })
})

describe('LinkPreviews', () => {
  let db: SqlDriver
  let now = 1_000_000
  let calls = 0
  const fetcher = async (url: string) => {
    calls++
    return page('<meta property="og:title" content="T">', url)
  }

  beforeEach(async () => {
    db = await createMemoryDriver()
    await prepareDatabase(db)
    calls = 0
  })

  it('fetches once, shares concurrent requests and refreshes after a week', async () => {
    const lp = new LinkPreviews(db, () => now)
    const [a, b] = await Promise.all([
      lp.get('https://a.com', fetcher),
      lp.get('https://a.com', fetcher),
    ])
    expect(a?.title).toBe('T')
    expect(b).toEqual(a)
    expect(calls).toBe(1)
    expect(await lp.get('https://a.com', fetcher)).toEqual(a)
    expect(calls).toBe(1)
    now += 8 * 24 * 3600 * 1000
    await lp.get('https://a.com', fetcher)
    expect(calls).toBe(2)
  })

  it('remembers failures for a day and works without a fetcher', async () => {
    const lp = new LinkPreviews(db, () => now)
    const failing = async () => {
      calls++
      throw new Error('offline')
    }
    expect(await lp.get('https://b.com', null)).toBeNull()
    expect((await lp.get('https://b.com', failing))?.kind).toBe('none')
    await lp.get('https://b.com', failing)
    expect(calls).toBe(1)
  })
})
