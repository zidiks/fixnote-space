// Integration checks for real Tiptap transactions and repository saves. Uses isolated, synthetic data.
import assert from 'node:assert/strict'
import { chromium } from 'playwright'

const origin = new URL(process.argv[2] ?? 'http://localhost:5173')
if (!['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname))
  throw new Error('Editor verification requires a localhost dev server.')
const browser = await chromium.launch({ channel: 'chrome', headless: true })
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto(`${origin.origin}/?dev-backend`)
  await page.evaluate(async () => {
    await (await import('/src/lib/db.tsx')).openDb()
  })
  const ids = await page.evaluate(async () => {
    const { repo } = await (await import('/src/lib/db.tsx')).openDb()
    const { useUi } = await import('/src/app/store.ts')
    const a = await repo.createNote({ content: '# Persistence\n\nStart.' })
    const b = await repo.createNote({ content: '# Other\n\nOther note.' })
    useUi.getState().setLayout('notes')
    useUi.getState().navigate({ kind: 'note', id: a.id })
    return [a.id, b.id]
  })
  const open = async (id, title) => {
    await page.evaluate(
      async (id) =>
        (await import('/src/app/store.ts')).useUi.getState().navigate({ kind: 'note', id }),
      id,
    )
    await page.waitForFunction(
      (title) => document.querySelector('.tiptap')?.textContent.startsWith(title),
      title,
    )
  }
  const append = (value) =>
    page.evaluate((value) => {
      const e = document.querySelector('.tiptap').editor
      e.commands.setTextSelection(e.state.doc.content.size - 1)
      e.commands.insertContent(value)
    }, value)
  const saved = async (value) => {
    const until = Date.now() + 8000
    while (Date.now() < until) {
      const found = await page.evaluate(
        async ({ id, value }) => {
          const { repo } = await (await import('/src/lib/db.tsx')).openDb()
          return (await repo.getNote(id))?.content.includes(value)
        },
        { id: ids[0], value },
      )
      if (found) return
      await page.waitForTimeout(50)
    }
    assert.fail(`Save did not persist ${value}`)
  }
  await open(ids[0], 'Persistence')
  await page.waitForTimeout(600)
  await page.evaluate(() => {
    window.serializations = 0
    const manager = document.querySelector('.tiptap').editor.markdown
    const original = manager.serialize.bind(manager)
    manager.serialize = (...args) => {
      window.serializations++
      return original(...args)
    }
  })
  await append(' autosave')
  assert.equal(
    await page.evaluate(() => window.serializations),
    0,
    'Typing must not serialize Markdown',
  )
  await saved('autosave')
  assert.equal(
    await page.evaluate(() => window.serializations),
    1,
    'One serialization after the pause',
  )

  await page.locator('.tiptap').click()
  await append(' blur')
  await page.locator('input[placeholder]').first().click()
  await saved('blur')

  await append(' leave')
  await open(ids[1], 'Other')
  await saved('leave')
  await open(ids[0], 'Persistence')
  assert.ok(
    await page
      .locator('.tiptap')
      .textContent()
      .then((s) => s.includes('leave')),
  )

  // Delay writes beyond SAVE_DELAY: both pauses must be saved in order, with the second edit's
  // base equal to what the first save stored. Its old response must not overwrite the editor.
  await page.evaluate(async () => {
    const { repo } = await (await import('/src/lib/db.tsx')).openDb()
    const update = repo.updateContent.bind(repo)
    window.writes = []
    repo.updateContent = async (id, content, options) => {
      await new Promise((r) => setTimeout(r, 800))
      const result = await update(id, content, options)
      window.writes.push({ content, base: options.base, stored: result.content })
      return result
    }
  })
  await append(' first')
  await page.waitForTimeout(500)
  await append(' second')
  await saved('first second')
  const writes = await page.evaluate(() => window.writes)
  assert.equal(writes.length, 2)
  assert.equal(writes[1].base, writes[0].stored)
  assert.ok(
    await page
      .locator('.tiptap')
      .textContent()
      .then((s) => s.includes('first second')),
  )
  assert.equal(errors.length, 0, errors.join('\n'))
  console.log(
    'PASS: deferred serialization, autosave, blur, unmount, reopen, overlapping slow saves.',
  )
} finally {
  await browser.close()
}
