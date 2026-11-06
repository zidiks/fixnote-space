/**
 * The FixNote UI kit for Figma, built from the repository each time it is pushed:
 *
 * - colours from packages/ui/src/styles.css (`:root` = Light, `.dark` = Dark; `var(--x)` stays an
 *   alias), radii from `--radius`, the shadows `shadow-xs` and `--shadow-float`;
 * - icons from lucide-react as the app has it installed (the same paths, stroke 1.75);
 * - components measured from their Tailwind classes: Button (`buttonVariants`), Input, Badge, Kbd,
 *   Dialog (packages/ui/src/components), the note card and the column snippet (NoteCard.tsx) and
 *   the sidebar (Sidebar.tsx, SidebarFolders.tsx); labels come from @fixnote/i18n's English locale.
 *
 * Every layer has a key, so pushing again updates the same variables, styles and components. When
 * a component's classes change in the app, change its spec below in the same way.
 */
import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

/** The repository: the nearest folder up from here with packages/ui (copies in dist/ work too). */
const REPO = (() => {
  let dir = dirname(fileURLToPath(import.meta.url))
  for (let i = 0; i < 8; i++) {
    if (existsSync(join(dir, 'packages/ui/src/styles.css'))) return dir
    dir = resolve(dir, '..')
  }
  return resolve(dirname(fileURLToPath(import.meta.url)), '../..')
})()
const STYLES = join(REPO, 'packages/ui/src/styles.css')
const COLORS = 'FixNote Theme'
const SIZES = 'FixNote Size'
const ROOT = 'kit'

export const KIT_PARTS = [
  'tokens',
  'icons',
  'button',
  'controls',
  'dialog',
  'notes',
  'sidebar',
  'screens',
]

// ---------------------------------------------------------------------------------------------
// Tokens.

/** OKLCH (CSS) to sRGB 0..1, clipped to the gamut. */
function oklchToRgb(L, C, H) {
  const h = (H * Math.PI) / 180
  const a = C * Math.cos(h)
  const b = C * Math.sin(h)
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3
  const lin = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ]
  return lin.map((x) => {
    const v = x <= 0.0031308 ? 12.92 * x : 1.055 * Math.abs(x) ** (1 / 2.4) - 0.055
    return Math.min(1, Math.max(0, v))
  })
}

const hex2 = (x) =>
  Math.round(x * 255)
    .toString(16)
    .padStart(2, '0')

/** 'oklch(0.66 0.19 45)' or 'oklch(0 0 0 / 0.04)' → '#rrggbb' or '#rrggbbaa'. */
function cssColor(value) {
  const m = /oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*(?:\/\s*([\d.]+))?\s*\)/.exec(value)
  if (!m) return null
  const [r, g, b] = oklchToRgb(Number(m[1]), Number(m[2]), Number(m[3]))
  const a = m[4] === undefined ? 1 : Number(m[4])
  return `#${hex2(r)}${hex2(g)}${hex2(b)}${a < 1 ? hex2(a) : ''}`
}

function declarations(css, selector) {
  const at = css.indexOf(`${selector} {`)
  if (at < 0) throw new Error(`No ${selector} block in ${STYLES}`)
  const body = css.slice(at, css.indexOf('}', at))
  const out = {}
  for (const m of body.matchAll(/--([\w-]+)\s*:\s*([^;]+);/g)) out[m[1]] = m[2].trim()
  return out
}

/** `0 1px 2px oklch(…), 0 8px 24px -6px oklch(…)` → [{x, y, blur, spread, color}] */
function cssShadow(value) {
  return value.split(/,(?![^(]*\))/).map((part) => {
    const color = cssColor(part)
    const nums = part
      .replace(/oklch\([^)]*\)/, '')
      .trim()
      .split(/\s+/)
      .map((n) => Number.parseFloat(n))
    const [x = 0, y = 0, blur = 0, spread = 0] = nums
    return { x, y, blur, spread, color }
  })
}

const rem = (v) => Number.parseFloat(v) * (String(v).endsWith('rem') ? 16 : 1)

/** Spacing steps the components use (Tailwind 4: 0.25rem each), in px. */
const SPACE = [2, 4, 6, 8, 10, 12, 16, 20, 24]
/** Colours with an alpha that effects need (effects cannot take a paint opacity). */
const ALPHA = [
  ['ring', 50],
  ['ring', 40],
  ['ring', 30],
  ['brand', 40],
]

export function readTokens() {
  if (!existsSync(STYLES)) throw new Error(`Not in the FixNote repository: ${STYLES} is missing`)
  const css = readFileSync(STYLES, 'utf8')
  const light = declarations(css, ':root')
  const dark = declarations(css, '.dark')
  const colors = []
  for (const [name, value] of Object.entries(light)) {
    if (name === 'radius' || name.startsWith('shadow')) continue
    const read = (v) => {
      const alias = /^var\(--([\w-]+)\)$/.exec(v ?? '')
      return alias ? { alias: alias[1] } : cssColor(v ?? '')
    }
    const l = read(value)
    if (!l) continue
    colors.push({ name, light: l, dark: read(dark[name]) ?? l })
  }
  const byName = new Map(colors.map((c) => [c.name, c]))
  const resolveColor = (name, mode) => {
    const v = byName.get(name)?.[mode]
    return v && typeof v === 'object' ? resolveColor(v.alias, mode) : v
  }
  const radius = rem(light.radius ?? '0.75rem')
  return {
    colors,
    resolveColor,
    radius: { sm: radius - 4, md: radius - 2, lg: radius, xl: radius + 4, full: 9999 },
    float: { light: cssShadow(light['shadow-float']), dark: cssShadow(dark['shadow-float']) },
  }
}

