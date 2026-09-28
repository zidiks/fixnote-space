import { assertEquals } from 'jsr:@std/assert@1'
import { type CleanupStore, handle } from './handler.ts'

function fakeStore(files: Record<string, number>, due: string[]) {
  const removed: string[][] = []
  let lastRun = 0
  const store: CleanupStore = {
    claim: async () => {
      if (Date.now() - lastRun < 3_600_000) return false
      lastRun = Date.now()
      return true
    },
    due: async () => due,
    list: async (user) => Array.from({ length: files[user] ?? 0 }, (_, i) => `${user}/${i}`),
    remove: async (paths) => {
      removed.push(paths)
    },
  }
  return { store, removed }
}

const post = () => new Request('http://x/storage-cleanup', { method: 'POST' })

Deno.test('removes every file of the accounts that are due, in batches', async () => {
  const { store, removed } = fakeStore({ a: 250, b: 3, c: 7 }, ['a', 'b'])
  const res = await handle(post(), store)
  assertEquals(await res.json(), { accounts: 2, files: 253 })
  assertEquals(
    removed.map((batch) => batch.length),
    [100, 100, 50, 3],
  )
  assertEquals(
    removed.flat().some((p) => p.startsWith('c/')),
    false,
  )
})

Deno.test('runs at most once an hour, and only on POST', async () => {
  const { store, removed } = fakeStore({ a: 1 }, ['a'])
  await handle(post(), store)
  assertEquals(await (await handle(post(), store)).json(), { skipped: true })
  assertEquals(removed.length, 1)
  assertEquals((await handle(new Request('http://x/'), store)).status, 405)
})
