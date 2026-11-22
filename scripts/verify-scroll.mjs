import assert from 'node:assert/strict'
import { chromium } from 'playwright'

const origin = new URL(process.argv[2] ?? 'http://localhost:5173')
assert(['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname), 'Localhost only')
const browser = await chromium.launch({ channel: 'chrome', headless: true })
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, locale: 'en-US' })
  page.setDefaultTimeout(12000)
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.route('**/*', (route) =>
    new URL(route.request().url()).origin === origin.origin ? route.continue() : route.abort(),
  )
  await page.addInitScript(() => {
    localStorage.setItem(
      'fixnote.ui',
      JSON.stringify({ state: { layout: 'assistant' }, version: 0 }),
    )
    // Use the module instance loaded by Vite after a hot reload as well.
    window.fixtureImport = (path) =>
      import(
        performance.getEntriesByType('resource').findLast((r) => new URL(r.name).pathname === path)
          ?.name ?? path
      )
  })
  await page.goto(`${origin.origin}/?dev-backend`)
  await page.getByRole('button', { name: 'New note', exact: true }).first().waitFor()
  const noteId = await page.evaluate(async () => {
    const { driver, repo } = await (await window.fixtureImport('/src/lib/db.tsx')).openDb()
    await driver.transaction(async (tx) => {
      for (let i = 0; i < 650; i++) {
        await tx.execute(
          'INSERT INTO folders(id,parent_id,name,sort,created_at,updated_at) VALUES (?,?,?,?,1,1)',
          [`folder-${i}`, i === 1 ? 'folder-0' : null, `Fixture folder ${i}`, i],
        )
      }
    })
    return (await repo.createNote({ content: '# Move me' })).id
  })
  await page.reload()
  const folders = page.locator('nav [data-folder-id]')
  const parent = page.locator('[data-folder-id="folder-0"]')
  const child = page.locator('[data-folder-id="folder-1"]')
  const toggle = parent.locator('[aria-expanded][aria-label="Fixture folder 0"]')
  await child.waitFor()
  const folderCount = await folders.count()
  assert(folderCount < 45, `Mounted ${folderCount} out of 650 folder rows`)
  await toggle.click()
  await child.waitFor({ state: 'detached' })

  const transfer = await page.evaluateHandle((id) => {
    const transfer = new DataTransfer()
    transfer.setData('application/x-fixnote-notes', JSON.stringify([id]))
    return transfer
  }, noteId)
  await parent.dispatchEvent('dragover', { dataTransfer: transfer })
  await child.waitFor()
  await child.dispatchEvent('drop', { dataTransfer: transfer })
  await transfer.dispose()
  await page.waitForFunction(async (id) => {
    const { repo } = await (await window.fixtureImport('/src/lib/db.tsx')).openDb()
    return (await repo.getNote(id))?.folderId === 'folder-1'
  }, noteId)

  await parent.getByRole('button', { name: 'Fixture folder 0' }).first().focus()
  await page.keyboard.press('End')
  await page.waitForFunction(() =>
    document.activeElement?.textContent.includes('Fixture folder 649'),
  )
  await page.keyboard.press('Home')
  await page.waitForFunction(() => document.activeElement?.textContent.includes('Fixture folder 0'))
  await parent.click({ button: 'right' })
  await page.getByRole('menuitem', { name: 'Rename' }).click()
  const name = page.getByRole('textbox', { name: 'Folder name' })
  await name.fill('Renamed parent')
  await name.press('Home')
  await name.press('Enter')
  await parent.getByRole('button', { name: 'Renamed parent' }).first().waitFor()
  await parent.hover()
  await parent.getByRole('button', { name: 'Folder actions' }).click()
  await page.getByRole('menuitem', { name: 'New subfolder' }).click()
  await name.fill('New nested folder')
  await name.press('Enter')
  await page.getByRole('button', { name: 'New nested folder' }).waitFor()
  await page.getByRole('button', { name: 'New folder', exact: true }).click()
  await name.waitFor()
  assert(await name.evaluate((el) => document.activeElement === el))
  await name.fill('New root folder')
  await name.press('Enter')
  await page.getByRole('button', { name: 'New root folder' }).waitFor()

  await page.evaluate(async () => {
    const { useUi } = await window.fixtureImport('/src/app/store.ts')
    const { useAssistant } = await window.fixtureImport('/src/lib/assistant/assistant.ts')
    const { platform } = await window.fixtureImport('/src/lib/platform.tsx')
    // A 20-second local silent clip, long enough to scroll away and return during playback.
    const sampleRate = 8000
    const samples = sampleRate * 20
    const wav = new ArrayBuffer(44 + samples * 2)
    const view = new DataView(wav)
    for (const [offset, text] of [
      [0, 'RIFF'],
      [8, 'WAVEfmt '],
      [36, 'data'],
    ]) {
      new Uint8Array(wav, offset, text.length).set(new TextEncoder().encode(text))
    }
    for (const [offset, value] of [
      [4, wav.byteLength - 8],
      [16, 16],
      [24, sampleRate],
      [28, sampleRate * 2],
      [40, samples * 2],
    ]) {
      view.setUint32(offset, value, true)
    }
    for (const [offset, value] of [
      [20, 1],
      [22, 1],
      [32, 2],
      [34, 16],
    ]) {
      view.setUint16(offset, value, true)
    }
    await platform.blobs.put('voice/fixture.wav', new Blob([wav], { type: 'audio/wav' }))
    const messages = Array.from({ length: 200 }, (_, index) => ({
      id: `message-${index}`,
      kind: index % 2 ? 'assistant' : 'user',
      content:
        index % 2
          ? `Answer ${index}\n\n${'Fixture answer. '.repeat(index % 13)}`
          : `Question ${index}`,
      scope: { kind: 'all' },
      status: index === 199 ? 'streaming' : 'done',
      citations: [],
      confidence: null,
      createdAt: index,
      ...(index === 198
        ? { voice: { key: 'voice/fixture.wav', durationMs: 20000, peaks: [] } }
        : {}),
    }))
    useAssistant.setState({ semantic: 'ready', messages })
    useUi.getState().setChatOpen(true)
  })
  const history = page.locator('[data-chat-history]')
  const last = history.locator('[data-chat-message-id="message-199"]')
  const voice = history.locator('[data-chat-message-id="message-198"]')
  const atEnd = () =>
    page.waitForFunction(() => {
      const scroll = document.querySelector('[data-chat-history]')
      return scroll.scrollHeight - scroll.scrollTop - scroll.clientHeight < 3
    })
  const setScroll = (fraction) =>
    history.evaluate((scroll, fraction) => {
      scroll.scrollTop = (scroll.scrollHeight - scroll.clientHeight) * fraction
    }, fraction)
  const growAnswer = (text) =>
    page.evaluate(async (text) => {
      const { useAssistant } = await window.fixtureImport('/src/lib/assistant/assistant.ts')
      useAssistant.setState(({ messages }) => ({
        messages: [...messages.slice(0, -1), { ...messages.at(-1), content: text }],
      }))
    }, text)
  await last.waitFor()
  await atEnd()
  const chatCount = await history.locator('[data-chat-message-id]').count()
  assert(chatCount < 45, `Mounted ${chatCount} out of 200 chat messages`)
  await voice.getByRole('button', { name: 'Play', exact: true }).click()
  await voice.getByRole('button', { name: 'Pause', exact: true }).waitFor()
  // Move focus away as well: playback alone should retain the voice row.
  await page.locator('aside[aria-label="Assistant"] header button').last().focus()
  await setScroll(0.35)
  await last.waitFor({ state: 'detached' })
  assert.equal(await voice.count(), 1)
  const position = await history.evaluate((scroll) => scroll.scrollTop)
  const fullAnswer = Array.from({ length: 28 }, (_, i) => `New paragraph ${i}`).join('\n\n')
  await growAnswer(fullAnswer)
  await page.waitForFunction(() => !document.querySelector('[data-chat-message-id="message-199"]'))
  assert(Math.abs((await history.evaluate((scroll) => scroll.scrollTop)) - position) < 3)
  await setScroll(1)
  await last.getByText('New paragraph 27', { exact: true }).waitFor()
  await atEnd()
  await growAnswer(`${fullAnswer}\n\nTail appeared`)
  await last.getByText('Tail appeared', { exact: true }).waitFor()
  await atEnd()
  await voice.getByText(/^0:0[1-9]$/, { exact: true }).waitFor()
  await voice.getByRole('button', { name: 'Pause', exact: true }).click()
  const paused = await voice.getByText(/^0:0[1-9]$/, { exact: true }).textContent()
  await page.locator('aside[aria-label="Assistant"] header button').last().focus()
  await setScroll(0.35)
  await voice.waitFor({ state: 'detached' })
  await setScroll(1)
  await voice.getByText(paused, { exact: true }).waitFor()

  await setScroll(0)
  await history.getByText('Question 0', { exact: true }).waitFor()
  await page.evaluate(async () => {
    const { useAssistant } = await window.fixtureImport('/src/lib/assistant/assistant.ts')
    useAssistant.setState(({ messages }) => ({
      messages: [
        ...messages,
        { ...messages[0], id: 'new-question', content: 'New local question' },
        { ...messages.at(-1), id: 'new-answer', content: 'New local answer', status: 'done' },
      ],
    }))
  })
  await history.getByText('New local question', { exact: true }).waitFor()
  await atEnd()
  assert.deepEqual(errors, [])
  console.log({
    folders: { total: 650, mounted: folderCount },
    chat: { total: 200, mounted: chatCount },
  })
} finally {
  await browser.close()
}
