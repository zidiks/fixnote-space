// Figma Bridge, the part that runs inside Figma. It reads layers and exports pictures, and it writes:
// variables, styles, frames with auto layout, text, components, component sets and instances, all
// through the Plugin API (no REST, no rate limits), for jobs the bridge on localhost hands to the
// plugin window (ui.html does the networking; this side has no network access).

// A small strip by default; the window grows only when its details are opened (ui.html asks).
// `reload` runs this file again inside the running plugin to take in a newer version: the window
// stays, the newer code's message handler and jobs take over.
const RELOADING = typeof __fxReloading !== 'undefined'
if (!RELOADING) figma.showUI(__html__, { width: 260, height: 36, themeColors: true })

const MIXED = 'mixed'
const mixed = (v) => (v === figma.mixed ? MIXED : v)

/** Paint without Figma's internal noise; image fills keep their hash and crop. */
function paint(p) {
  const out = {
    type: p.type,
    visible: p.visible !== false,
    opacity: p.opacity,
    blendMode: p.blendMode,
  }
  if (p.type === 'SOLID') out.color = p.color
  if (p.type.startsWith('GRADIENT_')) {
    out.gradientStops = p.gradientStops
    out.gradientTransform = p.gradientTransform
  }
  if (p.type === 'IMAGE') {
    out.imageHash = p.imageHash
    out.scaleMode = p.scaleMode
    out.imageTransform = p.imageTransform
    out.scalingFactor = p.scalingFactor
    out.rotation = p.rotation
    out.filters = p.filters
  }
  return out
}
const paints = (v) => (v === figma.mixed ? MIXED : Array.isArray(v) ? v.map(paint) : undefined)

const PICK = [
  'visible',
  'locked',
  'opacity',
  'blendMode',
  'isMask',
  'rotation',
  'x',
  'y',
  'width',
  'height',
  'absoluteBoundingBox',
  'absoluteRenderBounds',
  'relativeTransform',
  'constraints',
  'clipsContent',
  'cornerRadius',
  'topLeftRadius',
  'topRightRadius',
  'bottomLeftRadius',
  'bottomRightRadius',
  'cornerSmoothing',
  'strokeWeight',
  'strokeAlign',
  'strokeCap',
  'strokeJoin',
  'dashPattern',
  'strokeTopWeight',
  'strokeRightWeight',
  'strokeBottomWeight',
  'strokeLeftWeight',
  'layoutMode',
  'layoutWrap',
  'primaryAxisAlignItems',
  'counterAxisAlignItems',
  'primaryAxisSizingMode',
  'counterAxisSizingMode',
  'itemSpacing',
  'counterAxisSpacing',
  'itemReverseZIndex',
  'paddingLeft',
  'paddingRight',
  'paddingTop',
  'paddingBottom',
  'layoutAlign',
  'layoutGrow',
  'layoutPositioning',
  'layoutSizingHorizontal',
  'layoutSizingVertical',
  'minWidth',
  'maxWidth',
  'minHeight',
  'maxHeight',
  'characters',
  'fontSize',
  'fontName',
  'fontWeight',
  'letterSpacing',
  'lineHeight',
  'paragraphSpacing',
  'textAlignHorizontal',
  'textAlignVertical',
  'textAutoResize',
  'textCase',
  'textDecoration',
  'textTruncation',
  'arcData',
  'pointCount',
  'innerRadius',
  'booleanOperation',
]

/** One layer as plain JSON (`depth` levels of children; Infinity for all). */
async function serialize(node, depth) {
  const out = { id: node.id, name: node.name, type: node.type }
  for (const key of PICK) {
    if (!(key in node)) continue
    const v = node[key]
    if (v !== undefined && typeof v !== 'function') out[key] = mixed(v)
  }
  if ('fills' in node) out.fills = paints(node.fills)
  if ('strokes' in node) out.strokes = paints(node.strokes)
  if ('effects' in node) out.effects = node.effects
  if ('fillStyleId' in node && node.fillStyleId && node.fillStyleId !== figma.mixed) {
    const style = await figma.getStyleByIdAsync(node.fillStyleId)
    if (style) out.fillStyle = style.name
  }
  if (node.type === 'TEXT') {
    // Mixed styles in one text: each run with its own font, size, colour.
    out.segments = node
      .getStyledTextSegments([
        'fontName',
        'fontSize',
        'fontWeight',
        'letterSpacing',
        'lineHeight',
        'fills',
        'textDecoration',
        'textCase',
      ])
      .map((s) => ({ ...s, fills: paints(s.fills) }))
  }
  if (node.type === 'INSTANCE') {
    const main = await node.getMainComponentAsync()
    if (main) out.mainComponent = { id: main.id, name: main.name }
  }
  if ('children' in node) {
    out.childCount = node.children.length
    if (depth > 0)
      out.children = await Promise.all(node.children.map((c) => serialize(c, depth - 1)))
  }
  return out
}

/** A compact outline: id, type, name, size, the text, nesting. */
function outline(node, depth, level = 0, lines = []) {
  const b = node.absoluteBoundingBox
  const size = b ? ` ${Math.round(b.width)}×${Math.round(b.height)}` : ''
  const text = node.type === 'TEXT' ? `  “${node.characters.slice(0, 60).replace(/\n/g, ' ')}”` : ''
  const hidden = node.visible === false ? '  (hidden)' : ''
  lines.push(`${'  '.repeat(level)}${node.id}  ${node.type}  ${node.name}${size}${text}${hidden}`)
  if ('children' in node && level < depth)
    for (const c of node.children) outline(c, depth, level + 1, lines)
  return lines
}

async function nodesById(ids) {
  if (!ids?.length) return figma.currentPage.selection.slice()
  const found = []
  for (const id of ids) {
    const node = await figma.getNodeByIdAsync(id)
    if (!node) throw new Error(`No layer ${id} in this file`)
    found.push(node)
  }
  return found
}

function imageType(bytes) {
  if (bytes[0] === 0x89 && bytes[1] === 0x50) return 'png'
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return 'jpg'
  if (bytes[0] === 0x47 && bytes[1] === 0x49) return 'gif'
  if (bytes[8] === 0x57 && bytes[9] === 0x45) return 'webp'
  return 'bin'
}

const slug = (s) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40) || 'layer'
const base = (node) => `${node.id.replace(/[:;]/g, '-')}-${slug(node.name)}`

const jobs = {
  async info() {
    return {
      file: figma.root.name,
      page: { id: figma.currentPage.id, name: figma.currentPage.name },
      selection: figma.currentPage.selection.map((n) => ({ id: n.id, name: n.name, type: n.type })),
    }
  },

  async tree({ ids, depth = 2 }) {
    const lines = []
    for (const node of await nodesById(ids)) outline(node, depth, 0, lines)
    return { text: lines.join('\n') }
  },

  async nodes({ ids, depth }) {
    const nodes = await nodesById(ids)
    const files = []
    for (const node of nodes) {
      const data = await serialize(node, depth === undefined ? Number.POSITIVE_INFINITY : depth)
      files.push({ name: `${base(node)}.json`, text: JSON.stringify(data, null, 2) })
    }
    return { files }
  },

  async render({ ids, format = 'PNG', scale = 2 }) {
    const files = []
    for (const node of await nodesById(ids)) {
      const f = format.toUpperCase()
      const settings =
        f === 'SVG' || f === 'PDF'
          ? { format: f }
          : { format: f, constraint: { type: 'SCALE', value: scale } }
      const bytes = await node.exportAsync(settings)
      const suffix = f === 'SVG' || f === 'PDF' ? '' : `@${scale}x`
      files.push({ name: `${base(node)}${suffix}.${f.toLowerCase()}`, bytes })
    }
    return { files }
  },

  async originals({ ids }) {
    const seen = new Map()
    for (const root of await nodesById(ids)) {
      const visit = (n) => {
        if ('fills' in n && Array.isArray(n.fills)) {
          for (const p of n.fills)
            if (p.type === 'IMAGE' && p.imageHash && !seen.has(p.imageHash))
              seen.set(p.imageHash, n)
        }
        if ('children' in n) n.children.forEach(visit)
      }
      visit(root)
    }
    if (!seen.size) throw new Error('No photos (image fills) in these layers; try render instead')
    const files = []
    for (const [hash, node] of seen) {
      const image = figma.getImageByHash(hash)
      if (!image) continue
      const bytes = await image.getBytesAsync()
      files.push({ name: `${base(node)}.${imageType(bytes)}`, bytes })
    }
    return { files }
  },

  async find({ query, limit = 50 }) {
    await figma.currentPage.loadAsync()
    const q = String(query).toLowerCase()
    const hits = figma.currentPage
      .findAll(
        (n) =>
          n.name.toLowerCase().includes(q) ||
          (n.type === 'TEXT' && n.characters.toLowerCase().includes(q)),
      )
      .slice(0, limit)
    return {
      text:
        hits.map((n) => `${n.id}  ${n.type}  ${n.name}`).join('\n') ||
        'Nothing found on this page.',
    }
  },
}

