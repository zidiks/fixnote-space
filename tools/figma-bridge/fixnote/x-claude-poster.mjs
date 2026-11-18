/**
 * The photo posters of the "Fixnote is in Claude's connectors directory" set for X / LinkedIn
 * (4:5, 1080 × 1350), built on the page "Social" of the open Figma file: a photo with a large
 * headline, two chat bubbles styled like our social posts ("Social / mcp": radius 30, padding
 * 22/30, Geist 30; the question in white glass, the answer solid white with an orange accent) and
 * the wordmark of our social posts. Posters 2 and 3 are copies of our social posts
 * (x-claude-social.mjs).
 *
 *   1 "Your notes, in Claude."  photo .figma/x/claude-1-4x5.jpg (not in the repository)
 *
 * Run again to rebuild (frames of the same name are replaced):
 *
 *   pnpm figma serve   (and the Figma Bridge plugin open in the file)
 *   node tools/figma-bridge/fixnote/x-claude-poster.mjs
 */
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const BRIDGE = join(HERE, '..', 'bridge.mjs')
const X = join(HERE, '..', '.figma', 'x')
const photo = (name) => {
  const file = join(X, name)
  return existsSync(file) ? readFileSync(file).toString('base64') : null
}
const POSTERS = [
  {
    index: 1,
    name: 'X · Claude directory · 1',
    photo: photo('claude-1-4x5.jpg'),
    headline: 'Your notes,\nin Claude.',
    cta: 'Connect in Claude',
    question: {
      text: 'What did we decide about the launch?',
      label: ['You', 'now'],
      y: 840,
      width: 360,
    },
    answer: {
      text: 'Launch on November 24, then a public post a week later.',
      label: ['Claude', 'from your note'],
      accent: 'Beta launch plan',
      y: 1010,
      width: 470,
    },
  },
].filter((p) => p.photo)

