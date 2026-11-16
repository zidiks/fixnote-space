/**
 * Blog cover specs in the Social page style, one per article and language on fixnote.space/blog
 * (en, ru, es: each language block sits to the right of the previous one).
 * Canvas 1200×630 (the site's og:image size): logo, two-line headline (ink + grey),
 * two-line subline, CTA pill, and a 570×570 art board with a Social silk/cloud texture
 * plus a small UI mockup. Keys `blog/<slug>` (English) and `blog/<lang>/<slug>` make re-pushes
 * update in place.
 *
 *   node tools/figma-bridge/fixnote/blog-covers.mjs          # writes blog-covers.json
 *   node tools/figma-bridge/bridge.mjs build fixnote/blog-covers.json --page "Blog covers"
 *
 * Rendered at 1x, each cover goes to apps/landing/src/assets/blog/<lang>/<slug>.png.
 * The logo is the word from brand/fixnote-wordmark.svg (the designer's, Figma 2031:2121), the
 * same file the app and the site are made from.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const LOGO = join(HERE, '..', '..', '..', 'brand', 'fixnote-wordmark.svg')
const logoSvg = readFileSync(LOGO, 'utf8')
const [, LOGO_VW, LOGO_VH] = /viewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(logoSvg).map(Number)
const LOGO_H = 25.5
const LOGO_W = Math.round(((LOGO_H * LOGO_VW) / LOGO_VH) * 100) / 100

// Social palette (sampled from the Social page frames).
const INK = '#211F1C'
const GRAY = '#9B9894'
const BG = '#F5F3F0'
const PAPER = '#FDFCFB'
const DGRAY = '#8A8682'
const DBG = '#151312'
const ORANGE = '#EC6100'
const WHITE = '#FFFFFF'
const w = (opacity) => ({ color: WHITE, opacity })

// Social textures, by image hash in this file.
const TEX = {
  'ember-silk': '750a832be64505a99c96a4be59c78d7e89dc0cb8',
  'ember-cloud': '1fcc396cb1b4f59e5792b1a063db3b4d35d10bae',
  'dawn-silk': 'aae94a7b6af12a982cfab38ae78d5a7a2fafb5de',
  'dawn-cloud': 'b62b69822aed5ea46669db67d6c3708e59f0e023',
  'dusk-silk': '8e1e48a256291dde7bcb95d9bd54193c563fe1c6',
  'dusk-cloud': 'c3e46c1dbb3bca83346a3a14922d16aaf7cf9f4f',
}
const tex = (name) => ({ type: 'IMAGE', imageHash: TEX[name], scaleMode: 'FILL' })

// Lucide-style stroke icons; `color` on the SVG spec repaints them.
const icon = (paths) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#000" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`
const ICONS = {
  search: icon('<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>'),
  mic: icon(
    '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>',
  ),
  folder: icon(
    '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/>',
  ),
  file: icon(
    '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z"/><path d="M14 3v5h5M9 13h6M9 17h4"/>',
  ),
  check: icon('<path d="m5 12 5 5 9-10"/>'),
  lock: icon(
    '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  ),
  image: icon(
    '<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="10" r="1.5"/><path d="m5 17 5-5 3 3 3-3 3 3"/>',
  ),
  link: icon(
    '<path d="M10 14a4 4 0 0 1 0-6l3-3a4 4 0 0 1 6 6l-1.5 1.5"/><path d="M14 10a4 4 0 0 1 0 6l-3 3a4 4 0 0 1-6-6L6.5 11.5"/>',
  ),
  repeat: icon(
    '<path d="m17 2 4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14"/><path d="m7 22-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/>',
  ),
  send: icon('<path d="M22 2 11 13"/><path d="M22 2 15 22l-4-9-9-4Z"/>'),
  sparkles: icon('<path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9Z"/>'),
  download: icon('<path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/>'),
  languages: icon(
    '<path d="M4 5h8"/><path d="M8 3v2c0 4-2 7-5 9"/><path d="M6 8c0 3 3 6 6 7"/><path d="m12 21 4-9 4 9"/><path d="M13.5 18h5"/>',
  ),
  calendar: icon(
    '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4M16 3v4M3 10h18"/>',
  ),
  users: icon(
    '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8"/><path d="M17.5 14.4a6.5 6.5 0 0 1 4 5.6"/>',
  ),
  'wifi-off': icon(
    '<path d="M2 2l20 20"/><path d="M8.5 16.5a5 5 0 0 1 7 0"/><path d="M5 13a10 10 0 0 1 5.2-2.7"/><path d="M19 13a10 10 0 0 0-3.4-2.2"/><path d="M12 20h.01"/>',
  ),
  terminal: icon('<path d="m4 17 6-5-6-5"/><path d="M12 19h8"/>'),
  key: icon(
    '<circle cx="8" cy="15" r="4"/><path d="m11 12 9-9"/><path d="M17 3l3 3"/><path d="M14 6l3 3"/>',
  ),
  copy: icon(
    '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/>',
  ),
  up: icon('<path d="M12 19V5"/><path d="m5 12 7-7 7 7"/>'),
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

// Text helpers. Geist, like Social; runs paint the second line grey.
const text = (name, str, o = {}) => ({
  type: 'TEXT',
  name,
  text: str,
  family: o.mono ? 'Geist Mono' : 'Geist',
  weight: o.weight ?? 'Regular',
  size: o.size ?? 19.5,
  lineHeight: o.lh ?? 25,
  letterSpacing: o.ls ?? '-2%',
  fill: o.fill ?? INK,
  ...(o.w !== undefined ? { w: o.w } : {}),
  ...(o.runs ? { runs: o.runs } : {}),
  ...(o.x !== undefined ? { x: o.x, y: o.y } : {}),
})
const twoLine = (name, a, b, o) => {
  const t = text(name, `${a}\n${b}`, o)
  t.runs = [{ start: a.length + 1, end: a.length + 1 + b.length, fill: o.grey }]
  return t
}

// Mockup parts, 0.75× the Social art scale.
const bubble = (str, o = {}) => ({
  type: 'FRAME',
  name: o.name ?? 'Bubble',
  layout: 'row',
  align: 'center',
  gap: 10,
  pad: [14, 19],
  radius: 19,
  fill: o.dark ? INK : o.translucent ? w(0.16) : WHITE,
  ...(o.w !== undefined ? { w: o.w } : {}),
  children: [
    ...(o.icon ? [svg(o.icon, 18, o.dark ? WHITE : (o.iconColor ?? INK))] : []),
    text('Text', str, {
      fill: o.dark ? WHITE : o.translucent ? PAPER : INK,
      ...(o.runs ? { runs: o.runs } : {}),
      ...(o.mono ? { mono: true, weight: 'Medium' } : {}),
    }),
  ],
})
const chip = (str, o = {}) => ({
  type: 'FRAME',
  name: 'Chip',
  layout: 'row',
  align: 'center',
  gap: 8,
  pad: [0, 14],
  h: 34,
  radius: 999,
  fill: o.fill ?? w(0.85),
  children: [
    ...(o.icon ? [svg(o.icon, 15, o.iconColor ?? ORANGE)] : []),
    text('Text', str, {
      size: 14.5,
      lh: 19,
      ls: '-1%',
      weight: o.weight ?? 'Regular',
      mono: o.mono,
      fill: o.color ?? INK,
    }),
  ],
})
const iconBox = (name, o = {}) => ({
  type: 'FRAME',
  name: 'Icon',
  w: 34,
  h: 34,
  radius: 9,
  fill: o.fill ?? BG,
  children: [svg(name, 18, o.color ?? INK, { center: true })],
})
const row = (iconName, title, sub, o = {}) => ({
  type: 'FRAME',
  name: `Row / ${title}`,
  layout: 'row',
  align: 'center',
  gap: 12,
  pad: o.pad ?? [12, 14],
  radius: 16,
  w: 'fill',
  ...(o.fill !== undefined ? { fill: o.fill } : {}),
  children: [
    ...(iconName ? [iconBox(iconName, o.iconBox ?? {})] : []),
    {
      type: 'FRAME',
      name: 'Labels',
      layout: 'col',
      gap: 2,
      w: 'fill',
      children: [
        text('Title', title, {
          size: 19,
          lh: 24,
          ls: '-1.5%',
          weight: 'Medium',
          fill: o.titleFill ?? INK,
        }),
        ...(sub
          ? [text('Sub', sub, { size: 14.5, lh: 19, ls: '-1%', fill: o.subFill ?? GRAY })]
          : []),
      ],
    },
    ...(o.right ? [o.right] : []),
  ],
})
const panel = (children, o = {}) => ({
  type: 'FRAME',
  name: o.name ?? 'Panel',
  layout: 'col',
  gap: o.gap ?? 6,
  pad: o.pad ?? [10, 10],
  radius: 19,
  w: 506,
  fill: o.fill ?? WHITE,
  children,
})
const pill = (str, o = {}) => ({
  type: 'FRAME',
  name: 'Button',
  layout: 'row',
  align: 'center',
  pad: [0, o.padX ?? 14],
  h: o.h ?? 30,
  radius: 999,
  fill: o.fill ?? INK,
  children: [
    text('Text', str, {
      size: o.size ?? 14,
      lh: 18,
      ls: '-1%',
      weight: 'Medium',
      fill: o.color ?? WHITE,
    }),
  ],
})
const searchBar = (query, o = {}) => ({
  type: 'FRAME',
  name: 'Search bar',
  layout: 'row',
  align: 'center',
  gap: 12,
  pad: [0, 18],
  h: 54,
  radius: 19,
  w: 506,
  fill: WHITE,
  children: [
    svg('search', 20, GRAY),
    text('Query', query, { w: 'fill', fill: INK }),
    ...(o.kbd === false
      ? []
      : [
          {
            type: 'FRAME',
            name: 'Kbd',
            layout: 'row',
            align: 'center',
            pad: [0, 10],
            h: 30,
            radius: 8,
            fill: BG,
            children: [
              text('Keys', o.kbd ?? 'Ctrl K', {
                mono: true,
                weight: 'Medium',
                size: 14,
                lh: 18,
                ls: '0%',
                fill: GRAY,
              }),
            ],
          },
        ]),
  ],
})
const col = (children, o = {}) => ({
  type: 'FRAME',
  name: o.name ?? 'Art content',
  layout: 'col',
  gap: o.gap ?? 14,
  w: 506,
  x: 32,
  y: o.y ?? 150,
  children,
})
const endRow = (child) => ({
  type: 'FRAME',
  name: 'Align end',
  layout: 'row',
  justify: 'end',
  w: 'fill',
  children: [child],
})
const radio = (on) =>
  on
    ? {
        type: 'FRAME',
        name: 'Radio on',
        w: 22,
        h: 22,
        radius: 999,
        fill: ORANGE,
        children: [{ type: 'ELLIPSE', name: 'Dot', w: 8, h: 8, fill: WHITE, center: true }],
      }
    : {
        type: 'ELLIPSE',
        name: 'Radio',
        w: 22,
        h: 22,
        stroke: { color: INK, opacity: 0.25 },
        strokeWidth: 2,
      }
const toggle = () => ({
  type: 'FRAME',
  name: 'Switch on',
  w: 46,
  h: 26,
  radius: 999,
  fill: ORANGE,
  children: [{ type: 'ELLIPSE', name: 'Knob', w: 20, h: 20, fill: WHITE, x: 23, y: 3 }],
})
const kbd = (keys) => ({
  type: 'FRAME',
  name: `Kbd / ${keys}`,
  layout: 'row',
  align: 'center',
  pad: [0, 10],
  h: 34,
  radius: 8,
  fill: BG,
  children: [
    text('Keys', keys, { mono: true, weight: 'Medium', size: 15, lh: 19, ls: '0%', fill: INK }),
  ],
})
const hexCard = (lines) => ({
  type: 'FRAME',
  name: 'Ciphertext',
  layout: 'col',
  pad: [16, 18],
  radius: 16,
  w: 506,
  fill: w(0.08),
  children: [text('Hex', lines, { mono: true, size: 15.5, lh: 26, ls: '0%', fill: w(0.7) })],
})
const lockHead = (title, sub) => ({
  type: 'FRAME',
  name: 'Lock head',
  layout: 'row',
  align: 'center',
  gap: 14,
  w: 'fill',
  children: [
    iconBox('lock', { fill: w(0.12), color: PAPER }),
    {
      type: 'FRAME',
      name: 'Labels',
      layout: 'col',
      gap: 2,
      children: [
        text('Title', title, { size: 19, lh: 24, ls: '-1.5%', weight: 'Medium', fill: PAPER }),
        text('Sub', sub, { size: 14.5, lh: 19, ls: '-1%', fill: DGRAY }),
      ],
    },
  ],
})
const chips = (items) => ({
  type: 'FRAME',
  name: 'Chips',
  layout: 'row',
  gap: 10,
  w: 'fill',
  children: items,
})
// Voice-style orb with the mic glass circle, bubbles absolute around it.
const orbArt = (bubbles) => [
  {
    type: 'FRAME',
    name: 'Orb',
    x: 95,
    y: 70,
    w: 380,
    h: 380,
    radius: 999,
    clip: true,
    fill: tex('ember-cloud'),
  },
  {
    type: 'FRAME',
    name: 'Mic',
    x: 230,
    y: 205,
    w: 110,
    h: 110,
    radius: 999,
    fill: w(0.3),
    effects: [{ type: 'BACKGROUND_BLUR', blur: 15 }],
    children: [svg('mic', 46, WHITE, { center: true })],
  },
  ...bubbles,
]

/** A run that paints `part` of `str` (found by text, so translations keep their marks). */
const mark = (str, part, style) => {
  const start = str.indexOf(part)
  if (start < 0) throw new Error(`"${part}" is not in "${str}"`)
  return [{ start, end: start + part.length, ...style }]
}
const MONO_ORANGE = { fill: ORANGE, family: 'Geist Mono', weight: 'Medium' }
const saved = (str, tag) => bubble(str, { runs: mark(str, tag, MONO_ORANGE) })