// ---------------------------------------------------------------------------------------------
// Writing: declarative specs become real layers (frames with auto layout, text, components,
// component sets, instances, vectors), bound to variables and styles. Every layer made here keeps a
// key in its plugin data, so pushing the same spec again updates the layers in place: node ids stay
// the same, instances elsewhere keep pointing at their components and keep their overrides.

const KEY = 'fxkey'
const KIND = 'fx:type'
const SVG_HASH = 'fx:svg'
const INDEX = 'fx:index'
const CAN_NEST = ['FRAME', 'COMPONENT']

function readIndex() {
  try {
    return JSON.parse(figma.root.getPluginData(INDEX) || '{}')
  } catch {
    return {}
  }
}

/** Variables and styles of this file by name, plus what one write job collects on the way. */
async function context() {
  const collections = await figma.variables.getLocalVariableCollectionsAsync()
  const colName = new Map(collections.map((c) => [c.id, c.name]))
  const vars = new Map()
  // Shorter collection names first: "FixNote Colors" wins over "FixNote Colors (Dark)".
  const list = (await figma.variables.getLocalVariablesAsync()).sort(
    (a, b) =>
      (colName.get(a.variableCollectionId) ?? '').length -
      (colName.get(b.variableCollectionId) ?? '').length,
  )
  const byId = new Map(list.map((v) => [v.id, v]))
  for (const v of list) {
    vars.set(`${colName.get(v.variableCollectionId)}:${v.name}`, v)
    if (!vars.has(v.name)) vars.set(v.name, v)
  }
  const text = new Map((await figma.getLocalTextStylesAsync()).map((s) => [s.name, s]))
  const effect = new Map((await figma.getLocalEffectStylesAsync()).map((s) => [s.name, s]))
  return {
    index: readIndex(),
    vars,
    text,
    effect,
    fonts: new Set(),
    props: new Map(),
    binds: [],
    centers: [],
    made: 0,
    updated: 0,
    variable(name) {
      const full = String(name).replace(/^\$/, '')
      // "Collection:name"; a file without that collection (a Dark one) falls back to the name.
      const v = vars.get(full) ?? vars.get(full.slice(full.indexOf(':') + 1))
      if (!v) throw new Error(`No variable ${name} in this file (push the variables first)`)
      return v
    },
    /**
     * The variable's colour in its collection's first mode (aliases followed). Figma keeps the
     * paint's own colour when a layer gets the same binding again, so it must be the real one.
     */
    colorOf(v, depth = 0) {
      const val = Object.values(v.valuesByMode)[0]
      if (val && val.type === 'VARIABLE_ALIAS' && depth < 10) {
        const target = byId.get(val.id)
        return target ? this.colorOf(target, depth + 1) : { r: 0, g: 0, b: 0, a: 1 }
      }
      return val && typeof val.r === 'number' ? val : { r: 0, g: 0, b: 0, a: 1 }
    },
  }
}

async function font(ctx, f) {
  const k = `${f.family}/${f.style}`
  if (ctx.fonts.has(k)) return
  await figma.loadFontAsync(f)
  ctx.fonts.add(k)
}

/** The font if this computer has it, else Inter in the same style, else Inter Regular. */
async function usableFont(ctx, f) {
  for (const c of [f, { family: 'Inter', style: f.style }, { family: 'Inter', style: 'Regular' }])
    try {
      await font(ctx, c)
      return c
    } catch {
      // Not installed (or no such style): try the next one.
    }
  throw new Error(`No font ${f.family} ${f.style}`)
}

/** #rgb, #rrggbb, #rrggbbaa or {r,g,b,a} (0..1). */
function parseColor(s) {
  if (s && typeof s === 'object') return { r: s.r, g: s.g, b: s.b, a: s.a ?? 1 }
  const m = /^#?([0-9a-f]{3,8})$/i.exec(String(s).trim())
  if (!m) throw new Error(`Not a colour: ${s}`)
  let h = m[1]
  if (h.length <= 4) h = [...h].map((c) => c + c).join('')
  const n = (i) => Number.parseInt(h.slice(i, i + 2), 16) / 255
  return { r: n(0), g: n(2), b: n(4), a: h.length === 8 ? n(6) : 1 }
}

/**
 * '$primary', '#fff', {var, opacity}, {color, opacity}, {image: base64, scale: FILL|FIT|CROP|TILE},
 * or a raw Figma Paint (has `type`).
 */
function toPaint(ctx, spec) {
  if (spec && typeof spec === 'object' && spec.type) return spec
  if (spec && typeof spec === 'object' && spec.image) {
    const image = figma.createImage(figma.base64Decode(spec.image))
    return {
      type: 'IMAGE',
      imageHash: image.hash,
      scaleMode: String(spec.scale ?? 'fill').toUpperCase(),
      opacity: spec.opacity ?? 1,
    }
  }
  const s =
    typeof spec === 'string' ? (spec.startsWith('$') ? { var: spec } : { color: spec }) : spec
  const opacity = s.opacity ?? 1
  if (s.var) {
    const v = ctx.variable(s.var)
    const { r, g, b } = ctx.colorOf(v)
    const base = { type: 'SOLID', color: { r, g, b }, opacity }
    return figma.variables.setBoundVariableForPaint(base, 'color', v)
  }
  const c = parseColor(s.color)
  return { type: 'SOLID', color: { r: c.r, g: c.g, b: c.b }, opacity: c.a * opacity }
}
/**
 * Paints onto a layer. Figma resets a variable-bound paint's opacity to 1 when it is assigned; a
 * second assignment of the now-bound paints keeps it, so `bg-brand/10` stays 10 %.
 */
function setPaints(node, field, paints) {
  node[field] = paints
  if (paints.some((p) => (p.opacity ?? 1) !== 1 && p.boundVariables?.color))
    node[field] = node[field].map((p, i) => ({ ...p, opacity: paints[i]?.opacity ?? 1 }))
}

const toPaints = (ctx, v) =>
  v == null || v === false ? [] : (Array.isArray(v) ? v : [v]).map((p) => toPaint(ctx, p))

/** A number, or '$name' to bind the field to a FLOAT variable. */
function setNum(ctx, node, field, value) {
  if (value === undefined || !(field in node)) return
  if (typeof value === 'string' && value.startsWith('$')) {
    node.setBoundVariable(field, ctx.variable(value))
    return
  }
  if (node.boundVariables?.[field]) node.setBoundVariable(field, null)
  node[field] = value
}

/** n | [vertical, horizontal] | [top, right, bottom, left] */
function sides(v) {
  if (v === undefined) return [0, 0, 0, 0]
  if (!Array.isArray(v)) return [v, v, v, v]
  if (v.length === 2) return [v[0], v[1], v[0], v[1]]
  if (v.length === 3) return [v[0], v[1], v[2], v[1]]
  return v
}

