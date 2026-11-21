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
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto(`${origin.origin}/?dev-backend`)
  await page.evaluate(async () => {
    await (await import('/src/lib/db.tsx')).openDb()
  })
  const ids = await page.evaluate(async () => {
    const { repo } = await (await import('/src/lib/db.tsx')).openDb()
    const { useUi } = await import('/src/app/store.ts')
    const ids = []
    for (let i = 0; i < 1000; i++)
      ids.push(
        (
          await repo.createNote({
            content: `# Virtual ${String(i).padStart(4, '0')}\n\n${'Meeting notes. '.repeat((i % 4) + 1)}`,
          })
        ).id,
      )
    await repo.setPinned(ids[0], true)
    useUi.getState().setLayout('notes')
    useUi.getState().navigate({ kind: 'note', id: ids[0] })
    return ids
  })
  // Direct repository seeding bypasses UI mutations. Start with a fresh query cache, rather
  // than reusing a list that the app may have read while the seed was still being inserted.
  await page.reload()
  await page.evaluate(async (id) => {
    await (await import('/src/lib/db.tsx')).openDb()
    const { useUi } = await import('/src/app/store.ts')
    useUi.getState().setLayout('notes')
    useUi.getState().navigate({ kind: 'note', id })
  }, ids[0])
  await page.waitForSelector('[data-virtual-count] button[data-note-id]')
  const snapshot = () =>
    page.evaluate(() => {
      const list = document.querySelector('[data-virtual-count]')
      let scroll = list.parentElement
      while (scroll && !/(auto|scroll)/.test(getComputedStyle(scroll).overflowY))
        scroll = scroll.parentElement
      return {
        totalRows: Number(list.dataset.virtualCount),
        mounted: list.querySelectorAll('[data-note-id]').length,
        scrollTop: scroll.scrollTop,
        height: scroll.scrollHeight,
      }
    })
  const bottom = () =>
    page.evaluate(() => {
      let scroll = document.querySelector('[data-virtual-count]').parentElement
      while (scroll && !/(auto|scroll)/.test(getComputedStyle(scroll).overflowY))
        scroll = scroll.parentElement
      scroll.scrollTop = scroll.scrollHeight
    })
  const top = () =>
    page.evaluate(() => {
      let scroll = document.querySelector('[data-virtual-count]').parentElement
      while (scroll && !/(auto|scroll)/.test(getComputedStyle(scroll).overflowY))
        scroll = scroll.parentElement
      scroll.scrollTop = 0
    })
  for (let i = 0; i < 80 && (await snapshot()).totalRows < 1000; i++) {
    await bottom()
    await page.waitForTimeout(120)
  }
  const column = await snapshot()
  assert.equal(column.totalRows, 1002) // Pinned and date headings.
  assert(column.mounted < 35, JSON.stringify(column))
  await top()
  await page.waitForTimeout(200)
  await page.locator('[data-note-id]').first().focus()
  await page.keyboard.press('End')
  await page.waitForFunction(() => document.activeElement?.textContent.includes('Virtual 0001'))
  await page.keyboard.press('Home')
  await page.waitForFunction(() => document.activeElement?.textContent.includes('Virtual 0000'))
  const picked = await page.locator('[data-note-id]').first().getAttribute('data-note-id')
  await page
    .locator('[data-note-id]')
    .first()
    .click({ modifiers: ['Control'] })
  await bottom()
  await page.waitForTimeout(150)
  await top()
  await page.waitForTimeout(150)
  assert((await page.locator(`[data-note-id="${picked}"]`).getAttribute('data-selected')) !== null)
  await page.evaluate(async () => (await import('/src/lib/selection.ts')).endSelection())
  await page.locator('[data-note-id]').first().click({ button: 'right' })
  await page.waitForSelector('[role="menu"]')
  await bottom()
  await page.waitForTimeout(100)
  assert.equal(await page.locator('[role="menu"]').count(), 1)
  await page.keyboard.press('Escape')
  await top()
  await page.waitForTimeout(150)
  await page.evaluate(async () => {
    const { repo } = await (await import('/src/lib/db.tsx')).openDb()
    window.savedReads = { list: 0, navigation: 0 }
    for (const [name, key] of [
      ['listNotes', 'list'],
      ['navigation', 'navigation'],
    ]) {
      const read = repo[name].bind(repo)
      repo[name] = (...args) => {
        window.savedReads[key]++
        return read(...args)
      }
    }
    const editor = document.querySelector('.tiptap').editor
    editor.commands.setTextSelection(editor.state.doc.content.size - 1)
    editor.commands.insertContent(' Saved paragraph.')
  })
  await page.waitForTimeout(1200)
  assert.deepEqual(await page.evaluate(() => window.savedReads), { list: 0, navigation: 0 })
  assert(
    (
      await page.evaluate(
        async (id) => (await (await import('/src/lib/db.tsx')).openDb()).repo.getNote(id),
        ids[0],
      )
    ).content.includes('Saved paragraph.'),
  )
  const search = page.locator('input[placeholder]').first()
  await search.fill('Virtual')
  await page.waitForFunction(
    () => Number(document.querySelector('[data-virtual-count]')?.dataset.virtualCount) === 50,
  )
  const searchState = await snapshot()
  assert(searchState.mounted < 35)
  await search.fill('')
  await page.waitForFunction(
    () => Number(document.querySelector('[data-virtual-count]')?.dataset.virtualCount) > 1000,
  )
  const grid = {}
  for (const view of ['cards', 'list', 'compact']) {
    await page.evaluate(async (view) => {
      const { useUi } = await import('/src/app/store.ts')
      useUi.getState().setNoteView(view)
      useUi.getState().navigate({ kind: 'overview' })
    }, view)
    await page.waitForSelector('[data-virtual-count] button[data-note-id]')
    await page.waitForTimeout(180)
    await bottom()
    await page.waitForTimeout(180)
    grid[view] = await snapshot()
    assert(grid[view].mounted < 100, JSON.stringify(grid[view]))
    await top()
    await page.waitForTimeout(100)
    if (view === 'cards') {
      for (const width of [800, 500, 1440]) {
        await page.setViewportSize({ width, height: 1000 })
        await page.waitForTimeout(180)
        assert((await snapshot()).mounted > 0)
      }
    }
    await mkdir('.cache/profile-ui', { recursive: true })
    await page.screenshot({ path: `.cache/profile-ui/virtual-${view}.png` })
  }
  await mkdir('.cache/profile-ui', { recursive: true })
  await page.screenshot({ path: '.cache/profile-ui/virtual-lists.png' })
  assert.deepEqual(errors, [])
  console.log(
    JSON.stringify(
      { column, search: searchState, grid, saveReads: { list: 0, navigation: 0 }, errors },
      null,
      2,
    ),
  )
} finally {
  await browser.close()
}