const LANGS = ['en', 'ru', 'es']

// The 19 articles, in blog order. `slug` per language (the post's file name), `t` the cover's words
// per language: head/sub are [ink line, grey line], the rest is what the art shows.
const ARTICLES = [
  {
    slug: {
      en: 'best-ai-note-taking-apps',
      ru: 'luchshie-prilozheniya-dlya-zametok-s-ii',
      es: 'mejores-apps-de-notas-con-ia',
    },
    tex: 'dawn-silk',
    t: {
      en: {
        head: ['Six note apps.', 'One honest look.'],
        sub: ['AI, price, encryption, platforms —', 'Fixnote vs Notion, Obsidian and more.'],
        cta: 'Read the comparison',
        fixnote: 'E2E always · free AI option',
        notion: 'AI trial · no end-to-end encryption',
        obsidian: 'E2E with paid Sync',
      },
      ru: {
        head: ['Шесть приложений.', 'Честный взгляд.'],
        sub: ['ИИ, цена, шифрование, платформы —', 'Fixnote, Notion, Obsidian и другие.'],
        cta: 'Читать сравнение',
        fixnote: 'Всегда E2E · есть бесплатный ИИ',
        notion: 'ИИ на пробу · без сквозного шифрования',
        obsidian: 'E2E с платным Sync',
      },
      es: {
        head: ['Seis apps de notas.', 'Una mirada honesta.'],
        sub: ['IA, precio, cifrado, plataformas —', 'Fixnote frente a Notion, Obsidian y más.'],
        cta: 'Leer la comparativa',
        fixnote: 'Siempre E2E · opción de IA gratis',
        notion: 'IA de prueba · sin cifrado de extremo a extremo',
        obsidian: 'E2E con Sync de pago',
      },
    },
    art: (s) =>
      col(
        [
          panel([
            row('sparkles', 'Fixnote', s.fixnote, { right: svg('check', 20, ORANGE) }),
            row('file', 'Notion', s.notion),
            row('file', 'Obsidian', s.obsidian),
          ]),
          chips([chip('+ Evernote, Apple Notes, Joplin', { color: INK })]),
        ],
        { y: 140 },
      ),
  },
  {
    slug: {
      en: 'call-transcription-and-summary',
      ru: 'itogi-vstrechi-na-kompyutere',
      es: 'transcripcion-y-resumen-de-llamadas',
    },
    tex: 'ember-cloud',
    board: '#E8E5E0', // plain board like Social / voice, so the orb reads against it
    t: {
      en: {
        head: ['Record the call.', 'Keep the decisions.'],
        sub: ['Zoom, Meet or Telegram, transcribed', 'on your computer. No audio is kept.'],
        cta: 'See how it works',
        call: 'Product sync · Zoom · 42 min',
        working: 'Transcribing on your device…',
        done: '[saved] 3 decisions · 2 tasks',
        tag: '[saved]',
      },
      ru: {
        head: ['Запишите созвон.', 'Решения останутся.'],
        sub: ['Zoom, Meet или Telegram — расшифровка', 'на компьютере. Аудио не хранится.'],
        cta: 'Как это работает',
        call: 'Синк по продукту · Zoom · 42 мин',
        working: 'Расшифровка на устройстве…',
        done: '[готово] 3 решения · 2 задачи',
        tag: '[готово]',
      },
      es: {
        head: ['Graba la llamada.', 'Quédate lo decidido.'],
        sub: ['Zoom, Meet o Telegram, transcrito', 'en tu ordenador. No se guarda audio.'],
        cta: 'Mira cómo funciona',
        call: 'Sync de producto · Zoom · 42 min',
        working: 'Transcribiendo en tu equipo…',
        done: '[listo] 3 decisiones · 2 tareas',
        tag: '[listo]',
      },
    },
    art: (s) =>
      orbArt([
        { ...bubble(s.call, { dark: true }), x: 38, y: 110 },
        { ...bubble(s.working), x: 225, y: 385 },
        { ...saved(s.done, s.tag), x: 200, y: 448 },
      ]),
  },
  {
    slug: {
      en: 'ai-assistant-for-notes',
      ru: 'assistent-kotoryj-menyaet-zametki',
      es: 'asistente-ia-para-notas',
    },
    tex: 'ember-silk',
    t: {
      en: {
        head: ['Ask your notes.', 'Get sources back.'],
        sub: ['Answers from your own notes, with', 'a citation for every claim.'],
        cta: 'Meet the assistant',
        q: 'What did we decide about pricing?',
        a: 'You settled on $7 a month or $60 a year. [1]',
        source: '1 · Pricing call · Mar 12',
      },
      ru: {
        head: ['Спросите заметки.', 'Получите источники.'],
        sub: ['Ответы из ваших заметок, и у каждого', 'утверждения есть ссылка.'],
        cta: 'Узнать об ассистенте',
        q: 'Что мы решили по ценам?',
        a: 'Остановились на $7 в месяц или $60 в год. [1]',
        source: '1 · Созвон по ценам · 12 мар',
      },
      es: {
        head: ['Pregunta a tus notas.', 'Recibe las fuentes.'],
        sub: ['Respuestas de tus propias notas, con', 'una cita para cada afirmación.'],
        cta: 'Conoce al asistente',
        q: '¿Qué decidimos sobre el precio?',
        a: 'Quedamos en $7 al mes o $60 al año. [1]',
        source: '1 · Llamada de precios · 12 mar',
      },
    },
    art: (s) =>
      col(
        [
          endRow(bubble(s.q, { dark: true })),
          bubble(s.a, { runs: mark(s.a, '[1]', MONO_ORANGE) }),
          chips([chip(s.source, { icon: 'file', color: ORANGE, fill: w(0.85) })]),
        ],
        { y: 165, gap: 12 },
      ),
  },
  {
    slug: {
      en: 'offline-speech-to-text-dictation',
      ru: 'diktovka-bez-interneta',
      es: 'dictado-por-voz-sin-internet',
    },
    tex: 'dawn-cloud',
    t: {
      en: {
        head: ['Say it out loud.', 'It stays on device.'],
        sub: ['Offline dictation on Windows and Mac.', 'Your voice never leaves the computer.'],
        cta: 'Try dictation',
        listening: 'Listening… offline',
        done: '[saved] Note · just now',
        tag: '[saved]',
      },
      ru: {
        head: ['Скажите вслух.', 'Голос не уходит.'],
        sub: ['Диктовка без интернета на Windows и Mac:', 'речь распознаётся на компьютере.'],
        cta: 'Попробовать диктовку',
        listening: 'Слушаю… офлайн',
        done: '[готово] Заметка · сейчас',
        tag: '[готово]',
      },
      es: {
        head: ['Dilo en voz alta.', 'Se queda en tu equipo.'],
        sub: ['Dictado sin internet en Windows y Mac.', 'Tu voz nunca sale del ordenador.'],
        cta: 'Prueba el dictado',
        listening: 'Escuchando… sin conexión',
        done: '[listo] Nota · ahora mismo',
        tag: '[listo]',
      },
    },
    art: (s) => [
      {
        type: 'FRAME',
        name: 'Mic',
        x: 210,
        y: 190,
        w: 150,
        h: 150,
        radius: 999,
        fill: w(0.45),
        effects: [{ type: 'BACKGROUND_BLUR', blur: 15 }],
        children: [svg('mic', 62, INK, { center: true })],
      },
      { ...bubble(s.listening, { dark: true }), x: 40, y: 110 },
      { ...saved(s.done, s.tag), x: 245, y: 400 },
    ],
  },
  {
    slug: {
      en: 'save-telegram-messages-to-notes',
      ru: 'zametki-iz-telegram',
      es: 'guardar-mensajes-de-telegram-en-notas',
    },
    tex: 'dawn-silk',
    t: {
      en: {
        head: ['Forward it.', 'It becomes a note.'],
        sub: [
          'Text, links and voice to the Fixnote bot —',
          'saved encrypted, straight to your folder.',
        ],
        cta: 'Connect the bot',
        fwd: 'Forwarded from Telegram',
        saved: 'Saved to Links · fixnote.space/…',
        chip: 'The bot can’t read your chats',
      },
      ru: {
        head: ['Перешлите.', 'Это уже заметка.'],
        sub: ['Текст, ссылки и голосовые боту Fixnote —', 'зашифровано и сразу в нужной папке.'],
        cta: 'Подключить бота',
        fwd: 'Переслано из Telegram',
        saved: 'Сохранено в «Ссылки» · fixnote.space/…',
        chip: 'Бот не читает ваши чаты',
      },
      es: {
        head: ['Reenvíalo.', 'Ya es una nota.'],
        sub: ['Texto, enlaces y voz al bot de Fixnote —', 'cifrado y directo a tu carpeta.'],
        cta: 'Conecta el bot',
        fwd: 'Reenviado desde Telegram',
        saved: 'Guardado en Enlaces · fixnote.space/…',
        chip: 'El bot no puede leer tus chats',
      },
    },
    art: (s) =>
      col(
        [
          endRow(bubble(s.fwd, { dark: true, icon: 'send' })),
          bubble(s.saved),
          chips([chip(s.chip, { icon: 'lock', color: INK })]),
        ],
        { y: 165, gap: 12 },
      ),
  },
  {
    slug: {
      en: 'daily-note-and-recurring-tasks',
      ru: 'zametka-dnya-i-povtoryayushchiesya-zadachi',
      es: 'nota-diaria-y-tareas-repetidas',
    },
    tex: 'ember-silk',
    t: {
      en: {
        head: ['One note a day.', 'Tasks on schedule.'],
        sub: ['Unfinished tasks carry over; recurring', 'ones appear exactly when they’re due.'],
        cta: 'Set up daily notes',
        rows: [
          ['Today · Thursday', 'Daily note · 3 tasks'],
          ['Standup notes', 'Every weekday · 9:00'],
          ['Review the budget', 'Once a month · on the 1st'],
        ],
      },
      ru: {
        head: ['Заметка на день.', 'Задачи по графику.'],
        sub: ['Невыполненные задачи переносятся,', 'повторяющиеся приходят в свой день.'],
        cta: 'Настроить заметку дня',
        rows: [
          ['Сегодня · четверг', 'Заметка дня · 3 задачи'],
          ['Заметки к планёрке', 'По будням · 9:00'],
          ['Проверить бюджет', 'Раз в месяц · 1-го числа'],
        ],
      },
      es: {
        head: ['Una nota al día.', 'Tareas a su hora.'],
        sub: ['Lo pendiente pasa al día siguiente;', 'lo que se repite llega cuando toca.'],
        cta: 'Configura la nota diaria',
        rows: [
          ['Hoy · jueves', 'Nota diaria · 3 tareas'],
          ['Notas del standup', 'Cada día laborable · 9:00'],
          ['Revisar el presupuesto', 'Una vez al mes · el día 1'],
        ],
      },
    },
    art: (s) =>
      col(
        [
          panel([
            row('calendar', ...s.rows[0]),
            row('repeat', ...s.rows[1]),
            row('repeat', ...s.rows[2]),
          ]),
        ],
        { y: 165 },
      ),
  },
  {
    slug: {
      en: 'shared-notes-and-folders',
      ru: 'obshchie-zametki-i-papki',
      es: 'notas-y-carpetas-compartidas',
    },
    tex: 'dawn-cloud',
    t: {
      en: {
        head: ['Share a folder.', 'Keep the encryption.'],
        sub: ['Edit and view roles, live cursors —', 'the server still sees only ciphertext.'],
        cta: 'Share your first note',
        folder: ['Work', 'Shared folder · 24 notes'],
        editor: ['Anna', 'Can edit · online now', 'edit'],
        viewer: ['Max', 'View only', 'view'],
        chip: 'End-to-end encrypted',
      },
      ru: {
        head: ['Общая папка.', 'Шифрование то же.'],
        sub: ['Права на правку и просмотр, курсоры —', 'а сервер видит только шифротекст.'],
        cta: 'Поделиться заметкой',
        folder: ['Работа', 'Общая папка · 24 заметки'],
        editor: ['Анна', 'Может править · в сети', 'правка'],
        viewer: ['Макс', 'Только просмотр', 'просмотр'],
        chip: 'Сквозное шифрование',
      },
      es: {
        head: ['Comparte una carpeta.', 'El cifrado sigue.'],
        sub: ['Roles de edición y lectura, cursores —', 'el servidor solo ve texto cifrado.'],
        cta: 'Comparte tu primera nota',
        folder: ['Trabajo', 'Carpeta compartida · 24 notas'],
        editor: ['Ana', 'Puede editar · en línea', 'editar'],
        viewer: ['Max', 'Solo lectura', 'ver'],
        chip: 'Cifrado de extremo a extremo',
      },
    },
    art: (s) =>
      col(
        [
          panel([
            row('folder', ...s.folder),
            row('users', s.editor[0], s.editor[1], {
              right: chip(s.editor[2], { fill: BG, color: GRAY }),
            }),
            row('users', s.viewer[0], s.viewer[1], {
              right: chip(s.viewer[2], { fill: BG, color: GRAY }),
            }),
          ]),
          chips([chip(s.chip, { icon: 'lock', color: INK })]),
        ],
        { y: 130 },
      ),
  },
  {
    slug: {
      en: 'mcp-server-for-notes',
      ru: 'claude-i-cursor-chitayut-zametki',
      es: 'servidor-mcp-para-notas',
    },
    tex: 'dusk-silk',
    t: {
      en: {
        head: ['Your notes,', 'one prompt away.'],
        sub: ['Claude, Cursor and Codex read only', 'the folders you pick.'],
        cta: 'Connect your AI',
        ask: 'Add today’s decisions to my Launch note.',
        done: 'Done. 3 decisions added to Launch plan.',
        note: 'Launch plan.',
        placeholder: 'Ask about your notes…',
      },
      ru: {
        head: ['Ваши заметки —', 'в одном запросе.'],
        sub: ['Claude, Cursor и Codex читают только', 'те папки, которые вы выбрали.'],
        cta: 'Подключить ИИ',
        ask: 'Добавь сегодняшние решения в «Запуск».',
        done: 'Готово. 3 решения в «Плане запуска».',
        note: '«Плане запуска».',
        placeholder: 'Спросите о своих заметках…',
      },
      es: {
        head: ['Tus notas,', 'a un solo prompt.'],
        sub: ['Claude, Cursor y Codex leen solo', 'las carpetas que tú eliges.'],
        cta: 'Conecta tu IA',
        ask: 'Añade las decisiones de hoy a Lanzamiento.',
        done: 'Hecho: 3 decisiones en Plan de lanzamiento.',
        note: 'Plan de lanzamiento.',
        placeholder: 'Pregunta sobre tus notas…',
      },
    },
    art: (s) =>
      col(
        [
          endRow(bubble(s.ask, { translucent: true })),
          bubble(s.done, { runs: mark(s.done, s.note, { fill: ORANGE }) }),
          {
            type: 'FRAME',
            name: 'Prompt bar',
            layout: 'row',
            align: 'center',
            gap: 10,
            pad: [0, 10, 0, 18],
            h: 54,
            radius: 19,
            w: 506,
            fill: w(0.16),
            children: [
              text('Placeholder', s.placeholder, { w: 'fill', fill: w(0.75) }),
              chip('Fixnote MCP', { icon: 'check', iconColor: PAPER, fill: w(0.16), color: PAPER }),
              {
                type: 'FRAME',
                name: 'Send',
                w: 38,
                h: 38,
                radius: 999,
                fill: WHITE,
                children: [svg('up', 18, INK, { center: true })],
              },
            ],
          },
        ],
        { y: 150, gap: 12 },
      ),
  },
  {
    slug: { en: 'search-text-in-images', ru: 'tekst-s-kartinok', es: 'buscar-texto-en-imagenes' },
    tex: 'dawn-silk',
    t: {
      en: {
        head: ['Search the words', 'inside your photos.'],
        sub: ['Receipts, screenshots, whiteboards —', 'OCR runs on your device.'],
        cta: 'See OCR search',
        query: 'total from the receipt',
        receipt: ['Receipt photo', 'Text in image: “total $42.00”'],
        board: ['Whiteboard photo', '“launch timeline · April”'],
        chip: 'On-device OCR',
      },
      ru: {
        head: ['Ищите слова', 'внутри фотографий.'],
        sub: ['Чеки, скриншоты, доски —', 'текст распознаётся на устройстве.'],
        cta: 'Поиск по картинкам',
        query: 'итого по чеку',
        receipt: ['Фото чека', 'Текст на картинке: «итого 4 200 ₽»'],
        board: ['Фото доски', '«план запуска · апрель»'],
        chip: 'Распознавание на устройстве',
      },
      es: {
        head: ['Busca las palabras', 'dentro de tus fotos.'],
        sub: ['Tickets, capturas, pizarras —', 'el OCR se hace en tu equipo.'],
        cta: 'Mira la búsqueda OCR',
        query: 'total del ticket',
        receipt: ['Foto del ticket', 'Texto en la imagen: «total 42,00 €»'],
        board: ['Foto de la pizarra', '«plan de lanzamiento · abril»'],
        chip: 'OCR en el dispositivo',
      },
    },
    art: (s) =>
      col(
        [
          searchBar(s.query),
          panel([row('image', ...s.receipt), row('image', ...s.board)]),
          chips([chip(s.chip, { icon: 'image', color: INK })]),
        ],
        { y: 120, gap: 12 },
      ),
  },
  {
    slug: {
      en: 'move-notes-from-notion-obsidian-bear',
      ru: 'pereezd-iz-notion-bear-obsidian',
      es: 'pasar-notas-de-notion-obsidian-bear',
    },
    tex: 'ember-silk',
    t: {
      en: {
        head: ['Moving in?', 'Bring everything.'],
        sub: ['Notion, Obsidian, Bear, Apple Notes —', 'Markdown in, Markdown out.'],
        cta: 'Start the import',
        rows: [
          ['Notion export.zip', '128 notes · imported'],
          ['Obsidian vault', '342 notes · imported'],
          ['Bear backup', '57 notes · importing…'],
        ],
        chip: 'Markdown in, Markdown out',
      },
      ru: {
        head: ['Переезжаете?', 'Берите всё.'],
        sub: ['Notion, Obsidian, Bear, Apple Notes —', 'Markdown на входе и на выходе.'],
        cta: 'Начать импорт',
        rows: [
          ['Notion export.zip', '128 заметок · перенесено'],
          ['Хранилище Obsidian', '342 заметки · перенесено'],
          ['Копия Bear', '57 заметок · переносим…'],
        ],
        chip: 'Markdown на входе и на выходе',
      },
      es: {
        head: ['¿Te mudas?', 'Tráelo todo.'],
        sub: ['Notion, Obsidian, Bear, Apple Notes —', 'Markdown de entrada y de salida.'],
        cta: 'Empieza a importar',
        rows: [
          ['Notion export.zip', '128 notas · importadas'],
          ['Bóveda de Obsidian', '342 notas · importadas'],
          ['Copia de Bear', '57 notas · importando…'],
        ],
        chip: 'Markdown de entrada y de salida',
      },
    },
    art: (s) =>
      col(
        [
          panel([
            row('download', ...s.rows[0], { right: svg('check', 20, ORANGE) }),
            row('download', ...s.rows[1], { right: svg('check', 20, ORANGE) }),
            row('download', ...s.rows[2]),
          ]),
          chips([chip(s.chip, { color: INK })]),
        ],
        { y: 140 },
      ),
  },
  {
    slug: { en: 'tidy-up-notes-with-ai', ru: 'navesti-poryadok', es: 'ordenar-notas-con-ia' },
    tex: 'dawn-cloud',
    t: {
      en: {
        head: ['Save now.', 'Sort later.'],
        sub: ['Folders, titles and duplicates suggested.', 'You accept, reject or undo each one.'],
        cta: 'Tidy up your notes',
        accept: 'Accept',
        rows: [
          ['Move to “Work”', 'Q3 budget notes'],
          ['Rename to “Trip to Lisbon”', 'Untitled note'],
          ['Merge 2 duplicates', 'Grocery list'],
        ],
      },
      ru: {
        head: ['Сохраните сейчас.', 'Разберите потом.'],
        sub: [
          'ИИ предложит папки, заголовки и дубли.',
          'Каждое можно принять, отклонить, отменить.',
        ],
        cta: 'Навести порядок',
        accept: 'Принять',
        rows: [
          ['В папку «Работа»', 'Бюджет на третий квартал'],
          ['Назвать «Поездка в Лиссабон»', 'Без названия'],
          ['Объединить 2 дубля', 'Список покупок'],
        ],
      },
      es: {
        head: ['Guarda ahora.', 'Ordena después.'],
        sub: [
          'Carpetas, títulos y duplicados sugeridos.',
          'Aceptas, rechazas o deshaces cada uno.',
        ],
        cta: 'Ordena tus notas',
        accept: 'Aceptar',
        rows: [
          ['Mover a «Trabajo»', 'Presupuesto del T3'],
          ['Renombrar a «Viaje a Lisboa»', 'Nota sin título'],
          ['Fusionar 2 duplicados', 'Lista de la compra'],
        ],
      },
    },
    art: (s) =>
      col(
        [
          row('folder', ...s.rows[0], { fill: WHITE, pad: [14, 14], right: pill(s.accept) }),
          row('file', ...s.rows[1], { fill: WHITE, pad: [14, 14], right: pill(s.accept) }),
          row('copy', ...s.rows[2], { fill: WHITE, pad: [14, 14], right: pill(s.accept) }),
        ],
        { y: 165, gap: 12 },
      ),
  },
  {
    slug: { en: 'share-a-note-by-link', ru: 'ssylka-na-zametku', es: 'compartir-nota-por-enlace' },
    tex: 'ember-silk',
    t: {
      en: {
        head: ['A link that', 'keeps the secret.'],
        sub: ['Read-only sharing; the key lives after #', 'so the server never sees the text.'],
        cta: 'Share by link',
        readOnly: 'Read-only',
        key: 'Key in #fragment',
        revoke: 'Revoke link',
      },
      ru: {
        head: ['Ссылка, которая', 'хранит секрет.'],
        sub: ['Только чтение; ключ живёт после #,', 'поэтому сервер не видит текст.'],
        cta: 'Поделиться ссылкой',
        readOnly: 'Только чтение',
        key: 'Ключ после #',
        revoke: 'Отозвать ссылку',
      },
      es: {
        head: ['Un enlace que', 'guarda el secreto.'],
        sub: ['Solo lectura; la clave va después de #,', 'así el servidor nunca ve el texto.'],
        cta: 'Comparte por enlace',
        readOnly: 'Solo lectura',
        key: 'Clave tras el #',
        revoke: 'Revocar enlace',
      },
    },
    art: (s) =>
      col(
        [
          {
            type: 'FRAME',
            name: 'Link card',
            layout: 'col',
            gap: 14,
            pad: [18, 20],
            radius: 19,
            w: 506,
            fill: WHITE,
            children: [
              {
                type: 'FRAME',
                name: 'Link',
                layout: 'row',
                align: 'center',
                gap: 12,
                w: 'fill',
                children: [
                  svg('link', 20, INK),
                  text('Url', 'fixnote.space/n/7f3a…#k92c…', {
                    mono: true,
                    size: 17,
                    lh: 22,
                    ls: '0%',
                    w: 'fill',
                  }),
                ],
              },
              chips([
                chip(s.readOnly, { fill: BG, color: GRAY }),
                chip(s.key, { fill: BG, color: GRAY }),
              ]),
            ],
          },
          { ...pill(s.revoke, { h: 44, padX: 20, size: 16 }), name: 'Revoke' },
        ],
        { y: 165 },
      ),
  },
  {
    slug: { en: 'recovery-phrase', ru: 'fraza-vosstanovleniya', es: 'frase-de-recuperacion' },
    dark: true,
    tex: 'dusk-cloud',
    t: {
      en: {
        head: ['Twelve words.', 'The whole key.'],
        sub: ['Write them down once, keep them offline.', 'No phrase — no recovery. By design.'],
        cta: 'How the key works',
        lock: ['Your recovery phrase', 'Shown once · never synced'],
        synced: 'Never synced',
        only: 'Only you have it',
      },
      ru: {
        head: ['Двенадцать слов.', 'Это весь ключ.'],
        sub: ['Запишите их один раз и храните офлайн.', 'Нет фразы — нет восстановления.'],
        cta: 'Как устроен ключ',
        lock: ['Ваша фраза восстановления', 'Показывается один раз · не синхронизируется'],
        synced: 'Не синхронизируется',
        only: 'Есть только у вас',
      },
      es: {
        head: ['Doce palabras.', 'Toda la clave.'],
        sub: [
          'Anótalas una vez y guárdalas sin conexión.',
          'Sin frase no hay recuperación. A propósito.',
        ],
        cta: 'Cómo funciona la clave',
        lock: ['Tu frase de recuperación', 'Se muestra una vez · nunca se sincroniza'],
        synced: 'Nunca se sincroniza',
        only: 'Solo la tienes tú',
      },
    },
    art: (s) =>
      col(
        [
          lockHead(...s.lock),
          {
            type: 'FRAME',
            name: 'Words',
            layout: 'col',
            pad: [16, 18],
            radius: 16,
            w: 506,
            fill: w(0.1),
            children: [
              text(
                'Words',
                'ember · candle · harbor · meadow\nquartz · lantern · river · saddle\nthicket · velvet · willow · amber',
                {
                  mono: true,
                  size: 15.5,
                  lh: 26,
                  ls: '0%',
                  fill: w(0.8),
                },
              ),
            ],
          },
          chips([
            chip(s.synced, { icon: 'check', iconColor: PAPER, fill: w(0.12), color: PAPER }),
            chip(s.only, { fill: w(0.12), color: PAPER }),
          ]),
        ],
        { y: 130 },
      ),
  },
  {
    slug: { en: 'offline-notes-app', ru: 'fixnote-bez-interneta', es: 'app-de-notas-sin-internet' },
    tex: 'dusk-silk',
    t: {
      en: {
        head: ['No internet?', 'Still your notes.'],
        sub: ['Everything works offline; sync waits.', 'Ollama keeps the assistant local too.'],
        cta: 'Go offline',
        local: ['Only on this device', 'Sync pauses, notes stay'],
        ollama: ['Ollama · local model', 'Assistant runs on this computer'],
        badge: 'Local',
        chip: 'Sync resumes when you’re back online',
      },
      ru: {
        head: ['Нет интернета?', 'Заметки с вами.'],
        sub: [
          'Всё работает офлайн, синхронизация ждёт.',
          'С Ollama и ассистент работает локально.',
        ],
        cta: 'Работать офлайн',
        local: ['Только на этом устройстве', 'Синхронизация на паузе, заметки здесь'],
        ollama: ['Ollama · локальная модель', 'Ассистент работает на компьютере'],
        badge: 'Локально',
        chip: 'Синхронизация продолжится, когда появится сеть',
      },
      es: {
        head: ['¿Sin internet?', 'Tus notas siguen.'],
        sub: [
          'Todo funciona sin conexión; la sync espera.',
          'Con Ollama, el asistente también es local.',
        ],
        cta: 'Trabaja sin conexión',
        local: ['Solo en este dispositivo', 'La sync se pausa, las notas siguen'],
        ollama: ['Ollama · modelo local', 'El asistente corre en este equipo'],
        badge: 'Local',
        chip: 'La sync vuelve cuando hay conexión',
      },
    },
    art: (s) =>
      col(
        [
          panel([
            row('wifi-off', ...s.local, { right: toggle() }),
            row('terminal', ...s.ollama, { right: chip(s.badge, { fill: BG, color: GRAY }) }),
          ]),
          chips([chip(s.chip, { color: INK })]),
        ],
        { y: 160 },
      ),
  },
  {
    slug: {
      en: 'which-ai-model-for-fixnote-assistant',
      ru: 'kakuyu-model-vybrat-dlya-assistenta',
      es: 'que-modelo-de-ia-elegir-para-el-asistente',
    },
    tex: 'dawn-silk',
    t: {
      en: {
        head: ['Three ways', 'to run the AI.'],
        sub: ['Fixnote AI, your own key or Ollama —', 'what each sends, and where it runs.'],
        cta: 'Pick your model',
        rows: [
          ['Fixnote AI', 'Encrypted · works on Free'],
          ['Your own API key', 'Straight to the provider'],
          ['Ollama', 'Fully on this device'],
        ],
      },
      ru: {
        head: ['Три способа', 'запустить ИИ.'],
        sub: ['Fixnote AI, свой ключ или Ollama —', 'что куда уходит и где работает.'],
        cta: 'Выбрать модель',
        rows: [
          ['Fixnote AI', 'Зашифровано · есть на Free'],
          ['Свой API-ключ', 'Напрямую к провайдеру'],
          ['Ollama', 'Целиком на этом устройстве'],
        ],
      },
      es: {
        head: ['Tres formas', 'de usar la IA.'],
        sub: ['Fixnote AI, tu propia clave u Ollama —', 'qué envía cada uno y dónde se ejecuta.'],
        cta: 'Elige tu modelo',
        rows: [
          ['Fixnote AI', 'Cifrado · funciona en Free'],
          ['Tu propia clave de API', 'Directo al proveedor'],
          ['Ollama', 'Todo en este dispositivo'],
        ],
      },
    },
    art: (s) =>
      col(
        [
          panel([
            row('sparkles', ...s.rows[0], { right: radio(true) }),
            row('key', ...s.rows[1], { right: radio(false) }),
            row('terminal', ...s.rows[2], { right: radio(false) }),
          ]),
        ],
        { y: 165 },
      ),
  },
  {
    slug: {
      en: 'how-to-take-notes-you-can-find',
      ru: 'kak-vesti-zametki-chtoby-nahodit',
      es: 'como-tomar-notas-que-encuentres',
    },
    tex: 'ember-silk',
    t: {
      en: {
        head: ['Write it down.', 'Find it later.'],
        sub: ['Capture fast, add context, keep few', 'folders — and search with questions.'],
        cta: 'Read the 7 habits',
        query: 'that idea about pricing?',
        found: ['Pricing call · Mar 12', 'Found by meaning, not keywords'],
        chip: '7 habits in the article',
      },
      ru: {
        head: ['Запишите.', 'Найдите потом.'],
        sub: ['Пишите быстро, с контекстом, папок мало —', 'а ищите вопросами.'],
        cta: 'Семь привычек',
        query: 'та идея про цены?',
        found: ['Созвон по ценам · 12 мар', 'Найдено по смыслу, а не по словам'],
        chip: '7 привычек в статье',
      },
      es: {
        head: ['Apúntalo.', 'Encuéntralo luego.'],
        sub: ['Apunta rápido, con contexto, pocas carpetas —', 'y busca con preguntas.'],
        cta: 'Lee los 7 hábitos',
        query: '¿aquella idea sobre precios?',
        found: ['Llamada de precios · 12 mar', 'Por significado, no por palabras'],
        chip: '7 hábitos en el artículo',
      },
    },
    art: (s) =>
      col(
        [
          searchBar(s.query),
          panel([row('file', ...s.found, { right: svg('check', 20, ORANGE) })]),
          chips([chip(s.chip, { color: INK })]),
        ],
        { y: 140, gap: 12 },
      ),
  },
  {
    slug: {
      en: 'fixnote-keyboard-shortcuts',
      ru: 'goryachie-klavishi',
      es: 'atajos-de-teclado-fixnote',
    },
    tex: 'ember-cloud',
    t: {
      en: {
        head: ['Every shortcut.', 'Any layout.'],
        sub: ['System-wide hotkeys on Windows and Mac,', 'remappable and layout-proof.'],
        cta: 'See the shortcuts',
        keys: [
          ['Ctrl K', 'Search everywhere'],
          ['Ctrl N', 'New note'],
          ['Ctrl Shift D', 'Dictate a note'],
        ],
        chip: 'Works in any keyboard layout',
      },
      ru: {
        head: ['Все сочетания.', 'Любая раскладка.'],
        sub: ['Глобальные клавиши на Windows и Mac:', 'можно переназначить, раскладка не важна.'],
        cta: 'Все горячие клавиши',
        keys: [
          ['Ctrl K', 'Поиск везде'],
          ['Ctrl N', 'Новая заметка'],
          ['Ctrl Shift D', 'Надиктовать заметку'],
        ],
        chip: 'Работает в любой раскладке',
      },
      es: {
        head: ['Todos los atajos.', 'Cualquier teclado.'],
        sub: ['Atajos globales en Windows y Mac,', 'reasignables y en cualquier distribución.'],
        cta: 'Ver los atajos',
        keys: [
          ['Ctrl K', 'Buscar en todo'],
          ['Ctrl N', 'Nueva nota'],
          ['Ctrl Shift D', 'Dictar una nota'],
        ],
        chip: 'Funciona con cualquier distribución',
      },
    },
    art: (s) =>
      col(
        [
          panel(
            s.keys.map(([keys, action]) => ({
              ...row(null, action, null, { pad: [8, 8] }),
              children: [
                kbd(keys),
                text('Action', action, {
                  w: 'fill',
                  size: 19,
                  lh: 24,
                  ls: '-1.5%',
                  weight: 'Medium',
                }),
              ],
            })),
            { gap: 4, pad: [12, 12] },
          ),
          chips([chip(s.chip, { color: INK })]),
        ],
        { y: 140 },
      ),
  },
  {
    slug: {
      en: 'searching-notes-in-three-languages',
      ru: 'poisk-po-zametkam-na-treh-yazykah',
      es: 'buscar-notas-en-tres-idiomas',
    },
    tex: 'dawn-silk',
    t: {
      en: {
        head: ['Forgot the language?', 'Search still finds it.'],
        sub: ['Transliterated keywords, on-device', 'meaning search across languages.'],
        cta: 'Try multilingual search',
        query: 'launch ideas from spring',
        rows: [
          ['Spring release — kickoff', 'Found by meaning: “first ideas for April”'],
          ['Idées de lancement', 'Another language, same idea'],
          ['Notas de lanzamiento', 'Spanish, same note'],
        ],
      },
      ru: {
        head: ['Не помните язык?', 'Поиск найдёт.'],
        sub: ['Транслитерация и поиск по смыслу', 'на устройстве, на любом из языков.'],
        cta: 'Попробовать поиск',
        query: 'идеи запуска весной',
        rows: [
          ['Весенний релиз — старт', 'По смыслу: «первые идеи на апрель»'],
          ['Launch ideas', 'Другой язык, та же мысль'],
          ['Notas de lanzamiento', 'Испанский, та же заметка'],
        ],
      },
      es: {
        head: ['¿Otro idioma?', 'Igual la encuentras.'],
        sub: [
          'Palabras transliteradas y búsqueda por',
          'significado en tu equipo, en cualquier idioma.',
        ],
        cta: 'Prueba la búsqueda',
        query: 'ideas de lanzamiento de primavera',
        rows: [
          ['Lanzamiento de primavera', 'Por significado: «primeras ideas para abril»'],
          ['Launch ideas', 'Otro idioma, la misma idea'],
          ['Идеи запуска', 'Ruso, la misma nota'],
        ],
      },
    },
    art: (s) =>
      col(
        [
          searchBar(s.query),
          panel([
            row('file', ...s.rows[0]),
            row('languages', ...s.rows[1]),
            row('languages', ...s.rows[2]),
          ]),
        ],
        { y: 115, gap: 12 },
      ),
  },
  {
    slug: {
      en: 'end-to-end-encrypted-notes',
      ru: 'skvoznoe-shifrovanie-zametok',
      es: 'notas-cifrado-de-extremo-a-extremo',
    },
    dark: true,
    tex: 'dusk-cloud',
    t: {
      en: {
        head: ['Encrypted here.', 'Ciphertext there.'],
        sub: ['A fresh key for every note version;', 'the server stores only ciphertext.'],
        cta: 'How encryption works',
        lock: ['What the server stores', 'It cannot read a word of it'],
        device: 'Encrypted on your device',
        key: 'A key only you have',
      },
      ru: {
        head: ['Шифруется здесь.', 'Там — шифротекст.'],
        sub: ['Новый ключ для каждой версии заметки;', 'сервер хранит только шифротекст.'],
        cta: 'Как устроено шифрование',
        lock: ['Что хранит сервер', 'Он не может прочитать ни слова'],
        device: 'Шифруется на устройстве',
        key: 'Ключ только у вас',
      },
      es: {
        head: ['Cifrado aquí.', 'Ilegible allí.'],
        sub: [
          'Una clave nueva por cada versión de la nota;',
          'el servidor solo guarda texto cifrado.',
        ],
        cta: 'Cómo funciona el cifrado',
        lock: ['Lo que guarda el servidor', 'No puede leer ni una palabra'],
        device: 'Cifrado en tu dispositivo',
        key: 'Una clave solo tuya',
      },
    },
    art: (s) =>
      col(
        [
          lockHead(...s.lock),
          hexCard(
            'a9f2 7c1e 04bd e6f0 93aa 1c7d 5be8 d2f4 77a0\n3e19 c5b2 80fd 1f4c 9ae3 b05d 62c8 e71a 4d96\n0c3b f8a5 27de 916e b4f1 6a0d 35c7 e29b 8d40',
          ),
          chips([
            chip(s.device, { icon: 'check', iconColor: PAPER, fill: w(0.12), color: PAPER }),
            chip(s.key, { fill: w(0.12), color: PAPER }),
          ]),
        ],
        { y: 125 },
      ),
  },
]

