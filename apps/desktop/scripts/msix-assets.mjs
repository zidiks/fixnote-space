// The Microsoft Store package's images (msix/Assets), from icon-src/app.svg. Windows picks the size
// it needs: scale-* for tiles and the Store, targetsize-* for the taskbar, Start and file lists
// ("altform-unplated": drawn as is, not on an accent-coloured plate). Run by `pnpm icons`.
import { mkdirSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const out = join(root, 'msix', 'Assets')
const svg = readFileSync(join(root, 'icon-src', 'app.svg'))

const files = {}
for (const [name, size] of [
  ['StoreLogo', 50],
  ['Square44x44Logo', 44],
  ['Square71x71Logo', 71],
  ['Square150x150Logo', 150],
  ['Square310x310Logo', 310],
]) {
  files[`${name}.png`] = size
  files[`${name}.scale-200.png`] = size * 2
}
for (const size of [16, 24, 32, 48, 256]) {
  files[`Square44x44Logo.targetsize-${size}.png`] = size
  files[`Square44x44Logo.targetsize-${size}_altform-unplated.png`] = size
}

mkdirSync(out, { recursive: true })
for (const name of readdirSync(out)) rmSync(join(out, name))
for (const [name, size] of Object.entries(files)) {
  await sharp(svg, { density: Math.max(72, (72 * size * 2) / 1024) })
    .resize(size, size)
    .png({ compressionLevel: 9 })
    .toFile(join(out, name))
}
console.log(`${Object.keys(files).length} Store images in ${out}`)
