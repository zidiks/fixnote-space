import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { renderAsync } from '@resvg/resvg-js'
import satori from 'satori'
import sharp from 'sharp'

/**
 * Open Graph pictures (1200×630) for every page, made after the build from the built pages
 * themselves, so a picture always says what its page says.
 *
 * Base.astro writes the picture's address into og:image (/og/<lang>/<path>.png) and a hint for it:
 * `<meta name="og-card" content='{"eyebrow":…,"shot":…,"rival":…,"title":…}'>`. This step reads
 * the <title> (without the brand; the hint's `title` wins), the description and the hint, draws
 * the card in the site's style and removes the hint from the page.
 */

const root = fileURLToPath(new URL('.', import.meta.url))
const W = 1200
const H = 630
const INK = '#1d1d1f'
const MUTED = '#6e6e73'
const FAINT = '#86868b'
const PANEL = '#f5f5f7'
/** How wide a screenshot is drawn; it is embedded at twice that so it stays sharp. */
const SHOT_WIDTH = 760

const font = (subset, weight) =>
  readFileSync(
    join(root, `node_modules/@fontsource/inter/files/inter-${subset}-${weight}-normal.woff`),
  )
// One family per subset: satori looks for a missing glyph in the next family, not in another
// file of the same family.
const FONTS = [400, 600].flatMap((weight) => [
  { name: 'Inter', data: font('latin', weight), weight, style: 'normal' },
  { name: 'Inter Cyrillic', data: font('cyrillic', weight), weight, style: 'normal' },
])

const dataUri = (buf, type = 'png') => `data:image/${type};base64,${buf.toString('base64')}`
const logo = dataUri(await sharp(join(root, 'public/logo.png')).resize(112, 112).png().toBuffer())

/** A screenshot from src/assets/shots, shrunk to the size it is drawn at. */
const shots = new Map()
async function shot(name) {
  if (!shots.has(name)) {
    const buf = await sharp(join(root, `src/assets/shots/${name}.png`))
      .resize({ width: SHOT_WIDTH * 2 })
      .jpeg({ quality: 80 })
      .toBuffer()
    const { height } = await sharp(buf).metadata()
    shots.set(name, { src: dataUri(buf, 'jpeg'), height: height ?? 800 })
  }
  return shots.get(name)
}

const appIcon = async (name) =>
  dataUri(
    await sharp(join(root, `src/assets/apps/${name}.png`))
      .resize(176, 176)
      .png()
      .toBuffer(),
  )

/** The brand removed from a page title: "FixNote: x", "x · FixNote", "x | FixNote", "x — FixNote". */
export function cardTitle(title) {
  const t = title
    .replace(/\s*[:·|—–-]\s*FixNote\s*$/u, '')
    .replace(/^FixNote\s*[:·|—–-]\s*/u, '')
    .trim()
  return t ? t[0].toLocaleUpperCase() + t.slice(1) : title
}

const h = (type, style, children) => ({ type, props: { style, children } })
const img = (src, style) => ({ type: 'img', props: { src, style } })

function titleSize(text, wide) {
  const n = text.length
  if (wide) return n > 80 ? 52 : n > 55 ? 58 : n > 40 ? 64 : 72
  return n > 60 ? 46 : n > 40 ? 52 : 58
}