const code = `
const POSTERS = ${JSON.stringify(POSTERS)}
const W = 1080, H = 1350, ORANGE = '#F86C2D'
await Promise.all(['Regular', 'Medium'].map((style) => figma.loadFontAsync({ family: 'Geist', style })))
const page = figma.root.children.find((p) => p.name === 'Social')
await page.loadAsync()
// The set sits in one row to the right of everything else on the page.
const others = page.children.filter((n) => !n.name.startsWith('X · '))
const base = Math.ceil(Math.max(...others.map((n) => n.x + n.width)) / 100) * 100 + 400

const rgb = (hex) => ({ r: parseInt(hex.slice(1, 3), 16) / 255, g: parseInt(hex.slice(3, 5), 16) / 255, b: parseInt(hex.slice(5, 7), 16) / 255 })
const solid = (hex, opacity = 1) => ({ type: 'SOLID', color: rgb(hex), opacity })
const shadow = (a, y, r) => ({ type: 'DROP_SHADOW', color: { r: 0, g: 0, b: 0, a }, offset: { x: 0, y }, radius: r, spread: 0, visible: true, blendMode: 'NORMAL' })
const text = (chars, size, style, color, extra = {}) => {
  const t = figma.createText()
  t.fontName = { family: 'Geist', style }
  t.characters = chars
  t.fontSize = size
  t.fills = [solid(color, extra.opacity ?? 1)]
  t.letterSpacing = { unit: 'PERCENT', value: extra.tracking ?? -2 }
  if (extra.lineHeight) t.lineHeight = { unit: 'PIXELS', value: extra.lineHeight }
  return t
}
const auto = (name, dir, gap, extra = {}) => {
  const f = figma.createFrame()
  f.name = name
  f.layoutMode = dir
  f.itemSpacing = gap
  f.fills = extra.fills ?? []
  f.primaryAxisSizingMode = 'AUTO'
  f.counterAxisSizingMode = 'AUTO'
  if (extra.align) f.counterAxisAlignItems = extra.align
  const [t, r, b, l] = extra.pad ?? [0, 0, 0, 0]
  f.paddingTop = t, f.paddingRight = r, f.paddingBottom = b, f.paddingLeft = l
  if (extra.radius) f.cornerRadius = extra.radius
  return f
}

// Our social posts' chat bubble: radius 30, padding 22/30, Geist 30 on a 38 line.
const bubble = (frame, name, chars, glass, maxText, label, accent) => {
  const group = auto(name, 'VERTICAL', 10)
  const pill = auto('Bubble', 'HORIZONTAL', 0, { radius: 30, pad: [22, 30, 22, 30],
    fills: [solid('#FFFFFF', glass ? 0.16 : 1)] })
  if (glass) {
    pill.strokes = [solid('#FFFFFF', 0.18)]
    pill.strokeWeight = 1
    pill.effects = [{ type: 'BACKGROUND_BLUR', radius: 24, visible: true }]
  } else {
    pill.effects = [shadow(0.1, 10, 30)]
  }
  const t = text(chars, 30, 'Regular', glass ? '#FFFFFF' : '#161616', { lineHeight: 38 })
  t.textAutoResize = 'WIDTH_AND_HEIGHT'
  if (t.width > maxText) {
    t.textAutoResize = 'HEIGHT'
    t.resize(maxText, t.height)
  }
  pill.appendChild(t)
  group.appendChild(pill)
  const l = text(label.join('  ') + (accent ? ' ' + accent : ''), 21, 'Medium', '#FFFFFF', { tracking: -1 })
  l.setRangeFills(label[0].length, l.characters.length, [solid('#FFFFFF', 0.75)])
  l.setRangeFontName(label[0].length, l.characters.length, { family: 'Geist', style: 'Regular' })
  if (accent) {
    const i = l.characters.lastIndexOf(accent)
    l.setRangeFontName(i, i + accent.length, { family: 'Geist', style: 'Medium' })
    l.setRangeFills(i, i + accent.length, [solid('#FFFFFF')])
  }
  l.effects = [shadow(0.45, 1, 10)]
  const row = auto('Label', 'HORIZONTAL', 0, { pad: [0, 0, 0, 30] })
  row.appendChild(l)
  group.appendChild(row)
  frame.appendChild(group)
  return group
}

const made = []
for (const p of POSTERS) {
  page.children.filter((n) => n.name === p.name).forEach((n) => n.remove())
  const frame = figma.createFrame()
  frame.name = p.name
  frame.resize(W, H)
  frame.x = base + (p.index - 1) * (W + 120)
  frame.y = 0
  const image = figma.createImage(Uint8Array.from(atob(p.photo), (c) => c.charCodeAt(0)))
  frame.fills = [{ type: 'IMAGE', scaleMode: 'FILL', imageHash: image.hash }]
  frame.clipsContent = true
  page.appendChild(frame)

  const shade = figma.createRectangle()
  shade.name = 'Shade'
  shade.resize(W, 260)
  shade.y = H - 260
  shade.fills = [{ type: 'GRADIENT_LINEAR', gradientTransform: [[0, 1, 0], [-1, 0, 1]], gradientStops: [
    { position: 0, color: { r: 0.1, g: 0.06, b: 0.04, a: 0 } },
    { position: 1, color: { r: 0.1, g: 0.06, b: 0.04, a: 0.45 } },
  ] }]
  frame.appendChild(shade)

  const h = text(p.headline, 154, 'Medium', '#FFFFFF', { tracking: -5 })
  h.lineHeight = { unit: 'PERCENT', value: 86 }
  h.name = 'Headline'
  h.x = 40
  h.y = 34
  frame.appendChild(h)

  const q = bubble(frame, 'Question', p.question.text, true, p.question.width, p.question.label)
  q.x = W - 40 - q.width
  q.y = p.question.y
  const a = bubble(frame, 'Answer', p.answer.text, false, p.answer.width, p.answer.label, p.answer.accent)
  a.x = 40
  a.y = p.answer.y

  // The footer of our dark social posts: the light wordmark on the left and the light CTA pill on
  // the right, where they are there.
  const dark = page.children.find((n) => n.name === 'Social / private / 4x5')
  for (const name of ['Fixnote', 'CTA']) {
    const source = dark.findOne((n) => n.name === name)
    const copy = source.clone()
    frame.appendChild(copy)
    copy.x = source.x
    copy.y = source.y
    if (name === 'CTA') {
      const label = copy.findOne((n) => n.type === 'TEXT')
      await Promise.all(label.getRangeAllFontNames(0, label.characters.length).map((f) => figma.loadFontAsync(f)))
      label.characters = p.cta
      copy.x = W - (dark.width - source.x - source.width) - copy.width
    }
  }
  made.push(frame)
}
await figma.setCurrentPageAsync(page)
figma.viewport.scrollAndZoomIntoView(page.children.filter((n) => n.name.startsWith('X · ')))
return made.map((f) => f.id)
`

const file = join(tmpdir(), `x-claude-poster-${process.pid}.js`)
writeFileSync(file, code)
try {
  console.log(
    execFileSync(process.execPath, [BRIDGE, 'script', file], {
      encoding: 'utf8',
      maxBuffer: 1 << 26,
    }).trim(),
  )
} finally {
  rmSync(file, { force: true })
}
