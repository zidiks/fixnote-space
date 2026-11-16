/**
 * Figma Bridge capture: turns what a web page shows into editable Figma layers and pushes them
 * through the running bridge. Load it in the page (any app, dev server or not):
 *
 *   const cap = await import('http://127.0.0.1:7331/web/capture.js')   // served by the bridge
 *   await cap.push({ key: 'screen/home', name: 'Home', page: 'Screens', x: 0, y: 0 })
 *
 * What comes out:
 * - frames for elements that draw something (background, border, shadow, clipping), with auto
 *   layout wherever a row or column with even gaps reproduces the measured positions exactly
 *   (checked on the geometry, not guessed from CSS), else absolute positions;
 * - colours bound to the file's variables when a CSS custom property `--<name>` has the colour of
 *   the variable `<name>` (Tailwind classes such as `bg-card` decide between equal colours); a page
 *   in `.dark` uses the collection named "<collection> (Dark)" when there is one;
 * - text with the file's text styles when size, line height and weight match, bold/italic/link runs;
 * - lucide icons as instances of `icon/<name>` components when the file has them, other SVGs as
 *   vectors; images and canvases as image fills.
 * Not covered: ::before/::after boxes, list markers other than bullets/numbers, gradients (their
 * first colour), transforms (boxes are measured after them).
 */

const BRIDGE = new URL(import.meta.url).origin.includes('7331')
  ? new URL(import.meta.url).origin
  : 'http://127.0.0.1:7331'

export async function job(kind, params, label = 'capture') {
  const res = await fetch(`${BRIDGE}/job`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ kind, params, label }),
  })
  const data = await res.json()
  if (data.error) throw new Error(data.error)
  return data.result
}

// ---------------------------------------------------------------------------------------------
// What the Figma file has: variables by collection, text styles, keyed components.

let fileInfo = null
const FILE_SCRIPT = `
const cols = await figma.variables.getLocalVariableCollectionsAsync()
const names = new Map(cols.map((c) => [c.id, c.name]))
const vars = (await figma.variables.getLocalVariablesAsync())
  .filter((v) => v.resolvedType === 'COLOR')
  .map((v) => ({ collection: names.get(v.variableCollectionId), name: v.name }))
const styles = (await figma.getLocalTextStylesAsync()).map((s) => ({
  name: s.name, size: s.fontSize, style: s.fontName.style, family: s.fontName.family,
  lh: s.lineHeight.unit === 'PIXELS' ? s.lineHeight.value
    : s.lineHeight.unit === 'PERCENT' ? (s.fontSize * s.lineHeight.value) / 100 : null,
  ls: s.letterSpacing.unit === 'PIXELS' ? s.letterSpacing.value : (s.fontSize * s.letterSpacing.value) / 100,
  upper: s.textCase === 'UPPER',
}))
const index = JSON.parse(figma.root.getPluginData('fx:index') || '{}')
return { vars, styles, keys: Object.keys(index) }`

export async function file(refresh = false) {
  if (!fileInfo || refresh)
    fileInfo = (await job('script', { code: FILE_SCRIPT }, 'capture: file')).value
  return fileInfo
}

// ---------------------------------------------------------------------------------------------
// Colours: any CSS colour → {r, g, b, a} through a canvas (oklch, color-mix, named…).

const canvas = document.createElement('canvas')
canvas.width = canvas.height = 1
const c2d = canvas.getContext('2d', { willReadFrequently: true })
const colorCache = new Map()

/** The alpha written in a computed colour, and the same colour made opaque. */
function splitAlpha(css) {
  let m = /^rgba?\(([^,]+),([^,]+),([^,)]+)(?:,\s*([\d.]+))?\)$/.exec(css)
  if (m) return { a: m[4] === undefined ? 1 : Number(m[4]), solid: `rgb(${m[1]},${m[2]},${m[3]})` }
  m = /^(.*?)\s*\/\s*([\d.]+%?)\s*\)$/.exec(css)
  if (m) {
    const a = m[2].endsWith('%') ? Number.parseFloat(m[2]) / 100 : Number(m[2])
    return { a, solid: `${m[1]})` }
  }
  return { a: 1, solid: css }
}

export function rgba(css) {
  if (!css || css === 'transparent' || css === 'none') return null
  if (colorCache.has(css)) return colorCache.get(css)
  const { a, solid } = splitAlpha(css.trim())
  let out = null
  if (a > 0) {
    c2d.clearRect(0, 0, 1, 1)
    c2d.fillStyle = '#000'
    c2d.fillStyle = solid
    c2d.fillRect(0, 0, 1, 1)
    const d = c2d.getImageData(0, 0, 1, 1).data
    out = { r: d[0], g: d[1], b: d[2], a: Math.round(a * 1000) / 1000 }
  }
  colorCache.set(css, out)
  return out
}

const hex2 = (n) => n.toString(16).padStart(2, '0')
const hex = (c) => `#${hex2(c.r)}${hex2(c.g)}${hex2(c.b)}`
const same = (a, b) =>
  Math.abs(a.r - b.r) <= 1 && Math.abs(a.g - b.g) <= 1 && Math.abs(a.b - b.b) <= 1

/** Variables whose CSS property this page defines: name → colour, in the page's current theme. */
function tokens(info) {
  const dark = document.documentElement.classList.contains('dark')
  const cols = new Set(info.vars.map((v) => v.collection))
  const root = getComputedStyle(document.documentElement)
  const out = []
  const seen = new Set()
  // Shorter collection names first: "Theme" before "Theme (Dark)" unless the page is dark.
  const order = [...info.vars].sort((a, b) => a.collection.length - b.collection.length)
  for (const v of order) {
    if (seen.has(v.name)) continue
    const darkCol = `${v.collection} (Dark)`
    const collection = dark && cols.has(darkCol) ? darkCol : v.collection
    const css = root.getPropertyValue(`--${v.name}`).trim()
    const color = css && rgba(css)
    if (!color) continue
    seen.add(v.name)
    out.push({ name: v.name, ref: `$${collection}:${v.name}`, color })
  }
  return out
}

/** Which colour classes (bg-, text-, border-, fill-, stroke-) an element and its parents use. */
function classTokens(el, prefix, depth) {
  const names = []
  for (let e = el, i = 0; e && i <= depth; e = e.parentElement, i++)
    for (const c of e.classList ?? []) {
      if (c.includes(':') && !c.startsWith('dark:')) continue
      const m = new RegExp(`^(?:dark:)?${prefix}-([a-z0-9-]+?)(?:/\\d+)?$`).exec(c)
      if (m) names.push(m[1])
    }
  return names
}

const PRIORITY = {
  bg: [
    'background',
    'card',
    'popover',
    'sidebar',
    'muted',
    'accent',
    'secondary',
    'primary',
    'brand',
  ],
  text: [
    'foreground',
    'muted-foreground',
    'card-foreground',
    'popover-foreground',
    'sidebar-foreground',
    'primary-foreground',
    'brand',
    'brand-foreground',
  ],
  border: ['border', 'input', 'sidebar-border', 'ring'],
}