function tokenJobs(t, darkFallback) {
  const alpha = (name, pct, mode) => `${t.resolveColor(name, mode).slice(0, 7)}${hex2(pct / 100)}`
  const colorVars = [
    ...t.colors.map((c) => ({
      name: c.name,
      type: 'COLOR',
      code: `var(--${c.name})`,
      values: { Light: c.light, Dark: c.dark },
    })),
    ...ALPHA.map(([name, pct]) => ({
      name: `alpha/${name}-${pct}`,
      type: 'COLOR',
      code: `color-mix(in oklch, var(--${name}) ${pct}%, transparent)`,
      values: { Light: alpha(name, pct, 'light'), Dark: alpha(name, pct, 'dark') },
    })),
    // Every layer of --shadow-float, so the effect style follows the mode too.
    ...t.float.light.flatMap((layer, i) =>
      ['color', 'y', 'blur', 'spread'].map((field) => ({
        name: `shadow/float-${i + 1}/${field}`,
        type: field === 'color' ? 'COLOR' : 'FLOAT',
        values: { Light: layer[field], Dark: t.float.dark[i]?.[field] ?? layer[field] },
      })),
    ),
  ]
  const jobs = [
    {
      kind: 'variables',
      label: COLORS,
      params: { collection: COLORS, modes: ['Light', 'Dark'], variables: colorVars },
    },
  ]
  if (darkFallback)
    jobs.push({
      kind: 'variables',
      label: `${COLORS} (Dark)`,
      params: {
        collection: `${COLORS} (Dark)`,
        modes: ['Dark'],
        variables: colorVars.map((v) => ({
          ...v,
          values: { Dark: v.values.Dark },
        })),
      },
    })
  jobs.push({
    kind: 'variables',
    label: SIZES,
    params: {
      collection: SIZES,
      modes: ['Value'],
      variables: [
        ...Object.entries(t.radius).map(([k, v]) => ({
          name: `radius/${k}`,
          type: 'FLOAT',
          value: v,
          scopes: ['CORNER_RADIUS'],
          code: k === 'full' ? 'calc(infinity * 1px)' : `var(--radius-${k})`,
        })),
        ...SPACE.map((px) => ({
          name: `space/${px}`,
          type: 'FLOAT',
          value: px,
          scopes: ['GAP', 'WIDTH_HEIGHT'],
          code: `calc(var(--spacing) * ${px / 4})`,
        })),
      ],
    },
  })
  const text = (name, size, lineHeight, weight = 'Regular', extra = {}) => ({
    name: `text/${name}`,
    size,
    lineHeight,
    weight,
    ...extra,
  })
  jobs.push({
    kind: 'styles',
    label: 'text and shadows',
    params: {
      text: [
        text('11-medium', 11, '150%', 'Medium'),
        text('11-label', 11, '150%', 'Medium', { upper: true, letterSpacing: '2.5%' }),
        text('xs', 12, 16),
        text('xs-medium', 12, 16, 'Medium'),
        text('13', 13, '150%'),
        text('13-medium', 13, '150%', 'Medium'),
        text('13-snug', 13, '137.5%'),
        text('13-relaxed', 13, '162.5%'),
        text('13.5', 13.5, '150%'),
        text('13.5-medium', 13.5, '150%', 'Medium'),
        text('sm', 14, 20),
        text('sm-medium', 14, 20, 'Medium'),
        text('base-medium', 16, '137.5%', 'Medium'),
        text('lg-semibold', 18, 28, 'Semi Bold'),
        text('sm-semibold', 14, 20, 'Semi Bold'),
        text('base-medium-24', 16, 24, 'Medium'),
        text('15', 15, '150%'),
        text('2xl-semibold', 24, 32, 'Semi Bold', { letterSpacing: '-2.5%' }),
      ],
      effect: [
        {
          name: 'shadow/xs',
          description: 'shadow-xs',
          effects: [{ type: 'DROP_SHADOW', x: 0, y: 1, blur: 2, spread: 0, color: '#0000000d' }],
        },
        {
          name: 'shadow/float',
          description: 'shadow-float (Light and Dark through variables)',
          effects: t.float.light.map((_, i) => ({
            type: 'DROP_SHADOW',
            x: 0,
            y: `$shadow/float-${i + 1}/y`,
            blur: `$shadow/float-${i + 1}/blur`,
            spread: `$shadow/float-${i + 1}/spread`,
            color: `$shadow/float-${i + 1}/color`,
          })),
        },
      ],
    },
  })
  return jobs
}

// ---------------------------------------------------------------------------------------------
// Strings and icons from the app's own packages.

const FALLBACK = {
  common: { cancel: 'Cancel', delete: 'Delete', untitled: 'Untitled' },
  nav: { home: 'Home' },
  sidebar: {
    search: 'Search',
    daily: 'Today',
    folders: 'Folders',
    settings: 'Settings',
    deleteFolderTitle: 'Delete “{{name}}”?',
    deleteFolderBody: 'Its notes stay, without a folder.',
  },
  links: { nav: 'Links' },
  tidy: { nav: 'Tidy up' },
  layout: { overview: 'Overview' },
}

async function strings() {
  try {
    // Node 23.6+ runs TypeScript without a build step.
    const mod = await import(pathToFileURL(join(REPO, 'packages/i18n/src/locales/en.ts')).href)
    return mod.default ?? mod.en ?? FALLBACK
  } catch {
    return FALLBACK
  }
}

function lucideDir() {
  const require = createRequire(join(REPO, 'apps/web/package.json'))
  return join(dirname(require.resolve('lucide-react/package.json')), 'dist/esm/icons')
}

/** A lucide icon as the app draws it (24 grid, stroke 1.75), sized 16. */
function lucideSvg(dir, name) {
  const src = readFileSync(join(dir, `${name}.mjs`), 'utf8')
  // An old name only re-exports the icon it became (trash-2 → trash).
  const alias = /export \{ default \} from '\.\/([\w-]+)\.mjs'/.exec(src)
  if (alias) return lucideSvg(dir, alias[1])
  // `node: [[tag, attrs], …]` in the icon's data: the array up to its matching bracket.
  const start = src.indexOf('[', src.indexOf('node:'))
  let depth = 0
  let end = start
  for (; end < src.length; end++) {
    if (src[end] === '[') depth++
    if (src[end] === ']' && --depth === 0) break
  }
  if (start < 0 || depth !== 0) throw new Error(`Cannot read the lucide icon ${name}`)
  const node = Function(`return ${src.slice(start, end + 1)}`)()
  const body = node
    .map(([tag, attrs]) => {
      const a = Object.entries(attrs)
        .filter(([k]) => k !== 'key')
        .map(([k, v]) => `${k.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}="${v}"`)
        .join(' ')
      return `<${tag} ${a}/>`
    })
    .join('')
  return svg(body)
}

const svg = (body) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#000000" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`

/** `Spinner` from button.tsx (16 grid). */
const SPINNER =
  '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="6.25" stroke="#000000" stroke-width="1.75" opacity="0.25"/><path d="M14.25 8A6.25 6.25 0 0 0 8 1.75" stroke="#000000" stroke-width="1.75" stroke-linecap="round"/></svg>'

const ICONS = [
  'plus',
  'search',
  'house',
  'calendar-days',
  'link-2',
  'layout-dashboard',
  'wand-sparkles',
  'folder',
  'chevron-right',
  'settings',
  'cloud-check',
  'file-text',
  'pin',
  'users',
  'square-check-big',
  'trash-2',
  'ellipsis',
  'inbox',
  'x',
  'folder-plus',
  'square-pen',
  'panel-left-close',
  'arrow-left',
  'arrow-right',
  'chevron-down',
  'bell',
  'message-circle',
  'list',
  'image',
]

// ---------------------------------------------------------------------------------------------
// Spec helpers.

const text = (name, value, style, fill, extra = {}) => ({
  type: 'TEXT',
  name,
  text: value,
  textStyle: `text/${style}`,
  fill,
  ...extra,
})
const icon = (name, size, color, extra = {}) => ({
  type: 'INSTANCE',
  name: extra.name ?? 'Icon',
  of: `icon/${name}`,
  w: size,
  h: size,
  color,
  ...extra,
})
const use = (of, variant, props, extra = {}) => ({ type: 'INSTANCE', of, variant, props, ...extra })

/** A page-sized board: title, then its content; bound to the theme, so switching mode shows Dark. */
const board = (key, title, children, extra = {}) => ({
  key: `board/${key}`,
  type: 'FRAME',
  name: title,
  layout: 'col',
  gap: 32,
  pad: 48,
  radius: 24,
  fill: '$background',
  children: [text('Title', title, 'lg-semibold', '$foreground'), ...children],
  ...extra,
})

const caption = (value) => text('Caption', value, 'xs', '$muted-foreground')

// ---------------------------------------------------------------------------------------------
// Boards.

