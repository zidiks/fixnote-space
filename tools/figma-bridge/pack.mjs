#!/usr/bin/env node
/**
 * Packs Figma Bridge for other people (no repository, no FixNote kit):
 *
 *   dist/figma-bridge-<version>.zip   the archive to send: a "Figma Bridge" folder with
 *     Figma Bridge.mcpb               Claude Desktop extension (double-click; runs on Claude's own Node)
 *     figma-bridge.mjs                the bridge as one file (any MCP client, terminal commands)
 *     plugin/                         Figma: Plugins → Development → Import plugin from manifest…
 *     Install.cmd / Install.command   copy to ~/Figma Bridge, add to Claude Code and Cursor
 *     README.md, README.en.md         share/README*.md
 *   dist/Figma Bridge.mcpb            the same extension on its own
 *
 * `node tools/figma-bridge/pack.mjs` (or `pnpm figma:pack`); with `kit` also dist/fixnote-figma.zip:
 * the FixNote UI kit and the Screens page as one bundle file (pages "FixNote UI" and "Screens"), a
 * README and a prompt, and this bridge, for another person's Figma file. No dependencies: the zip writer is
 * below, and it keeps the executable bit of Install.command for macOS.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { deflateRawSync } from 'node:zlib'

const HERE = dirname(fileURLToPath(import.meta.url))
const DIST = join(HERE, 'dist')
const FOLDER = 'Figma Bridge'
const PLUGIN = ['manifest.json', 'code.js', 'ui.html']

const bridge = readFileSync(join(HERE, 'bridge.mjs'), 'utf8')
const version = /const VERSION = '([^']+)'/.exec(bridge)?.[1]
if (!version) throw new Error('No VERSION in bridge.mjs')

// The bridge copied on its own has no kit.mjs next to it: ask that copy for its tool list.
rmSync(DIST, { recursive: true, force: true })
const stage = join(DIST, 'stage')
mkdirSync(stage, { recursive: true })
writeFileSync(join(stage, 'figma-bridge.mjs'), bridge)
const tools = JSON.parse(
  execFileSync(process.execPath, [join(stage, 'figma-bridge.mjs'), 'tools'], { encoding: 'utf8' }),
)
if (tools.some((t) => t.name === 'figma_push_kit')) throw new Error('The packed bridge has the kit')

const text = (s) => Buffer.from(s, 'utf8')
const lf = (s) => s.replace(/\r\n/g, '\n')
const crlf = (s) => lf(s).replace(/\n/g, '\r\n')
const file = (path) => readFileSync(join(HERE, path), 'utf8')
const plugin = PLUGIN.map((f) => ({ name: f, data: text(file(`plugin/${f}`)) }))
// Served by the bridge at /web/capture.js: any page can turn itself into Figma layers.
const web = [{ name: 'web/capture.js', data: text(file('web/capture.js')) }]

// Claude Desktop extension (MCPB): Claude Desktop installs it on macOS and Windows and runs it with
// the Node it ships, so the person needs no Node of their own. `~` is expanded by the bridge.
const manifest = {
  manifest_version: '0.2',
  name: 'figma-bridge',
  display_name: 'Figma Bridge',
  version,
  description:
    'Read and write the file open in Figma desktop: layers, pictures, variables, styles, components. No token, no rate limits.',
  long_description:
    'Works with the Figma Bridge plugin (the plugin folder in the archive: Figma desktop → Plugins → Development → ' +
    'Import plugin from manifest…). Start the plugin in the file you work on and keep its small window open. ' +
    'Everything stays on this computer: the plugin talks only to localhost:7331. Files (renders, layer JSON) go to ~/Figma Bridge/files.',
  author: { name: 'Zidiks' },
  server: {
    type: 'node',
    entry_point: 'server/figma-bridge.mjs',
    mcp_config: {
      command: 'node',
      // biome-ignore lint/suspicious/noTemplateCurlyInString: MCPB's own placeholder, not JS
      args: ['${__dirname}/server/figma-bridge.mjs', 'mcp', '--out', '~/Figma Bridge/files'],
    },
  },
  tools,
  keywords: ['figma', 'design', 'design system', 'components', 'variables'],
  compatibility: { platforms: ['darwin', 'win32'], runtimes: { node: '>=18.0.0' } },
}
const mcpb = zip([
  { name: 'manifest.json', data: text(`${JSON.stringify(manifest, null, 2)}\n`) },
  { name: 'server/figma-bridge.mjs', data: text(bridge) },
  // The bridge sends a newer plugin/code.js to a running plugin (`reload`), so it ships one.
  ...plugin.map((f) => ({ ...f, name: `server/plugin/${f.name}` })),
  ...web.map((f) => ({ ...f, name: `server/${f.name}` })),
])
writeFileSync(join(DIST, `${FOLDER}.mcpb`), mcpb)

const archive = zip(
  [
    { name: 'README.md', data: text(lf(file('share/README.md'))) },
    { name: 'README.en.md', data: text(lf(file('share/README.en.md'))) },
    { name: `${FOLDER}.mcpb`, data: mcpb },
    { name: 'figma-bridge.mjs', data: text(bridge) },
    ...plugin.map((f) => ({ ...f, name: `plugin/${f.name}` })),
    ...web,
    { name: 'Install.cmd', data: text(crlf(file('share/Install.cmd'))) },
    { name: 'Install.command', data: text(lf(file('share/Install.command'))), mode: 0o755 },
  ].map((e) => ({ ...e, name: `${FOLDER}/${e.name}` })),
)
const name = `figma-bridge-${version}.zip`
writeFileSync(join(DIST, name), archive)
console.log(`Figma Bridge ${version}, ${tools.length} tools:`)
console.log(`  ${join(DIST, name)}  (${Math.round(archive.length / 1024)} KB, send this)`)
console.log(`  ${join(DIST, `${FOLDER}.mcpb`)}  (${Math.round(mcpb.length / 1024)} KB)`)

// `node pack.mjs kit`: the FixNote UI kit for someone else's Figma file, as one archive: the kit
// bundle (export-kit), how to apply it (README, a prompt for their AI) and this bridge next to it.
if (process.argv[2] === 'kit') {
  // The kit from the code, then (when exported: `bridge.mjs export-page Screens <file>`) the
  // Screens page from Figma, which uses the kit's components and variables: one bundle, in order.
  const kitFile = join(stage, 'kit.json')
  execFileSync(process.execPath, [join(HERE, 'bridge.mjs'), 'export-kit', kitFile], {
    stdio: 'inherit',
  })
  const kit = JSON.parse(readFileSync(kitFile, 'utf8'))
  const screensFile = process.argv[3] ?? join(HERE, '.figma', 'fixnote-screens.json')
  const screens = existsSync(screensFile) ? JSON.parse(readFileSync(screensFile, 'utf8')) : null
  if (!screens) console.log(`  (no ${screensFile}: the kit only)`)
  const show = kit.steps.pop()
  const bundle = {
    ...kit,
    name: screens ? 'FixNote UI kit and screens' : kit.name,
    pages: screens ? [kit.page, screens.page] : [kit.page],
    steps: [...kit.steps, ...(screens?.steps ?? []), show],
  }
  const KIT = 'fixnote-figma'
  const kitZip = zip(
    [
      { name: 'README.md', data: text(lf(file('share/kit/README.md'))) },
      { name: 'PROMPT.md', data: text(lf(file('share/kit/PROMPT.md'))) },
      { name: 'fixnote-figma.json', data: text(JSON.stringify(bundle)) },
      { name: 'bridge/figma-bridge.mjs', data: text(bridge) },
      ...plugin.map((f) => ({ ...f, name: `bridge/plugin/${f.name}` })),
      ...web.map((f) => ({ ...f, name: `bridge/${f.name}` })),
      { name: `bridge/${FOLDER}.mcpb`, data: mcpb },
    ].map((e) => ({ ...e, name: `${KIT}/${e.name}` })),
  )
  writeFileSync(join(DIST, `${KIT}.zip`), kitZip)
  console.log(
    `  ${join(DIST, `${KIT}.zip`)}  (${Math.round(kitZip.length / 1024)} KB: ${bundle.steps.length} steps, pages ${bundle.pages.join(' + ')})`,
  )
}
rmSync(stage, { recursive: true, force: true })

// ---------------------------------------------------------------------------------------------
// A small zip writer: deflate, UTF-8 names, Unix modes (so macOS keeps Install.command runnable).

function zip(entries) {
  const locals = []
  const central = []
  let offset = 0
  const now = new Date()
  const time = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1)
  const date = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate()
  for (const { name, data, mode = 0o644 } of entries) {
    const path = Buffer.from(name, 'utf8')
    const packed = deflateRawSync(data, { level: 9 })
    const crc = crc32(data)
    const head = Buffer.alloc(30)
    head.writeUInt32LE(0x04034b50, 0)
    head.writeUInt16LE(20, 4) // version needed
    head.writeUInt16LE(0x0800, 6) // UTF-8 names
    head.writeUInt16LE(8, 8) // deflate
    head.writeUInt16LE(time, 10)
    head.writeUInt16LE(date, 12)
    head.writeUInt32LE(crc, 14)
    head.writeUInt32LE(packed.length, 18)
    head.writeUInt32LE(data.length, 22)
    head.writeUInt16LE(path.length, 26)
    locals.push(head, path, packed)

    const dir = Buffer.alloc(46)
    dir.writeUInt32LE(0x02014b50, 0)
    dir.writeUInt16LE((3 << 8) | 20, 4) // made by Unix, so the mode below counts
    dir.writeUInt16LE(20, 6)
    dir.writeUInt16LE(0x0800, 8)
    dir.writeUInt16LE(8, 10)
    dir.writeUInt16LE(time, 12)
    dir.writeUInt16LE(date, 14)
    dir.writeUInt32LE(crc, 16)
    dir.writeUInt32LE(packed.length, 20)
    dir.writeUInt32LE(data.length, 24)
    dir.writeUInt16LE(path.length, 28)
    dir.writeUInt32LE(((0o100000 | mode) << 16) >>> 0, 38) // regular file + permissions
    dir.writeUInt32LE(offset, 42)
    central.push(dir, path)
    offset += head.length + path.length + packed.length
  }
  const size = central.reduce((n, b) => n + b.length, 0)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(entries.length, 8)
  end.writeUInt16LE(entries.length, 10)
  end.writeUInt32LE(size, 12)
  end.writeUInt32LE(offset, 16)
  return Buffer.concat([...locals, ...central, end])
}

function crc32(buf) {
  // Built on first use: zip() runs above this line, before a top-level const here would exist.
  crc32.table ??= Array.from({ length: 256 }, (_, n) => {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    return c >>> 0
  })
  let c = 0xffffffff
  for (const b of buf) c = crc32.table[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
