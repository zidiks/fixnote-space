/**
 * Every FixNote screen and state, captured into Figma (page "Screens") from the running app:
 *
 *   pnpm dev, open http://localhost:5173/?dev-backend at 1280×820 (phones: 390×844), seed once
 *   (seed.js), then in the page:
 *   const s = await import('/@fs/<repo>/tools/figma-bridge/fixnote/screens.js')
 *   s.start({ only: ['home', 'note'] })        // groups (default: all desktop ones); s.status()
 *
 * Each state is set through the app's own stores (routes, dialogs, plan, voice…) or a click, then
 * web/capture.js turns the page into layers. The same key updates the same frame, so running it
 * again after a UI change refreshes the screens in place. Rows on the page: one per group.
 */

const CAPTURE = new URL('../web/capture.js', import.meta.url).href
const PAGE = 'Screens'
const ROW = 1160
const GAP = 120

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
/**
 * The app's own module instances: Vite rewrites import() it can see (adding ?import), which would
 * load a second copy of a store; an import Vite cannot see gets the very modules the app uses.
 */
const mod = new Function('path', 'return import(path)')

// ---------------------------------------------------------------------------------------------
// Helpers for the states.

const stores = async () => {
  const [{ useUi }, plan, sel, voice, call, pay, card, linkMove] = await Promise.all([
    mod('/src/app/store.ts'),
    mod('/src/lib/plan.ts'),
    mod('/src/lib/selection.ts'),
    mod('/src/lib/voice/voice.ts'),
    mod('/src/lib/voice/call.ts'),
    mod('/src/lib/payment.ts'),
    mod('/src/lib/card-payment.ts'),
    mod('/src/lib/link-save.ts'),
  ])
  return {
    ui: useUi,
    plan: plan.usePlan,
    selection: sel.useSelection,
    voice: voice.useVoice,
    call: call.useCall,
    payment: pay.usePayment,
    card: card.useCardPayment,
    linkMove: linkMove.useLinkMove,
  }
}

async function db() {
  const { openDb } = await mod('/src/lib/db.tsx')
  return openDb()
}

/** A note by (the start of) its title. */
async function noteId(title) {
  const { repo } = await db()
  const list = await repo.listNotes({ limit: 200 })
  const n = (list.items ?? list).find((x) => (x.title ?? '').startsWith(title))
  if (!n) throw new Error(`No note "${title}" (seed first)`)
  return n.id
}

async function folderId(name) {
  const { repo } = await db()
  const f = (await repo.listFolders()).find((x) => x.name === name)
  if (!f) throw new Error(`No folder ${name}`)
  return f.id
}

const shown = (el) => el && el.getBoundingClientRect().width > 0

/** The visible element whose aria-label or text is (or starts with) `text`. */
function find(text, sel = 'button,[role=button],[role=tab],[role=menuitem],a,[role=option]') {
  const all = [...document.querySelectorAll(sel)].filter(shown)
  return (
    all.find((e) => e.getAttribute('aria-label') === text) ??
    all.find((e) => e.textContent.trim() === text) ??
    all.find((e) => (e.getAttribute('aria-label') ?? '').startsWith(text)) ??
    all.find((e) => e.textContent.trim().startsWith(text))
  )
}

/** A real-looking click: Radix menus open on pointerdown. */
function press(el) {
  if (typeof el === 'string') {
    const hit = find(el)
    if (!hit) throw new Error(`Nothing to click: ${el}`)
    el = hit
  }
  const r = el.getBoundingClientRect()
  const at = {
    bubbles: true,
    cancelable: true,
    clientX: r.left + r.width / 2,
    clientY: r.top + r.height / 2,
    button: 0,
  }
  el.dispatchEvent(
    new PointerEvent('pointerdown', { ...at, pointerType: 'mouse', isPrimary: true }),
  )
  el.dispatchEvent(new MouseEvent('mousedown', at))
  el.dispatchEvent(new PointerEvent('pointerup', { ...at, pointerType: 'mouse', isPrimary: true }))
  el.dispatchEvent(new MouseEvent('mouseup', at))
  el.dispatchEvent(new MouseEvent('click', at))
  return el
}