function tokensBoard(t) {
  const swatch = (c) => ({
    type: 'FRAME',
    name: c.name,
    layout: 'col',
    gap: 6,
    w: 132,
    children: [
      {
        type: 'RECTANGLE',
        name: 'Swatch',
        w: 132,
        h: 56,
        radius: '$radius/sm',
        fill: `$${c.name}`,
        stroke: '$border',
      },
      text('Name', c.name, 'xs-medium', '$foreground'),
      text(
        'Value',
        [c.light, c.dark].map((v) => (typeof v === 'object' ? `→ ${v.alias}` : v)).join(' / '),
        'xs',
        '$muted-foreground',
      ),
    ],
  })
  const radius = Object.keys(t.radius)
    .filter((k) => k !== 'full')
    .map((k) => ({
      type: 'FRAME',
      name: `radius/${k}`,
      layout: 'col',
      gap: 6,
      align: 'center',
      children: [
        {
          type: 'RECTANGLE',
          name: 'Shape',
          w: 64,
          h: 64,
          radius: `$radius/${k}`,
          fill: '$muted',
          stroke: '$border',
        },
        text('Name', `${k} · ${t.radius[k]}`, 'xs', '$muted-foreground'),
      ],
    }))
  const sample = (style, value) => ({
    type: 'FRAME',
    name: style,
    layout: 'row',
    gap: 24,
    align: 'baseline',
    children: [
      text('Style', style, 'xs', '$muted-foreground', { w: 120 }),
      text('Sample', value, style, '$foreground'),
    ],
  })
  return board('tokens', 'Tokens', [
    caption(
      'Colours from packages/ui/src/styles.css · Light / Dark. Switch this board’s mode to see Dark.',
    ),
    {
      type: 'FRAME',
      name: 'Colours',
      layout: 'row',
      wrap: true,
      gap: 16,
      w: 1180,
      children: t.colors.map(swatch),
    },
    caption('Radius (--radius and its steps)'),
    { type: 'FRAME', name: 'Radius', layout: 'row', gap: 24, children: radius },
    caption('Text styles (Inter)'),
    {
      type: 'FRAME',
      name: 'Type',
      layout: 'col',
      gap: 12,
      children: [
        sample('lg-semibold', 'Delete “Ideas”?'),
        sample('base-medium', 'Weekly plan'),
        sample('sm-medium', 'Button label'),
        sample('sm', 'Body text in inputs and dialogs'),
        sample('13.5', 'Sidebar item'),
        sample('13-relaxed', 'Card excerpt, relaxed leading'),
        sample('xs', 'Dates and counts'),
        sample('11-label', 'Section label'),
      ],
    },
    caption('Shadows'),
    {
      type: 'FRAME',
      name: 'Shadows',
      layout: 'row',
      gap: 32,
      pad: [8, 8, 24, 8],
      children: ['shadow/xs', 'shadow/float'].map((name) => ({
        type: 'FRAME',
        name,
        layout: 'col',
        justify: 'center',
        align: 'center',
        w: 160,
        h: 96,
        radius: '$radius/xl',
        fill: '$card',
        stroke: '$border',
        effects: name,
        children: [text('Name', name, 'xs', '$muted-foreground')],
      })),
    },
  ])
}

function iconsBoard(dir) {
  const comps = [
    ...ICONS.map((name) => ({ name, svg: lucideSvg(dir, name) })),
    { name: 'spinner', svg: SPINNER },
  ].map(({ name, svg: markup }) => ({
    key: `icon/${name}`,
    type: 'COMPONENT',
    name: `icon/${name}`,
    w: 16,
    h: 16,
    description: name === 'spinner' ? 'Spinner (button.tsx)' : `lucide ${name}`,
    children: [
      {
        type: 'SVG',
        name: 'Vector',
        svg: markup,
        color: '$foreground',
        constraints: { h: 'scale', v: 'scale' },
      },
    ],
  }))
  return board('icons', 'Icons', [
    caption('lucide-react as installed in apps/web, stroke 1.75. Instances recolour the vectors.'),
    { type: 'FRAME', name: 'Grid', layout: 'row', wrap: true, gap: 24, w: 640, children: comps },
  ])
}

// buttonVariants (packages/ui/src/components/button.tsx).
const BUTTON = {
  default: {
    fill: '$primary',
    text: '$primary-foreground',
    hover: { fill: { var: 'primary', opacity: 0.9 } },
  },
  brand: {
    fill: '$brand',
    text: '$brand-foreground',
    hover: { fill: { var: 'brand', opacity: 0.9 } },
  },
  outline: {
    fill: '$card',
    text: '$foreground',
    stroke: '$border',
    effects: 'shadow/xs',
    hover: { fill: '$accent' },
  },
  secondary: {
    fill: '$secondary',
    text: '$secondary-foreground',
    hover: { fill: { var: 'secondary', opacity: 0.8 } },
  },
  ghost: { fill: null, text: '$muted-foreground', hover: { fill: '$accent', text: '$foreground' } },
  link: { fill: null, text: '$brand', hover: { underline: true } },
}
const BUTTON_SIZE = {
  default: { h: 36, pad: [0, '$space/16'], gap: '$space/8', style: 'sm-medium' },
  sm: { h: 32, pad: [0, '$space/12'], gap: '$space/6', style: '13-medium' },
  lg: { h: 40, pad: [0, '$space/24'], gap: '$space/8', style: 'sm-medium' },
  icon: { w: 36, h: 36 },
  'icon-sm': { w: 32, h: 32 },
  'icon-xs': { w: 28, h: 28 },
}

function buttonVariant(variant, size, state) {
  const v = BUTTON[variant]
  const z = BUTTON_SIZE[size]
  const hover = state === 'hover' ? v.hover : {}
  const color = hover.text ?? v.text
  const iconOnly = !z.style
  const loading = state === 'loading'
  const children = iconOnly
    ? [icon('plus', 16, color, { opacity: loading ? 0 : 1, bind: { mainComponent: 'Glyph' } })]
    : [
        icon('plus', 16, color, {
          opacity: loading ? 0 : 1,
          bind: { visible: 'Show icon', mainComponent: 'Glyph' },
        }),
        text('Label', 'Button', z.style, color, {
          opacity: loading ? 0 : 1,
          underline: Boolean(hover.underline),
          bind: { characters: 'Label' },
        }),
      ]
  if (loading) children.push(icon('spinner', 16, color, { name: 'Spinner', center: true }))
  return {
    variant: { variant, size, state },
    layout: 'row',
    justify: 'center',
    align: 'center',
    gap: z.gap ?? 0,
    pad: z.pad ?? 0,
    w: z.w,
    h: z.h,
    radius: '$radius/md',
    fill: hover.fill ?? v.fill,
    stroke: v.stroke,
    effects: state === 'focus' ? [{ spread: 2, color: '$alpha/ring-50' }] : v.effects,
    opacity: state === 'disabled' ? 0.5 : 1,
    children,
  }
}

function buttonBoard() {
  const variants = []
  for (const variant of Object.keys(BUTTON))
    for (const size of Object.keys(BUTTON_SIZE))
      variants.push(buttonVariant(variant, size, 'default'))
  for (const state of ['hover', 'focus', 'disabled', 'loading'])
    for (const variant of Object.keys(BUTTON))
      variants.push(buttonVariant(variant, 'default', state))
  return board('button', 'Button', [
    caption(
      'buttonVariants: variant × size; hover, focus, disabled and loading at the default size.',
    ),
    {
      key: 'button',
      type: 'COMPONENT_SET',
      name: 'Button',
      description: '@fixnote/ui Button. Label, Show icon and Glyph (icon swap) are properties.',
      props: { Label: 'Button', 'Show icon': false, Glyph: { swap: 'icon/plus' } },
      w: 980,
      variants,
    },
  ])
}