const ALIGN = {
  start: 'MIN',
  center: 'CENTER',
  end: 'MAX',
  baseline: 'BASELINE',
  between: 'SPACE_BETWEEN',
}
const CONSTRAINT = {
  start: 'MIN',
  end: 'MAX',
  center: 'CENTER',
  stretch: 'STRETCH',
  scale: 'SCALE',
}

function setLayout(ctx, node, s) {
  if (!('layoutMode' in node)) return
  const mode = s.layout === 'row' ? 'HORIZONTAL' : s.layout === 'col' ? 'VERTICAL' : 'NONE'
  node.layoutMode = mode
  if (mode === 'NONE') return
  node.layoutWrap = s.wrap && mode === 'HORIZONTAL' ? 'WRAP' : 'NO_WRAP'
  setNum(ctx, node, 'itemSpacing', s.gap ?? 0)
  if (node.layoutWrap === 'WRAP') setNum(ctx, node, 'counterAxisSpacing', s.rowGap ?? s.gap ?? 0)
  const [t, r, b, l] = sides(s.pad)
  setNum(ctx, node, 'paddingTop', t)
  setNum(ctx, node, 'paddingRight', r)
  setNum(ctx, node, 'paddingBottom', b)
  setNum(ctx, node, 'paddingLeft', l)
  node.primaryAxisAlignItems = ALIGN[s.justify ?? 'start'] ?? 'MIN'
  node.counterAxisAlignItems = (s.align && s.align !== 'between' && ALIGN[s.align]) || 'MIN'
  node.strokesIncludedInLayout = false
}

/** w/h: a number (fixed), 'hug' or 'fill'; auto layout frames and text hug by default. */
function setSize(node, s, parent) {
  const auto = 'layoutMode' in node && node.layoutMode !== 'NONE'
  const inAuto =
    parent &&
    'layoutMode' in parent &&
    parent.layoutMode !== 'NONE' &&
    node.layoutPositioning !== 'ABSOLUTE'
  const hugs = auto || node.type === 'TEXT'
  const w = s.w ?? (hugs && node.type !== 'INSTANCE' ? 'hug' : undefined)
  const h = s.h ?? (hugs && node.type !== 'INSTANCE' ? 'hug' : undefined)
  if ((typeof w === 'number' || typeof h === 'number') && 'resize' in node) {
    const nw = typeof w === 'number' ? w : node.width
    const nh = typeof h === 'number' ? h : node.height
    node.resize(Math.max(nw, 0.01), Math.max(nh, 0.01))
    // A fixed width keeps the text wrapping and growing downwards.
    if (node.type === 'TEXT' && typeof h !== 'number') node.textAutoResize = 'HEIGHT'
  }
  for (const [dim, v] of [
    ['layoutSizingHorizontal', w],
    ['layoutSizingVertical', h],
  ]) {
    if (!(dim in node) || v === undefined) continue
    try {
      if (v === 'fill') {
        if (inAuto) node[dim] = 'FILL'
      } else if (v === 'hug') {
        if (hugs) node[dim] = 'HUG'
      } else if (inAuto || auto) node[dim] = 'FIXED'
    } catch {
      // A combination Figma refuses (e.g. hug inside a wrapping row): the size above stays.
    }
  }
  for (const [field, v] of [
    ['minWidth', s.minW],
    ['maxWidth', s.maxW],
    ['minHeight', s.minH],
    ['maxHeight', s.maxH],
  ]) {
    if (!(field in node) || (v === undefined && node[field] === null)) continue
    try {
      node[field] = v ?? null
    } catch {
      // Only auto layout frames and their children have min/max sizes.
    }
  }
}

function setRadius(ctx, node, r) {
  if (!('topLeftRadius' in node)) return
  const [tl, tr, br, bl] = Array.isArray(r) ? r : [r ?? 0, r ?? 0, r ?? 0, r ?? 0]
  setNum(ctx, node, 'topLeftRadius', tl)
  setNum(ctx, node, 'topRightRadius', tr)
  setNum(ctx, node, 'bottomRightRadius', br)
  setNum(ctx, node, 'bottomLeftRadius', bl)
}

function setStroke(ctx, node, s) {
  if (!('strokes' in node)) return
  setPaints(node, 'strokes', toPaints(ctx, s.stroke))
  if (!s.stroke) return
  node.strokeAlign = String(s.strokeAlign ?? 'inside').toUpperCase()
  const w = s.strokeWidth ?? 1
  if (Array.isArray(w) && 'strokeTopWeight' in node) {
    const [t, r, b, l] = sides(w)
    node.strokeTopWeight = t
    node.strokeRightWeight = r
    node.strokeBottomWeight = b
    node.strokeLeftWeight = l
  } else setNum(ctx, node, 'strokeWeight', Array.isArray(w) ? w[0] : w)
}

/** {type: DROP_SHADOW|INNER_SHADOW|LAYER_BLUR|BACKGROUND_BLUR, x, y, blur, spread, color} */
function toEffect(ctx, e) {
  const type = e.type ?? 'DROP_SHADOW'
  if (type.endsWith('BLUR')) return { type, radius: e.blur ?? 0, visible: true }
  const bound = typeof e.color === 'string' && e.color.startsWith('$')
  const c = bound
    ? ctx.colorOf(ctx.variable(e.color))
    : e.color
      ? parseColor(e.color)
      : { r: 0, g: 0, b: 0, a: 0.1 }
  // Fields bound to a variable start at 0; the binding below sets them.
  const n = (v) => (typeof v === 'number' ? v : 0)
  let out = {
    type,
    color: c,
    offset: { x: n(e.x), y: n(e.y) },
    radius: n(e.blur),
    spread: n(e.spread),
    visible: true,
    blendMode: 'NORMAL',
  }
  if (type === 'DROP_SHADOW') out.showShadowBehindNode = false
  if (bound) out = figma.variables.setBoundVariableForEffect(out, 'color', ctx.variable(e.color))
  for (const [field, v] of [
    ['offsetX', e.x],
    ['offsetY', e.y],
    ['radius', e.blur],
    ['spread', e.spread],
  ])
    if (typeof v === 'string' && v.startsWith('$'))
      out = figma.variables.setBoundVariableForEffect(out, field, ctx.variable(v))
  // Binding a variable resets the numbers (spread comes back 0): put them back.
  return { ...out, offset: { x: n(e.x), y: n(e.y) }, radius: n(e.blur), spread: n(e.spread) }
}

/** A style name ('shadow/float') or a list of effects. */
async function setEffects(ctx, node, v) {
  if (!('effects' in node)) return
  if (typeof v === 'string') {
    const style = ctx.effect.get(v)
    if (!style) throw new Error(`No effect style ${v} (push the styles first)`)
    await node.setEffectStyleIdAsync(style.id)
    return
  }
  if (node.effectStyleId) await node.setEffectStyleIdAsync('')
  node.effects = (v ?? []).map((e) => toEffect(ctx, e))
}

const lineHeight = (v) =>
  v === undefined || v === 'auto'
    ? { unit: 'AUTO' }
    : typeof v === 'number'
      ? { unit: 'PIXELS', value: v }
      : { unit: 'PERCENT', value: Number.parseFloat(v) }
const letterSpacing = (v) =>
  v === undefined
    ? { unit: 'PERCENT', value: 0 }
    : typeof v === 'number'
      ? { unit: 'PIXELS', value: v }
      : { unit: 'PERCENT', value: Number.parseFloat(v) }

