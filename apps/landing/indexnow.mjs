import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * IndexNow and the sitemap's <lastmod>: Yandex and Bing (and through it others) hear about new and
 * changed pages within minutes, and every engine sees when a page last changed.
 *
 * 1. The build (`indexNow` integration) writes dist/indexnow.json: every indexable page, a hash of
 *    what it says (title, description, <main>; not the header and footer, which change on every
 *    page with a new blog post) and the date it last changed. It compares the hashes with the live
 *    site's indexnow.json: a changed page gets today's date, an unchanged one keeps its date, an
 *    article always has its own (`dateModified`). The dates go into the sitemap as <lastmod>, and
 *    the new or changed pages into .indexnow-pending.json (next to this file, not published).
 * 2. After the deploy, `node indexnow.mjs` sends that list. The Cloudflare deploy command is
 *    `npx wrangler deploy && node indexnow.mjs`, so only production deploys send anything.
 *
 * The key is public by design: search engines check it at https://fixnote.space/<KEY>.txt.
 */
export const KEY = '7b1fec5fab75c81282c25d639298a492'
const SITE = 'https://fixnote.space'
const root = fileURLToPath(new URL('.', import.meta.url))
const PENDING = join(root, '.indexnow-pending.json')

function* htmlFiles(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) yield* htmlFiles(p)
    else if (name === 'index.html') yield p
  }
}

async function liveManifest() {
  try {
    const res = await fetch(`${SITE}/indexnow.json`, { signal: AbortSignal.timeout(10_000) })
    if (res.status === 404) return {}
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}

export const indexNow = {
  name: 'indexnow',
  hooks: {
    'astro:build:done': async ({ dir, logger }) => {
      const out = fileURLToPath(dir)
      const found = {}
      for (const file of htmlFiles(out)) {
        const html = readFileSync(file, 'utf8')
        if (/<meta name="robots" content="noindex/.test(html)) continue
        const path = `/${relative(out, file).split(sep).slice(0, -1).join('/')}`
        const said = [
          html.match(/<title>[^<]*<\/title>/)?.[0],
          html.match(/<meta name="description" content="[^"]*"/)?.[0],
          html.match(/<main[\s\S]*<\/main>/)?.[0] ?? html,
        ].join('\n')
        found[path === '/' ? '/' : `${path}/`] = {
          h: createHash('sha1').update(said).digest('hex').slice(0, 16),
          dated: html.match(/"dateModified":"(\d{4}-\d{2}-\d{2})/)?.[1],
        }
      }
      const live = await liveManifest()
      if (!live)
        logger.warn('could not read the live indexnow.json; nothing will be sent after this deploy')
      const today = new Date().toISOString().slice(0, 10)
      const pages = {}
      const changed = []
      for (const [path, { h, dated }] of Object.entries(found)) {
        // Older manifests held only the hash.
        const before = typeof live?.[path] === 'string' ? { h: live[path] } : live?.[path]
        const same = before?.h === h
        if (live && !same) changed.push(path)
        pages[path] = { h, m: dated ?? (same && before?.m ? before.m : live ? today : undefined) }
      }
      writeFileSync(join(out, 'indexnow.json'), JSON.stringify(pages))
      writeFileSync(PENDING, JSON.stringify(changed))
      addLastmod(out, pages)
      if (live) logger.info(`${changed.length} new or changed pages to send after the deploy`)
    },
  },
}

/** Each sitemap <url> gets <lastmod> right after its <loc>. */
function addLastmod(out, pages) {
  for (const name of readdirSync(out)) {
    if (!/^sitemap-\d+\.xml$/.test(name)) continue
    const file = join(out, name)
    const xml = readFileSync(file, 'utf8').replace(/<loc>([^<]+)<\/loc>/g, (tag, url) => {
      const m = pages[new URL(url).pathname]?.m
      return m ? `${tag}<lastmod>${m}</lastmod>` : tag
    })
    writeFileSync(file, xml)
  }
}

/** `node indexnow.mjs`: send the pages the last build found new or changed. */
async function send() {
  const paths = existsSync(PENDING) ? JSON.parse(readFileSync(PENDING, 'utf8')) : []
  if (!paths.length) {
    console.log('IndexNow: nothing to send')
    return
  }
  // One request reaches every engine that takes part; 10,000 URLs at most.
  const res = await fetch('https://api.indexnow.org/indexnow', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({
      host: new URL(SITE).host,
      key: KEY,
      keyLocation: `${SITE}/${KEY}.txt`,
      urlList: paths.slice(0, 10_000).map((p) => `${SITE}${p}`),
    }),
  })
  console.log(`IndexNow: ${paths.length} pages, HTTP ${res.status}`)
  // A failed ping must not fail the deploy that already happened.
  writeFileSync(PENDING, '[]')
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) await send()