function controlsBoard(s) {
  const input = (state) => ({
    variant: { state },
    layout: 'row',
    align: 'center',
    w: 240,
    h: 36,
    pad: [4, '$space/12'],
    radius: '$radius/md',
    stroke: state === 'focus' ? '$ring' : '$input',
    effects: state === 'focus' ? [{ spread: 2, color: '$alpha/ring-30' }] : [],
    opacity: state === 'disabled' ? 0.5 : 1,
    children: [
      text(
        'Text',
        state === 'filled' ? 'Weekly plan' : (s.sidebar.folderName ?? 'Folder name'),
        'sm',
        state === 'filled' ? '$foreground' : '$muted-foreground',
        {
          w: 'fill',
          maxLines: 1,
          bind: { characters: 'Text' },
        },
      ),
    ],
  })
  const BADGE = {
    default: { fill: '$secondary', text: '$secondary-foreground' },
    outline: { fill: '$card', text: '$foreground', stroke: '$border' },
    brand: { fill: { var: 'brand', opacity: 0.12 }, text: '$brand' },
  }
  return board('controls', 'Input · Badge · Kbd', [
    caption('Input (input.tsx): placeholder, filled, focus ring, disabled.'),
    {
      key: 'input',
      type: 'COMPONENT_SET',
      name: 'Input',
      props: { Text: 'Folder name' },
      variants: ['default', 'filled', 'focus', 'disabled'].map(input),
    },
    caption('Badge (badge.tsx)'),
    {
      key: 'badge',
      type: 'COMPONENT_SET',
      name: 'Badge',
      props: { Label: 'Badge' },
      variants: Object.entries(BADGE).map(([variant, b]) => ({
        variant: { variant },
        layout: 'row',
        align: 'center',
        gap: '$space/4',
        // px-2 py-0.5 plus the 1px border every badge has (transparent on two of them).
        pad: [3, 9],
        radius: '$radius/full',
        fill: b.fill,
        stroke: b.stroke,
        children: [text('Label', 'Badge', 'xs-medium', b.text, { bind: { characters: 'Label' } })],
      })),
    },
    caption('Kbd (kbd.tsx)'),
    {
      key: 'kbd',
      type: 'COMPONENT',
      name: 'Kbd',
      props: { Keys: 'Ctrl K' },
      layout: 'row',
      justify: 'center',
      align: 'center',
      gap: 2,
      h: 20,
      minW: 20,
      pad: [0, '$space/4'],
      radius: 4,
      fill: '$muted',
      stroke: '$border',
      children: [
        text('Keys', 'Ctrl K', '11-medium', '$muted-foreground', { bind: { characters: 'Keys' } }),
      ],
    },
  ])
}

function dialogBoard(s) {
  const title = (s.sidebar.deleteFolderTitle ?? 'Delete “{{name}}”?').replace('{{name}}', 'Ideas')
  const body = s.sidebar.deleteFolderBody ?? 'Its notes stay, without a folder.'
  const button = (variant, label) =>
    use('button', { variant, size: 'default', state: 'default' }, { Label: label })
  return board('dialog', 'Dialog', [
    caption('DialogContent (dialog.tsx): max-w-xl, rounded-xl, p-6, bg-popover, shadow-float.'),
    {
      key: 'dialog',
      type: 'COMPONENT',
      name: 'Dialog',
      props: { Title: title, Description: body },
      layout: 'col',
      gap: '$space/24',
      w: 576,
      pad: '$space/24',
      radius: '$radius/xl',
      fill: '$popover',
      stroke: '$border',
      effects: 'shadow/float',
      children: [
        {
          type: 'FRAME',
          name: 'Header',
          layout: 'col',
          gap: '$space/4',
          w: 'fill',
          children: [
            text('Title', title, 'lg-semibold', '$popover-foreground', {
              w: 'fill',
              bind: { characters: 'Title' },
            }),
            text('Description', body, 'sm', '$muted-foreground', {
              w: 'fill',
              bind: { characters: 'Description' },
            }),
          ],
        },
        {
          type: 'FRAME',
          name: 'Footer',
          layout: 'row',
          justify: 'end',
          gap: '$space/8',
          w: 'fill',
          children: [
            button('outline', s.common.cancel ?? 'Cancel'),
            button('default', s.common.delete ?? 'Delete'),
          ],
        },
      ],
    },
    caption(
      'In place: the overlay is bg-black/25 (Light), /50 (Dark); the dialog sits at 18% from the top.',
    ),
    {
      type: 'FRAME',
      name: 'Dialog on screen',
      layout: 'col',
      align: 'center',
      pad: [92, 0, 0, 0],
      w: 900,
      h: 520,
      radius: '$radius/lg',
      clip: true,
      fill: [{ var: 'background' }, { color: '#000000', opacity: 0.25 }],
      children: [use('dialog', undefined, undefined, { name: 'Dialog' })],
    },
  ])
}

const EXCERPT =
  'Call the bank about the card. Draft the landing copy and send it for review before Friday. Book the train for the 14th.'

function notesBoard() {
  const meta = (withSpacer) => ({
    type: 'FRAME',
    name: 'Meta',
    layout: 'row',
    align: 'center',
    gap: '$space/6',
    w: 'fill',
    children: [
      ...(withSpacer ? [icon('file-text', 14, '$muted-foreground')] : []),
      text('Date', 'Nov 6', 'xs', '$muted-foreground', { bind: { characters: 'Date' } }),
      icon('pin', 14, '$brand', { name: 'Pinned', bind: { visible: 'Pinned' } }),
      ...(withSpacer ? [{ type: 'FRAME', name: 'Spacer', w: 'fill', h: 1 }] : []),
      {
        type: 'FRAME',
        name: 'Tasks',
        layout: 'row',
        align: 'center',
        gap: '$space/4',
        bind: { visible: 'Tasks' },
        children: [
          icon('square-check-big', 14, '$muted-foreground'),
          text('Count', '2/5', 'xs', '$muted-foreground'),
        ],
      },
    ],
  })
  const card = (state) => ({
    variant: { state },
    layout: 'col',
    gap: '$space/8',
    w: 260,
    minH: 128,
    pad: '$space/16',
    radius: '$radius/xl',
    fill: '$card',
    stroke: state === 'selected' ? '$brand' : '$border',
    effects:
      state === 'hover'
        ? 'shadow/float'
        : state === 'selected'
          ? [{ spread: 2, color: '$alpha/brand-40' }]
          : 'shadow/xs',
    children: [
      meta(true),
      {
        type: 'FRAME',
        name: 'Body',
        layout: 'col',
        gap: '$space/6',
        w: 'fill',
        children: [
          text('Title', 'Weekly plan', 'base-medium', '$card-foreground', {
            w: 'fill',
            maxLines: 2,
            bind: { characters: 'Title' },
          }),
          text('Excerpt', EXCERPT, '13-relaxed', '$muted-foreground', {
            w: 'fill',
            maxLines: 7,
            bind: { characters: 'Excerpt' },
          }),
        ],
      },
    ],
  })
  const snippet = (state) => ({
    variant: { state },
    layout: 'row',
    gap: '$space/12',
    w: 300,
    pad: [10, '$space/12'],
    radius: '$radius/lg',
    fill:
      state === 'active' ? '$accent' : state === 'hover' ? { var: 'accent', opacity: 0.5 } : null,
    children: [
      {
        type: 'FRAME',
        name: 'Text',
        layout: 'col',
        gap: '$space/6',
        w: 'fill',
        children: [
          {
            type: 'FRAME',
            name: 'Top',
            layout: 'col',
            gap: 2,
            w: 'fill',
            children: [
              text('Title', 'Weekly plan', 'sm-medium', '$foreground', {
                w: 'fill',
                maxLines: 1,
                bind: { characters: 'Title' },
              }),
              text('Excerpt', EXCERPT, '13-snug', '$muted-foreground', {
                w: 'fill',
                maxLines: 2,
                bind: { characters: 'Excerpt' },
              }),
            ],
          },
          meta(false),
        ],
      },
    ],
  })
  const props = {
    Title: 'Weekly plan',
    Excerpt: EXCERPT,
    Date: 'Nov 6',
    Pinned: false,
    Tasks: false,
  }
  return board('notes', 'Notes', [
    caption('NoteCard (cards view): default, hover (shadow-float), selected.'),
    {
      key: 'note-card',
      type: 'COMPONENT_SET',
      name: 'Note card',
      props,
      variants: ['default', 'hover', 'selected'].map(card),
    },
    caption(
      'NoteSnippet (the notes layout’s middle column): default, hover, active (the open note).',
    ),
    {
      key: 'note-snippet',
      type: 'COMPONENT_SET',
      name: 'Note snippet',
      props,
      variants: ['default', 'hover', 'active'].map(snippet),
    },
  ])
}

