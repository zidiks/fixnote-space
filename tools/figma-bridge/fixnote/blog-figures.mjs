/**
 * Figures inside blog posts, in the style of the blog covers (blog-covers.mjs): Geist, the Social
 * palette and textures, glass panels on a texture. 1200×500; one frame per figure and
 * language, below the covers on the "Blog covers" page. Keys `blog-figure/<lang>/<name>`.
 *
 *   node tools/figma-bridge/fixnote/blog-figures.mjs        # writes blog-figures.json
 *   node tools/figma-bridge/bridge.mjs build tools/figma-bridge/fixnote/blog-figures.json --page "Blog covers"
 *
 * Rendered at 1x, each figure goes to apps/landing/src/assets/blog-figures/<lang>/<name>.png, and
 * the post links it with a relative Markdown image.
 */
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))

// Same palette and textures as blog-covers.mjs.
const PAPER = '#FDFCFB'
const DGRAY = '#8A8682'
const DBG = '#151312'
const ORANGE = '#EC6100'
const WHITE = '#FFFFFF'
const w = (opacity) => ({ color: WHITE, opacity })
const TEX = {
  'dusk-cloud': 'c3e46c1dbb3bca83346a3a14922d16aaf7cf9f4f',
  'dusk-silk': '8e1e48a256291dde7bcb95d9bd54193c563fe1c6',
}
const tex = (name) => ({ type: 'IMAGE', imageHash: TEX[name], scaleMode: 'FILL' })

