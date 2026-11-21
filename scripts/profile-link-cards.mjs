// Isolates the real LinkCards plugin's transaction work; no network, React or DOM rendering.
import { mkdir, writeFile } from 'node:fs/promises'
import { chromium } from 'playwright'

const origin = new URL(process.argv[2] ?? 'http://localhost:5173')
if (!['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname))
  throw new Error('Localhost only')
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const modulePath = process.argv[3] ?? '/src/components/editor/link-cards.ts'
const label = (process.argv[4] ?? '').replace(/[^a-zA-Z0-9_-]/g, '')
try {
  const page = await browser.newPage()
  await page.goto(`${origin.origin}/?dev-backend`)
  await page.evaluate(async () => {
    const { repo } = await (await import('/src/lib/db.tsx')).openDb()
    const note = await repo.createNote({ content: '# Benchmark\n\nText' })
    ;(await import('/src/app/store.ts')).useUi.getState().navigate({ kind: 'note', id: note.id })
  })
  await page.waitForSelector('.tiptap')
  const result = await page.evaluate(async (modulePath) => {
    const { LinkCards } = await import(modulePath)
    const { schema } = document.querySelector('.tiptap').editor.state
    const State = document.querySelector('.tiptap').editor.state.constructor
    const results = []
    for (const count of [100, 1000, 4000]) {
      for (const links of [0, 20, 200].filter((n) => n <= count)) {
        for (const preview of links ? ['fallback', 'cached'] : ['fallback']) {
          const plugins = LinkCards.config.addProseMirrorPlugins.call({
            options: {
              load: async (url) =>
                preview === 'cached'
                  ? { url, kind: 'page', title: 'Cached preview', description: 'A saved page.' }
                  : null,
              open: () => {},
            },
          })
          const plugin = plugins[0]
          const samples = []
          const apply = plugin.spec.state.apply
          plugin.spec.state.apply = function (...args) {
            const start = performance.now()
            const result = apply.apply(this, args)
            samples.push(performance.now() - start)
            return result
          }
          const blocks = Array.from({ length: count }, (_, i) => {
            const url = `https://benchmark.invalid/${i}`
            return schema.nodes.paragraph.create(
              null,
              i < links
                ? schema.text(url, [schema.marks.link.create({ href: url })])
                : schema.text('A paragraph of meeting notes. '.repeat(4)),
            )
          })
          let state = State.create({ schema, doc: schema.nodes.doc.create(null, blocks), plugins })
          // The async loader must update plugin state just as it does in a mounted editor.
          // No DOM is needed: this view implements only the plugin's dispatch protocol.
          const lifecycle = plugin.spec.view?.({
            get state() {
              return state
            },
            isDestroyed: false,
            dispatch(tr) {
              state = state.apply(tr)
            },
          })
          // Drain the preview promise chain without mounting an EditorView.
          await Promise.resolve()
          await Promise.resolve()
          await Promise.resolve()
          samples.length = 0
          for (let i = 0; i < 250; i++)
            state = state.apply(state.tr.insertText('a', state.doc.content.size - 1))
          if (samples.length !== 250)
            throw new Error(`Unexpected transaction count: ${samples.length}`)
          const measured = samples.slice(50).sort((a, b) => a - b)
          results.push({
            preview,
            paragraphs: count,
            links,
            meanMs: measured.reduce((sum, ms) => sum + ms, 0) / measured.length,
            medianMs: measured[Math.floor(measured.length / 2)],
            p95Ms: measured[Math.ceil(measured.length * 0.95) - 1],
            maxMs: measured.at(-1),
          })
          lifecycle?.destroy?.()
        }
      }
    }
    return results
  }, modulePath)
  await mkdir('.cache/profile-ui', { recursive: true })
  await writeFile(
    `.cache/profile-ui/link-cards${label ? `-${label}` : ''}.json`,
    JSON.stringify(result, null, 2),
  )
  console.log(JSON.stringify(result, null, 2))
} finally {
  await browser.close()
}