function key(k, opts = {}, target = document.activeElement ?? document.body) {
  const code = opts.code ?? (k.length === 1 ? `Key${k.toUpperCase()}` : k)
  target.dispatchEvent(
    new KeyboardEvent('keydown', { key: k, code, bubbles: true, cancelable: true, ...opts }),
  )
  target.dispatchEvent(
    new KeyboardEvent('keyup', { key: k, code, bubbles: true, cancelable: true, ...opts }),
  )
}

/** Types into an input the way React notices. */
function type(input, text) {
  const proto =
    input instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype
  Object.getOwnPropertyDescriptor(proto, 'value').set.call(input, text)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

async function until(fn, ms = 4000) {
  const end = Date.now() + ms
  while (Date.now() < end) {
    const v = await fn()
    if (v) return v
    await sleep(60)
  }
  return null
}

/** Back to a calm Home: no dialogs, menus, chat, selection or fake recording. */
async function reset(s) {
  for (let i = 0; i < 3; i++) {
    key('Escape')
    await sleep(40)
  }
  s.selection.setState({ active: false, ids: [] })
  s.voice.setState({ status: 'idle', download: null })
  s.call.setState({ status: 'idle', left: 0 })
  s.plan.setState({ prompt: null, paywall: false })
  s.payment.setState({ open: false })
  s.linkMove.setState({ target: null })
  const ui = s.ui.getState()
  ui.setChatOpen(false)
  ui.setSpotlightOpen(false)
  ui.openSettings(null)
  ui.setNoteView('cards')
  if (!ui.sidebarOpen) ui.toggleSidebar()
  ui.navigate({ kind: 'home' })
  await sleep(250)
}

const open = (s, route) => s.ui.getState().navigate(route)

// ---------------------------------------------------------------------------------------------
// The states: group → row on the page, in this order.

export const GROUPS = [
  ['start', 'Первый запуск'],
  ['home', 'Главная · вид «Ассистент»'],
  ['note', 'Заметка'],
  ['lists', 'Папки, ссылки, порядок'],
  ['search', 'Поиск'],
  ['chat', 'Ассистент'],
  ['dialogs', 'Диалоги и действия'],
  ['record', 'Диктовка и звонок'],
  ['settings', 'Настройки'],
  ['account', 'Аккаунт и Pro'],
  ['notes', 'Вид «Заметки»'],
  ['dark', 'Тёмная тема'],
  ['phone', 'Телефон'],
]

export const STATES = [
  // Первый запуск
  {
    group: 'start',
    key: 'onboarding',
    name: 'Выбор вида при первом запуске',
    setup: async (s) => {
      s.ui.setState({ layout: null })
      // It asks by itself only after the app has been quiet a while: ask now.
      const { useLayoutAsking } = await mod('/src/components/LayoutOnboarding.tsx')
      useLayoutAsking.setState({ open: true })
      await until(() => find('Продолжить'))
    },
    after: (s) => s.ui.getState().setLayout('assistant'),
  },

  // Главная
  { group: 'home', key: 'home', name: 'Главная · карточки', setup: async () => sleep(300) },
  {
    group: 'home',
    key: 'home-list',
    name: 'Главная · список',
    setup: async (s) => s.ui.getState().setNoteView('list'),
  },
  {
    group: 'home',
    key: 'home-compact',
    name: 'Главная · компактно',
    setup: async (s) => s.ui.getState().setNoteView('compact'),
  },
  {
    group: 'home',
    key: 'home-inbox',
    name: 'Главная · без папки',
    setup: async (s) => open(s, { kind: 'home', filter: 'inbox' }),
  },
  {
    group: 'home',
    key: 'home-folder-menu',
    name: 'Главная · фильтр по папке',
    setup: async () => {
      press('Папка')
      await until(() => document.querySelector('[role=menu]'))
    },
  },
  {
    group: 'home',
    key: 'home-view-menu',
    name: 'Главная · вид и сортировка',
    setup: async () => {
      press('Вид и сортировка')
      await until(() => document.querySelector('[role=menu]'))
    },
  },
  {
    group: 'home',
    key: 'home-card-menu',
    name: 'Главная · меню карточки',
    setup: async () => {
      const card = document.querySelector('[data-note-id]')
      const r = card.getBoundingClientRect()
      card.dispatchEvent(
        new MouseEvent('contextmenu', {
          bubbles: true,
          cancelable: true,
          clientX: r.left + 40,
          clientY: r.top + 30,
          button: 2,
        }),
      )
      await until(() => document.querySelector('[role=menu]'))
    },
  },

  // Заметка
  {
    group: 'note',
    key: 'note',
    name: 'Заметка · задачи и заголовки',
    setup: async (s) => open(s, { kind: 'note', id: await noteId('План запуска') }),
  },
  {
    group: 'note',
    key: 'note-image',
    name: 'Заметка · с картинкой',
    setup: async (s) => open(s, { kind: 'note', id: await noteId('Поездка в горы') }),
  },
  {
    group: 'note',
    key: 'note-call',
    name: 'Заметка · итоги созвона',
    setup: async (s) => open(s, { kind: 'note', id: await noteId('Созвон с командой дизайна') }),
  },
  {
    group: 'note',
    key: 'note-link',
    name: 'Заметка · сохранённая ссылка',
    setup: async (s) => open(s, { kind: 'note', id: await noteId('Linear') }),
  },
  {
    group: 'note',
    key: 'note-daily',
    name: 'Сегодня · ежедневная заметка',
    setup: async (s) => open(s, { kind: 'today' }),
  },
  {
    group: 'note',
    key: 'note-menu',
    name: 'Заметка · переместить в папку',
    setup: async (s) => {
      open(s, { kind: 'note', id: await noteId('План запуска') })
      await until(() => find('Переместить в'))
      press('Переместить в')
      await until(() => document.querySelector('[role=menu]'))
    },
  },

  // Папки, ссылки, порядок
  {
    group: 'lists',
    key: 'folder',
    name: 'Папка «Работа»',
    setup: async (s) => open(s, { kind: 'folder', id: await folderId('Работа') }),
  },
  { group: 'lists', key: 'links', name: 'Ссылки', setup: async (s) => open(s, { kind: 'links' }) },
  {
    group: 'lists',
    key: 'links-topic',
    name: 'Ссылки · тема «Разработка»',
    setup: async (s) => open(s, { kind: 'links', folder: await folderId('Разработка') }),
  },
  {
    group: 'lists',
    key: 'tidy',
    name: 'Навести порядок',
    setup: async (s) => open(s, { kind: 'tidy' }),
  },

  // Поиск
  {
    group: 'search',
    key: 'spotlight',
    name: 'Поиск · пустой',
    setup: async (s) => {
      s.ui.getState().setSpotlightOpen(true)
      await until(() => document.querySelector('[role=dialog] input'))
    },
  },
  {
    group: 'search',
    key: 'spotlight-results',
    name: 'Поиск · результаты',
    setup: async (s) => {
      s.ui.getState().setSpotlightOpen(true)
      const input = await until(() => document.querySelector('[role=dialog] input'))
      type(input, 'созвон')
      await sleep(700)
    },
  },
  {
    group: 'search',
    key: 'spotlight-none',
    name: 'Поиск · ничего не нашлось',
    setup: async (s) => {
      s.ui.getState().setSpotlightOpen(true)
      const input = await until(() => document.querySelector('[role=dialog] input'))
      type(input, 'квантовый холодильник')
      await sleep(700)
    },
  },

  // Ассистент
  {
    group: 'chat',
    key: 'chat',
    name: 'Ассистент · пустой',
    setup: async (s) => {
      s.ui.getState().setChatOpen(true)
      await sleep(400)
    },
  },
  {
    group: 'chat',
    key: 'chat-note',
    name: 'Ассистент рядом с заметкой',
    setup: async (s) => {
      open(s, { kind: 'note', id: await noteId('План запуска') })
      s.ui.getState().setChatOpen(true)
      await sleep(500)
    },
  },

  // Диалоги и действия
  {
    group: 'dialogs',
    key: 'new-folder',
    name: 'Новая папка',
    setup: async () => {
      press('Новая папка')
      await until(() => document.querySelector('[role=dialog]'))
    },
  },
  {
    group: 'dialogs',
    key: 'delete-confirm',
    name: 'Удалить заметку?',
    setup: async () => {
      const card = document.querySelector('[data-note-id]')
      card.focus()
      press(card.querySelector('[data-note-id]') ?? card)
      await sleep(100)
      key('Delete', { code: 'Delete' }, card)
      await until(() => document.querySelector('[role=alertdialog],[role=dialog]'))
    },
  },
  {
    group: 'dialogs',
    key: 'selection',
    name: 'Выбор нескольких заметок',
    setup: async (s) => {
      const ids = [...document.querySelectorAll('[data-note-id]')]
        .slice(0, 3)
        .map((e) => e.dataset.noteId)
      s.selection.setState({ active: true, ids })
      await sleep(300)
    },
  },
  {
    group: 'dialogs',
    key: 'notifications',
    name: 'Уведомления',
    setup: async () => {
      press('Уведомления')
      await sleep(400)
    },
  },
  {
    group: 'dialogs',
    key: 'pro-prompt',
    name: 'Это часть Pro',
    setup: async (s) => {
      s.plan.setState({ prompt: 'ai' })
      await until(() => document.querySelector('[role=dialog]'))
    },
  },

  // Диктовка и звонок
  {
    group: 'record',
    key: 'voice',
    name: 'Голосовая заметка · запись',
    setup: async (s) => {
      s.voice.setState({
        status: 'recording',
        target: 'new-note',
        startedAt: Date.now() - 14_000,
        level: 0.55,
        download: null,
      })
      await sleep(300)
    },
  },
  {
    group: 'record',
    key: 'voice-transcribing',
    name: 'Голосовая заметка · распознавание',
    setup: async (s) => {
      s.voice.setState({
        status: 'transcribing',
        target: 'new-note',
        startedAt: Date.now() - 31_000,
        level: 0,
        download: null,
      })
      await sleep(300)
    },
  },
  {
    group: 'record',
    key: 'voice-download',
    name: 'Голосовая заметка · загрузка модели',
    setup: async (s) => {
      s.voice.setState({
        status: 'recording',
        target: 'new-note',
        startedAt: Date.now() - 2_000,
        level: 0.2,
        download: 0.42,
      })
      await sleep(300)
    },
  },
  {
    group: 'record',
    key: 'call',
    name: 'Звонок · запись',
    setup: async (s) => {
      s.call.setState({
        status: 'recording',
        startedAt: Date.now() - 754_000,
        me: 0.5,
        them: 0.3,
        left: 0,
      })
      await sleep(300)
    },
  },
  {
    group: 'record',
    key: 'call-summary',
    name: 'Звонок · пишем итоги',
    setup: async (s) => {
      s.call.setState({
        status: 'summarizing',
        startedAt: Date.now() - 1_900_000,
        me: 0,
        them: 0,
        left: 0,
      })
      await sleep(300)
    },
  },

  // Настройки
  ...Object.entries({
    general: 'Общие',
    shortcuts: 'Сочетания клавиш',
    account: 'Аккаунт',
    plan: 'Тариф',
    integrations: 'Интеграции',
    ai: 'AI',
    data: 'Данные',
    advanced: 'Дополнительно',
  }).map(([section, label]) => ({
    group: 'settings',
    key: `settings-${section}`,
    name: `Настройки · ${label}`,
    setup: async (s) => {
      s.ui.getState().openSettings(section)
      await until(() => document.querySelector('[role=dialog]'))
      await sleep(500)
    },
  })),

  // Вид «Заметки»
  {
    group: 'notes',
    key: 'notes-home',
    name: 'Заметки · все, ничего не открыто',
    layout: 'notes',
    setup: async () => sleep(300),
  },
  {
    group: 'notes',
    key: 'notes-note',
    name: 'Заметки · папка и открытая заметка',
    layout: 'notes',
    setup: async (s) => {
      open(s, { kind: 'folder', id: await folderId('Работа') })
      await sleep(300)
      open(s, { kind: 'note', id: await noteId('План запуска') })
    },
  },
  {
    group: 'notes',
    key: 'notes-today',
    name: 'Заметки · сегодня',
    layout: 'notes',
    setup: async (s) => open(s, { kind: 'today' }),
  },
  {
    group: 'notes',
    key: 'notes-links',
    name: 'Заметки · ссылки',
    layout: 'notes',
    setup: async (s) => {
      open(s, { kind: 'links' })
      await sleep(300)
      open(s, { kind: 'note', id: await noteId('Linear') })
    },
  },
  {
    group: 'notes',
    key: 'notes-overview',
    name: 'Заметки · обзор',
    layout: 'notes',
    setup: async (s) => open(s, { kind: 'overview' }),
  },
  {
    group: 'notes',
    key: 'notes-no-sidebar',
    name: 'Заметки · без боковой панели',
    layout: 'notes',
    setup: async (s) => {
      open(s, { kind: 'note', id: await noteId('Список покупок') })
      s.ui.getState().toggleSidebar()
    },
  },
]

/**
 * A conversation in the assistant panel, written straight into its store (the fake server's model
 * answers in English placeholders): a question about the launch plan and an answer citing notes.
 */
async function chat(_s, phase) {
  const { useAssistant } = await mod('/src/lib/assistant/assistant.ts')
  const plan = await noteId('План запуска')
  const call = await noteId('Созвон с командой дизайна')
  const at = Date.now() - 60_000
  const question = {
    id: 'demo-q',
    kind: 'user',
    content: 'Что осталось сделать по запуску FixNote 2.0?',
    scope: { kind: 'all' },
    citations: [],
    confidence: null,
    status: null,
    createdAt: at,
  }
  const answer = {
    id: 'demo-a',
    kind: 'assistant',
    content:
      'По плану запуска осталось три задачи [1]:\n\n- Обновить лендинг и цены\n- Записать демо-видео на 60 секунд\n- Подготовить пост для Product Hunt\n\nДве уже готовы: отзывы бета-тестеров собраны, онбординг переделан. Главный риск — синхронизация больших заметок на медленном интернете [1]. А на созвоне с дизайном решили выпускать тёмную тему вместе с новым видом [2].',
    scope: { kind: 'all' },
    citations: [
      { n: 1, noteId: plan, title: 'План запуска FixNote 2.0', quote: 'Обновить лендинг и цены' },
      {
        n: 2,
        noteId: call,
        title: 'Созвон с командой дизайна',
        quote: 'Тёмную тему выпускаем вместе с новым видом',
      },
    ],
    confidence: 'high',
    status: 'done',
    createdAt: at + 4000,
  }
  if (phase === 'done')
    useAssistant.setState({
      messages: [question, answer],
      status: 'done',
      activity: null,
      error: null,
    })
  else
    useAssistant.setState({
      messages: [question, { ...answer, content: '', citations: [], status: 'streaming' }],
      status: 'thinking',
      activity: 'Ищу «запуск FixNote»',
      error: null,
    })
  await sleep(500)
}

// Аккаунт и Pro: one flow, in order (sign in on the fake server, trial, Pro). Each step builds on
// the one before, so run the whole group.
const account = () => mod('/src/lib/account/account.ts')
const devPlan = () => mod('/src/lib/account/dev-plan.ts')
const phase = async () => (await account()).useAccount.getState().phase
const settingsAt = async (s, section) => {
  s.ui.getState().openSettings(section)
  await until(() => document.querySelector('[role=dialog]'))
  await sleep(600)
}

STATES.push(
  {
    group: 'account',
    key: 'account-code',
    name: 'Вход · код из письма',
    setup: async (s) => {
      const a = await account()
      if ((await phase()) !== 'signed-out') await a.signOut()
      ;(await devPlan()).resetDevAccount()
      // Forget the account on the fake server, so signing in is a new account each run (with its
      // recovery phrase) rather than one that asks for the phrase of an earlier run.
      const server = JSON.parse(localStorage.getItem('fixnote.dev-server') ?? '{}')
      localStorage.setItem(
        'fixnote.dev-server',
        JSON.stringify({ ...server, keys: {}, notes: {}, folders: {} }),
      )
      await settingsAt(s, 'account')
      await a.sendCode('anna@fixnote.dev')
      await until(async () => (await phase()) === 'code-sent')
      await sleep(300)
    },
  },
  {
    group: 'account',
    key: 'account-phrase',
    name: 'Вход · фраза восстановления',
    setup: async (s) => {
      const a = await account()
      if ((await phase()) === 'code-sent') await a.verifyCode('123456')
      await until(async () => ['new-account', 'needs-phrase', 'ready'].includes(await phase()))
      await settingsAt(s, 'account')
    },
  },
  {
    group: 'account',
    key: 'account-confirm',
    name: 'Вход · проверка фразы',
    setup: async (s) => {
      const a = await account()
      if ((await phase()) === 'new-account') a.phraseSaved()
      await settingsAt(s, 'account')
    },
  },
  {
    group: 'account',
    key: 'account-ready',
    name: 'Аккаунт · вход выполнен',
    setup: async (s) => {
      const a = await account()
      if ((await phase()) === 'confirm-phrase') await a.finishNewAccount()
      await until(async () => (await phase()) === 'ready', 8000)
      await settingsAt(s, 'account')
    },
  },
  {
    group: 'account',
    key: 'plan-free',
    name: 'Тариф · Free',
    setup: async (s) => settingsAt(s, 'plan'),
  },
  {
    group: 'account',
    key: 'paywall',
    name: 'Предложение попробовать Pro',
    setup: async (s) => {
      s.plan.setState({ paywall: true })
      await until(() => document.querySelector('[role=dialog]'))
    },
  },
  {
    group: 'account',
    key: 'home-signed-in',
    name: 'Главная · вошли в аккаунт',
    setup: async () => sleep(600),
  },
  {
    group: 'account',
    key: 'plan-trial',
    name: 'Тариф · пробный период',
    setup: async (s) => {
      const a = await account()
      if (s.plan.getState().info?.plan === 'free') await a.startTrial().catch(() => {})
      await a.refreshPlan(true)
      await settingsAt(s, 'plan')
    },
  },
  {
    group: 'account',
    key: 'chat-answer',
    name: 'Ассистент · ответ с источниками',
    wait: 800,
    setup: async (s) => {
      s.ui.getState().setChatOpen(true)
      await sleep(600)
      await chat(s, 'done')
    },
  },
  {
    group: 'account',
    key: 'chat-thinking',
    name: 'Ассистент · ищет в заметках',
    setup: async (s) => {
      s.ui.getState().setChatOpen(true)
      await sleep(600)
      await chat(s, 'thinking')
    },
  },
  {
    group: 'account',
    key: 'share',
    name: 'Поделиться заметкой',
    setup: async (s) => {
      open(s, { kind: 'note', id: await noteId('План запуска') })
      await until(() => find('Поделиться'))
      press('Поделиться')
      await until(() => document.querySelector('[role=dialog]'))
      await sleep(500)
    },
  },
  {
    group: 'account',
    key: 'plan-pro',
    name: 'Тариф · Pro',
    setup: async (s) => {
      ;(await devPlan()).setDevPlanMode('pro')
      await (await account()).refreshPlan(true)
      await settingsAt(s, 'plan')
    },
  },
  {
    group: 'account',
    key: 'payment',
    name: 'Оплата прошла',
    setup: async (s) => {
      s.payment.setState({ open: true })
      await until(() => document.querySelector('[role=dialog]'))
    },
  },
)

// Телефон: run with the window at 390×844 (`start({ only: ['phone'] })`); the app switches to its
// phone layout by width.
STATES.push(
  { group: 'phone', key: 'phone-home', name: 'Телефон · главная', setup: async () => sleep(400) },
  {
    group: 'phone',
    key: 'phone-drawer',
    name: 'Телефон · боковая панель',
    setup: async (s) => {
      s.ui.setState({ drawerOpen: true })
      await sleep(500)
    },
    after: (s) => s.ui.setState({ drawerOpen: false }),
  },
  {
    group: 'phone',
    key: 'phone-note',
    name: 'Телефон · заметка',
    setup: async (s) => open(s, { kind: 'note', id: await noteId('План запуска') }),
  },
  {
    group: 'phone',
    key: 'phone-today',
    name: 'Телефон · сегодня',
    setup: async (s) => open(s, { kind: 'today' }),
  },
  {
    group: 'phone',
    key: 'phone-search',
    name: 'Телефон · поиск',
    setup: async (s) => {
      s.ui.getState().setSpotlightOpen(true)
      const input = await until(() => document.querySelector('[role=dialog] input'))
      type(input, 'созвон')
      await sleep(700)
    },
  },
  {
    group: 'phone',
    key: 'phone-chat',
    name: 'Телефон · ассистент',
    setup: async (s) => {
      s.ui.getState().setChatOpen(true)
      await sleep(600)
    },
  },
  {
    group: 'phone',
    key: 'phone-voice',
    name: 'Телефон · диктовка',
    setup: async (s) => {
      s.voice.setState({
        status: 'recording',
        target: 'new-note',
        startedAt: Date.now() - 9_000,
        level: 0.5,
        download: null,
      })
      await sleep(300)
    },
  },
  {
    group: 'phone',
    key: 'phone-selection',
    name: 'Телефон · выбор заметок',
    setup: async (s) => {
      const ids = [...document.querySelectorAll('[data-note-id]')]
        .slice(0, 2)
        .map((e) => e.dataset.noteId)
      s.selection.setState({ active: true, ids })
      await sleep(300)
    },
  },
  {
    group: 'phone',
    key: 'phone-settings',
    name: 'Телефон · настройки',
    setup: async (s) => settingsAt(s, 'general'),
  },
  {
    group: 'phone',
    key: 'phone-notes-layout',
    name: 'Телефон · вид «Заметки»',
    layout: 'notes',
    setup: async () => sleep(400),
  },
)

/** Dark copies of a few screens: the same setup with the dark theme. */
for (const k of [
  'home',
  'note',
  'notes-note',
  'spotlight-results',
  'settings-general',
  'chat-note',
]) {
  const base = STATES.find((x) => x.key === k)
  STATES.push({
    ...base,
    group: 'dark',
    key: `dark-${k}`,
    name: `${base.name} · тёмная`,
    theme: 'dark',
  })
}

// ---------------------------------------------------------------------------------------------
// Running.

const state = { running: false, done: [], errors: [], current: null }
export const status = () => JSON.parse(JSON.stringify(state))

function place(st) {
  const gi = GROUPS.findIndex(([g]) => g === st.group)
  const inGroup = STATES.filter((x) => x.group === st.group)
  const i = inGroup.indexOf(st)
  const w = window.innerWidth
  return { x: i * (w + GAP), y: gi * ROW }
}

async function titles(cap) {
  const nodes = GROUPS.map(([g, label], gi) => ({
    key: `screens/title/${g}`,
    type: 'TEXT',
    name: label,
    text: label,
    size: 48,
    weight: 'Semi Bold',
    fill: '#1f1f1f',
    x: 0,
    y: gi * ROW - 110,
  }))
  await cap.job('build', { page: PAGE, nodes, show: false }, 'screens: titles')
}

/** Capture states (all, or `only` these groups/keys) one after another; poll status(). */
export function start({ only } = {}) {
  if (state.running) return 'already running'
  const want = STATES.filter((st) =>
    only ? only.includes(st.group) || only.includes(st.key) : st.group !== 'phone',
  )
  state.running = true
  state.done = []
  state.errors = []
  ;(async () => {
    const cap = await mod(`${CAPTURE}?t=${Date.now()}`)
    const s = await stores()
    // The plugin runs the code it last loaded: hand it this repository's, so fixes count.
    const raw = await fetch(
      `${new URL('../plugin/code.js', import.meta.url).href}?raw&t=${Date.now()}`,
    ).then((r) => r.text())
    await cap.job(
      'reload',
      { code: JSON.parse(raw.slice('export default '.length).replace(/;\s*$/, '')) },
      'plugin code',
    )
    await titles(cap)
    const ui = s.ui.getState()
    for (const st of want) {
      state.current = st.key
      try {
        // Explicit: the window's own scheme can be dark, and "system" would follow it.
        s.ui.getState().setTheme(st.theme ?? 'light')
        s.ui.getState().setLayout(st.layout ?? 'assistant')
        await reset(s)
        await st.setup(s)
        await sleep(st.wait ?? 450)
        const { x, y } = place(st)
        const r = await cap.push({ key: `screen/${st.key}`, name: st.name, page: PAGE, x, y })
        state.done.push(`${st.key}: ${r.layers} layers, ${r.ms} ms`)
      } catch (e) {
        state.errors.push(`${st.key}: ${e.message}`)
      } finally {
        try {
          await st.after?.(s)
        } catch {}
        s.ui.getState().setTheme('light')
      }
    }
    void ui
    await reset(s)
    state.current = null
    state.running = false
  })()
  return `started ${want.length}`
}
