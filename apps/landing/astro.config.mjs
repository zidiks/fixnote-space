import { existsSync, renameSync, rmdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import sitemap from '@astrojs/sitemap'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'astro/config'

/**
 * Cloudflare serves the nearest 404.html for a missing page, so /en/… gets the English one. Astro
 * writes the translated 404 pages as /en/404/index.html; move them to /en/404.html.
 */
const localized404 = {
  name: 'localized-404',
  hooks: {
    'astro:build:done': ({ dir }) => {
      for (const lang of ['en', 'es']) {
        const folder = fileURLToPath(new URL(`${lang}/404/`, dir))
        if (!existsSync(`${folder}index.html`)) continue
        renameSync(`${folder}index.html`, fileURLToPath(new URL(`${lang}/404.html`, dir)))
        rmdirSync(folder)
      }
    },
  },
}

// Static site for fixnote.space: every page is prebuilt HTML with almost no JavaScript, so it
// renders fast (Core Web Vitals) and search engines read it as is. Russian is served at the
// root, English under /en/ and Spanish under /es/.
export default defineConfig({
  site: 'https://fixnote.space',
  trailingSlash: 'always',
  build: {
    format: 'directory',
    // One small stylesheet: inlined, so the first paint needs no extra request.
    inlineStylesheets: 'always',
  },
  i18n: {
    defaultLocale: 'ru',
    locales: ['ru', 'en', 'es'],
    routing: { prefixDefaultLocale: false },
  },
  integrations: [
    sitemap({
      filter: (page) => !/\/404\/?$/.test(page),
      i18n: {
        defaultLocale: 'ru',
        locales: { ru: 'ru-RU', en: 'en-US', es: 'es-ES' },
      },
    }),
    localized404,
  ],
  vite: { plugins: [tailwindcss()] },
})
