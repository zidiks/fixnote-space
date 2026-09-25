// Regenerates the app icons from icon-src/. Windows, Linux and the store logos use app.svg, which
// fills the canvas; macOS uses app-macos.svg, drawn on Apple's grid (824px tile with margins and
// a shadow), so it sits in the Dock at the same size as other apps.
import { execFileSync } from 'node:child_process'
import { copyFileSync, mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const icons = join(root, 'src-tauri', 'icons')
const tauri = join(
  root,
  'node_modules',
  '.bin',
  process.platform === 'win32' ? 'tauri.cmd' : 'tauri',
)

function generate(svg) {
  const out = mkdtempSync(join(tmpdir(), 'fixnote-icons-'))
  execFileSync(tauri, ['icon', join(root, 'icon-src', svg), '-o', out], {
    stdio: 'ignore',
    shell: process.platform === 'win32',
  })
  return out
}

const full = generate('app.svg')
const mac = generate('app-macos.svg')
for (const name of readdirSync(icons)) {
  copyFileSync(join(name === 'icon.icns' ? mac : full, name), join(icons, name))
}
rmSync(full, { recursive: true })
rmSync(mac, { recursive: true })
console.log(`icons updated in ${icons}`)