async function applyText(ctx, node, s) {
  // Figma wants the fonts already on the layer loaded before anything about it changes.
  if (node.characters.length)
    for (const f of node.getRangeAllFontNames(0, node.characters.length)) await font(ctx, f)
  else if (node.fontName !== figma.mixed) await font(ctx, node.fontName)
  const named = s.textStyle ? ctx.text.get(s.textStyle) : null
  if (s.textStyle && !named) throw new Error(`No text style ${s.textStyle} (push the styles first)`)
  // On a styled layer Figma writes a decoration into the style itself (every text using it would be
  // underlined), so underlined text copies the style's values instead of using it.
  const style = s.underline ? null : named
  const f = named
    ? named.fontName
    : await usableFont(ctx, { family: s.family ?? 'Inter', style: s.weight ?? 'Regular' })
  await font(ctx, f)
  node.characters = String(s.text ?? '')
  if (style) await node.setTextStyleIdAsync(style.id)
  else {
    if (node.textStyleId) await node.setTextStyleIdAsync('')
    node.fontName = f
    node.fontSize = named ? named.fontSize : (s.size ?? 14)
    node.lineHeight = named ? named.lineHeight : lineHeight(s.lineHeight)
    node.letterSpacing = named ? named.letterSpacing : letterSpacing(s.letterSpacing)
    node.textCase = named ? named.textCase : s.upper ? 'UPPER' : 'ORIGINAL'
  }
  node.textAlignHorizontal = String(s.textAlign ?? 'left').toUpperCase()
  if (!style) node.textDecoration = s.underline ? 'UNDERLINE' : 'NONE'
  if (node.fillStyleId) await node.setFillStyleIdAsync('')
  setPaints(node, 'fills', toPaints(ctx, s.fill ?? '#000000'))
  await applyRuns(ctx, node, s.runs, f)
}

/**
 * Parts of one text that look different (bold, a link, code): runs [{start, end, weight, family,
 * size, fill, underline, strike}], offsets into `text`; what a run leaves out stays as the base.
 */
async function applyRuns(ctx, node, runs, base) {
  const length = node.characters.length
  for (const r of runs ?? []) {
    const start = Math.max(0, r.start)
    const end = Math.min(length, r.end)
    if (end <= start) continue
    if (r.weight || r.family) {
      const f = await usableFont(ctx, {
        family: r.family ?? base.family,
        style: r.weight ?? base.style,
      })
      node.setRangeFontName(start, end, f)
    }
    if (r.size) node.setRangeFontSize(start, end, r.size)
    if (r.fill) {
      const paints = toPaints(ctx, r.fill)
      node.setRangeFills(start, end, paints)
      // Same as setPaints: a bound colour comes back opaque the first time.
      if (paints.some((p) => (p.opacity ?? 1) !== 1 && p.boundVariables?.color))
        node.setRangeFills(
          start,
          end,
          node
            .getRangeFills(start, end)
            .map((p, i) => ({ ...p, opacity: paints[i]?.opacity ?? 1 })),
        )
    }
    if (r.underline || r.strike)
      node.setRangeTextDecoration(start, end, r.strike ? 'STRIKETHROUGH' : 'UNDERLINE')
  }
}

/**
 * After the size: a text that hugs grows sideways (a layer pushed before with a fixed width keeps
 * that mode otherwise), a fixed width wraps downwards; the cut and the line clamp come last, since
 * Figma resets them when the resize mode changes.
 */
function textSizing(node, s) {
  const hug = s.w === undefined || s.w === 'hug'
  if (hug && !s.maxLines) {
    if (node.layoutSizingHorizontal !== 'FILL') node.textAutoResize = 'WIDTH_AND_HEIGHT'
  } else if (typeof s.h !== 'number') node.textAutoResize = 'HEIGHT'
  node.textTruncation = s.truncate || s.maxLines ? 'ENDING' : 'DISABLED'
  try {
    node.maxLines = s.maxLines ?? null
  } catch {
    // Older Figma versions have no line clamp.
  }
}

/** Strokes and fills of every vector inside (icons drawn from SVG, or an instance of one). */
function paintVectors(node, p) {
  const walk = (n) => {
    if ('strokes' in n && n.type !== 'FRAME' && n.type !== 'INSTANCE' && n.type !== 'COMPONENT') {
      // Each vector keeps its own opacity (a spinner's faint ring).
      if (n.strokes.length) setPaints(n, 'strokes', [{ ...p, opacity: n.strokes[0].opacity ?? 1 }])
      if (n.fills.length) setPaints(n, 'fills', [{ ...p, opacity: n.fills[0].opacity ?? 1 }])
    }
    if ('children' in n) n.children.forEach(walk)
  }
  walk(node)
}

function hash(s) {
  let h = 5381
  for (let i = 0; i < s.length; i++) h = (h * 33) ^ s.charCodeAt(i)
  return (h >>> 0).toString(36)
}

async function findKeyed(ctx, key) {
  const id = ctx.index[key]
  if (!id) return null
  const n = await figma.getNodeByIdAsync(id)
  return n && !n.removed && n.getPluginData(KEY) === key ? n : null
}

/** `of`: the key (or node id) of a component or component set; `variant` picks one of a set. */
async function componentFor(ctx, s) {
  const n = (await findKeyed(ctx, s.of)) ?? (await figma.getNodeByIdAsync(s.of).catch(() => null))
  if (!n) throw new Error(`No component ${s.of} (push it before the layers that use it)`)
  if (n.type === 'COMPONENT') return n
  if (n.type !== 'COMPONENT_SET') throw new Error(`${s.of} is a ${n.type}, not a component`)
  if (!s.variant) return n.defaultVariant
  const hit = n.children.find((c) =>
    Object.entries(s.variant).every(([k, v]) => c.variantProperties?.[k] === String(v)),
  )
  if (!hit) throw new Error(`${s.of} has no variant ${JSON.stringify(s.variant)}`)
  return hit
}

/** {swap: 'icon/plus'} → the id of that component, for INSTANCE_SWAP properties. */
async function swapTarget(ctx, v) {
  const n =
    (await findKeyed(ctx, v.swap)) ?? (await figma.getNodeByIdAsync(v.swap).catch(() => null))
  if (n?.type !== 'COMPONENT') throw new Error(`No component ${v.swap} to swap in`)
  return n.id
}

/**
 * Component properties by plain name: `{Label: 'Button', Icon: false, Glyph: {swap: 'icon/plus'}}`
 * (TEXT, BOOLEAN, INSTANCE_SWAP); properties not listed are removed.
 */
async function ensureProps(ctx, node, props = {}) {
  const map = {}
  const want = (v) =>
    typeof v === 'boolean' ? 'BOOLEAN' : v && typeof v === 'object' ? 'INSTANCE_SWAP' : 'TEXT'
  for (const [full, d] of Object.entries(node.componentPropertyDefinitions)) {
    if (d.type === 'VARIANT') continue
    const name = full.split('#')[0]
    if (!(name in props) || want(props[name]) !== d.type) node.deleteComponentProperty(full)
    else map[name] = full
  }
  for (const [name, value] of Object.entries(props)) {
    const v = want(value) === 'INSTANCE_SWAP' ? await swapTarget(ctx, value) : value
    if (map[name]) {
      if (node.componentPropertyDefinitions[map[name]].defaultValue !== v)
        node.editComponentProperty(map[name], { defaultValue: v })
    } else map[name] = node.addComponentProperty(name, want(value), v)
  }
  return map
}

const ownerFor = (node, owner) =>
  node.type === 'COMPONENT' ? (node.parent?.type === 'COMPONENT_SET' ? node.parent : node) : owner

const variantName = (v) =>
  Object.entries(v)
    .map(([k, x]) => `${k}=${x}`)
    .join(', ')

async function create(s) {
  switch (s.type) {
    case 'FRAME':
      return figma.createFrame()
    case 'COMPONENT':
      return figma.createComponent()
    case 'TEXT':
      return figma.createText()
    case 'RECTANGLE':
      return figma.createRectangle()
    case 'ELLIPSE':
      return figma.createEllipse()
    case 'SVG': {
      const n = figma.createNodeFromSvg(s.svg)
      const walk = (x) => {
        if ('constraints' in x) x.constraints = { horizontal: 'SCALE', vertical: 'SCALE' }
        if ('children' in x) x.children.forEach(walk)
      }
      n.children.forEach(walk)
      n.setPluginData(SVG_HASH, hash(s.svg))
      return n
    }
    default:
      throw new Error(`Unknown layer type ${s.type}`)
  }
}

function place(node, parent, index) {
  if (index === undefined) {
    if (node.parent !== parent) parent.appendChild(node)
  } else if (node.parent !== parent || parent.children.indexOf(node) !== index)
    parent.insertChild(index, node)
}