async function card({ title, eyebrow, description, shot: shotName, rival }) {
  const wide = !shotName && !rival
  const textWidth = wide ? 1040 : 600
  const brand = h('div', { display: 'flex', alignItems: 'center', gap: 18 }, [
    img(logo, { width: 56, height: 56 }),
    h('div', { fontSize: 32, fontWeight: 600, color: INK, letterSpacing: -0.5 }, 'FixNote'),
  ])
  const text = h('div', { display: 'flex', flexDirection: 'column', gap: 18, width: textWidth }, [
    ...(eyebrow ? [h('div', { fontSize: 28, fontWeight: 600, color: MUTED }, eyebrow)] : []),
    h(
      'div',
      {
        fontSize: titleSize(title, wide),
        fontWeight: 600,
        color: INK,
        lineHeight: 1.08,
        letterSpacing: -1.2,
        lineClamp: wide ? 3 : 4,
        display: 'block',
      },
      title,
    ),
    ...(wide && description
      ? [
          h(
            'div',
            {
              fontSize: 28,
              color: MUTED,
              lineHeight: 1.35,
              lineClamp: 2,
              display: 'block',
              marginTop: 6,
            },
            description,
          ),
        ]
      : []),
  ])
  const left = h(
    'div',
    {
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'space-between',
      height: H,
      padding: '64px 0 56px 80px',
    },
    [brand, text, h('div', { fontSize: 26, color: FAINT }, 'fixnote.space')],
  )

  let right = null
  if (shotName) {
    const s = await shot(shotName)
    const width = SHOT_WIDTH
    const height = Math.round((s.height * width) / (SHOT_WIDTH * 2))
    right = h(
      'div',
      {
        display: 'flex',
        position: 'absolute',
        left: 700,
        top: 92,
        width,
        height,
        borderRadius: 22,
        overflow: 'hidden',
        boxShadow: '0 30px 80px rgba(0,0,0,0.16)',
        border: '1px solid #d2d2d7',
      },
      [img(s.src, { width, height })],
    )
  } else if (rival) {
    const icon = (src) => img(src, { width: 176, height: 176, borderRadius: 40 })
    right = h(
      'div',
      {
        display: 'flex',
        position: 'absolute',
        left: 720,
        top: 0,
        height: H,
        alignItems: 'center',
        gap: 28,
      },
      [
        icon(dataUri(await sharp(join(root, 'public/logo.png')).resize(176, 176).png().toBuffer())),
        h('div', { fontSize: 40, fontWeight: 600, color: FAINT }, 'vs'),
        icon(await appIcon(rival)),
      ],
    )
  }

  const svg = await satori(
    h(
      'div',
      {
        display: 'flex',
        width: W,
        height: H,
        background: PANEL,
        fontFamily: 'Inter, Inter Cyrillic',
        position: 'relative',
      },
      [left, ...(right ? [right] : [])],
    ),
    { width: W, height: H, fonts: FONTS },
  )
  return (await renderAsync(svg, { fitTo: { mode: 'width', value: W } })).asPng()
}

function* htmlFiles(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) yield* htmlFiles(p)
    else if (name.endsWith('.html')) yield p
  }
}

const decode = (s) =>
  s
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')

const HINT = /<meta name="og-card" content="([^"]*)"\s*\/?>/

export const ogCards = {
  name: 'og-cards',
  hooks: {
    'astro:build:done': async ({ dir, logger }) => {
      const out = fileURLToPath(dir)
      const started = Date.now()
      const jobs = []
      for (const file of htmlFiles(out)) {
        const html = readFileSync(file, 'utf8')
        const hint = html.match(HINT)
        if (!hint) continue
        const image = html.match(
          /<meta property="og:image" content="https?:\/\/[^/"]+(\/og\/[^"]+\.png)"/,
        )
        const title = html.match(/<title>([^<]*)<\/title>/)
        const description = html.match(/<meta name="description" content="([^"]*)"/)
        if (!image || !title)
          throw new Error(`og-cards: ${file} has a hint but no og:image or <title>`)
        writeFileSync(file, html.replace(hint[0], ''))
        jobs.push({
          target: join(out, image[1]),
          title: cardTitle(decode(title[1])),
          description: description ? decode(description[1]) : undefined,
          ...JSON.parse(decode(hint[1])),
        })
      }
      // resvg renders on libuv's thread pool, so a few cards at a time use the other cores.
      let next = 0
      const worker = async () => {
        while (next < jobs.length) {
          const { target, ...job } = jobs[next++]
          const png = await card(job)
          mkdirSync(dirname(target), { recursive: true })
          writeFileSync(target, png)
        }
      }
      await Promise.all(Array.from({ length: 4 }, worker))
      logger.info(`${jobs.length} pictures in ${((Date.now() - started) / 1000).toFixed(1)}s`)
    },
  },
}
