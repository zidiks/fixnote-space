// Checks a built fixnote-mcp binary the way an MCP client uses it:
// 1. against a missing database it starts and prints its own error (the OS runs it at all);
// 2. against a fresh notes database it answers initialize, tools/list and a search over stdio.
// 3. after hundreds of calls (when V8 starts compiling to machine code) it still answers.
// Usage: node scripts/smoke.mjs <path-to-binary>
import { execFileSync, spawn, spawnSync } from 'node:child_process'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

const binary = process.argv[2]
if (!binary) throw new Error('usage: smoke.mjs <binary>')
const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const dir = mkdtempSync(join(tmpdir(), 'fixnote-smoke-'))

// 1. Missing database.
const missing = spawnSync(binary, [], {
  env: { ...process.env, FIXNOTE_DB: join(dir, 'missing.db') },
  encoding: 'utf8',
  timeout: 30_000,
})
console.log(`missing db: exit ${missing.status}, signal ${missing.signal ?? 'none'}`)
if (missing.error) throw missing.error
if (!(missing.stderr ?? '').includes('FixNote database not found')) {
  console.error(missing.stderr)
  throw new Error('fixnote-mcp did not start')
}

// 2. A database made by the same code the app uses, with one note.
const dbPath = join(dir, 'fixnote.db')
const maker = join(dir, 'make-db.mjs')
await build({
  stdin: {
    contents: `
      import { NotesRepo, prepareDatabase } from '@fixnote/core'
      import { openNodeSqlite } from './src/sqlite'
      const db = openNodeSqlite(process.argv[2])
      await prepareDatabase(db)
      await new NotesRepo(db).createNote({ content: '# Smoke test\\nbanana bread recipe' })
      await db.close()`,
    resolveDir: root,
    loader: 'ts',
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  outfile: maker,
  logLevel: 'warning',
})
execFileSync(process.execPath, [maker, dbPath], { stdio: 'inherit' })

const server = spawn(binary, [], { env: { ...process.env, FIXNOTE_DB: dbPath } })
let stderr = ''
server.stderr.on('data', (d) => {
  stderr += d
})
const pending = new Map()
let buffer = ''
server.stdout.on('data', (d) => {
  buffer += d
  let nl = buffer.indexOf('\n')
  while (nl >= 0) {
    const line = buffer.slice(0, nl).trim()
    buffer = buffer.slice(nl + 1)
    nl = buffer.indexOf('\n')
    if (!line) continue
    const msg = JSON.parse(line)
    pending.get(msg.id)?.(msg)
  }
})
const exited = new Promise((resolve) =>
  server.on('exit', (code, signal) => resolve({ code, signal })),
)
let nextId = 1
function request(method, params) {
  const id = nextId++
  const reply = new Promise((resolve, reject) => {
    pending.set(id, resolve)
    setTimeout(() => reject(new Error(`no reply to ${method}\n${stderr}`)), 20_000)
    exited.then((e) => reject(new Error(`server exited (${JSON.stringify(e)})\n${stderr}`)))
  })
  server.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`)
  return reply
}

try {
  const init = await request('initialize', {
    protocolVersion: '2025-06-18',
    capabilities: {},
    clientInfo: { name: 'fixnote-smoke', version: '0' },
  })
  console.log('initialize:', init.result?.serverInfo?.name)
  server.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })}\n`)
  const tools = await request('tools/list', {})
  const names = (tools.result?.tools ?? []).map((t) => t.name)
  console.log('tools:', names.join(', '))
  if (!names.length) throw new Error('no tools')
  const search = names.find((n) => n.includes('search'))
  const found = await request('tools/call', { name: search, arguments: { query: 'banana' } })
  const text = JSON.stringify(found.result ?? found.error)
  if (!text.includes('Smoke test')) throw new Error(`search did not find the note: ${text}`)
  console.log('search: finds the note')
  // Keep it busy until V8 compiles hot functions to machine code (Sparkplug, then TurboFan): that
  // needs executable memory, which macOS hardened runtime without the JIT entitlement refuses.
  for (let i = 0; i < 600; i++) {
    await request('tools/call', { name: search, arguments: { query: `banana ${i % 7}` } })
    await request('tools/list', {})
  }
  console.log('600 more calls: still running')
} finally {
  server.kill()
}
console.log('fixnote-mcp works')
process.exit(0)