/** One layer: reuse `node` when it fits the spec, else make a new one; then apply the spec. */
async function upsert(ctx, s, key, node, parent, index, owner) {
  if (s.type === 'COMPONENT_SET') return upsertSet(ctx, s, key, node, parent, index)
  if (
    node &&
    (node.getPluginData(KIND) !== s.type ||
      (s.type === 'SVG' && node.getPluginData(SVG_HASH) !== hash(s.svg)))
  ) {
    node.remove()
    node = null
  }
  // A variant made just to start its set counts as new.
  const fresh = !node || node.getPluginData('fx:fresh') === '1'
  if (node) node.setPluginData('fx:fresh', '')
  if (s.type === 'INSTANCE') {
    const main = await componentFor(ctx, s)
    if (!node) node = main.createInstance()
    else if ((await node.getMainComponentAsync())?.id !== main.id) node.swapComponent(main)
  } else if (!node) node = await create(s)
  node.setPluginData(KEY, key)
  node.setPluginData(KIND, s.type)
  if (s.key) ctx.index[s.key] = node.id
  place(node, parent, index)
  await apply(ctx, node, s, parent, owner)
  if (fresh) ctx.made++
  else ctx.updated++
  return node
}

/** A component set: `variants` are component specs with a `variant` object ({size: 'sm'}). */
async function upsertSet(ctx, s, key, set, parent, index) {
  if (set && set.type !== 'COMPONENT_SET') {
    set.remove()
    set = null
  }
  if (!s.variants?.length) throw new Error(`${key}: a component set needs variants`)
  const variants = s.variants.map((v) => {
    const name = variantName(v.variant)
    return { ...v, type: 'COMPONENT', name, key: `${key}/${name}` }
  })
  const fresh = !set
  if (fresh) {
    const first = figma.createComponent()
    first.setPluginData(KEY, variants[0].key)
    first.setPluginData(KIND, 'COMPONENT')
    first.setPluginData('fx:fresh', '1')
    first.name = variants[0].name
    parent.appendChild(first)
    set = figma.combineAsVariants([first], parent)
  }
  set.setPluginData(KEY, key)
  set.setPluginData(KIND, 'COMPONENT_SET')
  if (s.key) ctx.index[s.key] = set.id
  place(set, parent, index)
  set.name = s.name ?? key
  if (s.description !== undefined) set.description = s.description
  await children(ctx, set, variants, set)
  ctx.props.set(set.id, await ensureProps(ctx, set, s.props))
  setLayout(ctx, set, { layout: 'row', wrap: true, gap: 16, pad: 24, ...s })
  setPaints(set, 'fills', toPaints(ctx, s.fill))
  setStroke(ctx, set, s.stroke ? s : { stroke: '#9747ff', strokeWidth: 1 })
  if (!s.stroke) set.dashPattern = [10, 5]
  setRadius(ctx, set, s.radius ?? 5)
  setSize(set, { w: s.w ?? 'hug', h: s.h ?? 'hug' }, parent)
  if (s.x !== undefined) set.x = s.x
  if (s.y !== undefined) set.y = s.y
  if (fresh) ctx.made++
  else ctx.updated++
  return set
}

/** The layer's children become exactly `specs`, matched by key (or type + name), in order. */
async function children(ctx, parent, specs, owner) {
  const old = new Map()
  for (const c of parent.children) {
    const k = c.getPluginData(KEY)
    if (k && !old.has(k)) old.set(k, c)
  }
  const seen = new Map()
  const keep = new Set()
  for (let i = 0; i < specs.length; i++) {
    const s = specs[i]
    let k = s.key ?? `${s.type}:${s.name ?? ''}`
    const n = seen.get(k) ?? 0
    seen.set(k, n + 1)
    if (n) k = `${k}#${n}`
    const node = await upsert(ctx, s, k, old.get(k) ?? null, parent, i, owner)
    keep.add(node)
  }
  for (const c of [...parent.children]) if (!keep.has(c)) c.remove()
}

async function apply(ctx, node, s, parent, owner) {
  const own = node.type !== 'INSTANCE'
  if (s.name !== undefined || own) node.name = s.name ?? s.type.toLowerCase()
  node.visible = !s.hidden
  if ('opacity' in node && (own || s.opacity !== undefined)) node.opacity = s.opacity ?? 1
  if (s.description !== undefined && 'description' in node) node.description = s.description

  if (node.type === 'TEXT') await applyText(ctx, node, s)
  else if ('fills' in node && (own || s.fill !== undefined)) {
    if (node.fillStyleId) await node.setFillStyleIdAsync('')
    setPaints(node, 'fills', toPaints(ctx, s.fill))
  }
  if (own || s.stroke !== undefined) setStroke(ctx, node, s)
  if (own || s.radius !== undefined) setRadius(ctx, node, s.radius)
  if (own || s.effects !== undefined) await setEffects(ctx, node, s.effects)
  if ('clipsContent' in node && (own || s.clip !== undefined)) node.clipsContent = Boolean(s.clip)
  if (own || s.layout !== undefined) setLayout(ctx, node, s)

  // Position: absolute inside an auto layout parent, or plain x/y.
  if (
    'layoutPositioning' in node &&
    parent &&
    'layoutMode' in parent &&
    parent.layoutMode !== 'NONE'
  )
    node.layoutPositioning = s.absolute || s.center ? 'ABSOLUTE' : 'AUTO'
  if (s.x !== undefined) node.x = s.x
  if (s.y !== undefined) node.y = s.y
  if (s.constraints && 'constraints' in node)
    node.constraints = {
      horizontal: CONSTRAINT[s.constraints.h ?? 'start'],
      vertical: CONSTRAINT[s.constraints.v ?? 'start'],
    }
  if (s.center) ctx.centers.push(node)

  setSize(node, s, parent)
  if (node.type === 'TEXT') textSizing(node, s)

  if (node.type === 'INSTANCE') {
    const setProps = async (target, props, what) => {
      const names = Object.keys(target.componentProperties)
      const set = {}
      for (const [name, v] of Object.entries(props)) {
        const full = names.find((k) => k.split('#')[0] === name)
        if (!full) throw new Error(`${what} has no property ${name}`)
        set[full] = v && typeof v === 'object' ? await swapTarget(ctx, v) : v
      }
      target.setProperties(set)
    }
    if (s.props) await setProps(node, s.props, s.of)
    // expose: inside a component, this instance's own properties show on the component's panel.
    if (s.expose !== undefined && owner) node.isExposedInstance = Boolean(s.expose)
    // nested: {Kbd: {Keys: '⌘K'}} sets the properties of an exposed instance inside this one.
    for (const [name, props] of Object.entries(s.nested ?? {})) {
      const inner = node.exposedInstances.find((i) => i.name === name)
      if (!inner) throw new Error(`${s.of} exposes no instance ${name} (mark it expose: true)`)
      await setProps(inner, props, name)
    }
  } else if (node.type === 'COMPONENT' && node.parent?.type !== 'COMPONENT_SET')
    ctx.props.set(node.id, await ensureProps(ctx, node, s.props))

  if (s.color && (node.type === 'INSTANCE' || s.type === 'SVG'))
    paintVectors(node, toPaint(ctx, s.color))
  // keep: leave the children alone (a container other pushes add to).
  if (CAN_NEST.includes(node.type) && s.type !== 'SVG' && !s.keep)
    await children(ctx, node, s.children ?? [], ownerFor(node, owner))

  if (s.bind) ctx.binds.push({ node, bind: s.bind, owner })
  else if (owner && Object.keys(node.componentPropertyReferences ?? {}).length)
    node.componentPropertyReferences = {}
}