function sidebarBoard(s) {
  const t = (path, fallback) => path.split('.').reduce((o, k) => o?.[k], s) ?? fallback
  const row = (state) => ({
    fill: state === 'default' ? null : '$sidebar-accent',
    text: state === 'active' ? '$foreground' : '$sidebar-foreground',
    style: state === 'active' ? '13.5-medium' : '13.5',
  })
  const navItem = (state) => {
    const r = row(state)
    return {
      variant: { state },
      layout: 'row',
      align: 'center',
      gap: '$space/10',
      w: 240,
      h: 32,
      pad: [0, '$space/10'],
      radius: '$radius/md',
      fill: r.fill,
      children: [
        icon('house', 16, r.text, { opacity: 0.7, bind: { mainComponent: 'Glyph' } }),
        text('Label', t('nav.home', 'Home'), r.style, r.text, {
          w: 'fill',
          maxLines: 1,
          bind: { characters: 'Label' },
        }),
        text('Count', '128', 'xs', '$muted-foreground', {
          bind: { characters: 'Count', visible: 'Show count' },
        }),
      ],
    }
  }
  const folder = (state) => {
    const r = row(state)
    return {
      variant: { state },
      layout: 'row',
      align: 'center',
      w: 240,
      h: 32,
      pad: [0, 4, 0, '$space/10'],
      radius: '$radius/md',
      fill: r.fill,
      children: [
        {
          type: 'FRAME',
          name: 'Name',
          layout: 'row',
          align: 'center',
          gap: '$space/10',
          w: 'fill',
          children: [
            icon('folder', 16, r.text, { opacity: 0.7 }),
            text('Name', 'Ideas', r.style, r.text, { bind: { characters: 'Name' } }),
            icon('users', 14, '$muted-foreground', { name: 'Shared', bind: { visible: 'Shared' } }),
          ],
        },
        {
          type: 'FRAME',
          name: 'Expand',
          layout: 'row',
          justify: 'center',
          align: 'center',
          w: 24,
          h: 24,
          bind: { visible: 'Subfolders' },
          children: [icon('chevron-right', 14, '$muted-foreground')],
        },
        {
          type: 'FRAME',
          name: 'Count',
          layout: 'row',
          pad: [0, 4],
          children: [
            text('Count', '8', 'xs', '$muted-foreground', { bind: { characters: 'Count' } }),
          ],
        },
      ],
    }
  }
  const nav = (glyph, label, state, count) =>
    use(
      'sidebar/nav-item',
      { state },
      {
        Glyph: { swap: `icon/${glyph}` },
        Label: label,
        'Show count': count !== undefined,
        Count: count ?? '',
      },
      { w: 'fill', name: label },
    )
  const folderRow = (name, count, subfolders = false) =>
    use(
      'sidebar/folder',
      { state: 'default' },
      { Name: name, Count: count, Subfolders: subfolders, Shared: false },
      { w: 'fill', name },
    )
  return board('sidebar', 'Sidebar', [
    caption(
      'Sidebar.tsx and SidebarFolders.tsx: nav item, folder row, section header, search, then the whole sidebar.',
    ),
    {
      type: 'FRAME',
      name: 'Parts',
      layout: 'row',
      gap: 48,
      children: [
        {
          key: 'sidebar/nav-item',
          type: 'COMPONENT_SET',
          name: 'Sidebar / Nav item',
          props: {
            Glyph: { swap: 'icon/house' },
            Label: t('nav.home', 'Home'),
            Count: '128',
            'Show count': true,
          },
          layout: 'col',
          wrap: false,
          variants: ['default', 'hover', 'active'].map(navItem),
        },
        {
          key: 'sidebar/folder',
          type: 'COMPONENT_SET',
          name: 'Sidebar / Folder',
          props: { Name: 'Ideas', Count: '8', Subfolders: false, Shared: false },
          layout: 'col',
          wrap: false,
          variants: ['default', 'hover', 'active'].map(folder),
        },
        {
          type: 'FRAME',
          name: 'Singles',
          layout: 'col',
          gap: 24,
          children: [
            {
              key: 'sidebar/section',
              type: 'COMPONENT',
              name: 'Sidebar / Section',
              props: { Label: t('sidebar.folders', 'Folders') },
              layout: 'row',
              justify: 'between',
              align: 'center',
              w: 240,
              pad: [0, 4, 4, '$space/10'],
              children: [
                text('Label', t('sidebar.folders', 'Folders'), '11-label', '$muted-foreground', {
                  bind: { characters: 'Label' },
                }),
                {
                  type: 'FRAME',
                  name: 'New folder',
                  layout: 'row',
                  justify: 'center',
                  align: 'center',
                  w: 24,
                  h: 24,
                  radius: '$radius/md',
                  children: [icon('folder-plus', 14, '$muted-foreground')],
                },
              ],
            },
            {
              key: 'sidebar/search',
              type: 'COMPONENT',
              name: 'Sidebar / Search',
              props: { Label: t('sidebar.search', 'Search') },
              layout: 'row',
              align: 'center',
              gap: '$space/8',
              w: 240,
              h: 32,
              pad: [0, '$space/10'],
              radius: '$radius/md',
              fill: { var: 'background', opacity: 0.6 },
              stroke: '$sidebar-border',
              children: [
                icon('search', 14, '$muted-foreground'),
                text('Label', t('sidebar.search', 'Search'), '13', '$muted-foreground', {
                  w: 'fill',
                  bind: { characters: 'Label' },
                }),
                use('kbd', undefined, { Keys: 'Ctrl K' }, { name: 'Kbd', expose: true }),
              ],
            },
          ],
        },
      ],
    },
    {
      key: 'sidebar',
      type: 'COMPONENT',
      name: 'Sidebar',
      description: 'w-64, bg-sidebar, border-r. The Pro card above the footer is left out.',
      layout: 'col',
      w: 256,
      h: 720,
      pad: [4, 0, 0, 0],
      fill: '$sidebar',
      stroke: '$sidebar-border',
      strokeWidth: [0, 1, 0, 0],
      children: [
        {
          type: 'FRAME',
          name: 'Search',
          layout: 'col',
          w: 'fill',
          pad: [0, '$space/8'],
          children: [use('sidebar/search', undefined, undefined, { w: 'fill', name: 'Search' })],
        },
        {
          type: 'FRAME',
          name: 'Nav',
          layout: 'col',
          gap: 2,
          w: 'fill',
          h: 'fill',
          pad: ['$space/12', '$space/8', 0, '$space/8'],
          children: [
            nav('house', t('nav.home', 'Home'), 'active', '128'),
            nav('calendar-days', t('sidebar.daily', 'Today'), 'default'),
            nav('link-2', t('links.nav', 'Links'), 'default', '24'),
            nav('wand-sparkles', t('tidy.nav', 'Tidy up'), 'default'),
            {
              type: 'FRAME',
              name: 'Folders',
              layout: 'col',
              gap: 2,
              w: 'fill',
              pad: ['$space/20', 0, 0, 0],
              children: [
                use('sidebar/section', undefined, undefined, { w: 'fill', name: 'Section' }),
                folderRow('Work', '23', true),
                folderRow('Ideas', '8'),
                folderRow('Reading', '41'),
                folderRow('Travel', '5'),
              ],
            },
          ],
        },
        {
          type: 'FRAME',
          name: 'Footer',
          layout: 'row',
          justify: 'between',
          align: 'center',
          w: 'fill',
          h: 44,
          pad: [0, '$space/8'],
          stroke: '$sidebar-border',
          strokeWidth: [1, 0, 0, 0],
          children: [
            {
              type: 'FRAME',
              name: 'Status',
              layout: 'row',
              align: 'center',
              gap: '$space/4',
              children: [
                {
                  type: 'FRAME',
                  name: 'Sync',
                  layout: 'row',
                  justify: 'center',
                  align: 'center',
                  w: 28,
                  h: 28,
                  radius: '$radius/md',
                  children: [icon('cloud-check', 14, '$muted-foreground')],
                },
                text('Version', 'v1.0.0', 'xs', '$muted-foreground'),
              ],
            },
            use(
              'button',
              { variant: 'ghost', size: 'icon-xs', state: 'default' },
              { Glyph: { swap: 'icon/settings' } },
              { name: t('sidebar.settings', 'Settings') },
            ),
          ],
        },
      ],
    },
  ])
}

