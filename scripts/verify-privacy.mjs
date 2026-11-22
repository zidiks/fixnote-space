// Runs against a local Vite server with an isolated browser profile and synthetic notes.
import assert from 'node:assert/strict'
import { chromium } from 'playwright'

const url = new URL(process.argv[2] ?? 'http://localhost:5173')
if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))
  throw new Error('Privacy review verification requires localhost.')
url.searchParams.set('dev-backend', '')

const browser = await chromium.launch({ channel: 'chrome', headless: true })
const importAppModule = () => {
  window.privacyTestImport = (path) => {
    const loaded = performance
      .getEntriesByType('resource')
      .findLast((entry) => new URL(entry.name).pathname === path)
    return import(loaded?.name || path)
  }
}
try {
  const page = await browser.newPage({ viewport: { width: 1300, height: 900 }, locale: 'en-US' })
  const errors = []
  const remote = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.route('**/*', async (route) => {
    const target = new URL(route.request().url())
    if (target.origin === url.origin) await route.continue()
    else {
      remote.push(target.origin)
      await route.abort()
    }
  })
  await page.addInitScript(importAppModule)
  await page.goto(url.href, { waitUntil: 'domcontentloaded' })
  // The normal app opens and migrates SQLite before the test opens its fixture connection.
  await page.getByRole('button', { name: 'New note', exact: true }).first().waitFor()
  const [first, other] = await page.evaluate(async () => {
    const { repo } = await (await window.privacyTestImport('/src/lib/db.tsx')).openDb()
    const { useUi } = await window.privacyTestImport('/src/app/store.ts')
    const first = await repo.createNote({ content: '# Example A\n\nPassword: local-fixture-value' })
    const other = await repo.createNote({ content: '# Example B\n\nordinary text' })
    useUi.getState().setLayout('notes')
    useUi.getState().navigate({ kind: 'note', id: first.id })
    return [first.id, other.id]
  })
  const toast = page
    .locator('[data-sonner-toast]')
    .filter({ hasText: 'Possible sensitive information' })
  await toast.waitFor()
  assert.ok(!(await toast.textContent()).includes('local-fixture-value'))
  await page.evaluate(async (id) => {
    const { useUi } = await window.privacyTestImport('/src/app/store.ts')
    useUi.getState().navigate({ kind: 'note', id })
  }, other)
  await page.waitForFunction(() =>
    document.querySelector('.tiptap')?.textContent.startsWith('Example B'),
  )
  await toast.getByRole('button', { name: 'Review', exact: true }).click()

  const mark = page.locator('.fixnote-privacy-candidate')
  const dialog = page.getByRole('dialog', { name: 'Possible sensitive information' })
  await dialog.waitFor()
  assert.equal(await mark.textContent(), 'local-fixture-value')
  await dialog.getByRole('button', { name: 'This is not a secret' }).click()
  await dialog.waitFor({ state: 'hidden' })
  assert.equal(await mark.count(), 0)
  await page.waitForFunction(async (id) => {
    const { driver } = await (await window.privacyTestImport('/src/lib/db.tsx')).openDb()
    const [row] = await driver.query('SELECT value FROM kv WHERE key = ?', [
      'privacy.dismissed.' + id,
    ])
    return row && JSON.parse(row.value).length === 1 && !row.value.includes('local-fixture-value')
  }, first)
  const original = await page.evaluate(async (id) => {
    const { repo } = await (await window.privacyTestImport('/src/lib/db.tsx')).openDb()
    return (await repo.getNote(id)).content
  }, first)
  assert.equal(original, '# Example A\n\nPassword: local-fixture-value')

  await page.locator('.tiptap').focus()
  await page.evaluate(() => {
    const editor = document.querySelector('.tiptap').editor
    editor.commands.insertContentAt(editor.state.doc.content.size - 1, '-changed')
  })
  await page.getByRole('button', { name: /Possible sensitive information.*Review/ }).click()
  await dialog.waitFor()
  assert.equal(await mark.textContent(), 'local-fixture-value-changed')
  await dialog.getByRole('button', { name: 'Protect', exact: true }).click()
  await dialog.waitFor({ state: 'hidden' })
  const value = page.locator('.fixnote-protected-value').filter({
    hasText: 'local-fixture-value-changed',
  })
  await value.waitFor()
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write'])
  const card = page.locator('.fixnote-protected-fragment').filter({
    hasText: 'local-fixture-value-changed',
  })
  await card.getByRole('button', { name: 'Copy', exact: true }).click()
  assert.equal(
    await page.evaluate(() => navigator.clipboard.readText()),
    'local-fixture-value-changed',
  )
  await page.evaluate(() => {
    const editor = document.querySelector('.tiptap').editor
    editor.commands.focus()
    editor.commands.selectAll()
  })
  await page.waitForFunction(() => document.activeElement?.classList.contains('tiptap'))
  await page.keyboard.press('Control+c')
  const copied = await page.evaluate(() => navigator.clipboard.readText())
  assert.ok(copied.includes('[protected fragment]'), JSON.stringify(copied))
  assert.ok(!copied.includes('local-fixture-value-changed'))

  // Sign in after protecting offline, then share that note. The original protected
  // value must remain personal, even though the reference now travels through Yjs.
  const shared = await page.evaluate(async (id) => {
    const a = await window.privacyTestImport('/src/lib/account/account.ts')
    await a.sendCode('privacy-owner@example.test')
    await a.verifyCode('123456')
    await a.finishNewAccount()
    await a.startTrial()
    await a.runSync()
    return a.sharedContext().shared.share(id)
  }, first)
  await page.evaluate(
    async ({ other, first }) => {
      const { useUi } = await window.privacyTestImport('/src/app/store.ts')
      useUi.getState().navigate({ kind: 'note', id: other })
      await new Promise((resolve) => setTimeout(resolve, 150))
      useUi.getState().navigate({ kind: 'note', id: first })
    },
    { other, first },
  )
  await value.waitFor()
  await page.evaluate(() => {
    const editor = document.querySelector('.tiptap').editor
    editor.commands.insertContentAt(
      editor.state.doc.content.size - 1,
      '\n\nPassword: team-fixture-value',
    )
  })
  await page.getByRole('button', { name: /Possible sensitive information.*Review/ }).click()
  await dialog.waitFor()
  assert.equal(await dialog.getByRole('combobox').inputValue(), 'members')
  assert.equal(await mark.textContent(), 'team-fixture-value')
  await dialog.getByRole('button', { name: 'Protect', exact: true }).click()
  await page.locator('.fixnote-protected-value').filter({ hasText: 'team-fixture-value' }).waitFor()
  const transport = await page.evaluate(
    async ({ first, shared }) => {
      const a = await window.privacyTestImport('/src/lib/account/account.ts')
      const { repo } = await (await window.privacyTestImport('/src/lib/db.tsx')).openDb()
      await a.runSync()
      const doc = await a.sharedContext().shared.doc(shared)
      const saved = await repo.getNote(first)
      const ref = /⟦fixnote-private:v1:members:([0-9a-f-]+)⟧/.exec(saved.content)?.[1]
      const blob = ref && (await a.sharedContext().shared.getProtectedFragment(shared, ref))
      return {
        content: saved.content,
        state: new TextDecoder().decode(doc.state),
        payload: blob && new TextDecoder().decode(blob),
      }
    },
    { first, shared },
  )
  assert.ok(transport.content.includes('⟦fixnote-private:v1:personal:'))
  assert.ok(transport.content.includes('⟦fixnote-private:v1:members:'))
  for (const [kind, material] of Object.entries(transport)) {
    assert.equal(typeof material, 'string')
    assert.ok(!material.includes('team-fixture-value'), kind)
    assert.ok(!material.includes('local-fixture-value'), kind)
  }

  // A second account has a separate device vault. It receives the team data and
  // can see the personal reference, but does not have access to the personal body.
  const member = await browser.newPage({ viewport: { width: 1300, height: 900 }, locale: 'en-US' })
  member.on('pageerror', (e) => errors.push(e.message))
  await member.route('**/*', (route) =>
    new URL(route.request().url()).origin === url.origin ? route.continue() : route.abort(),
  )
  await member.addInitScript(importAppModule)
  await member.goto(url.href, { waitUntil: 'domcontentloaded' })
  await member.getByRole('button', { name: 'New note', exact: true }).first().waitFor()
  const identity = await member.evaluate(async () => {
    const a = await window.privacyTestImport('/src/lib/account/account.ts')
    await a.sendCode('privacy-member@example.test.local')
    await a.verifyCode('123456')
    await a.finishNewAccount()
    const raw = JSON.parse(localStorage.getItem('fixnote.dev-shared'))
    return raw.users[0]
  })
  const sharedServer = await page.evaluate(
    async ({ identity, shared }) => {
      // Use the public registration exported by the other fake account.
      const a = await window.privacyTestImport('/src/lib/account/account.ts')
      const { devRegisterUser } = await window.privacyTestImport('/src/lib/shared/dev-remote.ts')
      const [id, { email, publicKey }] = identity
      devRegisterUser(id, email, publicKey)
      await a.sharedContext().shared.invite(shared, email, 'view')
      return localStorage.getItem('fixnote.dev-shared')
    },
    { identity, shared },
  )
  await member.evaluate(
    async ({ sharedServer, shared }) => {
      localStorage.setItem('fixnote.dev-shared', sharedServer)
      const a = await window.privacyTestImport('/src/lib/account/account.ts')
      const ctx = a.sharedContext()
      await ctx.shared.accept(shared)
      const note = await ctx.shared.doc(shared)
      const { useUi } = await window.privacyTestImport('/src/app/store.ts')
      useUi.getState().setLayout('notes')
      useUi.getState().navigate({ kind: 'note', id: note.noteId })
    },
    { sharedServer, shared },
  )
  await member
    .locator('.fixnote-protected-value')
    .filter({ hasText: 'team-fixture-value' })
    .waitFor()
  await member
    .locator('.fixnote-protected-value')
    .filter({ hasText: 'Unavailable on this device' })
    .waitFor()
  assert.ok(!(await member.locator('.tiptap').textContent()).includes('local-fixture-value'))
  await member.close()
  const snapshot = () =>
    page.evaluate(async (id) => {
      const { repo } = await (await window.privacyTestImport('/src/lib/db.tsx')).openDb()
      return (await repo.getNote(id)).content
    }, first)
  const stored = await snapshot()
  assert.ok(stored.includes('⟦fixnote-private:v1:personal:'))
  assert.ok(!stored.includes('local-fixture-value'))
  const afterUndo = await page.evaluate(() => {
    const editor = document.querySelector('.tiptap').editor
    editor.commands.undo()
    return editor.getMarkdown()
  })
  assert.equal(afterUndo, stored)

  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.getByRole('button', { name: 'New note', exact: true }).first().waitFor()
  await page.evaluate(async (id) => {
    const { useUi } = await window.privacyTestImport('/src/app/store.ts')
    useUi.getState().navigate({ kind: 'note', id })
  }, first)
  await value.waitFor()
  await page.evaluate(async (id) => {
    const a = await window.privacyTestImport('/src/lib/account/account.ts')
    await a.sharedContext().shared.unshare(id)
    await a.runSync()
  }, shared)
  const detached = await snapshot()
  assert.equal((detached.match(/⟦fixnote-private:v1:personal:/g) ?? []).length, 2)
  assert.ok(!detached.includes('team-fixture-value'))
  // The UI's unshare flow refreshes the note query. The fixture calls the core operation directly.
  await page.evaluate(
    async ({ other, first }) => {
      const { useUi } = await window.privacyTestImport('/src/app/store.ts')
      useUi.getState().navigate({ kind: 'note', id: other })
      await new Promise((resolve) => setTimeout(resolve, 150))
      useUi.getState().navigate({ kind: 'note', id: first })
    },
    { other, first },
  )
  await page.waitForFunction((canonical) => {
    const editor = document.querySelector('.tiptap')?.editor
    return editor?.getMarkdown() === canonical
  }, detached)
  const teamCard = page
    .locator('.fixnote-protected-fragment')
    .filter({ hasText: 'team-fixture-value' })
  await teamCard.getByRole('button', { name: 'Edit', exact: true }).click()
  const edit = page.getByRole('dialog', { name: 'Edit protected text' })
  await edit.getByRole('textbox').fill('revised-fixture-value')
  await edit.getByRole('button', { name: 'Save', exact: true }).click()
  await page
    .locator('.fixnote-protected-value')
    .filter({ hasText: 'revised-fixture-value' })
    .waitFor()
  const revised = await snapshot()
  assert.ok(!revised.includes('revised-fixture-value'))
  const multiline = await page.evaluate(async () => {
    const { repo } = await (await window.privacyTestImport('/src/lib/db.tsx')).openDb()
    const { useUi } = await window.privacyTestImport('/src/app/store.ts')
    const { id } = await repo.createNote({ content: '# Multiple lines' })
    useUi.getState().navigate({ kind: 'note', id })
    return id
  })
  const editor = page.locator('.tiptap')
  await page.waitForFunction(() =>
    document.querySelector('.tiptap')?.editor.getMarkdown().startsWith('# Multiple lines'),
  )
  await editor.evaluate((el) => {
    const e = el.editor
    e.commands.setContent({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'fixture-user' },
            { type: 'hardBreak' },
            { type: 'text', text: 'fixture-code' },
          ],
        },
        { type: 'paragraph', content: [{ type: 'text', text: 'fixture-comment' }] },
      ],
    })
    e.commands.selectAll()
  })
  await editor.dispatchEvent('contextmenu', { button: 2, bubbles: true })
  await page.getByRole('menuitem', { name: 'Protect', exact: true }).click()
  await dialog.getByRole('button', { name: 'Protect', exact: true }).click()
  const protectedBlock = page.locator('.fixnote-protected-fragment.is-multiline')
  await protectedBlock.waitFor()
  assert.equal(await protectedBlock.count(), 1)
  assert.equal(await protectedBlock.locator('.fixnote-protected-label svg').count(), 1)
  const expectedBlock = 'fixture-user\nfixture-code\nfixture-comment'
  assert.equal(
    await protectedBlock.locator('.fixnote-protected-value').textContent(),
    expectedBlock,
  )
  assert.ok(
    await protectedBlock.evaluate((el) => {
      const header = el.querySelector('.fixnote-protected-header').getBoundingClientRect()
      const body = el.querySelector('.fixnote-protected-value').getBoundingClientRect()
      return header.bottom < body.top
    }),
  )
  await protectedBlock.getByRole('button', { name: 'Copy block' }).click()
  const copiedBlock = await page.evaluate(() => navigator.clipboard.readText())
  assert.equal(copiedBlock.replaceAll('\r\n', '\n'), expectedBlock)
  const storedBlock = await page.evaluate(async (id) => {
    const { repo } = await (await window.privacyTestImport('/src/lib/db.tsx')).openDb()
    return (await repo.getNote(id)).content
  }, multiline)
  assert.ok(storedBlock.includes('⟦fixnote-private:v1:personal:'))
  assert.ok(!storedBlock.includes('fixture-code'))
  assert.deepEqual(errors, [])
  assert.deepEqual(remote, [])
  console.log('PASS: local scan, protection, reopen, and ciphertext-only personal/shared sync.')
} finally {
  await browser.close()
}