const icon = (paths) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#000" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`
const ICONS = {
  laptop: icon('<rect x="4" y="5" width="16" height="11" rx="2"/><path d="M2 19h20"/>'),
  server: icon(
    '<rect x="3" y="4" width="18" height="7" rx="2"/><rect x="3" y="13" width="18" height="7" rx="2"/><path d="M7 7.5h.01M7 16.5h.01"/>',
  ),
  phone: icon('<rect x="7" y="3" width="10" height="18" rx="2"/><path d="M11 18h2"/>'),
  key: icon(
    '<circle cx="8" cy="15" r="4"/><path d="m10.8 12.2 8.2-8.2"/><path d="m17 6 2 2"/><path d="m15 8 2 2"/>',
  ),
  lock: icon(
    '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  ),
  arrow: icon('<path d="M4 12h16"/><path d="m14 6 6 6-6 6"/>'),
}
const svg = (name, size, color, extra = {}) => ({
  type: 'SVG',
  name: `icon/${name}`,
  svg: ICONS[name],
  w: size,
  h: size,
  color,
  ...extra,
})
const text = (name, str, o = {}) => ({
  type: 'TEXT',
  name,
  text: str,
  family: o.mono ? 'Geist Mono' : 'Geist',
  weight: o.weight ?? 'Regular',
  size: o.size ?? 19.5,
  lineHeight: o.lh ?? 25,
  letterSpacing: o.ls ?? '-2%',
  fill: o.fill ?? PAPER,
  ...(o.w !== undefined ? { w: o.w } : {}),
})
const glass = (name, children, o = {}) => ({
  type: 'FRAME',
  name,
  layout: 'col',
  gap: o.gap ?? 14,
  pad: o.pad ?? [24, 24],
  radius: 22,
  w: o.w ?? 'fill',
  h: o.h ?? 'fill',
  fill: { color: DBG, opacity: 0.42 },
  effects: [{ type: 'BACKGROUND_BLUR', blur: 24 }],
  children,
})
const iconBox = (name, color = PAPER) => ({
  type: 'FRAME',
  name: 'Icon',
  w: 44,
  h: 44,
  radius: 12,
  fill: w(0.14),
  children: [svg(name, 22, color, { center: true })],
})
const tag = (str, o = {}) => ({
  type: 'FRAME',
  name: 'Tag',
  layout: 'row',
  align: 'center',
  gap: 8,
  pad: [0, 16],
  h: 40,
  radius: 999,
  fill: o.fill ?? w(0.12),
  children: [
    svg(o.icon ?? 'key', 19, o.iconColor ?? ORANGE),
    text('Text', str, { size: 19, lh: 24, ls: '-1%', fill: PAPER }),
  ],
})

// Where a note can be read: the two devices hold the key, the server holds ciphertext.
const T = {
  en: {
    title: 'Who can read your note',
    laptop: ['Your laptop', 'Encrypts the note before it leaves'],
    server: ['Our server', 'Stores it and can’t read a word'],
    phone: ['Your phone', 'Opens it with the same key'],
    key: 'Has your key',
    nokey: 'No key',
  },
  es: {
    title: 'Quién puede leer tu nota',
    laptop: ['Tu portátil', 'Cifra la nota antes de enviarla'],
    server: ['Nuestro servidor', 'La guarda y no puede leer nada'],
    phone: ['Tu móvil', 'La abre con la misma clave'],
    key: 'Tiene tu clave',
    nokey: 'Sin clave',
  },
}

const device = (iconName, [title, sub], keyLabel) =>
  glass(`Card / ${title}`, [
    iconBox(iconName),
    {
      type: 'FRAME',
      name: 'Labels',
      layout: 'col',
      gap: 4,
      w: 'fill',
      children: [
        text('Title', title, { size: 28, lh: 34, ls: '-2%', weight: 'Medium' }),
        text('Sub', sub, { size: 21, lh: 27, ls: '-1%', fill: w(0.72), w: 'fill' }),
      ],
    },
    tag(keyLabel),
  ])

const server = ([title, sub], noKey) =>
  glass(`Card / ${title}`, [
    iconBox('server'),
    {
      type: 'FRAME',
      name: 'Labels',
      layout: 'col',
      gap: 4,
      w: 'fill',
      children: [
        text('Title', title, { size: 28, lh: 34, ls: '-2%', weight: 'Medium' }),
        text('Sub', sub, { size: 21, lh: 27, ls: '-1%', fill: w(0.72), w: 'fill' }),
      ],
    },
    text('Ciphertext', 'a9f2 7c1e 04bd e6f0\n93aa 1c7d 5be8 d2f4', {
      mono: true,
      size: 18,
      lh: 27,
      ls: '0%',
      fill: w(0.55),
    }),
    tag(noKey, { icon: 'lock', iconColor: DGRAY }),
  ])

const arrow = (name) => ({
  type: 'FRAME',
  name,
  layout: 'row',
  align: 'center',
  justify: 'center',
  w: 36,
  h: 'fill',
  children: [svg('arrow', 28, w(0.7))],
})

const nodes = []
Object.entries(T).forEach(([lang, s], i) => {
  const key = `blog-figure/${lang}/who-can-read`
  const x = i * 1300
  const y = 6000
  nodes.push(
    {
      key,
      type: 'FRAME',
      name: `Figure / ${lang} / who-can-read`,
      x,
      y,
      // The texture is the whole picture, square: the blog rounds its images (no frame in a frame).
      w: 1200,
      h: 500,
      clip: true,
      fill: tex('dusk-cloud'),
      layout: 'col',
      gap: 28,
      pad: [40, 44],
      children: [
        text('Title', s.title, { size: 38, lh: 44, ls: '-3%', weight: 'Medium' }),
        {
          type: 'FRAME',
          name: 'Flow',
          layout: 'row',
          gap: 14,
          w: 'fill',
          h: 'fill',
          children: [
            device('laptop', s.laptop, s.key),
            arrow('Arrow 1'),
            server(s.server, s.nokey),
            arrow('Arrow 2'),
            device('phone', s.phone, s.key),
          ],
        },
      ],
    },
    {
      key: `${key}/label`,
      type: 'TEXT',
      name: `Label / ${lang} / who-can-read`,
      text: `blog figure · secure-notes-app-2026 · ${lang} · 1200×500`,
      family: 'Geist',
      weight: 'Regular',
      size: 20,
      lineHeight: 26,
      letterSpacing: '-1%',
      fill: DGRAY,
      x,
      y: y + 515,
    },
  )
})

const out = join(HERE, 'blog-figures.json')
writeFileSync(out, JSON.stringify({ page: 'Blog covers', nodes }, null, 2))
console.log(`${nodes.length / 2} figures → ${out}`)