// ---------------------------------------------------------------------------------------------
// Screens: whole windows assembled from instances of the kit (desktop, notes in the list view).
// The text is sample content in Russian, like the app with a Russian interface; the chrome strings
// match @fixnote/i18n's ru locale.

const W = 1280
const H = 820
const CONTENT = 848 // max-w-4xl minus px-6 on both sides

function screenParts() {
  // NoteRow (NoteCard.tsx): title, two lines of the text, date and marks, a thumbnail.
  const row = (state) => ({
    variant: { state },
    layout: 'row',
    align: 'center',
    gap: '$space/16',
    w: CONTENT,
    pad: ['$space/12', '$space/16'],
    fill: state === 'hover' ? { var: 'accent', opacity: 0.4 } : null,
    children: [
      {
        type: 'FRAME',
        name: 'Body',
        layout: 'col',
        gap: '$space/6',
        w: 'fill',
        children: [
          {
            type: 'FRAME',
            name: 'Top',
            layout: 'col',
            gap: 2,
            w: 'fill',
            children: [
              text('Title', 'Bot Messages', 'base-medium-24', '$foreground', {
                w: 'fill',
                maxLines: 1,
                bind: { characters: 'Title' },
              }),
              text('Excerpt', 'image_1784269874381_0', '13-relaxed', '$muted-foreground', {
                w: 'fill',
                maxLines: 2,
                bind: { characters: 'Excerpt' },
              }),
            ],
          },
          {
            type: 'FRAME',
            name: 'Meta',
            layout: 'row',
            align: 'center',
            gap: '$space/6',
            children: [
              text('Date', '4 нояб.', 'xs', '$muted-foreground', { bind: { characters: 'Date' } }),
              icon('users', 14, '$brand', { name: 'Shared', bind: { visible: 'Shared' } }),
              {
                type: 'FRAME',
                name: 'Tasks',
                layout: 'row',
                align: 'center',
                gap: '$space/4',
                bind: { visible: 'Tasks' },
                children: [
                  icon('square-check-big', 14, '$muted-foreground'),
                  text('Task count', '0/4', 'xs', '$muted-foreground', {
                    bind: { characters: 'Task count' },
                  }),
                ],
              },
              {
                type: 'FRAME',
                name: 'Subfolder',
                layout: 'row',
                align: 'center',
                gap: '$space/4',
                bind: { visible: 'Subfolder' },
                children: [
                  icon('folder', 14, '$muted-foreground'),
                  text('Folder', 'Геймдизайн', 'xs', '$muted-foreground', {
                    bind: { characters: 'Folder' },
                  }),
                ],
              },
            ],
          },
        ],
      },
      {
        type: 'FRAME',
        name: 'Thumbnail',
        layout: 'row',
        justify: 'center',
        align: 'center',
        w: 64,
        h: 64,
        radius: '$radius/lg',
        fill: '$muted',
        stroke: '$border',
        clip: true,
        bind: { visible: 'Thumbnail' },
        children: [icon('image', 20, '$muted-foreground')],
      },
    ],
  })

  const item = (state) => ({
    variant: { state },
    layout: 'row',
    align: 'center',
    gap: '$space/12',
    w: 564,
    pad: ['$space/8', '$space/12'],
    radius: '$radius/lg',
    fill: state === 'active' ? '$accent' : null,
    children: [
      icon('file-text', 16, '$muted-foreground', { bind: { mainComponent: 'Glyph' } }),
      text('Label', 'Bot Messages', 'sm', '$popover-foreground', {
        w: 'fill',
        maxLines: 1,
        bind: { characters: 'Label' },
      }),
      text('Meta', '4 нояб.', 'xs', '$muted-foreground', {
        bind: { characters: 'Meta', visible: 'Show meta' },
      }),
    ],
  })

  // Disabled (opacity-50) exists as a variant at the default size only: other sizes fade the instance.
  const ghost = (glyph, name, disabled = false) =>
    use(
      'button',
      { variant: 'ghost', size: 'icon-xs', state: 'default' },
      { Glyph: { swap: `icon/${glyph}` } },
      { name, opacity: disabled ? 0.5 : 1 },
    )

  const light = (name, color) => ({ type: 'ELLIPSE', name, w: 12, h: 12, fill: color })

  return [
    caption('NoteRow (list view), the "New note" row, TitleBar and Spotlight (Ctrl+K).'),
    {
      key: 'note-row',
      type: 'COMPONENT_SET',
      name: 'Note row',
      props: {
        Title: 'Bot Messages',
        Excerpt: 'image_1784269874381_0',
        Date: '4 нояб.',
        Shared: false,
        Tasks: false,
        'Task count': '0/4',
        Subfolder: false,
        Folder: 'Геймдизайн',
        Thumbnail: false,
      },
      layout: 'col',
      variants: ['default', 'hover'].map(row),
    },
    {
      key: 'new-note-row',
      type: 'COMPONENT',
      name: 'New note row',
      props: { Label: 'Новая заметка' },
      layout: 'row',
      align: 'center',
      gap: '$space/10',
      w: CONTENT,
      h: 48,
      pad: [0, '$space/16'],
      children: [
        icon('plus', 16, '$muted-foreground'),
        text('Label', 'Новая заметка', 'sm', '$muted-foreground', {
          bind: { characters: 'Label' },
        }),
      ],
    },
    {
      key: 'titlebar',
      type: 'COMPONENT',
      name: 'Title bar',
      description: 'TitleBar.tsx on macOS (traffic lights); the left part is the docked sidebar.',
      props: { Place: 'Level Legends' },
      layout: 'row',
      w: W,
      h: 44,
      fill: '$background',
      children: [
        {
          type: 'FRAME',
          name: 'Sidebar part',
          layout: 'row',
          align: 'center',
          gap: 2,
          w: 256,
          h: 'fill',
          pad: [0, '$space/8', 0, '$space/12'],
          fill: '$sidebar',
          stroke: '$sidebar-border',
          strokeWidth: [0, 1, 0, 0],
          children: [
            {
              type: 'FRAME',
              name: 'Window controls',
              layout: 'row',
              align: 'center',
              gap: '$space/8',
              w: 66,
              children: [
                light('Close', '#ff5f57'),
                light('Minimize', '#febc2e'),
                light('Zoom', '#28c840'),
              ],
            },
            text('App', 'FixNote', 'sm-semibold', '$foreground', { w: 'fill' }),
            ghost('square-pen', 'Новая заметка'),
            ghost('panel-left-close', 'Скрыть боковую панель'),
          ],
        },
        {
          type: 'FRAME',
          name: 'Bar',
          layout: 'row',
          justify: 'between',
          align: 'center',
          w: 'fill',
          h: 'fill',
          pad: [0, '$space/8'],
          children: [
            {
              type: 'FRAME',
              name: 'History',
              layout: 'row',
              gap: 2,
              children: [ghost('arrow-left', 'Назад'), ghost('arrow-right', 'Вперёд', true)],
            },
            {
              type: 'FRAME',
              name: 'Place',
              layout: 'row',
              align: 'center',
              gap: '$space/6',
              h: 28,
              pad: [0, '$space/10'],
              radius: '$radius/md',
              children: [
                text('Place', 'Level Legends', '13-medium', '$foreground', {
                  bind: { characters: 'Place' },
                }),
                icon('chevron-down', 14, '$foreground', { opacity: 0.6 }),
              ],
            },
            {
              type: 'FRAME',
              name: 'Actions',
              layout: 'row',
              gap: 4,
              children: [ghost('bell', 'Уведомления'), ghost('message-circle', 'Чат')],
            },
          ],
        },
      ],
    },
    {
      key: 'spotlight/item',
      type: 'COMPONENT_SET',
      name: 'Spotlight / Item',
      props: {
        Glyph: { swap: 'icon/file-text' },
        Label: 'Bot Messages',
        Meta: '4 нояб.',
        'Show meta': true,
      },
      layout: 'col',
      variants: ['default', 'active'].map(item),
    },
  ]
}

