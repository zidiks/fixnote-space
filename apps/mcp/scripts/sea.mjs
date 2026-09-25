// Builds the MCP server into a single executable (Node SEA) for the desktop installer, so users
// need no Node.js. Output: apps/desktop/src-tauri/binaries/fixnote-mcp-<target triple>[.exe],
// the name Tauri expects for an external binary. Run `node scripts/bundle.mjs` first.
import { execFileSync } from 'node:child_process'
import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const dist = join(root, 'dist')

function targetTriple() {
  try {
    const out = execFileSync('rustc', ['-vV'], { encoding: 'utf8' })
    const host = out.match(/^host: (.+)$/m)?.[1]
    if (host) return host.trim()
  } catch {
    // no Rust: derive from Node
  }
  const arch = process.arch === 'arm64' ? 'aarch64' : 'x86_64'
  if (process.platform === 'win32') return `${arch}-pc-windows-msvc`
  if (process.platform === 'darwin') return `${arch}-apple-darwin`
  return `${arch}-unknown-linux-gnu`
}

const triple = process.env.TAURI_TARGET_TRIPLE ?? targetTriple()
const exe = process.platform === 'win32' ? '.exe' : ''
const binaries = join(root, '..', 'desktop', 'src-tauri', 'binaries')
const target = join(binaries, `fixnote-mcp-${triple}${exe}`)

writeFileSync(
  join(dist, 'sea-config.json'),
  JSON.stringify({
    main: join(dist, 'fixnote-mcp.cjs'),
    output: join(dist, 'sea-prep.blob'),
    disableExperimentalSEAWarning: true,
    useCodeCache: false,
    useSnapshot: false,
  }),
)
execFileSync(process.execPath, ['--experimental-sea-config', join(dist, 'sea-config.json')], {
  stdio: 'inherit',
})
mkdirSync(binaries, { recursive: true })
copyFileSync(process.execPath, target)
if (process.platform === 'darwin') execFileSync('codesign', ['--remove-signature', target])
const postject = join(
  root,
  'node_modules',
  '.bin',
  process.platform === 'win32' ? 'postject.cmd' : 'postject',
)
execFileSync(
  postject,
  [
    target,
    'NODE_SEA_BLOB',
    join(dist, 'sea-prep.blob'),
    '--sentinel-fuse',
    'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2',
    ...(process.platform === 'darwin' ? ['--macho-segment-name', 'NODE_SEA'] : []),
  ],
  { stdio: 'inherit', shell: process.platform === 'win32' },
)
if (process.platform === 'darwin') execFileSync('codesign', ['--sign', '-', target])
console.log(target)
