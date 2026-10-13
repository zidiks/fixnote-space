import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * IndexNow: Yandex and Bing (and through it others) hear about new and changed pages within
 * minutes instead of waiting for a crawl.
 *
 * 1. The build (`indexNow` integration) writes dist/indexnow.json: every indexable page and a
 *    hash of its HTML. It compares that with the live site's indexnow.json and writes the pages
 *    that are new or changed to .indexnow-pending.json (next to this file, not published).
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
      const pages = {}
      for (const file of htmlFiles(out)) {
        const html = readFileSync(file, 'utf8')
        if (/<meta name="robots" content="noindex/.test(html)) continue
        const path = `/${relative(out, file).split(sep).slice(0, -1).join('/')}`
        pages[path === '/' ? '/' : `${path}/`] = createHash('sha1')
          .update(html)
          .digest('hex')
          .slice(0, 16)
      }
      writeFileSync(join(out, 'indexnow.json'), JSON.stringify(pages))
      const live = await liveManifest()
      if (!live) {
        logger.warn('could not read the live indexnow.json; nothing will be sent after this deploy')
        writeFileSync(PENDING, '[]')
        return
      }
      const changed = Object.keys(pages).filter((p) => live[p] !== pages[p])
      writeFileSync(PENDING, JSON.stringify(changed))
      logger.info(`${changed.length} new or changed pages to send after the deploy`)
    },
  },
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