/** What has to wait for the whole tree: property references, centred layers, the key index. */
function finish(ctx) {
  for (const { node, bind, owner } of ctx.binds) {
    if (!owner) throw new Error(`${node.name}: "bind" works only inside a component`)
    const map = ctx.props.get(owner.id) ?? {}
    const refs = {}
    for (const [field, name] of Object.entries(bind)) {
      if (!map[name]) throw new Error(`${owner.name} has no property ${name} (add it to "props")`)
      refs[field] = map[name]
    }
    node.componentPropertyReferences = refs
  }
  for (const n of ctx.centers) {
    n.x = Math.round((n.parent.width - n.width) / 2)
    n.y = Math.round((n.parent.height - n.height) / 2)
    n.constraints = { horizontal: 'CENTER', vertical: 'CENTER' }
  }
  figma.root.setPluginData(INDEX, JSON.stringify(ctx.index))
}

async function pageNamed(name) {
  if (!name) return figma.currentPage
  const page = figma.root.children.find((p) => p.name === name) ?? figma.createPage()
  page.name = name
  await page.loadAsync()
  return page
}

async function variableValue(ctx, local, d, val) {
  if (val && typeof val === 'object' && 'alias' in val) {
    const target = local.get(val.alias) ?? ctx.variable(val.alias)
    return figma.variables.createVariableAlias(target)
  }
  if (d.type === 'COLOR') return parseColor(val)
  if (d.type === 'FLOAT') return Number(val)
  if (d.type === 'BOOLEAN') return Boolean(val)
  return String(val)
}

// ---------------------------------------------------------------------------------------------
// Export: layers back into build specs, so a page can be rebuilt in another file (`apply`).
// Variables, text and effect styles go by name; instances of keyed components (the kit) by key;
// vectors as SVG; images as their bytes. What has no spec form becomes the closest thing to it.

const hex6 = (c) =>
  `#${[c.r, c.g, c.b]
    .map((x) =>
      Math.round(x * 255)
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`
const hex8 = (c) =>
  `${hex6(c)}${Math.round((c.a ?? 1) * 255)
    .toString(16)
    .padStart(2, '0')}`
const r3 = (n) => Math.round(n * 1000) / 1000
const VECTORISH = ['VECTOR', 'BOOLEAN_OPERATION', 'STAR', 'LINE', 'POLYGON', 'GROUP']

async function exportContext() {
  const cols = new Map(
    (await figma.variables.getLocalVariableCollectionsAsync()).map((c) => [c.id, c.name]),
  )
  const vars = new Map()
  for (const v of await figma.variables.getLocalVariablesAsync())
    vars.set(v.id, `$${cols.get(v.variableCollectionId)}:${v.name}`)
  const text = new Map((await figma.getLocalTextStylesAsync()).map((s) => [s.id, s.name]))
  const effect = new Map((await figma.getLocalEffectStylesAsync()).map((s) => [s.id, s.name]))
  const images = new Map()
  return {
    varRef: (alias) => (alias?.id ? vars.get(alias.id) : undefined),
    text,
    effect,
    async image(hash) {
      if (!hash) return null
      if (!images.has(hash)) {
        const bytes = await figma.getImageByHash(hash)?.getBytesAsync()
        images.set(hash, bytes ? figma.base64Encode(bytes) : null)
      }
      return images.get(hash)
    },
  }
}

async function paintOut(ec, p) {
  if (!p || p.visible === false) return null
  const opacity = r3(p.opacity ?? 1)
  if (p.type === 'SOLID') {
    const ref = ec.varRef(p.boundVariables?.color)
    if (ref) return opacity === 1 ? ref : { var: ref, opacity }
    return opacity === 1 ? hex6(p.color) : { color: hex6(p.color), opacity }
  }
  if (p.type === 'IMAGE') {
    const data = await ec.image(p.imageHash)
    return data ? { image: data, scale: p.scaleMode, opacity } : null
  }
  if (p.type.startsWith('GRADIENT'))
    return {
      type: p.type,
      gradientTransform: p.gradientTransform,
      gradientStops: p.gradientStops.map((s) => ({ position: s.position, color: s.color })),
      opacity,
    }
  return null
}

async function paintsOut(ec, list) {
  if (!Array.isArray(list)) return null
  const out = []
  for (const p of list) {
    const x = await paintOut(ec, p)
    if (x) out.push(x)
  }
  return out.length ? (out.length === 1 ? out[0] : out) : null
}

const numOut = (ec, node, field) => ec.varRef(node.boundVariables?.[field]) ?? node[field]

function effectsOut(ec, node) {
  if (!('effects' in node)) return undefined
  if (typeof node.effectStyleId === 'string' && ec.effect.has(node.effectStyleId))
    return ec.effect.get(node.effectStyleId)
  const list = node.effects.filter((e) => e.visible !== false)
  if (!list.length) return undefined
  return list.map((e) =>
    e.type.endsWith('BLUR')
      ? { type: e.type, blur: e.radius }
      : {
          type: e.type,
          x: e.offset.x,
          y: e.offset.y,
          blur: e.radius,
          spread: e.spread ?? 0,
          color: ec.varRef(e.boundVariables?.color) ?? hex8(e.color),
        },
  )
}

const SIZE = { FILL: 'fill', HUG: 'hug' }
const ALIGN_OUT = {
  MIN: 'start',
  CENTER: 'center',
  MAX: 'end',
  SPACE_BETWEEN: 'between',
  BASELINE: 'baseline',
}

/** Size and place: numbers outside auto layout, fill/hug/fixed inside it. */
function placeOut(node, spec, parentAuto) {
  const auto = parentAuto && node.layoutPositioning !== 'ABSOLUTE'
  if (!auto) {
    spec.x = r3(node.x)
    spec.y = r3(node.y)
    if (parentAuto) spec.absolute = true
  }
  const h = node.layoutSizingHorizontal
  const v = node.layoutSizingVertical
  spec.w = auto && SIZE[h] ? SIZE[h] : r3(node.width)
  spec.h = auto && SIZE[v] ? SIZE[v] : r3(node.height)
  if (node.type === 'TEXT') {
    if (node.textAutoResize === 'WIDTH_AND_HEIGHT' && spec.w !== 'fill') spec.w = 'hug'
    if (node.textAutoResize !== 'NONE' && spec.h !== 'fill') delete spec.h
  }
  for (const [field, key] of [
    ['minWidth', 'minW'],
    ['maxWidth', 'maxW'],
    ['minHeight', 'minH'],
    ['maxHeight', 'maxH'],
  ])
    if (typeof node[field] === 'number') spec[key] = node[field]
}

async function textOut(ec, node, spec) {
  spec.text = node.characters
  const segs = node.getStyledTextSegments(['fontName', 'fontSize', 'fills', 'textDecoration'])
  const first = segs[0]
  const styled = typeof node.textStyleId === 'string' && ec.text.get(node.textStyleId)
  const font = node.fontName === figma.mixed ? first?.fontName : node.fontName
  const size = node.fontSize === figma.mixed ? first?.fontSize : node.fontSize
  if (styled) spec.textStyle = styled
  else {
    spec.family = font?.family
    spec.weight = font?.style
    spec.size = size
    const lh = node.lineHeight === figma.mixed ? { unit: 'AUTO' } : node.lineHeight
    if (lh.unit === 'PIXELS') spec.lineHeight = lh.value
    else if (lh.unit === 'PERCENT') spec.lineHeight = `${lh.value}%`
    const ls = node.letterSpacing === figma.mixed ? { value: 0 } : node.letterSpacing
    if (ls.value) spec.letterSpacing = ls.unit === 'PIXELS' ? ls.value : `${ls.value}%`
    if (node.textCase === 'UPPER') spec.upper = true
  }
  spec.fill = await paintsOut(ec, node.fills === figma.mixed ? first?.fills : node.fills)
  const align = node.textAlignHorizontal
  if (align === 'CENTER' || align === 'RIGHT') spec.textAlign = align.toLowerCase()
  if (node.textTruncation === 'ENDING') spec.truncate = true
  if (node.maxLines) spec.maxLines = node.maxLines
  // Parts that differ from the first one: weight, family, size, colour, line.
  const runs = []
  for (const seg of segs) {
    const r = { start: seg.start, end: seg.end }
    if (seg.fontName.style !== font?.style) r.weight = seg.fontName.style
    if (seg.fontName.family !== font?.family) r.family = seg.fontName.family
    if (seg.fontSize !== size) r.size = seg.fontSize
    const fill = await paintsOut(ec, seg.fills)
    if (JSON.stringify(fill) !== JSON.stringify(spec.fill)) r.fill = fill
    if (seg.textDecoration === 'UNDERLINE') r.underline = true
    if (seg.textDecoration === 'STRIKETHROUGH') r.strike = true
    if (Object.keys(r).length > 2) runs.push(r)
  }
  if (runs.length) spec.runs = runs
  if (segs.length === 1 && first.textDecoration === 'UNDERLINE' && !styled) {
    spec.underline = true
    delete spec.runs
  }
}

