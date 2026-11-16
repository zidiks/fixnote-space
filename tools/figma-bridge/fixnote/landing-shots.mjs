/**
 * The landing's app pictures in English and Spanish, rendered from the Figma file (pages "Home
 * page" and "Screens"): each job clones a layer next to the original, swaps its texts through
 * landing-shots.json, renders the clone at 2x into apps/landing/src/assets/landing/<name>-<lang>.png
 * and deletes the clone. Clones are made on a page "Landing renders"; the originals never change.
 *
 *   pnpm figma serve   (and the Figma Bridge plugin open in the file)
 *   node tools/figma-bridge/fixnote/landing-shots.mjs [name…]
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const BRIDGE = join(HERE, '..', 'bridge.mjs')
const ASSETS = join(HERE, '..', '..', '..', 'apps', 'landing', 'src', 'assets')
const OUT = join(ASSETS, 'landing')
const MAPS = JSON.parse(readFileSync(join(HERE, 'landing-shots.json'), 'utf8'))

const map = (...parts) => Object.assign({}, ...parts.map((p) => p ?? {}))
const ui = (lang) => MAPS.ui[lang]

/** One picture per language; `texts` swap layer texts, `hide` hides layers by name. */
const JOBS = [
  // The hero picture is also the app screenshot of other pages (Demo, og.mjs).
  {
    name: 'home',
    node: '531:179360',
    en: {},
    es: map(ui('es'), MAPS.hero.es),
    target: (lang) => join(ASSETS, 'shots', lang, 'home.png'),
  },
  { name: 'refine', node: '566:54100', en: {}, es: map(ui('es'), MAPS.refine.es) },
  { name: 'integrations', node: '574:56397', en: {}, es: map(ui('es'), MAPS.integrations.es) },
  { name: 'integrations-chat', node: '577:58086', en: MAPS.chat.en, es: MAPS.chat.es },
  // The site shows the Tidy up pane, a square without the sidebar.
  {
    name: 'tidy',
    node: '724:63151',
    en: MAPS.tidy.en,
    es: MAPS.tidy.es,
    crop: { x: 320, y: 0, w: 820, h: 820 },
  },
  {
    name: 'recall-meaning',
    node: '331:6657',
    en: MAPS.meaning.en,
    es: MAPS.meaning.es,
    hide: ['Highlight'],
  },
  // Across languages: the query in the other language finds the notes.
  {
    name: 'recall-languages',
    node: '331:6657',
    en: map(MAPS.meaning.en, { созвон: 'reunión' }),
    es: map(MAPS.meaning.es, { созвон: 'meeting' }),
    hide: ['Highlight'],
  },
  // Text in images: the same search, finding words that are only in pictures.
  {
    name: 'recall-images',
    node: '331:6657',
    en: MAPS.images.en,
    es: MAPS.images.es,
    hide: ['Highlight'],
  },
]

function bridge(...args) {
  return execFileSync(process.execPath, [BRIDGE, ...args], { encoding: 'utf8', maxBuffer: 1 << 26 })
}

function script(code) {
  const file = join(tmpdir(), `landing-shots-${process.pid}.js`)
  writeFileSync(file, code)
  try {
    const out = bridge('script', file).trim()
    return JSON.parse(out)
  } finally {
    rmSync(file, { force: true })
  }
}

