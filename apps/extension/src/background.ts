import { ApiError, type LinkPayload, type Pairing, refreshKey, saveLink, unpair } from './api'
import { SITES_URL } from './config'
import { type PageCapture, readPage } from './extract'
import { type Message, msg } from './messages'
import { DEFAULT_SITES, parseSites } from './sites'

/**
 * The extension's service worker. Saving: the toolbar button, the shortcut (Alt+Shift+S) and the
 * right-click menu save the page (its text read in the page, `readPage`), a link or the selection;
 * the content script on social networks sends posts saved with their own Save button. Everything
 * is sealed here and queued for the person's devices, which file it (packages/core/src/links).
 */

const PAIRING = 'pairing'
const SITES = 'sites'
const SITES_AT = 'sitesAt'
const DAY = 24 * 3600 * 1000

async function pairing(): Promise<Pairing | null> {
  const { [PAIRING]: p } = await chrome.storage.local.get(PAIRING)
  return p && typeof p === 'object' && 'token' in p ? (p as Pairing) : null
}

async function badge(text: string, color: string, title?: string) {
  await chrome.action.setBadgeBackgroundColor({ color })
  await chrome.action.setBadgeText({ text })
  if (title) await chrome.action.setTitle({ title })
  if (text === '✓') setTimeout(() => void chrome.action.setBadgeText({ text: '' }), 2500)
}

/** Why saving failed, in the browser's language. */
function failure(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.code === 'needs-pro') return msg('errorPro')
    if (err.code === 'not-paired') return msg('errorNotPaired')
    if (err.code === 'too-many') return msg('errorTooMany')
  }
  return msg('errorFailed')
}

async function send(link: LinkPayload): Promise<void> {
  const p = await pairing()
  if (!p) {
    await chrome.runtime.openOptionsPage()
    return
  }
  try {
    await saveLink(p, link)
    await badge('✓', '#16a34a', msg('actionTitle'))
  } catch (err) {
    if (err instanceof ApiError && err.code === 'not-paired')
      await chrome.storage.local.remove(PAIRING)
    await badge('!', '#dc2626', failure(err))
  }
}

/** The page in this tab, read in the tab; a browser page that cannot be read gives just the address. */
async function capture(tab: chrome.tabs.Tab): Promise<PageCapture | null> {
  if (!tab.id || !tab.url || !/^https?:/.test(tab.url)) return null
  try {
    const [res] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: readPage,
    })
    return res?.result ?? null
  } catch {
    return {
      url: tab.url,
      title: tab.title ?? '',
      description: '',
      site: '',
      text: '',
      selection: '',
    }
  }
}

async function savePage(tab: chrome.tabs.Tab | undefined, selection?: string) {
  if (!tab) return
  const page = await capture(tab)
  if (!page) {
    await badge('!', '#dc2626', msg('errorPage'))
    return
  }
  await send({ ...page, ...(selection ? { selection } : {}) })
}

async function activeTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  return tab
}

/** The social sites' rules from fixnote.space, once a day (the shipped ones until then). */
async function refreshSites() {
  const { [SITES_AT]: at } = await chrome.storage.local.get(SITES_AT)
  if (typeof at === 'number' && Date.now() - at < DAY) return
  try {
    const parsed = parseSites(await (await fetch(SITES_URL, { cache: 'no-cache' })).json())
    if (parsed) await chrome.storage.local.set({ [SITES]: parsed })
    await chrome.storage.local.set({ [SITES_AT]: Date.now() })
  } catch {
    // Offline: keep what we have.
  }
}

chrome.runtime.onInstalled.addListener(() => {
  void (async () => {
    await chrome.contextMenus.removeAll()
    chrome.contextMenus.create({ id: 'page', title: msg('menuPage'), contexts: ['page'] })
    chrome.contextMenus.create({ id: 'link', title: msg('menuLink'), contexts: ['link'] })
    chrome.contextMenus.create({
      id: 'selection',
      title: msg('menuSelection'),
      contexts: ['selection'],
    })
    const { [SITES]: sites } = await chrome.storage.local.get(SITES)
    if (!sites) await chrome.storage.local.set({ [SITES]: DEFAULT_SITES })
    await refreshSites()
    if (!(await pairing())) await chrome.runtime.openOptionsPage()
  })()
})

chrome.action.onClicked.addListener((tab) => void savePage(tab))

chrome.commands.onCommand.addListener((command, tab) => {
  if (command !== 'save-page') return
  void (async () => savePage(tab ?? (await activeTab())))()
})

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'link' && info.linkUrl) void send({ url: info.linkUrl })
  else if (info.menuItemId === 'selection') void savePage(tab, info.selectionText)
  else void savePage(tab)
})

async function answer(message: Message): Promise<unknown> {
  switch (message.type) {
    case 'social-save':
      void refreshSites()
      await send({ ...message.post, source: message.source })
      return { ok: true }
    case 'unpair': {
      const p = await pairing()
      if (p) await unpair(p)
      await chrome.storage.local.remove(PAIRING)
      return { ok: true }
    }
    case 'status': {
      let p = await pairing()
      if (p) {
        try {
          p = await refreshKey(p)
          await chrome.storage.local.set({ [PAIRING]: p })
        } catch (err) {
          if (err instanceof ApiError && err.code === 'not-paired') {
            await chrome.storage.local.remove(PAIRING)
            p = null
          }
        }
      }
      return { ok: true, pairing: p }
    }
  }
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (typeof message !== 'object' || message === null || !('type' in message)) return undefined
  void answer(message as Message).then(sendResponse)
  return true
})