function spotlight() {
  const heading = (label) => ({
    type: 'FRAME',
    name: label,
    layout: 'row',
    w: 'fill',
    pad: ['$space/12', '$space/12', 4, '$space/12'],
    children: [text('Heading', label, 'xs-medium', '$muted-foreground')],
  })
  const item = (glyph, label, meta, state = 'default') =>
    use(
      'spotlight/item',
      { state },
      {
        Glyph: { swap: `icon/${glyph}` },
        Label: label,
        Meta: meta ?? '',
        'Show meta': meta !== undefined,
      },
      { w: 'fill', name: label },
    )
  return {
    key: 'spotlight',
    type: 'COMPONENT',
    name: 'Spotlight',
    description: 'Spotlight.tsx: DialogContent p-0 with the cmdk list (recents, commands).',
    props: { Placeholder: 'Найдите заметку или введите команду…' },
    layout: 'col',
    w: 576,
    radius: '$radius/xl',
    fill: '$popover',
    stroke: '$border',
    effects: 'shadow/float',
    clip: true,
    children: [
      {
        type: 'FRAME',
        name: 'Input',
        layout: 'row',
        align: 'center',
        gap: '$space/12',
        w: 'fill',
        h: 48,
        pad: [0, '$space/16'],
        stroke: '$border',
        strokeWidth: [0, 0, 1, 0],
        children: [
          icon('search', 16, '$muted-foreground'),
          text('Placeholder', 'Найдите заметку или введите команду…', '15', '$muted-foreground', {
            w: 'fill',
            maxLines: 1,
            bind: { characters: 'Placeholder' },
          }),
          use('kbd', undefined, { Keys: 'Esc' }, { name: 'Esc' }),
        ],
      },
      {
        type: 'FRAME',
        name: 'List',
        layout: 'col',
        w: 'fill',
        pad: 6,
        children: [
          heading('Недавние'),
          item('file-text', 'Рекомендации от Bing по SEO для fixnote', '5 нояб.', 'active'),
          item('file-text', 'Bot Messages', '4 нояб.'),
          item('calendar-days', 'Вторник, 3 ноября 2026 г.', '3 нояб.'),
          item('calendar-days', 'Wednesday, October 28, 2026', '28 окт.'),
          item('file-text', '8 направлений A/B-тестов Hero', '28 окт.'),
          item('file-text', 'Кольцо бонусы SF эссенции', '27 окт.'),
          item('file-text', 'Приоритеты запуска FixNote по географии', '25 окт.'),
          item('file-text', 'Тарифы', '25 окт.'),
          heading('Команды'),
          item('square-pen', 'Новая заметка'),
          item('calendar-days', 'Открыть заметку на сегодня'),
        ],
      },
    ],
  }
}

const NOTES_7 = [
  {
    Title: 'Bot Messages',
    Excerpt: 'image_1784269874381_0',
    Date: '4 нояб.',
    Shared: true,
    Subfolder: true,
    Folder: 'Геймдизайн',
    Thumbnail: true,
  },
]
const NOTES_30 = [
  {
    Title: 'Кольцо бонусы SF эссенции',
    Excerpt:
      'Конфликтная копия · 29 сент. 2026 г., 14:14 Кольцо дающее больше SF / эссенции / токенов Кольцо дающее больше SF / эссенции / токенов на сколько больше? как премиум? - думаю +15% LEGD +25% Soulfire и Essence fire как суммируется/и как считается',
    Date: '27 окт.',
    Shared: true,
  },
  {
    Title: 'Аудит аудитории Level Legends — 7 октября 2026',
    Excerpt:
      'Текущую аудиторию стоит развивать. У неё есть измеримый резерв, но доказательств, что она одна обеспечит большой рост, нет. Приоритет: повысить частоту игры у опытных игроков, проверить возврат недавно ушедших и качество новых.',
    Date: '16 окт.',
    Shared: true,
  },
  {
    Title: 'Встреча · 10 окт., 19:15 · 20 мин',
    Excerpt:
      'Кратко Обсуждали сайт и приложение для заметок: разбирали блоки лендинга, фичи (заметка дня, локальная диктовка, поиск по смыслу, переезд из Notion, локальные и облачные MCP), мобильную версию, сравнение с конкурентами для SEO и планы.',
    Date: '14 окт.',
    Shared: true,
    Tasks: true,
    'Task count': '0/4',
  },
  {
    Title: 'Item Progression System',
    Excerpt:
      'Конфликтная копия · 29 сент. 2026 г., 16:41 Item Progression System Базовые сущности Item — новые свойства item_line — код линии/сета предметов: определяет, во что следующего качества мержатся 3 одинаковых предмета season — сезон предмета',
    Date: '13 окт.',
    Shared: true,
  },
  {
    Title: 'Тарифы',
    Excerpt:
      'Free — всё на устройстве. Pro — синхронизация, FixNote AI, общий доступ, ссылки и файлы.',
    Date: '12 окт.',
  },
]

