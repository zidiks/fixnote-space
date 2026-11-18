/**
 * Posters 2 and 3 of the "Fixnote is in Claude's connectors directory" set for X / LinkedIn
 * (4:5), made from our own social posts on the page "Social": each is a copy of a "Social / … / 4x5"
 * frame with its texts changed, so the style stays the brand's (poster 1, the photo, is
 * x-claude-poster.mjs). Run again to rebuild; copies of the same name are replaced.
 *
 *   pnpm figma serve   (and the Figma Bridge plugin open in the file)
 *   node tools/figma-bridge/fixnote/x-claude-social.mjs
 */
import { execFileSync } from 'node:child_process'
import { readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const BRIDGE = join(HERE, '..', 'bridge.mjs')
const ROOT = join(HERE, '..', '..', '..')

/**
 * `texts`: layer name (or its current text) → new text. A "\n" in a two-tone headline or subline
 * starts its quiet second line; `accent` marks a part to keep in the accent colour.
 */
const POSTERS = [
  {
    from: 'Social / mcp / 4x5',
    name: 'X · Claude directory · 2',
    index: 2,
    texts: {
      'Add today’s decisions to my Launch note.': 'Save this plan as a note in Work.',
      'Done. 3 decisions added to Launch plan.': {
        text: 'Done. Saved to Work as Q1 planning.',
        accent: 'Q1 planning',
      },
      'Ask about your notes…': 'Ask Claude…',
      'Fixnote MCP': 'Fixnote',
      Headline: 'Save it\nfrom the chat.',
      Subline: 'Claude adds and updates notes,\nonly where you allow it.',
      'Connect your AI': 'Find it in Claude',
    },
  },
  {
    from: 'Social / private / 4x5',
    name: 'X · Claude directory · 3',
    index: 3,
    texts: {
      'What the server stores': 'What our server keeps\nNothing. It only passes it on',
      'a9f2 7c1e': {
        text: 'claude       asks for a note\nrelay        passes it on, stores nothing\nyour device  decrypts it and answers',
        highlight: 'your device  decrypts it and answers',
      },
      'Encrypted on your device': 'Stored nowhere',
      'A key only you have': 'Read on your device',
      Headline: 'We pass it on.\nWe keep nothing.',
      Subline: "Claude's requests go to your own device.\nThe relay in between keeps nothing.",
      'How it works': 'How it works',
    },
  },
  // The closing call: the landing's privacy photo in the art card (it fits 1000 × 720), light theme.
  {
    from: 'Social / mcp / 4x5',
    name: 'X · Claude directory · 4',
    index: 4,
    photo: readFileSync(join(ROOT, 'apps/landing/src/assets/landing/privacy-photo.jpg')).toString(
      'base64',
    ),
    texts: {
      Headline: "Now in Claude's\nconnectors directory.",
      Subline: 'Find Fixnote in Claude and sign in\nwith your Fixnote account.',
      'Connect your AI': 'Connect now',
    },
  },
  // A wide one for the post on the Notion AI leak (Nov 2026): where copies of your data live.
  {
    from: 'Social / private / 16x9',
    name: 'X · Notion leak · 16x9',
    index: 5,
    texts: {
      'What the server stores': 'Readable copies of your data\nOne, on your own device',
      'a9f2 7c1e': {
        text: 'your device  the only readable copy\nour server   encrypted, unreadable\nAI apps      read via your device',
        highlight: 'your device  the only readable copy',
      },
      'Encrypted on your device': 'End-to-end encrypted',
      'A key only you have': 'Local AI with Ollama',
      Headline: 'How many copies\nof your data exist?',
      Subline: 'Every AI feature can quietly add one.\nIn Fixnote, only your device can read them.',
      'How it works': 'How it works',
    },
  },
]

const code = `
const POSTERS = ${JSON.stringify(POSTERS)}
const page = figma.root.children.find((p) => p.name === 'Social')
await page.loadAsync()
const W = 1080
// The set sits in one row to the right of everything else on the page.
const others = page.children.filter((n) => !n.name.startsWith('X · '))
const base = Math.ceil(Math.max(...others.map((n) => n.x + n.width)) / 100) * 100 + 400
const made = []
for (const p of POSTERS) {
  const src = page.children.find((n) => n.name === p.from)
  page.children.filter((n) => n.name === p.name).forEach((n) => n.remove())
  const copy = src.clone()
  copy.name = p.name
  page.appendChild(copy)
  copy.x = base + (p.index - 1) * (W + 120)
  copy.y = 0
  // A photo instead of the texture of the art card, and nothing on it.
  if (p.photo) {
    const art = copy.children.find((n) => n.name.startsWith('Art'))
    art.children.forEach((n) => n.remove())
    const image = figma.createImage(Uint8Array.from(atob(p.photo), (c) => c.charCodeAt(0)))
    art.fills = [{ type: 'IMAGE', scaleMode: 'FILL', imageHash: image.hash }]
  }
  // The CTA hugs its text: keep its right edge where it was when the text gets shorter or longer.
  const cta = copy.children.find((n) => n.name === 'CTA')
  const ctaRight = cta && cta.x + cta.width
  const texts = copy.findAll((n) => n.type === 'TEXT')
  for (const [key, value] of Object.entries(p.texts)) {
    const t = texts.find((n) => n.name === key || n.characters === key || n.characters.startsWith(key))
    if (!t) throw new Error('no text ' + key + ' in ' + p.from)
    await Promise.all(t.getRangeAllFontNames(0, t.characters.length).map((f) => figma.loadFontAsync(f)))
    const next = typeof value === 'string' ? value : value.text
    const old = t.characters
    // The style of the first line, the quiet one of the second (two-tone texts), the accent's.
    const style = (i) => ({ fills: t.getRangeFills(i, i + 1), font: t.getRangeFontName(i, i + 1) })
    const first = style(0)
    const brk = old.indexOf('\\n')
    const second = brk > 0 ? style(old.length - 1) : first
    const accentAt = old.search(/[A-Z][a-z]+ plan/)
    const accent = accentAt >= 0 ? style(accentAt) : null
    t.characters = next
    t.setRangeFills(0, next.length, first.fills)
    t.setRangeFontName(0, next.length, first.font)
    const nb = next.indexOf('\\n')
    if (nb > 0 && brk > 0) {
      t.setRangeFills(nb + 1, next.length, second.fills)
      t.setRangeFontName(nb + 1, next.length, second.font)
    }
    if (value.accent && accent) {
      const i = next.indexOf(value.accent)
      t.setRangeFills(i, i + value.accent.length, accent.fills)
    }
    // A part drawn at full opacity, to stand out from the quiet rest.
    // The block is dimmed as a layer, so its dimming moves into the text colour first.
    if (value.highlight) {
      const dim = t.opacity
      t.opacity = 1
      t.setRangeFills(0, next.length, first.fills.map((f) => ({ ...f, opacity: (f.opacity ?? 1) * dim })))
      const i = next.indexOf(value.highlight)
      t.setRangeFills(i, i + value.highlight.length, first.fills.map((f) => ({ ...f, opacity: 1 })))
    }
  }
  if (cta) cta.x = ctaRight - cta.width
  made.push(copy)
}
await figma.setCurrentPageAsync(page)
figma.viewport.scrollAndZoomIntoView(made)
return made.map((n) => n.id)
`

const file = join(tmpdir(), `x-claude-social-${process.pid}.js`)
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