/** Plugin code: clone, swap texts (keeping the style of kept parts), hide layers; returns the id. */
const cloneCode = (node, texts, hide, crop) => `
const src = await figma.getNodeByIdAsync(${JSON.stringify(node)})
const clone = src.clone()
const MAP = ${JSON.stringify(texts)}
const HIDE = ${JSON.stringify(hide ?? [])}
const all = 'findAll' in clone ? clone.findAll(() => true) : []
for (const n of all) if (HIDE.includes(n.name)) n.visible = false
// Fonts this computer lacks (the AI app mock-up uses its maker's font) become Geist, the app's.
const fonts = new Map()
for (const t of all.filter((n) => n.type === 'TEXT'))
  for (const f of t.getRangeAllFontNames(0, t.characters.length)) fonts.set(f.family + '/' + f.style, f)
const missing = new Set()
await Promise.all([...fonts].map(([k, f]) => figma.loadFontAsync(f).catch(() => missing.add(k))))
if (missing.size) {
  const weight = (style) => (/semi|bold|medium/i.test(style) ? 'Medium' : 'Regular')
  await Promise.all(['Regular', 'Medium'].map((style) => figma.loadFontAsync({ family: 'Geist', style })))
  for (const t of all.filter((n) => n.type === 'TEXT')) {
    const f = t.getRangeFontName(0, 1)
    if (missing.has(f.family + '/' + f.style)) t.fontName = { family: 'Geist', style: weight(f.style) }
  }
}
// A page of its own: editing a copy inside the 14 680 px home page frame makes Figma lay out the
// whole frame on every text change, which can stall the plugin.
let page = figma.root.children.find((p) => p.name === 'Landing renders')
if (!page) page = figma.createPage(), (page.name = 'Landing renders')
await page.loadAsync()
page.appendChild(clone)
clone.x = 0
clone.y = 0
for (const t of all.filter((n) => n.type === 'TEXT')) {
  // Captured text may use no-break spaces where the map has plain ones.
  const v = MAP[t.characters] ?? MAP[t.characters.replace(/\\u00a0/g, ' ')]
  if (v === undefined) continue
  const text = typeof v === 'string' ? v : v.text
  const keep = typeof v === 'string' ? [] : v.keep ?? []
  const old = t.characters
  const spans = keep.map(([part, from]) => [part, old.indexOf(from), from.length]).filter((s) => s[1] >= 0)
  const inKept = (i) => spans.some(([, s, l]) => i >= s && i < s + l)
  let base = 0
  while (base < old.length - 1 && inKept(base)) base++
  const style = (i, l) => ({ font: t.getRangeFontName(i, i + l), fills: t.getRangeFills(i, i + l) })
  const baseStyle = style(base, 1)
  const kept = spans.map(([part, s, l]) => [part, style(s, l)])
  t.characters = text
  // New text takes the style of the old first character; only texts with kept parts need more.
  const font = (f) => ({ family: f.family, style: f.style })
  if (text.length && kept.length) {
    t.setRangeFontName(0, text.length, font(baseStyle.font))
    t.setRangeFills(0, text.length, baseStyle.fills)
    for (const [part, st] of kept) {
      const i = text.indexOf(part)
      if (i < 0 || st.font === figma.mixed || st.fills === figma.mixed) continue
      t.setRangeFontName(i, i + part.length, font(st.font))
      t.setRangeFills(i, i + part.length, st.fills)
    }
  }
}
const CROP = ${JSON.stringify(crop ?? null)}
if (!CROP) return clone.id
// A clipping frame around the copy; removing the frame removes the copy too.
const frame = figma.createFrame()
page.appendChild(frame)
frame.resize(CROP.w, CROP.h)
frame.clipsContent = true
frame.fills = []
frame.appendChild(clone)
clone.x = -CROP.x
clone.y = -CROP.y
return frame.id
`

const only = process.argv.slice(2)
const tmp = join(tmpdir(), `landing-shots-out-${process.pid}`)
mkdirSync(tmp, { recursive: true })
for (const job of JOBS) {
  if (only.length && !only.includes(job.name)) continue
  for (const lang of ['en', 'es']) {
    const id = script(cloneCode(job.node, job[lang], job.hide, job.crop))
    try {
      const out = bridge('render', id, '--scale', '2', '--format', 'png', '--out', tmp)
      const file = out
        .trim()
        .split('\n')
        .find((l) => l.endsWith('.png'))
      if (!file) throw new Error(`no picture for ${job.name}: ${out}`)
      const target = job.target?.(lang) ?? join(OUT, `${job.name}-${lang}.png`)
      renameSync(file.trim(), target)
      console.log(target)
    } finally {
      script(`(await figma.getNodeByIdAsync(${JSON.stringify(id)}))?.remove(); return true`)
    }
  }
}
rmSync(tmp, { recursive: true, force: true })