function screen(name, withSearch) {
  const divider = { type: 'RECTANGLE', name: 'Divider', w: 'fill', h: 1, fill: '$border' }
  const group = (label, notes, withNew) => {
    const rows = []
    if (withNew)
      rows.push(use('new-note-row', undefined, undefined, { w: 'fill', name: 'Новая заметка' }))
    for (const n of notes) {
      if (rows.length) rows.push(divider)
      rows.push(use('note-row', { state: 'default' }, n, { w: 'fill', name: n.Title }))
    }
    return {
      type: 'FRAME',
      name: label,
      layout: 'col',
      gap: '$space/8',
      w: 'fill',
      pad: ['$space/24', 0, 0, 0],
      children: [
        text('Heading', label, 'sm-semibold', '$muted-foreground'),
        {
          type: 'FRAME',
          name: 'List',
          layout: 'col',
          w: 'fill',
          radius: '$radius/xl',
          fill: '$card',
          stroke: '$border',
          effects: 'shadow/xs',
          clip: true,
          children: rows,
        },
      ],
    }
  }
  const nav = (glyph, label, count) =>
    use(
      'sidebar/nav-item',
      { state: 'default' },
      {
        Glyph: { swap: `icon/${glyph}` },
        Label: label,
        'Show count': count !== undefined,
        Count: count ?? '',
      },
      { w: 'fill', name: label },
    )
  const folder = (name, count, state, shared, subfolders) =>
    use(
      'sidebar/folder',
      { state },
      { Name: name, Count: count, Shared: shared, Subfolders: subfolders },
      { w: 'fill', name },
    )
  const sidebar = {
    type: 'FRAME',
    name: 'Sidebar',
    layout: 'col',
    w: 256,
    h: 'fill',
    pad: [4, 0, 0, 0],
    fill: '$sidebar',
    stroke: '$sidebar-border',
    strokeWidth: [0, 1, 0, 0],
    children: [
      {
        type: 'FRAME',
        name: 'Search',
        layout: 'col',
        w: 'fill',
        pad: [0, '$space/8'],
        children: [
          use(
            'sidebar/search',
            undefined,
            { Label: 'Поиск' },
            { w: 'fill', name: 'Поиск', nested: { Kbd: { Keys: '⌘K' } } },
          ),
        ],
      },
      {
        type: 'FRAME',
        name: 'Nav',
        layout: 'col',
        gap: 2,
        w: 'fill',
        h: 'fill',
        pad: ['$space/12', '$space/8', 0, '$space/8'],
        children: [
          nav('house', 'Главная', '79'),
          nav('calendar-days', 'Сегодня'),
          nav('wand-sparkles', 'Навести порядок', '3'),
          {
            type: 'FRAME',
            name: 'Folders',
            layout: 'col',
            gap: 2,
            w: 'fill',
            pad: ['$space/20', 0, 0, 0],
            children: [
              use('sidebar/section', undefined, { Label: 'Папки' }, { w: 'fill', name: 'Папки' }),
              folder('Level Legends', '63', 'active', true, true),
              folder('Fixnote Internal', '1', 'default', false, false),
              folder('FixNote', '9', 'default', true, false),
            ],
          },
        ],
      },
      {
        type: 'FRAME',
        name: 'Footer',
        layout: 'row',
        justify: 'between',
        align: 'center',
        w: 'fill',
        h: 44,
        pad: [0, '$space/8'],
        stroke: '$sidebar-border',
        strokeWidth: [1, 0, 0, 0],
        children: [
          {
            type: 'FRAME',
            name: 'Status',
            layout: 'row',
            align: 'center',
            gap: '$space/4',
            children: [
              {
                type: 'FRAME',
                name: 'Sync',
                layout: 'row',
                justify: 'center',
                align: 'center',
                w: 28,
                h: 28,
                children: [icon('cloud-check', 14, '$muted-foreground')],
              },
              text('Version', 'v0.1.41', 'xs', '$muted-foreground'),
            ],
          },
          use(
            'button',
            { variant: 'ghost', size: 'icon-xs', state: 'default' },
            { Glyph: { swap: 'icon/settings' } },
            { name: 'Настройки' },
          ),
        ],
      },
    ],
  }
  const main = {
    type: 'FRAME',
    name: 'Content',
    layout: 'col',
    align: 'center',
    w: 'fill',
    h: 'fill',
    clip: true,
    children: [
      {
        type: 'FRAME',
        name: 'Folder list',
        layout: 'col',
        w: CONTENT,
        pad: ['$space/24', 0, 96, 0],
        children: [
          {
            type: 'FRAME',
            name: 'Header',
            layout: 'row',
            align: 'center',
            gap: '$space/12',
            w: 'fill',
            children: [
              {
                type: 'FRAME',
                name: 'Title',
                layout: 'row',
                align: 'center',
                gap: '$space/8',
                children: [
                  icon('folder', 20, '$muted-foreground'),
                  text('Title', 'Level Legends', '2xl-semibold', '$foreground'),
                ],
              },
              text('Count', 'Заметок: 63', 'sm', '$muted-foreground'),
              { type: 'FRAME', name: 'Spacer', w: 'fill', h: 1 },
              use(
                'button',
                { variant: 'outline', size: 'icon-sm', state: 'default' },
                { Glyph: { swap: 'icon/list' } },
                { name: 'Вид', radius: '$radius/full' },
              ),
            ],
          },
          group('Последние 7 дней', NOTES_7, true),
          group('Последние 30 дней', NOTES_30, false),
        ],
      },
    ],
  }
  const children = [
    use('titlebar', undefined, { Place: 'Level Legends' }, { w: 'fill', name: 'Title bar' }),
    { type: 'FRAME', name: 'Body', layout: 'row', w: 'fill', h: 'fill', children: [sidebar, main] },
  ]
  if (withSearch)
    children.push(
      {
        type: 'RECTANGLE',
        name: 'Overlay',
        absolute: true,
        x: 0,
        y: 0,
        w: W,
        h: H,
        fill: { color: '#000000', opacity: 0.25 },
        constraints: { h: 'stretch', v: 'stretch' },
      },
      use('spotlight', undefined, undefined, {
        name: 'Spotlight',
        absolute: true,
        // Centred, 18% from the top, as DialogContent places it.
        x: (W - 576) / 2,
        y: Math.round(H * 0.18),
        constraints: { h: 'center', v: 'start' },
      }),
    )
  return {
    type: 'FRAME',
    name,
    layout: 'col',
    w: W,
    h: H,
    radius: 10,
    fill: '$background',
    stroke: { color: '#000000', opacity: 0.12 },
    clip: true,
    children,
  }
}

function screensBoard() {
  return board('screens', 'Screens', [
    ...screenParts(),
    spotlight(),
    caption('Folder in the list view, and the same window with Spotlight (Ctrl+K) open.'),
    {
      type: 'FRAME',
      name: 'Windows',
      layout: 'row',
      gap: 64,
      children: [screen('Folder · list', false), screen('Folder · search', true)],
    },
  ])
}

// ---------------------------------------------------------------------------------------------
// Pushing.

/**
 * Push the kit (or some parts of it) through `job(kind, params, label)`; returns what happened, one
 * line per step. Parts run in KIT_PARTS order: later ones use the variables and components of
 * earlier ones, which must already be in the file.
 */
export async function pushKit(job, { parts, page = 'FixNote UI', log = () => {} } = {}) {
  const want = parts?.length ? parts : KIT_PARTS
  for (const p of want)
    if (!KIT_PARTS.includes(p)) throw new Error(`No kit part ${p}: ${KIT_PARTS.join(', ')}`)
  const lines = []
  const say = (line) => {
    lines.push(line)
    log(line)
  }
  const tokens = readTokens()
  const s = await strings()
  const root = {
    key: ROOT,
    type: 'FRAME',
    name: 'FixNote UI',
    layout: 'row',
    gap: 96,
    pad: 0,
    keep: true,
  }
  for (const part of KIT_PARTS.filter((p) => want.includes(p))) {
    if (part === 'tokens') {
      const [colors, ...rest] = tokenJobs(tokens, false)
      const r = await job(colors.kind, colors.params, colors.label)
      say(
        `variables ${r.collection}: ${r.made} new, ${r.updated} updated; modes ${r.modes.join(', ')}`,
      )
      for (const n of r.notes ?? []) say(`  ${n}`)
      const darkMissing = !r.modes.includes('Dark')
      if (darkMissing) {
        // A plan with one mode per collection: Dark goes to a collection of its own.
        const dark = tokenJobs(tokens, true)[1]
        const d = await job(dark.kind, dark.params, dark.label)
        say(
          `variables ${d.collection}: ${d.made} new, ${d.updated} updated (this plan allows one mode per collection)`,
        )
      }
      for (const j of rest) {
        const x = await job(j.kind, j.params, j.label)
        say(
          j.kind === 'styles'
            ? `styles: ${x.text} text, ${x.effect} effect`
            : `variables ${x.collection}: ${x.made} new, ${x.updated} updated`,
        )
      }
    }
    const boards = {
      tokens: () => tokensBoard(tokens),
      icons: () => iconsBoard(lucideDir()),
      button: () => buttonBoard(),
      controls: () => controlsBoard(s),
      dialog: () => dialogBoard(s),
      notes: () => notesBoard(),
      sidebar: () => sidebarBoard(s),
      screens: () => screensBoard(),
    }
    await job('build', { page, nodes: [root], show: false }, 'kit')
    const r = await job('build', { page, parent: ROOT, nodes: [boards[part]()], show: false }, part)
    say(`${part}: ${r.made} layers new, ${r.updated} updated`)
  }
  await job('show', { keys: [ROOT] }, 'kit')
  return lines
}
