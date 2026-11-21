// Real EditorView checks with a controlled preview loader; no external requests or account.
import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { chromium } from 'playwright'

const origin = new URL(process.argv[2] ?? 'http://localhost:5173')
if (!['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname))
  throw new Error('Localhost only')
const browser = await chromium.launch({ channel: 'chrome', headless: true })
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto(`${origin.origin}/?dev-backend`)
  await page.evaluate(async () => {
    const { repo } = await (await import('/src/lib/db.tsx')).openDb()
    const note = await repo.createNote({ content: '# Editor view test\n\nText' })
    ;(await import('/src/app/store.ts')).useUi.getState().navigate({ kind: 'note', id: note.id })
  })
  await page.waitForSelector('.tiptap')
  await page.evaluate(async () => {
    const { LinkCards } = await import('/src/components/editor/link-cards.ts')
    const { noteSchema } = await import('/src/components/editor/schema.ts')
    const root = document.createElement('div')
    root.id = 'link-cards-verification'
    root.style.cssText =
      'position:fixed;inset:16px;z-index:9999;overflow:auto;background:white;color:black;padding:24px'
    document.body.append(root)
    const pending = new Map(),
      requests = [],
      opened = []
    const text = (value) => ({ type: 'paragraph', content: [{ type: 'text', text: value }] })
    const bookmark = (url) => ({
      type: 'paragraph',
      content: [{ type: 'text', text: url, marks: [{ type: 'link', attrs: { href: url } }] }],
    })
    const a = 'https://example.invalid/a',
      b = 'https://example.invalid/b',
      c = 'https://example.invalid/c'
    const Editor = document.querySelector('.tiptap').editor.constructor
    const editor = new Editor({
      element: root,
      extensions: [
        ...noteSchema(),
        LinkCards.configure({
          load: (url) => {
            requests.push(url)
            return new Promise((resolve) => pending.set(url, resolve))
          },
          open: (url) => opened.push(url),
        }),
      ],
      content: {
        type: 'doc',
        content: [
          bookmark(a),
          text('Between'),
          bookmark(b),
          text('Between'),
          bookmark(a),
          text('Typing'),
        ],
      },
    })
    window.linkCheck = { editor, root, pending, requests, opened, a, b, c, bookmark, text }
  })
  const cards = page.locator('#link-cards-verification .fixnote-link-card')
  assert.equal(await cards.count(), 3)
  assert.equal(await page.evaluate(() => window.linkCheck.requests.length), 2)
  await page.evaluate(() => {
    const h = window.linkCheck
    h.bElement = [...h.root.querySelectorAll('.fixnote-link-card')].find((el) => el.title === h.b)
    h.pending.get(h.a)({ url: h.a, kind: 'page', title: 'Loaded A', description: 'Preview A' })
  })
  await page.waitForFunction(
    () =>
      document.querySelectorAll('#link-cards-verification .fixnote-link-card-title').length === 3 &&
      document.querySelector('#link-cards-verification').textContent.includes('Loaded A'),
  )
  assert(
    await page.evaluate(() => {
      const h = window.linkCheck
      return (
        [...h.root.querySelectorAll('.fixnote-link-card')]
          .filter((el) => el.title === h.a)
          .every((el) => el.textContent.includes('Loaded A')) && h.bElement.isConnected
      )
    }),
  )
  assert(
    await page.evaluate(() => {
      const h = window.linkCheck
      const before = [...h.root.querySelectorAll('.fixnote-link-card')]
      h.editor.commands.insertContentAt(h.editor.state.doc.content.size - 1, ' typed')
      const after = [...h.root.querySelectorAll('.fixnote-link-card')]
      return before.length === after.length && before.every((el, i) => el === after[i])
    }),
    'Unchanged cards must retain their DOM nodes',
  )
  await page.evaluate(() => {
    const h = window.linkCheck
    h.editor.commands.deleteRange({ from: 0, to: h.editor.state.doc.firstChild.nodeSize })
  })
  assert.equal(await cards.count(), 2)
  await page.evaluate(() => {
    const h = window.linkCheck
    const from = h.editor.state.doc.firstChild.nodeSize
    h.editor.commands.deleteRange({ from, to: from + h.editor.state.doc.child(1).nodeSize })
    h.pending.get(h.b)({ url: h.b, kind: 'page', title: 'Loaded B' })
  })
  await page.waitForTimeout(30)
  assert.equal(await cards.count(), 1)
  await page.evaluate(() => window.linkCheck.editor.commands.undo())
  assert.equal(await cards.count(), 2)
  assert(await page.evaluate(() => window.linkCheck.root.textContent.includes('Loaded B')))
  await page.evaluate(() => window.linkCheck.editor.commands.redo())
  assert.equal(await cards.count(), 1)
  await page.evaluate(() => {
    const h = window.linkCheck
    h.editor.commands.setContent({ type: 'doc', content: [h.bookmark(h.c), h.text('Text')] })
    h.pending.get(h.c)(null)
  })
  await page.waitForFunction(() => !document.querySelector('#link-cards-verification .is-loading'))
  await page.evaluate(async () => {
    const h = window.linkCheck
    ;(await import('/src/components/editor/link-cards.ts')).retryLinkCards(h.editor.view)
    h.pending.get(h.c)({
      url: h.c,
      kind: 'page',
      title: 'Retried C',
      description: 'Loaded on retry',
    })
  })
  await page.waitForFunction(() =>
    document.querySelector('#link-cards-verification').textContent.includes('Retried C'),
  )
  await page.evaluate(() => {
    const h = window.linkCheck
    h.editor.view.dispatch(h.editor.state.tr.setNodeAttribute(0, 'plainLink', true))
  })
  assert.equal(await cards.count(), 0)
  await page.evaluate(() => {
    const h = window.linkCheck
    h.editor.view.dispatch(h.editor.state.tr.setNodeAttribute(0, 'plainLink', false))
  })
  assert.equal(await cards.count(), 1)
  await cards.click()
  assert.deepEqual(await page.evaluate(() => window.linkCheck.opened), [
    'https://example.invalid/c',
  ])
  await mkdir('.cache/profile-ui', { recursive: true })
  await page.screenshot({ path: '.cache/profile-ui/link-cards.png' })
  await page.evaluate(() => window.linkCheck.editor.destroy())
  assert.deepEqual(errors, [])
  console.log(
    'PASS: stable widget DOM, duplicate URLs, targeted async refresh, deletion, late replies, undo/redo, replacement, retry, plainLink and opening a card.',
  )
} finally {
  await browser.close()
}
