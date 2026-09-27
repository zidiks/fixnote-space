import { existsSync, renameSync, rmdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import sitemap from '@astrojs/sitemap'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'astro/config'

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
  ],
  vite: { plugins: [tailwindcss()] },
})
