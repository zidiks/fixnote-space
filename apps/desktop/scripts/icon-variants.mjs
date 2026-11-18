// The app icons a person can pick (Settings → General), from what `pnpm logo` drew in
// icon-src/variants: 512 px PNGs the desktop app swaps in at run time (src/app_icon.rs), the
// full tile for Windows and Linux, the one on Apple's grid for the macOS Dock. Run by `pnpm icons`.
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const from = join(root, 'icon-src', 'variants')
const to = join(root, 'src-tauri', 'icons', 'variants')
mkdirSync(to, { recursive: true })
for (const name of readdirSync(from).filter((n) => n.endsWith('.svg'))) {
  const png = await sharp(readFileSync(join(from, name)), { density: 144 })
    .resize(512, 512)
    .png({ compressionLevel: 9 })
    .toBuffer()
  writeFileSync(join(to, name.replace(/\.svg$/, '.png')), png)
}
console.log(`icon variants updated in ${to}`)
