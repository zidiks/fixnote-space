import type { Pairing } from './api'
import {
  type ConnectRequest,
  desktopConnectUrl,
  pollConnect,
  startConnect,
  webConnectUrl,
} from './connect-api'
import { type Answer, browserLabel, type Message, msg } from './messages'
import { DEFAULT_SITES, parseSites } from './sites'

/**
 * The options page: connect (the extension asks, FixNote confirms, like an AI app), disconnect,
 * and which social networks' own Save buttons also save to FixNote.
 */

const PAIRING = 'pairing'
/** The request waiting for FixNote; kept so reopening this page goes on waiting. */
const REQUEST = 'connectRequest'
const REQUEST_LIFE = 10 * 60_000
const POLL = 2000

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T

const ask = (m: Message) => chrome.runtime.sendMessage(m) as Promise<Answer>

type View = 'start' | 'wait' | 'failed' | 'connected'
function show(view: View) {
  for (const v of ['start', 'wait', 'failed', 'connected'] as const) {
    $(`view-${v}`).hidden = v !== view
  }
}

function texts() {
  for (const el of document.querySelectorAll<HTMLElement>('[data-msg]')) {
    const text = chrome.i18n.getMessage(el.dataset.msg ?? '')
    if (text) el.textContent = text
  }
  document.documentElement.lang = chrome.i18n.getUILanguage()
}

function connected(p: Pairing) {
  $('connected-label').textContent = p.label || browserLabel()
  $('not-pro').hidden = p.pro
  show('connected')
}

function failed(kind: 'denied' | 'expired') {
  $('failed-title').textContent = msg(kind === 'denied' ? 'deniedTitle' : 'expiredTitle')
  $('failed-body').textContent = msg(kind === 'denied' ? 'deniedBody' : 'expiredBody')
  show('failed')
}

let polling = 0
let current: ConnectRequest | null = null

function stopWaiting() {
  clearTimeout(polling)
  current = null
  void chrome.storage.local.remove(REQUEST)
}

async function poll() {
  const r = current
  if (!r) return
  if (Date.now() - r.at > REQUEST_LIFE) {
    stopWaiting()
    return failed('expired')
  }
  try {
    const res = await pollConnect(r)
    if (current !== r) return
    if (res.status === 'approved') {
      stopWaiting()
      await chrome.storage.local.set({ [PAIRING]: res.pairing })
      await chrome.action.setBadgeText({ text: '' })
      return connected(res.pairing)
    }
    if (res.status === 'denied' || res.status === 'gone') {
      stopWaiting()
      return failed(res.status === 'denied' ? 'denied' : 'expired')
    }
  } catch {
    // Offline for a moment: keep asking.
  }
  polling = window.setTimeout(() => void poll(), POLL)
}

function wait(r: ConnectRequest) {
  current = r
  const code = $('code')
  code.replaceChildren(
    ...[...r.code].map((ch) => {
      const s = document.createElement('span')
      s.textContent = ch
      return s
    }),
  )
  code.setAttribute('aria-label', r.code)
  show('wait')
  clearTimeout(polling)
  polling = window.setTimeout(() => void poll(), POLL)
}

async function connect() {
  const button = $<HTMLButtonElement>('connect')
  const error = $('start-error')
  error.hidden = true
  button.disabled = true
  const label = button.innerHTML
  button.innerHTML = '<span class="spinner"></span>'
  try {
    const r = await startConnect(browserLabel())
    await chrome.storage.local.set({ [REQUEST]: r })
    wait(r)
    await chrome.tabs.create({ url: webConnectUrl(r.id) })
  } catch {
    error.textContent = msg('errorConnect')
    error.hidden = false
  } finally {
    button.disabled = false
    button.innerHTML = label
  }
}

async function renderSites() {
  const [{ social }, { sites }] = await Promise.all([
    chrome.storage.sync.get('social'),
    chrome.storage.local.get('sites'),
  ])
  const on = (social ?? {}) as Record<string, boolean>
  const list = $('sites')
  list.replaceChildren()
  for (const site of (parseSites(sites) ?? DEFAULT_SITES).sites) {
    const row = document.createElement('label')
    row.className = 'site'
    const name = document.createElement('span')
    name.textContent = site.name
    const sw = document.createElement('span')
    sw.className = 'switch'
    const box = document.createElement('input')
    box.type = 'checkbox'
    box.checked = Boolean(on[site.id])
    box.addEventListener('change', () => {
      on[site.id] = box.checked
      void chrome.storage.sync.set({ social: on })
    })
    sw.append(box, document.createElement('span'))
    row.append(name, sw)
    list.append(row)
  }
}

async function start() {
  texts()
  $('connect').addEventListener('click', () => void connect())
  $('retry').addEventListener('click', () => {
    show('start')
    void connect()
  })
  $('cancel').addEventListener('click', () => {
    stopWaiting()
    show('start')
  })
  $('open-web').addEventListener('click', () => {
    if (current) void chrome.tabs.create({ url: webConnectUrl(current.id) })
  })
  $('open-desktop').addEventListener('click', () => {
    if (current) void chrome.tabs.create({ url: desktopConnectUrl(current.id) })
  })
  $('unpair').addEventListener('click', () => {
    void ask({ type: 'unpair' }).then(() => show('start'))
  })
  await renderSites()

  const status = await ask({ type: 'status' })
  if (status.pairing) return connected(status.pairing)
  const { [REQUEST]: pending } = await chrome.storage.local.get(REQUEST)
  const r = pending as ConnectRequest | undefined
  if (r?.id && r.secret && Date.now() - r.at < REQUEST_LIFE) wait(r)
  else show('start')
}

void start()
