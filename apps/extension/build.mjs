/**
 * Builds the extension into dist/ (load it unpacked from there, or zip it for the stores):
 * each script is its own classic bundle (content scripts cannot be modules), then the static files
 * (manifest, options page, _locales) and the icons.
 *
 * VITE_SUPABASE_URL (from the repo's .env, like the web app) points the extension at our edge
 * function; VITE_WEB_URL at the web app where Connect is confirmed (http://localhost:5173 to try
 * it with `pnpm dev`); VITE_SITE_URL at the site that serves the social rules.
 */
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'vite'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '../..')
const out = join(here, 'dist')

function env(name) {
  if (process.env[name]) return process.env[name]
  for (const file of ['.env', '.env.example']) {
    const path = join(root, file)
    if (!existsSync(path)) continue
    const line = readFileSync(path, 'utf8')
      .split(/\r?\n/)
      .find((l) => l.startsWith(`${name}=`))
    const value = line?.slice(name.length + 1).trim()
    if (value) return value
  }
  return undefined
}

const supabase = env('VITE_SUPABASE_URL') ?? 'https://nsteehqbmljuczxgkvae.supabase.co'
const site = env('VITE_SITE_URL') ?? 'https://fixnote.space'
const app = (env('VITE_WEB_URL') ?? 'https://app.fixnote.space').replace(/\/+$/, '')

rmSync(out, { recursive: true, force: true })
mkdirSync(out, { recursive: true })

for (const name of ['background', 'social', 'options']) {
  await build({
    configFile: false,
    logLevel: 'warn',
    define: {
      __FUNCTIONS_URL__: JSON.stringify(`${supabase}/functions/v1/capture-extension`),
      __SITE_URL__: JSON.stringify(site),
      __APP_URL__: JSON.stringify(app),
    },
    build: {
      outDir: out,
      emptyOutDir: false,
      target: 'chrome120',
      lib: {
        entry: join(here, 'src', `${name}.ts`),
        // The service worker is a module (libsodium reads import.meta); content scripts and the
        // options page are classic scripts, one file each.
        formats: [name === 'background' ? 'es' : 'iife'],
        name: `fixnote_${name}`,
        fileName: () => `${name}.js`,
      },
    },
  })
}

cpSync(join(here, 'static'), out, { recursive: true })
const manifest = JSON.parse(readFileSync(join(out, 'manifest.json'), 'utf8'))
manifest.version = JSON.parse(readFileSync(join(here, 'package.json'), 'utf8')).version
// A site other than fixnote.space (staging): the social rules come from there.
if (site !== 'https://fixnote.space') {
  manifest.host_permissions = [`${new URL(site).origin}/*`, ...manifest.host_permissions.slice(1)]
}
writeFileSync(join(out, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`)

// The app's icon; the browser scales it to each size.
mkdirSync(join(out, 'icons'), { recursive: true })
for (const size of [16, 32, 48, 128]) {
  cpSync(join(root, 'apps/web/public/icon-192.png'), join(out, 'icons', `icon-${size}.png`))
}
cpSync(join(root, 'apps/web/public/icon.svg'), join(out, 'icons', 'icon.svg'))
console.log(`extension built in ${out} (confirms at ${app})`)
