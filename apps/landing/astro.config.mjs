import {
  existsSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmdirSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import sitemap from '@astrojs/sitemap'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'astro/config'
import { indexNow } from './indexnow.mjs'
import { ogCards } from './og.mjs'

/**
 * Cloudflare serves the nearest 404.html for a missing page, so /ru/… gets the Russian one. Astro
 * writes the translated 404 pages as /ru/404/index.html; move them to /ru/404.html.
 */
const localized404 = {
  name: 'localized-404',
  hooks: {
    'astro:build:done': ({ dir }) => {
      for (const lang of ['ru', 'es']) {
        const folder = fileURLToPath(new URL(`${lang}/404/`, dir))
        if (!existsSync(`${folder}index.html`)) continue
        renameSync(`${folder}index.html`, fileURLToPath(new URL(`${lang}/404.html`, dir)))
        rmdirSync(folder)
      }
    },
  },
}

/**
 * A page asked for without its trailing slash (/ru, /features/voice-notes) gets a permanent
 * redirect. Cloudflare's own trailing-slash handling answers 307, which search engines treat as
 * temporary; an exact rule in _redirects runs first and does not match the URL with the slash.
 */
const slashRedirects = {
  name: 'slash-redirects',
  hooks: {
    'astro:build:done': ({ dir }) => {
      const root = fileURLToPath(dir)
      const lines = []
      const walk = (folder) => {
        for (const name of readdirSync(folder)) {
          const p = join(folder, name)
          if (!statSync(p).isDirectory()) continue
          if (existsSync(join(p, 'index.html'))) {
            const path = `/${relative(root, p).split(sep).join('/')}`
            lines.push(`${path} ${path}/ 301`)
          }
          walk(p)
        }
      }
      walk(root)
      const file = join(root, '_redirects')
      const before = readFileSync(file, 'utf8').trimEnd()
      writeFileSync(
        file,
        `${before}\n# Pages without the trailing slash (slashRedirects in astro.config.mjs).\n${lines.sort().join('\n')}\n`,
      )
    },
  },
}

// Static site for fixnote.space: every page is prebuilt HTML with almost no JavaScript, so it
// renders fast (Core Web Vitals) and search engines read it as is. English is served at the
// root, Russian under /ru/ and Spanish under /es/.
export default defineConfig({
  site: 'https://fixnote.space',
  trailingSlash: 'always',
  build: {
    format: 'directory',
    // One small stylesheet: inlined, so the first paint needs no extra request.
    inlineStylesheets: 'always',
  },
  i18n: {
    defaultLocale: 'en',
    locales: ['en', 'ru', 'es'],
    routing: { prefixDefaultLocale: false },
  },
  integrations: [
    sitemap({
      filter: (page) => !/\/404\/?$/.test(page),
      i18n: {
        defaultLocale: 'en',
        locales: { en: 'en-US', ru: 'ru-RU', es: 'es-ES' },
      },
    }),
    localized404,
    slashRedirects,
    ogCards,
    // Last: it hashes the finished pages.
    indexNow,
  ],
  vite: { plugins: [tailwindcss()] },
})
