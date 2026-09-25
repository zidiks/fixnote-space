// Starts a built fixnote-mcp binary against a missing database and expects its own error message.
// A binary that the OS refuses to run, or that crashes on start (e.g. V8 without JIT under
// macOS hardened runtime), fails this check. Usage: node scripts/smoke.mjs <path-to-binary>
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const binary = process.argv[2]
if (!binary) throw new Error('usage: smoke.mjs <binary>')
const result = spawnSync(binary, [], {
  env: { ...process.env, FIXNOTE_DB: join(tmpdir(), 'fixnote-smoke-missing.db') },
  encoding: 'utf8',
  timeout: 30_000,
})
const stderr = result.stderr ?? ''
console.log(`${binary}: exit ${result.status}, signal ${result.signal ?? 'none'}`)
if (stderr) console.log(stderr.trim())
if (result.error) throw result.error
if (!stderr.includes('FixNote database not found')) {
  console.error('fixnote-mcp did not start')
  process.exit(1)
}
console.log('fixnote-mcp starts')
