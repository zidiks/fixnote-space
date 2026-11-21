// Main-thread helpers used during indexing and sync, measured on synthetic transcript text.
import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { chromium } from 'playwright'

const origin = new URL(process.argv[2] ?? 'http://localhost:5173')
if (!['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname))
  throw new Error('Core profiling requires a localhost dev server.')
const browser = await chromium.launch({ channel: 'chrome', headless: true })
try {
  const page = await browser.newPage()
  await page.goto(`${origin.origin}/?dev-backend`)
  const result = await page.evaluate(
    async (root) => {
      const { chunkNote, contentHash } = await import(`${root}/ai/chunk.ts`)
      const { merge3 } = await import(`${root}/sync/merge.ts`)
      const crypto = await import(`${root}/crypto/index.ts`)
      await crypto.cryptoReady()
      const keys = crypto.deriveKeys(crypto.newRecoverySecret())
      const markdown = `# Meeting\n\n${'A paragraph of meeting notes.\n\n'.repeat(4000)}`
      const time = (fn) => {
        const values = []
        fn()
        for (let i = 0; i < 5; i++) {
          const start = performance.now()
          fn()
          values.push(performance.now() - start)
        }
        values.sort((a, b) => a - b)
        return { medianMs: values[2], maxMs: values.at(-1) }
      }
      return {
        characters: markdown.length,
        hashAndChunk: time(() => {
          contentHash(markdown)
          chunkNote(markdown)
        }),
        merge: time(() => merge3(`local\n${markdown}`, markdown, `${markdown}\nremote`)),
        cryptoRoundtrip: time(() => {
          const sealed = crypto.encryptNote(keys, 'fixture', markdown)
          if (crypto.decryptNote(keys, 'fixture', sealed) !== markdown)
            throw new Error('Encryption roundtrip failed')
        }),
      }
    },
    `/@fs/${path.resolve('packages/core/src').replaceAll('\\', '/')}`,
  )
  assert.ok(result.merge.medianMs < 50, 'Transcript merge blocks the main thread')
  await mkdir('.cache/profile-ui', { recursive: true })
  await writeFile('.cache/profile-ui/core.json', JSON.stringify(result, null, 2))
  console.log(JSON.stringify(result, null, 2))
} finally {
  await browser.close()
}