// ---------------------------------------------------------------------------------------------
// The walk.

const px = (v) => Number.parseFloat(v) || 0
const r2 = (n) => Math.round(n * 100) / 100
const INLINE = /^(inline|contents)$/

/** A capture run: the page's tokens and the file's styles and keys. */
class Run {
  constructor(info) {
    this.info = info
    this.tokens = tokens(info)
    this.keys = new Set(info.keys)
    this.images = []
    this.count = 0
  }

  /** CSS colour → paint spec: a variable (with opacity) when one has that colour. */
  paint(css, el, kind) {
    const c = rgba(css)
    if (!c) return null
    const hits = this.tokens.filter((t) => same(t.color, c))
    let tok = null
    if (hits.length) {
      const wanted = classTokens(el, kind, kind === 'text' ? 6 : 0)
      tok =
        hits.find((t) => wanted.includes(t.name)) ??
        PRIORITY[kind]?.map((n) => hits.find((t) => t.name === n)).find(Boolean) ??
        hits[0]
    }
    if (tok) {
      const opacity = r2(c.a / (tok.color.a || 1))
      return opacity >= 0.995 ? tok.ref : { var: tok.ref, opacity: Math.min(1, opacity) }
    }
    return c.a >= 0.995 ? hex(c) : { color: hex(c), opacity: c.a }
  }

  textStyle(t) {
    return this.info.styles.find(
      (s) =>
        s.family === t.family &&
        Math.abs(s.size - t.size) < 0.01 &&
        s.style === t.weight &&
        Math.abs((s.lh ?? t.size * 1.21) - t.lineHeight) < 0.6 &&
        Math.abs((s.ls ?? 0) - (t.letterSpacing ?? 0)) < 0.05 &&
        Boolean(s.upper) === Boolean(t.upper),
    )?.name
  }
}

const WEIGHTS = {
  100: 'Thin',
  200: 'Extra Light',
  300: 'Light',
  400: 'Regular',
  500: 'Medium',
  600: 'Semi Bold',
  700: 'Bold',
  800: 'Extra Bold',
  900: 'Black',
}
function fontOf(cs) {
  const w = WEIGHTS[Math.round(Number(cs.fontWeight) / 100) * 100] ?? 'Regular'
  const italic = cs.fontStyle === 'italic'
  const first = cs.fontFamily.split(',')[0].replace(/["']/g, '').trim()
  const mono = /mono|consol|menlo|courier/i.test(cs.fontFamily) && !/inter/i.test(first)
  const family = mono ? 'Roboto Mono' : first.replace(/\s+Variable$/, '') || 'Inter'
  return { family, weight: italic ? (w === 'Regular' ? 'Italic' : `${w} Italic`) : w }
}

function lineHeightOf(cs) {
  return cs.lineHeight === 'normal' ? px(cs.fontSize) * 1.21 : px(cs.lineHeight)
}

function visible(_el, cs) {
  if (cs.display === 'none' || cs.visibility === 'hidden' || cs.visibility === 'collapse')
    return false
  if (Number(cs.opacity) === 0) return false
  // Screen-reader-only text.
  if (
    cs.position === 'absolute' &&
    (cs.clip === 'rect(0px, 0px, 0px, 0px)' || cs.clipPath === 'inset(50%)')
  )
    return false
  return true
}

const rectOf = (r) => ({ x: r.left, y: r.top, w: r.width, h: r.height })
const meets = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h

function radii(cs, box) {
  const one = (v) => {
    const n = v.endsWith('%') ? (Math.min(box.w, box.h) * px(v)) / 100 : px(v)
    return r2(Math.min(n, Math.min(box.w, box.h) / 2))
  }
  const r = [
    one(cs.borderTopLeftRadius),
    one(cs.borderTopRightRadius),
    one(cs.borderBottomRightRadius),
    one(cs.borderBottomLeftRadius),
  ]
  return r.every((x) => x === r[0]) ? r[0] : r
}

/** box-shadow → effects (an effect style when the element uses its Tailwind class). */
function shadows(run, el, cs) {
  if (!cs.boxShadow || cs.boxShadow === 'none') return null
  const cls = el.className?.baseVal ?? el.className ?? ''
  if (/\bshadow-xs\b/.test(cls) && run.info.keys) return 'shadow/xs'
  if (/shadow-float|shadow-\[var\(--shadow-float\)\]/.test(cls)) return 'shadow/float'
  const out = []
  // Split on commas outside parentheses.
  for (const part of cs.boxShadow.split(/,(?![^(]*\))/)) {
    const color = /(rgba?\([^)]*\)|oklch\([^)]*\)|oklab\([^)]*\)|color\([^)]*\)|#[0-9a-f]+)/i.exec(
      part,
    )?.[1]
    const nums = part
      .replace(color ?? '', '')
      .trim()
      .split(/\s+/)
    const inset = nums.includes('inset')
    const [x, y, blur = '0', spread = '0'] = nums.filter((n) => n !== 'inset')
    const c = rgba(color ?? 'rgba(0,0,0,0.1)')
    if (!c || (!px(blur) && !px(spread) && !px(x) && !px(y))) continue
    out.push({
      type: inset ? 'INNER_SHADOW' : 'DROP_SHADOW',
      x: px(x),
      y: px(y),
      blur: px(blur),
      spread: px(spread),
      color: `${hex(c)}${hex2(Math.round(c.a * 255))}`,
    })
  }
  return out.length ? out : null
}

/** What the element draws itself: fill, stroke, radius, effects, clip, opacity. */
function looks(run, el, cs, box) {
  const s = {}
  const bg = cs.backgroundColor
  const image = cs.backgroundImage !== 'none' ? cs.backgroundImage : null
  const fills = []
  const clipText = /text/.test(cs.backgroundClip || cs.webkitBackgroundClip || '')
  if (rgba(bg) && !clipText) fills.push(run.paint(bg, el, 'bg'))
  if (image && !clipText) fills.push(...gradients(image, box))
  if (fills.length) s.fill = fills.length === 1 ? fills[0] : fills
  const widths = [
    cs.borderTopWidth,
    cs.borderRightWidth,
    cs.borderBottomWidth,
    cs.borderLeftWidth,
  ].map(px)
  const styles = [cs.borderTopStyle, cs.borderRightStyle, cs.borderBottomStyle, cs.borderLeftStyle]
  const colors = [cs.borderTopColor, cs.borderRightColor, cs.borderBottomColor, cs.borderLeftColor]
  const on = widths.map(
    (w, i) => w > 0 && styles[i] !== 'none' && styles[i] !== 'hidden' && rgba(colors[i]),
  )
  if (on.some(Boolean)) {
    const i = on.findIndex(Boolean)
    s.stroke = run.paint(colors[i], el, 'border')
    const w = widths.map((x, j) => (on[j] ? x : 0))
    s.strokeWidth = w.every((x) => x === w[0]) ? w[0] : w
    s.strokeAlign = 'inside'
    if (styles[i] === 'dashed') s.dashed = true
  }
  const fx = shadows(run, el, cs)
  if (fx) s.effects = fx
  if (cs.backdropFilter && cs.backdropFilter !== 'none') {
    const blur = /blur\(([\d.]+)px\)/.exec(cs.backdropFilter)
    if (blur)
      s.effects = [
        ...(Array.isArray(s.effects) ? s.effects : []),
        { type: 'BACKGROUND_BLUR', blur: px(blur[1]) },
      ]
  }
  const r = radii(cs, box)
  if (r !== 0) s.radius = r
  if (
    /hidden|clip|auto|scroll/.test(cs.overflow) ||
    /hidden|clip|auto|scroll/.test(`${cs.overflowX} ${cs.overflowY}`)
  )
    s.clip = true
  const op = Number(cs.opacity)
  if (op < 1) s.opacity = r2(op)
  return s
}

