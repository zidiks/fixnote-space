// Figma Bridge, the part that runs inside Figma. It reads layers and exports pictures through the
// Plugin API (no REST, no rate limits) for jobs the bridge on localhost hands to the plugin window
// (ui.html does the networking; this side has no network access).

figma.showUI(__html__, { width: 320, height: 420, themeColors: true })

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
  if (msg.type === 'storage-get') {
    figma.ui.postMessage({ type: 'storage', value: await figma.clientStorage.getAsync(msg.key) })
  }
  if (msg.type === 'storage-set') await figma.clientStorage.setAsync(msg.key, msg.value)
}

figma.on('selectionchange', () => {
  figma.ui.postMessage({ type: 'selection', count: figma.currentPage.selection.length })
})
