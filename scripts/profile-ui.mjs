// Run against a local Vite dev server. Each run uses a fresh browser profile and synthetic notes.
// pnpm profile:ui --label after --url http://localhost:5173
import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { chromium } from 'playwright'

const option = (name, fallback) => {
  const index = process.argv.indexOf(name)
  return index < 0 ? fallback : (process.argv[index + 1] ?? fallback)
}
const origin = new URL(option('--url', 'http://localhost:5173'))
if (!['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname))
  throw new Error('Profiling seeds synthetic notes: only a localhost dev server is allowed.')
const label = option('--label', 'after').replace(/[^a-zA-Z0-9_-]/g, '')
const output = path.resolve('.cache/profile-ui', label)
await mkdir(output, { recursive: true })
const browser = await chromium.launch({ channel: 'chrome', headless: true })
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto(`${origin.origin}/?dev-backend`)
  await page.evaluate(async () => {
    const { openDb } = await import('/src/lib/db.tsx')
    await openDb()
  })
  const ids = await page.evaluate(async () => {
    const { openDb } = await import('/src/lib/db.tsx')
    const { useUi } = await import('/src/app/store.ts')
    const { repo } = await openDb()
    const ids = []
    for (let i = 0; i < 150; i++) {
      ids.push(
        (
          await repo.createNote({
            content:
              `# Profile ${i}\n\nMeeting transcript sample ${i}. ` +
              (i === 0 ? 'A paragraph of meeting notes.\n\n'.repeat(4000) : 'Preview text.'),
          })
        ).id,
      )
    }
    useUi.getState().setLayout('notes')
    useUi.getState().navigate({ kind: 'note', id: ids[0] })
    return ids
  })
  // Seeding bypasses UI mutation invalidation; discard any queries read during the seed.
  await page.reload()
  await page.evaluate(async (id) => {
    await (await import('/src/lib/db.tsx')).openDb()
    const { useUi } = await import('/src/app/store.ts')
    useUi.getState().navigate({ kind: 'note', id })
  }, ids[0])
  const waitNote = (index) =>
    page.waitForFunction(
      (index) => document.querySelector('.tiptap')?.textContent.startsWith(`Profile ${index}`),
      index,
    )
  await waitNote(0)
  await page.waitForTimeout(600)
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Profiler.enable')
  await page.evaluate(() => {
    window.uiProfile = { phase: 'setup', tasks: [], serializations: 0, serializeMs: 0 }
    new PerformanceObserver((list) => {
      window.uiProfile.tasks.push(
        ...list.getEntries().map((e) => ({
          phase: window.uiProfile.phase,
          duration: e.duration,
        })),
      )
    }).observe({ type: 'longtask' })
    const manager = document.querySelector('.tiptap').editor.markdown
    const serialize = manager.serialize.bind(manager)
    manager.serialize = (...args) => {
      const t = performance.now()
      const result = serialize(...args)
      window.uiProfile.serializations++
      window.uiProfile.serializeMs += performance.now() - t
      return result
    }
  })
  const measurements = {}
  const phase = async (name, run) => {
    await page.evaluate((name) => {
      window.uiProfile.phase = name
    }, name)
    const start = performance.now()
    await run()
    measurements[name] = Math.round(performance.now() - start)
  }
  await cdp.send('Profiler.start')
  await page.locator('.tiptap').click()
  await page.keyboard.press('Control+End')
  await phase('typing', async () => {
    await page.keyboard.type('Typing a long meeting transcript at normal speed.', { delay: 15 })
  })
  const duringTyping = await page.evaluate(() => ({
    serializations: window.uiProfile.serializations,
    serializeMs: window.uiProfile.serializeMs,
  }))
  await phase('save', () => page.waitForTimeout(1000))
  const afterSave = await page.evaluate(() => ({
    serializations: window.uiProfile.serializations,
    serializeMs: window.uiProfile.serializeMs,
  }))
  await phase('scroll', async () => {
    for (let i = 0; i < 6; i++) {
      await page.mouse.move(410, 600)
      await page.mouse.wheel(0, 1300)
      await page.waitForTimeout(150)
    }
  })
  const search = page.locator('input[placeholder]').first()
  await phase('search', async () => {
    await search.pressSequentially('Profile 12', { delay: 15 })
    await page.waitForFunction(() => {
      const cards = [...document.querySelectorAll('[data-note-id]')]
      return cards.length > 0 && cards.every((el) => /Profile 12\d?/.test(el.textContent))
    })
  })
  await search.fill('')
  await page.waitForTimeout(500)
  await phase('switch', async () => {
    for (const [index, id] of ids.slice(1, 5).entries()) {
      await page.evaluate(async (id) => {
        const { useUi } = await import('/src/app/store.ts')
        useUi.getState().navigate({ kind: 'note', id })
      }, id)
      await waitNote(index + 1)
    }
  })
  const { profile } = await cdp.send('Profiler.stop')
  const result = {
    measurements,
    duringTyping,
    afterSave,
    ...(await page.evaluate(() => ({
      longTasks: window.uiProfile.tasks,
      loadedCards: document.querySelectorAll('[data-note-id]').length,
      loadedRows: Number(document.querySelector('[data-virtual-count]')?.dataset.virtualCount ?? 0),
    }))),
    errors,
  }
  assert.equal(errors.length, 0, errors.join('\n'))
  await writeFile(path.join(output, 'cpu.cpuprofile'), JSON.stringify(profile))
  await writeFile(path.join(output, 'results.json'), JSON.stringify(result, null, 2))
  await page.screenshot({ path: path.join(output, 'app.png') })
  console.log(JSON.stringify(result, null, 2))
} finally {
  await browser.close()
}