/** The kit key of a component (or of its set, with the variant). */
function componentKey(main) {
  if (!main) return null
  const set = main.parent?.type === 'COMPONENT_SET' ? main.parent : null
  if (set?.getPluginData(KEY)) return { of: set.getPluginData(KEY), set: true }
  if (main.getPluginData(KEY)) return { of: main.getPluginData(KEY) }
  return null
}

async function exportOut(ec, node, parentAuto) {
  if (['SLICE', 'CONNECTOR', 'STICKY', 'WIDGET', 'EMBED', 'LINK_UNFURL'].includes(node.type))
    return null
  const spec = { name: node.name }
  if (!node.visible) spec.hidden = true
  if ('opacity' in node && node.opacity < 1) spec.opacity = r3(node.opacity)

  // Vectors (an icon from SVG, a group of shapes): as SVG markup.
  if (node.getPluginData(KIND) === 'SVG' || VECTORISH.includes(node.type)) {
    // Nothing visible inside (an empty or hidden drawing): Figma will not export it; keep its box.
    const svg = await node.exportAsync({ format: 'SVG_STRING' }).catch(() => null)
    Object.assign(spec, svg ? { type: 'SVG', svg } : { type: 'FRAME', fill: null })
    placeOut(node, spec, parentAuto)
    return spec
  }

  if (node.type === 'INSTANCE') {
    const main = await node.getMainComponentAsync()
    const at = componentKey(main)
    if (at) {
      spec.type = 'INSTANCE'
      spec.of = at.of
      if (at.set) spec.variant = { ...node.variantProperties }
      const props = {}
      for (const [k, v] of Object.entries(node.componentProperties)) {
        if (v.type === 'TEXT' || v.type === 'BOOLEAN') props[k.split('#')[0]] = v.value
        else if (v.type === 'INSTANCE_SWAP') {
          const swap = await figma.getNodeByIdAsync(v.value)
          const key = swap?.getPluginData(KEY)
          if (key) props[k.split('#')[0]] = { swap: key }
        }
      }
      if (Object.keys(props).length) spec.props = props
      // An icon painted another colour: the colour of its first vector.
      if (at.of.startsWith('icon/')) {
        const v = node.findOne(
          (n) => 'strokes' in n && n.type !== 'FRAME' && (n.strokes.length || n.fills.length),
        )
        const p = v && (v.strokes[0] ?? v.fills[0])
        if (p) spec.color = await paintOut(ec, { ...p, opacity: 1 })
      }
      placeOut(node, spec, parentAuto)
      return spec
    }
    // A component the other file will not have: its layers as a frame.
  }

  if (node.type === 'TEXT') {
    spec.type = 'TEXT'
    await textOut(ec, node, spec)
    placeOut(node, spec, parentAuto)
    return spec
  }

  spec.type =
    node.type === 'RECTANGLE' ? 'RECTANGLE' : node.type === 'ELLIPSE' ? 'ELLIPSE' : 'FRAME'
  if ('fills' in node) spec.fill = (await paintsOut(ec, node.fills)) ?? null
  if ('strokes' in node && node.strokes.length) {
    spec.stroke = await paintsOut(ec, node.strokes)
    spec.strokeAlign = String(node.strokeAlign).toLowerCase()
    spec.strokeWidth =
      node.strokeWeight === figma.mixed
        ? [
            node.strokeTopWeight,
            node.strokeRightWeight,
            node.strokeBottomWeight,
            node.strokeLeftWeight,
          ]
        : numOut(ec, node, 'strokeWeight')
  }
  if ('topLeftRadius' in node) {
    const r = ['topLeftRadius', 'topRightRadius', 'bottomRightRadius', 'bottomLeftRadius'].map(
      (f) => numOut(ec, node, f),
    )
    if (r.some((x) => x)) spec.radius = r.every((x) => x === r[0]) ? r[0] : r
  }
  const fx = effectsOut(ec, node)
  if (fx) spec.effects = fx
  if ('clipsContent' in node && node.clipsContent) spec.clip = true
  const auto = 'layoutMode' in node && node.layoutMode !== 'NONE'
  if (auto) {
    spec.layout = node.layoutMode === 'HORIZONTAL' ? 'row' : 'col'
    spec.gap = numOut(ec, node, 'itemSpacing')
    if (node.layoutWrap === 'WRAP') {
      spec.wrap = true
      spec.rowGap = numOut(ec, node, 'counterAxisSpacing')
    }
    spec.pad = ['paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft'].map((f) =>
      numOut(ec, node, f),
    )
    spec.justify = ALIGN_OUT[node.primaryAxisAlignItems] ?? 'start'
    spec.align = ALIGN_OUT[node.counterAxisAlignItems] ?? 'start'
  }
  placeOut(node, spec, parentAuto)
  if ('children' in node) {
    spec.children = []
    for (const c of node.children) {
      const x = await exportOut(ec, c, auto)
      if (x) spec.children.push(x)
    }
  }
  return spec
}

