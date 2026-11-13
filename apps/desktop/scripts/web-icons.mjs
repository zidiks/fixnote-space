// The icons that are not the desktop app's own, from what `pnpm logo` made: the web app's
// (home screen, maskable), the site's, and the macOS menu bar glyph. Run by `pnpm icons`.
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const repo = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const icon = readFileSync(join(repo, 'apps/web/public/icon.svg'))
// No corners of its own: phones cut the shape themselves.
const bleed = readFileSync(join(repo, 'brand/icon-bleed.svg'))
const mark = readFileSync(join(repo, 'brand/fixnote-mark.svg'))

const png = (svg, size) =>
  sharp(svg, { density: Math.max(72, (72 * size * 2) / 1024) })
    .resize(size, size)
    .png({ compressionLevel: 9 })

const out = [
  [png(icon, 192), 'apps/web/public/icon-192.png'],
  [png(icon, 512), 'apps/web/public/icon-512.png'],
  [png(bleed, 512).flatten(), 'apps/web/public/icon-maskable-512.png'],
  [png(bleed, 180).flatten(), 'apps/web/public/apple-touch-icon.png'],
  [png(bleed, 180).flatten(), 'apps/landing/public/apple-touch-icon.png'],
  [png(icon, 512), 'apps/landing/public/logo.png'],
  // A black shape that macOS tints (tray.rs): the mark, 40 px wide on a 44 px canvas.
  [
    sharp(mark, { density: 72 })
      .resize(40, 40, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .extend({ top: 2, bottom: 2, left: 2, right: 2, background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png({ compressionLevel: 9 }),
    'apps/desktop/src-tauri/icons/tray-template.png',
  ],
]
for (const [image, path] of out) await image.toFile(join(repo, path))
console.log(`${out.length} web, site and menu bar icons`)
