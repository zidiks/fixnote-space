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
 * the card in the style of the blog covers and removes the hint from the page.
 */

const root = fileURLToPath(new URL('.', import.meta.url))
const W = 1200
const H = 630
// The look of the blog covers (Figma «Blog covers», tools/figma-bridge/fixnote/blog-covers.mjs).
const BG = '#F5F3F0'
const INK = '#211F1C'
const GREY = '#9B9894'
/** The art board on the right, as on the covers. */
const BOARD = { x: 600, y: 30, size: 570 }
/** How wide a screenshot is drawn on the board; it is embedded at twice that so it stays sharp. */
const SHOT_WIDTH = 720

const font = (subset, weight) =>
  readFileSync(
    join(root, `node_modules/@fontsource/geist/files/geist-${subset}-${weight}-normal.woff`),
  )
// One family per subset: satori looks for a missing glyph in the next family, not in another
// file of the same family.
const FONTS = [400, 500].flatMap((weight) => [
  { name: 'Geist', data: font('latin', weight), weight, style: 'normal' },
  { name: 'Geist Cyrillic', data: font('cyrillic', weight), weight, style: 'normal' },
])

const dataUri = (buf, type = 'png') => `data:image/${type};base64,${buf.toString('base64')}`
const svgUri = (svg) => `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`

/** The word, from the same source as the app and the covers. */
const wordSvg = readFileSync(join(root, '../../brand/fixnote-wordmark.svg'), 'utf8')
const [, wordW, wordH] = /viewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(wordSvg).map(Number)
const word = svgUri(wordSvg.replace('fill="currentColor"', `fill="${INK}"`))
const LOGO_H = 25.5
const icon = dataUri(await sharp(join(root, 'public/logo.png')).resize(400, 400).png().toBuffer())

/** The covers' textures (Figma «Social»); a page gets one by its address, so it never changes. */
const TEXTURES = ['ember-silk', 'ember-cloud', 'dawn-silk', 'dawn-cloud', 'dusk-silk', 'dusk-cloud']
const textures = Object.fromEntries(
  TEXTURES.map((name) => [
    name,
    dataUri(readFileSync(join(root, `src/assets/og/${name}.jpg`)), 'jpeg'),
  ]),
)
function textureFor(key) {
  let h = 0
  for (const c of key) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return textures[TEXTURES[h % TEXTURES.length]]
}

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
      .resize(300, 300)
      .png()
      .toBuffer(),
  )

/** The brand removed from a page title: "Fixnote: x", "x · Fixnote", "x | Fixnote", "x — Fixnote". */
export function cardTitle(title) {
  const t = title
    .replace(/\s*[:·|—–-]\s*Fixnote\s*$/u, '')
    .replace(/^Fixnote\s*[:·|—–-]\s*/u, '')
    .trim()
  return t ? t[0].toLocaleUpperCase() + t.slice(1) : title
}

const h = (type, style, children) => ({ type, props: { style, children } })
const img = (src, style) => ({ type: 'img', props: { src, style } })

function titleSize(text) {
  const n = text.length
  return n > 80 ? 38 : n > 60 ? 42 : n > 42 ? 46 : 50
}

/** What the art board shows: the page's screenshot, Fixnote next to a rival, or the app icon. */
async function board({ shot: shotName, rival, key }) {
  const inner = []
  if (shotName) {
    const s = await shot(shotName)
    // Larger than the board and cut by its right edge, like a window seen from the side.
    const height = Math.min(Math.round(s.height / 2), 470)
    inner.push(
      h(
        'div',
        {
          display: 'flex',
          position: 'absolute',
          left: 44,
          top: Math.round((BOARD.size - height) / 2),
          width: SHOT_WIDTH,
          height,
          borderRadius: 18,
          overflow: 'hidden',
          boxShadow: '0 24px 60px rgba(60,20,0,0.28)',
        },
        [img(s.src, { width: SHOT_WIDTH, height: Math.round(s.height / 2) })],
      ),
    )
  } else if (rival) {
    const tile = (src) => img(src, { width: 150, height: 150, borderRadius: 34 })
    inner.push(
      h(
        'div',
        {
          display: 'flex',
          alignItems: 'center',
          gap: 26,
          padding: '28px 34px',
          borderRadius: 40,
          background: 'rgba(255,255,255,0.85)',
          boxShadow: '0 24px 60px rgba(60,20,0,0.22)',
        },
        [
          tile(icon),
          h('div', { fontSize: 34, fontWeight: 500, color: GREY }, 'vs'),
          tile(await appIcon(rival)),
        ],
      ),
    )
  } else {
    inner.push(
      img(icon, {
        width: 200,
        height: 200,
        borderRadius: 46,
        boxShadow: '0 24px 60px rgba(60,20,0,0.3)',
      }),
    )
  }
  return h(
    'div',
    {
      display: 'flex',
      position: 'absolute',
      left: BOARD.x,
      top: BOARD.y,
      width: BOARD.size,
      height: BOARD.size,
      borderRadius: 24,
      overflow: 'hidden',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundImage: `url(${textureFor(key)})`,
      backgroundSize: `${BOARD.size}px ${BOARD.size}px`,
    },
    inner,
  )
}

async function card({ key, title, eyebrow, description, shot: shotName, rival }) {
  const left = h(
    'div',
    {
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'space-between',
      width: 540,
      height: H - 60,
      margin: '30px 0 0 30px',
    },
    [
      img(word, { width: (LOGO_H * wordW) / wordH, height: LOGO_H }),
      h('div', { display: 'flex', flexDirection: 'column', gap: 18 }, [
        ...(eyebrow
          ? [h('div', { fontSize: 20, fontWeight: 500, color: GREY, letterSpacing: -0.2 }, eyebrow)]
          : []),
        h(
          'div',
          {
            fontSize: titleSize(title),
            fontWeight: 500,
            color: INK,
            lineHeight: 1.08,
            letterSpacing: -1.6,
            lineClamp: 4,
            display: 'block',
          },
          title,
        ),
        ...(description
          ? [
              h(
                'div',
                {
                  fontSize: 20.25,
                  color: GREY,
                  lineHeight: 1.3,
                  letterSpacing: -0.3,
                  lineClamp: 3,
                  display: 'block',
                },
                description,
              ),
            ]
          : []),
      ]),
      h(
        'div',
        {
          display: 'flex',
          alignItems: 'center',
          alignSelf: 'flex-start',
          height: 51,
          padding: '0 25.5px',
          borderRadius: 999,
          background: INK,
          color: '#fff',
          fontSize: 19.5,
          fontWeight: 500,
          letterSpacing: -0.2,
        },
        'fixnote.space',
      ),
    ],
  )

  const svg = await satori(
    h(
      'div',
      {
        display: 'flex',
        width: W,
        height: H,
        background: BG,
        fontFamily: 'Geist, Geist Cyrillic',
        position: 'relative',
      },
      [left, await board({ shot: shotName, rival, key })],
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
          key: image[1],
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