Object.assign(jobs, {
  /** Upsert one variable collection: its modes and variables by name. */
  async variables({ collection, modes = ['Value'], variables = [], prune = false }) {
    if (!collection) throw new Error('Which collection? Pass "collection"')
    const ctx = await context()
    const all = await figma.variables.getLocalVariableCollectionsAsync()
    const col =
      all.find((c) => c.name === collection) ?? figma.variables.createVariableCollection(collection)
    const notes = []
    if (!col.modes.some((m) => m.name === modes[0])) col.renameMode(col.modes[0].modeId, modes[0])
    const modeIds = {}
    for (const m of modes) {
      let mode = col.modes.find((x) => x.name === m)
      if (!mode) {
        try {
          col.addMode(m)
        } catch (e) {
          notes.push(`Mode ${m} not added: ${e?.message ?? e}`)
          continue
        }
        mode = col.modes.find((x) => x.name === m)
      }
      modeIds[m] = mode.modeId
    }
    const local = new Map()
    for (const id of col.variableIds) {
      const v = await figma.variables.getVariableByIdAsync(id)
      if (v) local.set(v.name, v)
    }
    let made = 0
    for (const d of variables) {
      let v = local.get(d.name)
      if (v && v.resolvedType !== d.type) {
        v.remove()
        v = null
      }
      if (!v) {
        v = figma.variables.createVariable(d.name, col, d.type)
        made++
      }
      local.set(d.name, v)
      if (d.description !== undefined) v.description = d.description
      if (d.scopes) v.scopes = d.scopes
      if (d.code) v.setVariableCodeSyntax('WEB', d.code)
    }
    // Values after every variable exists: aliases may point forward.
    for (const d of variables) {
      const v = local.get(d.name)
      const values = d.values ?? Object.fromEntries(Object.keys(modeIds).map((m) => [m, d.value]))
      for (const [m, val] of Object.entries(values)) {
        if (!modeIds[m] || val === undefined) continue
        v.setValueForMode(modeIds[m], await variableValue(ctx, local, d, val))
      }
    }
    let removed = 0
    if (prune) {
      const keep = new Set(variables.map((d) => d.name))
      for (const [name, v] of local)
        if (!keep.has(name)) {
          v.remove()
          removed++
        }
    }
    return {
      collection: col.name,
      id: col.id,
      modes: Object.keys(modeIds),
      made,
      updated: variables.length - made,
      removed,
      notes,
    }
  },

  /** Upsert text styles and effect styles by name. */
  async styles({ text = [], effect = [] }) {
    const ctx = await context()
    for (const t of text) {
      const st = ctx.text.get(t.name) ?? figma.createTextStyle()
      const f = { family: t.family ?? 'Inter', style: t.weight ?? 'Regular' }
      await font(ctx, f)
      st.name = t.name
      st.fontName = f
      st.fontSize = t.size ?? 14
      st.lineHeight = lineHeight(t.lineHeight)
      st.letterSpacing = letterSpacing(t.letterSpacing)
      st.textCase = t.upper ? 'UPPER' : 'ORIGINAL'
      st.textDecoration = t.underline ? 'UNDERLINE' : 'NONE'
      if (t.description !== undefined) st.description = t.description
    }
    for (const e of effect) {
      const st = ctx.effect.get(e.name) ?? figma.createEffectStyle()
      st.name = e.name
      st.effects = (e.effects ?? []).map((x) => toEffect(ctx, x))
      if (e.description !== undefined) st.description = e.description
    }
    return { text: text.length, effect: effect.length }
  },

  /** Make sure a page exists (and optionally show it). */
  async page({ name, show = false }) {
    const page = await pageNamed(name)
    if (show) await figma.setCurrentPageAsync(page)
    return { id: page.id, name: page.name }
  },

  /** Create or update layers from specs; top-level specs need a `key`. */
  async build({ page, parent, nodes = [], show = true }) {
    const ctx = await context()
    let target = await pageNamed(page)
    if (parent) {
      target = (await findKeyed(ctx, parent)) ?? (await figma.getNodeByIdAsync(parent))
      if (!target || !('appendChild' in target)) throw new Error(`No parent ${parent}`)
    }
    const out = []
    const made = []
    try {
      for (const s of nodes) {
        if (!s.key) throw new Error(`Top-level layers need a "key" (${s.name ?? s.type})`)
        const old = await findKeyed(ctx, s.key)
        const node = await upsert(ctx, s, s.key, old, target, undefined, null)
        out.push({ key: s.key, id: node.id, type: node.type, name: node.name })
        made.push(node)
      }
      finish(ctx)
    } finally {
      // Even after an error: what was made keeps its key, so the next push reuses it.
      figma.root.setPluginData(INDEX, JSON.stringify(ctx.index))
    }
    if (show && made.length) {
      const pageOf = (n) => (n.type === 'PAGE' ? n : pageOf(n.parent))
      await figma.setCurrentPageAsync(pageOf(made[0]))
      figma.viewport.scrollAndZoomIntoView(made)
    }
    return { made: ctx.made, updated: ctx.updated, nodes: out }
  },

  /** Layers this bridge made, by key. */
  /**
   * Layers as build specs (see exportOut): without `ids`, the list of a page's top-level layers to
   * ask for one by one (a page can be too big for one answer).
   */
  async export({ page, ids }) {
    const target = page ? figma.root.children.find((p) => p.name === page) : figma.currentPage
    if (!target) throw new Error(`No page ${page}`)
    await target.loadAsync()
    if (!ids?.length)
      return {
        page: target.name,
        top: target.children.map((n) => ({ id: n.id, name: n.name, type: n.type })),
      }
    const ec = await exportContext()
    const nodes = []
    for (const id of ids) {
      const n = await figma.getNodeByIdAsync(id)
      if (!n) continue
      const spec = await exportOut(ec, n, false)
      if (!spec) continue
      spec.key = n.getPluginData(KEY) || `export/${n.id}`
      nodes.push(spec)
    }
    return { nodes }
  },

  async keys() {
    const index = readIndex()
    const rows = []
    for (const [key, id] of Object.entries(index)) {
      const n = await figma.getNodeByIdAsync(id)
      if (n && !n.removed && n.getPluginData(KEY) === key)
        rows.push(`${key}  ${n.id}  ${n.type}  ${n.name}`)
    }
    return { text: rows.join('\n') || 'Nothing pushed to this file yet.' }
  },

  async remove({ keys = [], ids = [] }) {
    const ctx = await context()
    let removed = 0
    for (const k of keys) {
      const n = await findKeyed(ctx, k)
      delete ctx.index[k]
      if (n) {
        n.remove()
        removed++
      }
    }
    for (const id of ids) {
      const n = await figma.getNodeByIdAsync(id)
      if (n && n.type !== 'PAGE' && n.type !== 'DOCUMENT') {
        n.remove()
        removed++
      }
    }
    figma.root.setPluginData(INDEX, JSON.stringify(ctx.index))
    return { removed }
  },

  /** Select layers (by key or id) and bring them into view. */
  async show({ keys = [], ids = [] }) {
    const ctx = await context()
    const nodes = []
    for (const k of keys) {
      const n = await findKeyed(ctx, k)
      if (n) nodes.push(n)
    }
    for (const id of ids) {
      const n = await figma.getNodeByIdAsync(id)
      if (n) nodes.push(n)
    }
    if (!nodes.length) throw new Error('Nothing to show')
    const pageOf = (n) => (n.type === 'PAGE' ? n : pageOf(n.parent))
    await figma.setCurrentPageAsync(pageOf(nodes[0]))
    figma.currentPage.selection = nodes.filter((n) => pageOf(n) === figma.currentPage)
    figma.viewport.scrollAndZoomIntoView(figma.currentPage.selection)
    return { shown: figma.currentPage.selection.length }
  },

  /** Run Plugin API code: `figma` is in scope, top-level await works, `return` gives the result. */
  async script({ code }) {
    const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor
    let fn
    try {
      fn = new AsyncFunction('figma', String(code))
    } catch (e) {
      throw new Error(`Script not run: ${e?.message ?? e}`)
    }
    const value = await fn(figma)
    return { value: value === undefined ? null : JSON.parse(JSON.stringify(value)) }
  },

  /** Take in a newer code.js without restarting the plugin (the bridge sends it when it changes). */
  async reload({ code }) {
    const fresh = new Function('figma', '__html__', '__fxReloading', `${code}\nreturn jobs`)(
      figma,
      __html__,
      true,
    )
    Object.assign(jobs, fresh)
    return { jobs: Object.keys(fresh).length }
  },
})

// Every load, the first or a `reload`, answers with its own jobs: a reloaded file takes the window
// over (assigning into the jobs of the first load reaches only that load's object, so a second
// reload would otherwise run against the first reload's code).
figma.ui.onmessage = async (msg) => {
  if (msg.type === 'job') {
    const { id, kind, params } = msg.job
    try {
      const run = jobs[kind]
      if (!run) throw new Error(`Unknown job ${kind}`)
      figma.ui.postMessage({ type: 'done', id, result: await run(params || {}) })
    } catch (e) {
      figma.ui.postMessage({ type: 'done', id, error: String(e?.message ? e.message : e) })
    }
  }
  if (msg.type === 'push') {
    // "Send selection": the selected layers as JSON plus a 2x picture of each, into the inbox.
    try {
      const ids = figma.currentPage.selection.map((n) => n.id)
      if (!ids.length) throw new Error('Select one or more layers first')
      const a = await jobs.nodes({ ids })
      const b = await jobs.render({ ids, format: 'PNG', scale: 2 })
      figma.ui.postMessage({ type: 'pushed', result: { files: [...a.files, ...b.files] } })
    } catch (e) {
      figma.ui.postMessage({ type: 'pushed', error: String(e?.message ? e.message : e) })
    }
  }
  if (msg.type === 'resize') figma.ui.resize(msg.width, msg.height)
  if (msg.type === 'storage-get') {
    figma.ui.postMessage({ type: 'storage', value: await figma.clientStorage.getAsync(msg.key) })
  }
  if (msg.type === 'storage-set') await figma.clientStorage.setAsync(msg.key, msg.value)
}

if (!RELOADING)
  figma.on('selectionchange', () => {
    figma.ui.postMessage({ type: 'selection', count: figma.currentPage.selection.length })
  })