// Each language is its own block of three columns, side by side on the page.
const LANG_X = { en: 0, ru: 4000, es: 8000 }
const nodes = []
for (const lang of LANGS) {
  ARTICLES.forEach((a, i) => {
    const s = a.t[lang]
    const slug = a.slug[lang]
    const dark = Boolean(a.dark)
    const ink = dark ? PAPER : INK
    const grey = dark ? DGRAY : GRAY
    const x = LANG_X[lang] + (i % 3) * 1300
    const y = Math.floor(i / 3) * 760
    // English keeps its first keys, so pushing again updates the frames already in the file.
    const key = lang === 'en' ? `blog/${slug}` : `blog/${lang}/${slug}`
    nodes.push({
      key,
      type: 'FRAME',
      name: `Blog / ${lang} / ${slug}`,
      x,
      y,
      w: 1200,
      h: 630,
      clip: true,
      fill: dark ? DBG : BG,
      children: [
        {
          key: `${key}/logo`,
          type: 'SVG',
          name: 'Fixnote',
          svg: logoSvg
            .replace('fill="currentColor"', `fill="${ink}"`)
            .replace(/<title>.*?<\/title>/, ''),
          x: 30,
          y: 30,
          w: LOGO_W,
          h: LOGO_H,
        },
        {
          key: `${key}/head`,
          ...twoLine('Headline', s.head[0], s.head[1], {
            size: 49.5,
            lh: 52.5,
            ls: '-3.5%',
            weight: 'Medium',
            fill: ink,
            grey,
            x: 27.3,
            y: 196,
          }),
        },
        {
          key: `${key}/sub`,
          ...twoLine('Subline', s.sub[0], s.sub[1], {
            size: 20.25,
            lh: 25.5,
            ls: '-1.5%',
            fill: ink,
            grey,
            x: 29.8,
            y: 322,
          }),
        },
        {
          key: `${key}/cta`,
          type: 'FRAME',
          name: 'CTA',
          x: 30,
          y: 549,
          h: 51,
          layout: 'row',
          align: 'center',
          pad: [0, 25.5],
          radius: 999,
          fill: dark ? PAPER : INK,
          children: [
            text('Label', s.cta, {
              size: 19.5,
              lh: 23.25,
              ls: '-1%',
              weight: 'Medium',
              fill: dark ? INK : WHITE,
            }),
          ],
        },
        {
          key: `${key}/art`,
          type: 'FRAME',
          name: `Art / ${slug}`,
          x: 600,
          y: 30,
          w: 570,
          h: 570,
          radius: 24,
          clip: true,
          fill: a.board ?? tex(a.tex),
          children: [].concat(a.art(s)),
        },
      ],
    })
    const path = lang === 'en' ? `blog/${slug}` : `${lang}/blog/${slug}`
    nodes.push({
      key: `${key}/label`,
      type: 'TEXT',
      name: `Label / ${lang} / ${slug}`,
      text: `fixnote.space/${path} — og 1200×630 · ${a.tex}${dark ? ' · dark' : ''}`,
      family: 'Geist',
      weight: 'Regular',
      size: 20,
      lineHeight: 26,
      letterSpacing: '-1%',
      fill: GRAY,
      x,
      y: y + 645,
    })
  })
}

const out = join(HERE, 'blog-covers.json')
writeFileSync(out, JSON.stringify({ page: 'Blog covers', nodes }, null, 2))
console.log(`${ARTICLES.length * LANGS.length} covers → ${out}`)