const draws = (s) => s.fill || s.stroke || s.effects

function pseudoItems(run, el, box) {
  const out = []
  for (const which of ['::before', '::after']) {
    const cs = getComputedStyle(el, which)
    if (!cs || cs.content === 'none' || cs.content === 'normal' || cs.display === 'none') continue
    if (cs.visibility === 'hidden' || Number(cs.opacity) === 0) continue
    if (/matrix\(0, 0, 0, 0|scale\(0\)/.test(cs.transform)) continue
    const w = px(cs.width)
    const h = px(cs.height)
    const text = /^["'](.*)["']$/.exec(cs.content)?.[1] ?? ''
    const fill = rgba(cs.backgroundColor) ? run.paint(cs.backgroundColor, el, 'bg') : null
    const mask = /url\("?(data:image\/svg\+xml[^")]+)"?\)/.exec(
      cs.maskImage || cs.webkitMaskImage || '',
    )?.[1]
    if (!w && !h && !text) continue
    // Where: absolute with left/top, else centred in the element (place-content: center).
    const pcs = getComputedStyle(el)
    let x = box.x + (box.w - w) / 2
    let y = box.y + (box.h - h) / 2
    if (cs.position === 'absolute') {
      if (cs.left !== 'auto') x = box.x + px(pcs.borderLeftWidth) + px(cs.left)
      else if (cs.right !== 'auto') x = box.x + box.w - px(pcs.borderRightWidth) - px(cs.right) - w
      if (cs.top !== 'auto') y = box.y + px(pcs.borderTopWidth) + px(cs.top)
      else if (cs.bottom !== 'auto')
        y = box.y + box.h - px(pcs.borderBottomWidth) - px(cs.bottom) - h
    }
    const pbox = { x, y, w, h }
    if (mask && fill) {
      let svg = decodeURIComponent(mask.replace(/^data:image\/svg\+xml(;utf8)?,/, ''))
      const c = rgba(cs.backgroundColor)
      svg = svg
        .replace(/(stroke|fill)=(['"])(?!none)[^'"]*\2/g, `$1="${hex(c)}"`)
        .replace(/<svg /, `<svg width="${w}" height="${h}" `)
      out.push({
        spec: { type: 'SVG', name: which.slice(2), svg, w: r2(w), h: r2(h), color: fill },
        box: pbox,
        out: true,
        z: 1,
      })
    } else if (text?.trim()) {
      const tb = { x, y, w: Math.max(w, 1), h: lineHeightOf(cs) }
      out.push({
        spec: { ...textSpec(run, el, { text, runs: [] }, tb, cs), w: 'hug', name: which.slice(2) },
        box: tb,
        out: true,
        z: 1,
      })
    } else if (w && h && (fill || px(cs.borderTopWidth))) {
      const look = looks(run, el, cs, pbox)
      out.push({
        spec: {
          type: 'FRAME',
          name: which.slice(2),
          w: r2(w),
          h: r2(h),
          ...look,
          fill: look.fill ?? null,
        },
        box: pbox,
        out: true,
        z: 1,
      })
    }
  }
  return out
}

/** Split on commas outside parentheses. */
const topSplit = (str) => {
  const out = []
  let depth = 0
  let cur = ''
  for (const ch of str) {
    if (ch === '(') depth++
    if (ch === ')') depth--
    if (ch === ',' && !depth) {
      out.push(cur.trim())
      cur = ''
    } else cur += ch
  }
  if (cur.trim()) out.push(cur.trim())
  return out
}

const COLOR_RE =
  /^(rgba?\(.*?\)|oklch\(.*?\)|oklab\(.*?\)|lab\(.*?\)|lch\(.*?\)|color-mix\(.*\)|color\(.*?\)|hsla?\(.*?\)|#[0-9a-f]{3,8}|transparent|[a-z]+)(?=\s|$)/i

/** CSS linear/radial gradients (computed) → Figma gradient paints, top layer last. */
function gradients(image, box) {
  const out = []
  const layers = topSplit(image).filter((l) => /^(repeating-)?(linear|radial)-gradient\(/.test(l))
  for (const layer of layers) {
    const radial = layer.includes('radial-gradient(')
    const inner = layer.slice(layer.indexOf('(') + 1, -1)
    const parts = topSplit(inner)
    let head = null
    if (
      !COLOR_RE.test(parts[0]) ||
      /^(to |at |circle|ellipse|[\d.-]+(deg|turn|rad|px|%|rem|em))/.test(parts[0])
    )
      head = parts.shift()
    // Stops: colour with zero, one or two positions (fractions of the gradient line).
    const stops = []
    for (const part of parts) {
      const m = COLOR_RE.exec(part)
      if (!m) continue
      const c = rgba(m[1])
      const positions = part.slice(m[1].length).trim().split(/\s+/).filter(Boolean)
      const color = c ? { r: c.r / 255, g: c.g / 255, b: c.b / 255, a: c.a } : null
      if (!positions.length) stops.push({ color, at: null })
      for (const pos of positions) stops.push({ color, at: pos })
    }
    if (stops.length < 2) continue
    let transform
    let length
    if (radial) {
      // "<rx> <ry> at <x> <y>" (radii and centre in % or px of the box).
      const [size = '', at = '50% 50%'] = (head ?? '').split(' at ')
      const len = (v, total) => (v.endsWith('%') ? (px(v) / 100) * total : px(v))
      const [sx, sy] = size.trim().split(/\s+/)
      const rx = sx ? len(sx, box.w) : box.w / 2
      const ry = sy ? len(sy, box.h) : sx ? rx : box.h / 2
      const [ax = '50%', ay = '50%'] = at.trim().split(/\s+/)
      const cx = len(ax, box.w) / box.w
      const cy = len(ay, box.h) / box.h
      const nx = rx / box.w
      const ny = ry / box.h
      transform = [
        [0.5 / nx, 0, 0.5 - (cx * 0.5) / nx],
        [0, 0.5 / ny, 0.5 - (cy * 0.5) / ny],
      ]
      length = rx
    } else {
      let deg = 180
      const h = head ?? ''
      if (/deg/.test(h)) deg = px(h)
      else if (/turn/.test(h)) deg = px(h) * 360
      else if (/^to /.test(h)) {
        const dirs = {
          top: 0,
          right: 90,
          bottom: 180,
          left: 270,
          'top right': 45,
          'right top': 45,
          'bottom right': 135,
          'right bottom': 135,
          'bottom left': 225,
          'left bottom': 225,
          'top left': 315,
          'left top': 315,
        }
        deg = dirs[h.slice(3).trim()] ?? 180
      }
      const t = (deg * Math.PI) / 180
      const d = { x: Math.sin(t), y: -Math.cos(t) }
      const n = { x: -d.y, y: d.x }
      const L = Math.abs(box.w * d.x) + Math.abs(box.h * d.y)
      transform = [
        [(d.x * box.w) / L, (d.y * box.h) / L, 0.5 - (d.x * box.w + d.y * box.h) / 2 / L],
        [(n.x * box.w) / L, (n.y * box.h) / L, 0.5 - (n.x * box.w + n.y * box.h) / 2 / L],
      ]
      length = L
    }
    // Positions → 0..1; missing ones spread evenly between their neighbours.
    const frac = (v) => (v.endsWith('%') ? px(v) / 100 : px(v) / length)
    const at = stops.map((st, i) =>
      st.at != null ? frac(st.at) : i === 0 ? 0 : i === stops.length - 1 ? 1 : null,
    )
    for (let i = 1; i < at.length; i++) if (at[i] != null && at[i] < at[i - 1]) at[i] = at[i - 1]
    for (let i = 0; i < at.length; i++)
      if (at[i] == null) {
        let j = i
        while (at[j] == null) j++
        for (let k = i; k < j; k++)
          at[k] = at[i - 1] + ((at[j] - at[i - 1]) * (k - i + 1)) / (j - i + 1)
        i = j
      }
    // Transparent stops take their neighbour's colour (CSS mixes in premultiplied space).
    const cols = stops.map((st) => st.color)
    for (let i = 0; i < cols.length; i++)
      if (!cols[i] || cols[i].a === 0) {
        const near =
          cols.slice(i + 1).find((x) => x && x.a > 0) ??
          [...cols.slice(0, i)].reverse().find((x) => x && x.a > 0)
        cols[i] = near ? { ...near, a: 0 } : { r: 0, g: 0, b: 0, a: 0 }
      }
    out.push({
      type: radial ? 'GRADIENT_RADIAL' : 'GRADIENT_LINEAR',
      gradientTransform: transform,
      gradientStops: at.map((position, i) => ({
        position: Math.min(1, Math.max(0, position)),
        color: cols[i],
      })),
    })
  }
  return out.reverse()
}

/** Lucide icons: <svg class="lucide lucide-plus">; the spinner by its shape. */
function iconName(svg) {
  const m = /\blucide-([a-z0-9-]+)\b/.exec(svg.getAttribute('class') ?? '')
  if (m && m[1] !== 'icon') return m[1]
  if (svg.querySelector('circle[r="6.25"]') && svg.querySelector('path')) return 'spinner'
  return null
}

function svgItem(run, el, cs, box) {
  const color = run.paint(cs.color, el, 'text')
  const name = iconName(el)
  if (name && run.keys.has(`icon/${name}`))
    return {
      type: 'INSTANCE',
      of: `icon/${name}`,
      name: `icon/${name}`,
      w: r2(box.w),
      h: r2(box.h),
      color: color ?? undefined,
    }
  const clone = el.cloneNode(true)
  clone.setAttribute('width', String(box.w))
  clone.setAttribute('height', String(box.h))
  clone.removeAttribute('class')
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  const c = rgba(cs.color)
  let svg = new XMLSerializer().serializeToString(clone)
  if (c) svg = svg.replace(/currentColor/g, hex(c))
  return { type: 'SVG', name: name ? `icon/${name}` : 'svg', svg, w: r2(box.w), h: r2(box.h) }
}

/** Bytes of an image the page shows, as base64 (null when the browser will not give them). */
async function imageData(src, el, box) {
  try {
    const blob = await fetch(src).then((r) => (r.ok ? r.blob() : null))
    if (blob && blob.size < 4_000_000 && /image\/(png|jpe?g|gif|webp)/.test(blob.type)) {
      if (/webp/.test(blob.type)) return rasterize(await createImageBitmap(blob), box)
      const buf = new Uint8Array(await blob.arrayBuffer())
      let s = ''
      for (let i = 0; i < buf.length; i += 0x8000)
        s += String.fromCharCode(...buf.subarray(i, i + 0x8000))
      return btoa(s)
    }
  } catch {
    // Cross-origin without CORS: try drawing it.
  }
  try {
    return rasterize(el, box)
  } catch {
    return null
  }
}

function rasterize(source, box) {
  const c = document.createElement('canvas')
  const scale = Math.min(2, window.devicePixelRatio || 1)
  c.width = Math.max(1, Math.round(box.w * scale))
  c.height = Math.max(1, Math.round(box.h * scale))
  c.getContext('2d').drawImage(source, 0, 0, c.width, c.height)
  return c.toDataURL('image/png').split(',')[1]
}

// ---------------------------------------------------------------------------------------------
// Text.

/** A text leaf: only text and inline elements that draw nothing themselves. */
function isTextLeaf(el) {
  let text = false
  for (const n of el.childNodes) {
    if (n.nodeType === 3) {
      if (n.data.trim()) text = true
      continue
    }
    if (n.nodeType !== 1) continue
    const tag = n.tagName.toLowerCase()
    if (tag === 'br') continue
    const cs = getComputedStyle(n)
    if (!visible(n, cs)) continue
    if (/^(svg|img|canvas|input|textarea|select|video)$/.test(tag)) return false
    const boxed = rgba(cs.backgroundColor) || px(cs.borderTopWidth) || px(cs.borderBottomWidth)
    // A chip in the middle of a sentence (a citation number): text that is part of the line.
    const chip =
      /^inline-(block|flex|grid)$/.test(cs.display) &&
      boxed &&
      n.closest('p,li,h1,h2,h3,h4,blockquote')
    if (!INLINE.test(cs.display) && !chip) return false
    if (tag === 'button' && !chip) return false
    // Its own spacing (a count after a label): a layer of its own, the gap kept by auto layout.
    if (
      (px(cs.marginLeft) || px(cs.marginRight)) &&
      !(boxed && px(cs.marginLeft) <= 4 && px(cs.marginRight) <= 4)
    )
      return false
    if (!boxed && (px(cs.paddingLeft) || px(cs.paddingRight))) return false
    if (!isTextLeaf(n)) return false
    if (n.textContent.trim()) text = true
  }
  return text
}

/** Boxes of inline parts with a background (search marks, inline code), one per line they span. */
function highlights(run, root) {
  const out = []
  for (const n of root.querySelectorAll('*')) {
    const cs = getComputedStyle(n)
    if (!/^(inline|inline-block|inline-flex|inline-grid)$/.test(cs.display) || !visible(n, cs))
      continue
    if (!rgba(cs.backgroundColor) && !px(cs.borderTopWidth)) continue
    if (/text/.test(cs.backgroundClip || cs.webkitBackgroundClip || '')) continue
    for (const r of n.getClientRects()) {
      if (r.width < 1 || r.height < 1) continue
      const box = rectOf(r)
      const look = looks(run, n, cs, box)
      out.push({
        spec: {
          type: 'FRAME',
          name: 'highlight',
          w: r2(box.w),
          h: r2(box.h),
          ...look,
          clip: undefined,
          fill: look.fill ?? null,
        },
        box,
        out: true,
        z: -1,
      })
    }
  }
  return out
}

/** The text of a node as the page shows it, with styled runs (offsets into the text). */
function textRuns(root) {
  const parts = []
  const walk = (n, deco) => {
    if (n.nodeType === 3) {
      const cs = getComputedStyle(n.parentElement)
      const pre = /^pre/.test(cs.whiteSpace)
      parts.push({
        text: pre ? n.data : n.data.replace(/\s+/g, ' '),
        el: n.parentElement,
        cs,
        deco,
      })
      return
    }
    if (n.nodeType !== 1) return
    if (n.tagName === 'BR') {
      parts.push({ text: '\n', el: n, cs: getComputedStyle(n), deco })
      return
    }
    const cs = getComputedStyle(n)
    if (!visible(n, cs)) return
    const line = cs.textDecorationLine
    const d = {
      underline: deco.underline || line.includes('underline'),
      strike: deco.strike || line.includes('line-through'),
    }
    for (const c of n.childNodes) walk(c, d)
  }
  walk(root, { underline: false, strike: false })
  // Collapse spaces between parts and trim the ends, keeping offsets right.
  let text = ''
  const runs = []
  for (const p of parts) {
    let t = p.text
    if (text.endsWith(' ') || text.endsWith('\n') || !text) t = t.replace(/^ +/, '')
    if (!t) continue
    runs.push({ start: text.length, end: text.length + t.length, ...p })
    text += t
  }
  const trimmed = text.replace(/\s+$/, '')
  for (const r of runs) r.end = Math.min(r.end, trimmed.length)
  return { text: trimmed, runs: runs.filter((r) => r.end > r.start) }
}

/** Text painted by its background (bg-clip: text, a shimmer): the gradient's first solid colour. */
function clipTextColor(run, el, _cs) {
  for (let e = el, i = 0; e && i < 3; e = e.parentElement, i++) {
    const c = getComputedStyle(e)
    if (!/text/.test(c.backgroundClip || c.webkitBackgroundClip || '')) continue
    const first = topSplit(c.backgroundImage.replace(/^[a-z-]+\(|\)$/g, ''))
      .map((x) => COLOR_RE.exec(x)?.[1])
      .find((x) => x && rgba(x))
    return first ? run.paint(first, e, 'text') : null
  }
  return null
}

function textSpec(run, el, runsOf, box, cs, opts = {}) {
  const { text, runs } = runsOf
  const f = fontOf(cs)
  const size = px(cs.fontSize)
  const lh = lineHeightOf(cs)
  const ls = cs.letterSpacing === 'normal' ? 0 : px(cs.letterSpacing)
  const upper = cs.textTransform === 'uppercase'
  const base = {
    family: f.family,
    size,
    weight: f.weight,
    lineHeight: r2(lh),
    letterSpacing: ls,
    upper,
  }
  const spec = {
    type: 'TEXT',
    name: text.slice(0, 40).replace(/\s+/g, ' '),
    text,
    fill: run.paint(cs.color, el, 'text') ?? clipTextColor(run, el, cs) ?? '#000000',
  }
  const style = run.textStyle(base)
  if (style) spec.textStyle = style
  else
    Object.assign(spec, {
      family: f.family,
      size,
      weight: f.weight,
      lineHeight: r2(lh),
      letterSpacing: ls || undefined,
      upper: upper || undefined,
    })
  if (cs.textAlign === 'center') spec.textAlign = 'center'
  else if (cs.textAlign === 'right' || cs.textAlign === 'end') spec.textAlign = 'right'

  // Runs that differ from the base look.
  const out = []
  for (const r of runs) {
    const rf = fontOf(r.cs)
    const d = {}
    if (rf.weight !== f.weight) d.weight = rf.weight
    if (rf.family !== f.family) d.family = rf.family
    if (Math.abs(px(r.cs.fontSize) - size) > 0.01) d.size = px(r.cs.fontSize)
    const c = rgba(r.cs.color)
    if (c && !same(c, rgba(cs.color) ?? c)) d.fill = run.paint(r.cs.color, r.el, 'text')
    if (r.deco.underline) d.underline = true
    if (r.deco.strike) d.strike = true
    if (Object.keys(d).length) out.push({ start: r.start, end: r.end, ...d })
  }
  if (out.length) spec.runs = out
  if (opts.underline) spec.underline = true

  // Width: one line that fits hugs; wrapped or cut text keeps the measured width.
  const lines = Math.max(1, Math.round(box.h / lh))
  const clamp = cs.webkitLineClamp && cs.webkitLineClamp !== 'none' ? Number(cs.webkitLineClamp) : 0
  const cut = el.scrollWidth > el.clientWidth + 0.5 || el.scrollHeight > el.clientHeight + 0.5
  const ellipsis = cs.textOverflow === 'ellipsis' && /nowrap/.test(cs.whiteSpace) && cut
  if (ellipsis || (clamp && cut)) {
    spec.w = r2(box.w)
    spec.maxLines = clamp || 1
  } else if (lines > 1 || opts.fixed) spec.w = r2(box.w + 1)
  else spec.w = 'hug'
  return spec
}

/** The box text occupies: line boxes, not glyph boxes (Figma's text box is lines × line height). */
function textBox(node, cs) {
  const range = document.createRange()
  range.selectNodeContents(node)
  const rects = [...range.getClientRects()].filter((r) => r.width > 0 && r.height > 0)
  if (!rects.length) return null
  const lh = lineHeightOf(cs)
  const tops = []
  for (const r of rects) if (!tops.some((t) => Math.abs(t - r.top) < lh / 2)) tops.push(r.top)
  const left = Math.min(...rects.map((r) => r.left))
  const right = Math.max(...rects.map((r) => r.right))
  const first = rects[0]
  const top = first.top - (lh - first.height) / 2
  return { x: left, y: top, w: right - left, h: tops.length * lh }
}

// ---------------------------------------------------------------------------------------------
// Layout: a row or column with even gaps that lands every child where the page has it.

function inferLayout(frame, cs, items) {
  const flow = items.filter((i) => !i.out)
  if (!flow.length) return null
  const flex = /flex/.test(cs.display)
  const cssDir = flex && cs.flexDirection.startsWith('row') ? 'row' : 'col'
  for (const dir of [cssDir, cssDir === 'row' ? 'col' : 'row']) {
    const l = tryLayout(frame, cs, flow, dir, flex)
    if (l) return l
  }
  return null
}

function tryLayout(frame, cs, flow, dir, flex) {
  const [p, ps] = dir === 'row' ? ['x', 'w'] : ['y', 'h']
  const [c, cz] = dir === 'row' ? ['y', 'h'] : ['x', 'w']
  // Figma lays children out in layer order: the page's order must already be the visual one.
  for (let i = 1; i < flow.length; i++)
    if (flow[i].box[p] < flow[i - 1].box[p] + flow[i - 1].box[ps] - 0.75) return null
  const gaps = []
  for (let i = 1; i < flow.length; i++)
    gaps.push(flow[i].box[p] - (flow[i - 1].box[p] + flow[i - 1].box[ps]))
  const gap = gaps.length ? gaps.reduce((a, b) => a + b, 0) / gaps.length : 0
  if (gaps.some((g) => Math.abs(g - gap) > 0.75)) return null
  // What the CSS asks for on each side (padding + border), per axis.
  const side = (name) => px(cs[`padding${name}`]) + px(cs[`border${name}Width`])
  const [cssPs, cssPe, cssCs, cssCe] =
    dir === 'row'
      ? [side('Left'), side('Right'), side('Top'), side('Bottom')]
      : [side('Top'), side('Bottom'), side('Left'), side('Right')]
  const first = flow[0].box
  const last = flow[flow.length - 1].box
  const aStart = first[p] - frame[p]
  const aEnd = frame[p] + frame[ps] - (last[p] + last[ps])
  if (aStart < -0.5 || aEnd < -0.5) return null

  // Main axis: the CSS justify when it lands the children where they are, else start.
  const cssJ = flex ? cs.justifyContent : 'normal'
  let justify = 'start'
  let padStart = aStart
  let padEnd = Math.min(cssPe, aEnd)
  if (/space-between/.test(cssJ) && flow.length > 1) {
    justify = 'between'
    padEnd = aEnd
  } else if (/center/.test(cssJ)) {
    justify = 'center'
    const d = aStart - aEnd
    if (Math.abs(cssPs - cssPe - d) <= 0.75) [padStart, padEnd] = [cssPs, cssPe]
    else [padStart, padEnd] = [Math.max(0, d), Math.max(0, -d)]
  } else if (/end/.test(cssJ) && !/space/.test(cssJ)) {
    justify = 'end'
    padEnd = aEnd
    padStart = Math.min(cssPs, aStart)
  }

  // Cross axis: all at the start, the end, or centred (a constant start − end difference).
  const offs = flow.map((i) => [i.box[c] - frame[c], frame[c] + frame[cz] - (i.box[c] + i.box[cz])])
  const near = (vals) => vals.every((v) => Math.abs(v - vals[0]) <= 0.75)
  const cssAlign = flex ? cs.alignItems : 'normal'
  const startOk = near(offs.map((o) => o[0]))
  const endOk = near(offs.map((o) => o[1]))
  const centerOk = near(offs.map((o) => o[0] - o[1]))
  let align
  if (centerOk && /center/.test(cssAlign) && (flow.length > 1 || !startOk)) align = 'center'
  else if (startOk) align = 'start'
  else if (endOk) align = 'end'
  else if (centerOk) align = 'center'
  else return null
  let crossStart
  let crossEnd
  const minEnd = Math.min(...offs.map((o) => o[1]))
  const minStart = Math.min(...offs.map((o) => o[0]))
  if (align === 'start') {
    crossStart = offs[0][0]
    crossEnd = Math.max(0, Math.min(cssCe, minEnd))
  } else if (align === 'end') {
    crossEnd = offs[0][1]
    crossStart = Math.max(0, Math.min(cssCs, minStart))
  } else {
    const d = offs[0][0] - offs[0][1]
    if (Math.abs(cssCs - cssCe - d) <= 0.75) [crossStart, crossEnd] = [cssCs, cssCe]
    else [crossStart, crossEnd] = [Math.max(0, d), Math.max(0, -d)]
  }
  if (crossStart < -0.5) return null
  const k = (n) => (Math.abs(n - Math.round(n)) < 0.05 ? Math.round(n) : r2(n))
  const ps0 = k(Math.max(0, padStart))
  const pe0 = k(Math.max(0, padEnd))
  const pad =
    dir === 'row'
      ? [k(Math.max(0, crossStart)), pe0, k(Math.max(0, crossEnd)), ps0]
      : [ps0, k(Math.max(0, crossEnd)), pe0, k(Math.max(0, crossStart))]
  const crossInner = frame[cz] - crossStart - crossEnd
  return { layout: dir, gap: k(Math.max(0, gap)), pad, align, justify, crossInner, dir }
}

// ---------------------------------------------------------------------------------------------
// Elements → items {spec, box, out, z}.

function nameOf(el) {
  const label = el.getAttribute?.('aria-label') ?? el.getAttribute?.('title')
  const slot = el.dataset?.slot
  const role = el.getAttribute?.('role')
  const tag = el.tagName.toLowerCase()
  const base =
    slot ??
    role ??
    (/^(button|a|input|textarea|nav|header|aside|main|section|ul|li|label|form|dialog)$/.test(tag)
      ? tag
      : 'frame')
  if (label) return `${base} · ${label.slice(0, 40)}`
  if (/button|link|tab|menuitem|option/.test(base)) {
    const t = el.textContent.trim().replace(/\s+/g, ' ').slice(0, 32)
    if (t) return `${base} · ${t}`
  }
  return base
}

const outOfFlow = (cs) => cs.position === 'absolute' || cs.position === 'fixed'
const zOf = (cs) => (cs.zIndex === 'auto' ? 0 : Number(cs.zIndex) || 0)

async function convert(run, el, clip) {
  const cs = getComputedStyle(el)
  if (!visible(el, cs)) return []
  const tag = el.tagName.toLowerCase()
  if (cs.display === 'contents') return kidsOf(run, el, cs, clip)
  const box = rectOf(el.getBoundingClientRect())
  const out = outOfFlow(cs)
  const z = zOf(cs)
  if (box.w < 0.5 || box.h < 0.5) {
    // Zero boxes can still hold visible absolute children (menus anchored to a point).
    return cs.overflow === 'visible' ? kidsOf(run, el, cs, clip) : []
  }
  if (clip && !meets(box, clip)) return []
  if (tag === 'svg') {
    run.count++
    return [
      {
        spec: {
          ...svgItem(run, el, cs, box),
          opacity: Number(cs.opacity) < 1 ? r2(Number(cs.opacity)) : undefined,
        },
        box,
        out,
        z,
      },
    ]
  }
  if (tag === 'img' || tag === 'canvas' || tag === 'video') {
    const s = looks(run, el, cs, box)
    const src = tag === 'img' ? el.currentSrc || el.src : null
    let data = null
    if (tag === 'canvas') {
      try {
        data = el.toDataURL('image/png').split(',')[1]
      } catch {}
    } else if (src) data = await imageData(src, el, box)
    const fit = cs.objectFit === 'contain' ? 'fit' : 'fill'
    run.count++
    return [
      {
        spec: {
          type: 'RECTANGLE',
          name: tag === 'img' ? el.alt || 'image' : tag,
          w: r2(box.w),
          h: r2(box.h),
          ...s,
          clip: undefined,
          fill: data ? { image: data, scale: fit } : (s.fill ?? '#e5e5e5'),
        },
        box,
        out,
        z,
      },
    ]
  }
  if (tag === 'input' || tag === 'textarea' || tag === 'select')
    return [field(run, el, cs, box, out, z)]

  const s = looks(run, el, cs, box)
  const childClip = s.clip ? box : clip

  // Text-only elements become one text layer (inside a frame when they draw a box).
  if (isTextLeaf(el)) {
    const t = textRuns(el)
    if (t.text) {
      let tb = textBox(el, cs) ?? box
      // A block of text: its content box is exactly its line boxes (no glyph guessing).
      const top = box.y + px(cs.borderTopWidth) + px(cs.paddingTop)
      const height =
        box.h -
        px(cs.borderTopWidth) -
        px(cs.paddingTop) -
        px(cs.paddingBottom) -
        px(cs.borderBottomWidth)
      if (/^(block|list-item|inline-block)$/.test(cs.display)) {
        // Lines from the top; a <button> centres its content in its height by itself.
        const lh = lineHeightOf(cs)
        const h = Math.max(1, Math.round(height / lh - 0.25)) * lh
        const lines = Math.min(h, height)
        tb = {
          ...tb,
          y:
            el.tagName === 'BUTTON'
              ? top + (height - Math.max(1, Math.round(tb.h / lh)) * lh) / 2
              : top,
          h: el.tagName === 'BUTTON' ? Math.max(1, Math.round(tb.h / lh)) * lh : lines,
        }
      } else if (/flex|grid/.test(cs.display)) {
        const lines = Math.max(1, Math.round(tb.h / lineHeightOf(cs)))
        const h = lines * lineHeightOf(cs)
        const column = /flex/.test(cs.display) && cs.flexDirection.startsWith('column')
        const how = column
          ? cs.justifyContent
          : /grid/.test(cs.display)
            ? `${cs.alignContent} ${cs.alignItems}`
            : cs.alignItems
        const y = /center/.test(how)
          ? top + (height - h) / 2
          : /end/.test(how)
            ? top + height - h
            : top
        tb = { ...tb, y, h }
      }
      const padded =
        px(cs.paddingLeft) + px(cs.paddingRight) + px(cs.paddingTop) + px(cs.paddingBottom) > 0
      const blockWide = !INLINE.test(cs.display) && !/flex|grid/.test(cs.display)
      const ellipsis = cs.textOverflow === 'ellipsis' && el.scrollWidth > el.clientWidth + 0.5
      const tbox = ellipsis
        ? {
            ...tb,
            x: box.x + px(cs.paddingLeft) + px(cs.borderLeftWidth),
            w:
              box.w -
              px(cs.paddingLeft) -
              px(cs.paddingRight) -
              px(cs.borderLeftWidth) -
              px(cs.borderRightWidth),
          }
        : tb
      const multiline = tb.h > lineHeightOf(cs) * 1.5
      const fixed = multiline && blockWide && cs.textAlign !== 'left' && cs.textAlign !== 'start'
      const textBoxW = fixed
        ? {
            ...tbox,
            x: box.x + px(cs.paddingLeft) + px(cs.borderLeftWidth),
            w:
              box.w -
              px(cs.paddingLeft) -
              px(cs.paddingRight) -
              px(cs.borderLeftWidth) -
              px(cs.borderRightWidth),
          }
        : tbox
      const text = {
        spec: textSpec(run, el, t, textBoxW, cs, { fixed }),
        box: textBoxW,
        out: false,
        z: 0,
      }
      const marks = highlights(run, el)
      run.count++
      if (!draws(s) && !padded && s.opacity === undefined) {
        // The element is only its text: the text takes the element's place (marks behind it).
        return [...marks, { ...text, out, z }]
      }
      return [frameItem(run, el, cs, box, s, [...marks, text], out, z)]
    }
  }

  const items = await kidsOf(run, el, cs, childClip)
  items.push(...pseudoItems(run, el, box))
  // A list item's marker is not in the DOM.
  if (cs.display === 'list-item' && cs.listStyleType !== 'none') {
    const marker = listMarker(run, el, cs, box)
    if (marker) items.unshift(marker)
  }
  if (!items.length && !draws(s)) return []
  const keep = draws(s) || s.clip || s.opacity !== undefined
  if (!keep) {
    // Only structure: keep it as a frame when it is a clean row or column, else pass the children up.
    const layout = items.filter((i) => !i.out).length >= 2 ? inferLayout(box, cs, items) : null
    if (!layout) return items.map((i) => (out ? { ...i, out: true, z: Math.max(i.z, z) } : i))
    return [frameItem(run, el, cs, box, s, items, out, z, layout)]
  }
  return [frameItem(run, el, cs, box, s, items, out, z)]
}

async function kidsOf(run, el, cs, clip) {
  const items = []
  for (const n of el.childNodes) {
    if (n.nodeType === 3) {
      if (!n.data.trim()) continue
      const tb = textBox(n, cs)
      if (!tb || (clip && !meets(tb, clip))) continue
      const t = textRuns(n)
      if (!t.text) continue
      // Loose text in a box with other children: its own text layer.
      const fake = { text: t.text, runs: t.runs.map((r) => ({ ...r, cs, el })) }
      items.push({ spec: textSpec(run, el, fake, tb, cs), box: tb, out: false, z: 0 })
      run.count++
    } else if (n.nodeType === 1) items.push(...(await convert(run, n, clip)))
  }
  // Positioned layers above the others, as the page stacks them.
  return items
    .map((it, i) => ({ it, i }))
    .sort((a, b) => a.it.z - b.it.z || a.i - b.i)
    .map((x) => x.it)
}

function listMarker(run, el, cs, box) {
  const ordered = /decimal|alpha|roman/.test(cs.listStyleType)
  const index = ordered
    ? [...el.parentElement.children].filter((c) => c.tagName === 'LI').indexOf(el) + 1
    : 0
  const text = ordered ? `${index}.` : '•'
  const lh = lineHeightOf(cs)
  const size = px(cs.fontSize)
  const w = ordered ? size * 1.2 : size * 0.6
  const mbox = { x: box.x - w - size * 0.45, y: box.y + px(cs.paddingTop), w, h: lh }
  return {
    spec: { ...textSpec(run, el, { text, runs: [] }, mbox, cs), w: 'hug', name: 'marker' },
    box: mbox,
    out: true,
    z: 0,
  }
}

function field(run, el, cs, box, out, z) {
  const s = looks(run, el, cs, box)
  const tag = el.tagName.toLowerCase()
  const type = (el.getAttribute('type') ?? 'text').toLowerCase()
  if (type === 'checkbox' || type === 'radio') {
    const native = cs.appearance !== 'none'
    const spec = native
      ? {
          type: 'FRAME',
          name: type,
          w: r2(box.w),
          h: r2(box.h),
          radius: type === 'radio' ? box.w / 2 : 3,
          fill: el.checked
            ? run.paint(cs.accentColor !== 'auto' ? cs.accentColor : '#2563eb', el, 'bg')
            : '#ffffff',
          stroke: el.checked ? null : '#767676',
          strokeWidth: 1,
        }
      : {
          type: 'FRAME',
          name: type,
          w: r2(box.w),
          h: r2(box.h),
          ...s,
          fill: s.fill ?? null,
          children: pseudoItems(run, el, box).map((it) => ({
            ...it.spec,
            x: r2(it.box.x - box.x),
            y: r2(it.box.y - box.y),
          })),
        }
    run.count++
    return { spec, box, out, z }
  }
  const value = tag === 'select' ? (el.selectedOptions?.[0]?.textContent ?? '') : el.value
  const placeholder = !value && el.getAttribute('placeholder')
  const text = value || placeholder || ''
  const children = []
  if (text) {
    const pcs = placeholder ? getComputedStyle(el, '::placeholder') : cs
    const lh = lineHeightOf(cs)
    const left = box.x + px(cs.borderLeftWidth) + px(cs.paddingLeft)
    const width =
      box.w -
      px(cs.borderLeftWidth) -
      px(cs.paddingLeft) -
      px(cs.paddingRight) -
      px(cs.borderRightWidth)
    const top =
      tag === 'textarea'
        ? box.y + px(cs.borderTopWidth) + px(cs.paddingTop)
        : box.y + (box.h - lh) / 2
    const lines = tag === 'textarea' ? Math.max(1, text.split('\n').length) : 1
    const tb = { x: left, y: top, w: width, h: lh * lines }
    const spec = textSpec(run, el, { text, runs: [] }, tb, cs, { fixed: true })
    spec.fill = run.paint(pcs.color, el, 'text') ?? spec.fill
    if (tag !== 'textarea') spec.maxLines = 1
    children.push({ spec, box: tb, out: false, z: 0 })
  }
  return frameItem(run, el, cs, box, s, children, out, z)
}

function frameItem(run, el, cs, box, s, items, out, z, known) {
  run.count++
  const layout = known ?? inferLayout(box, cs, items)
  const spec = {
    type: 'FRAME',
    name: nameOf(el),
    w: r2(box.w),
    h: r2(box.h),
    fill: s.fill ?? null,
    ...s,
  }
  if (s.dashed) delete spec.dashed
  const children = []
  if (layout) {
    spec.layout = layout.layout
    spec.gap = layout.gap
    spec.pad = layout.pad
    spec.align = layout.align
    if (layout.justify !== 'start') spec.justify = layout.justify
    const [ps, cz] = layout.dir === 'row' ? ['w', 'h'] : ['h', 'w']
    for (const it of items) {
      const c = { ...it.spec }
      if (it.out) {
        c.absolute = true
        c.x = r2(it.box.x - box.x)
        c.y = r2(it.box.y - box.y)
      } else {
        // Frames and wrapped text that span the cross axis fill it.
        const spans = Math.abs(it.box[cz] - layout.crossInner) < 0.75
        const text = c.type === 'TEXT'
        if (
          spans &&
          c.type !== 'INSTANCE' &&
          c.type !== 'SVG' &&
          (!text || (c.w !== 'hug' && cz === 'w'))
        ) {
          if (cz === 'w') c.w = 'fill'
          else c.h = 'fill'
        }
        void ps
      }
      children.push(c)
    }
  } else
    for (const it of items)
      children.push({ ...it.spec, x: r2(it.box.x - box.x), y: r2(it.box.y - box.y) })
  spec.children = children
  return { spec, box, out, z }
}

// ---------------------------------------------------------------------------------------------
// Public.

async function settle() {
  await document.fonts?.ready
  // Entering dialogs and menus: jump to their end (a background tab may never play them).
  for (const a of document.getAnimations?.() ?? [])
    if (Number.isFinite(a.effect?.getComputedTiming?.().endTime))
      try {
        a.finish()
      } catch {
        // Some cannot finish (a scroll timeline): leave them.
      }
  await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 30)))
}

/**
 * The layer spec of what `root` (default: the whole window) shows now. Options: key, name,
 * width/height (default the window), root.
 */
export async function capture({ key, name, root = document.body } = {}) {
  const info = await file()
  await settle()
  const run = new Run(info)
  const w = window.innerWidth
  const h = window.innerHeight
  const view = { x: 0, y: 0, w, h }
  const items = await kidsOf(run, root, getComputedStyle(root), view)
  const rootCs = getComputedStyle(root)
  const bg = rgba(rootCs.backgroundColor)
    ? rootCs.backgroundColor
    : getComputedStyle(document.documentElement).backgroundColor
  const fake = {
    ...frameItem(
      run,
      root,
      rootCs,
      view,
      { fill: run.paint(bg, root, 'bg') ?? '#ffffff', clip: true },
      items,
      false,
      0,
      null,
    ),
  }
  const spec = { ...fake.spec, key, name: name ?? document.title, type: 'FRAME' }
  return { spec, layers: run.count }
}

/** Capture and push: a top-level frame `key` on `page`, at x/y (kept where it is when omitted). */
export async function push({ key, name, page = 'Screens', x, y, root } = {}) {
  if (!key) throw new Error('push needs a key (the same key updates the same frame)')
  const t0 = performance.now()
  const { spec, layers } = await capture({ key, name, root })
  if (x !== undefined) spec.x = x
  if (y !== undefined) spec.y = y
  const json = JSON.stringify(spec)
  const r = await job('build', { page, nodes: [spec], show: false }, `capture ${key}`)
  return {
    key,
    id: r.nodes[0]?.id,
    layers,
    kb: Math.round(json.length / 1024),
    made: r.made,
    updated: r.updated,
    ms: Math.round(performance.now() - t0),
  }
}

/** For debugging a capture from the console. */
export const internals = { inferLayout, convert, kidsOf, Run, file, textBox }
