#!/usr/bin/env node
/**
 * Figma Bridge: read layers and export pictures from the Figma file open on this computer, with no
 * API token and no rate limits. A small plugin (./plugin, imported once into Figma desktop) asks this
 * bridge for jobs and runs them through the Plugin API; the commands below queue the jobs.
 *
 *   node bridge.mjs serve                 keep running in a terminal (localhost:7331 only)
 *   node bridge.mjs info                  file, page and selection the plugin sees
 *   node bridge.mjs tree [ids] [--depth 2]
 *   node bridge.mjs nodes [ids] [--depth N]
 *   node bridge.mjs render [ids] [--format png|jpg|svg|pdf] [--scale 2]
 *   node bridge.mjs originals [ids]       photos as they were uploaded (image fills)
 *   node bridge.mjs find <text>           layers on the current page by name or text
 *
 * Ids: 279:51, 279-51 or a whole Figma link with ?node-id=…; none means the current selection.
 * Files go to --out (default ./.figma). The plugin's "Send selection" button drops files into
 * <out>/inbox/ of the running bridge. No dependencies: Node 18 or newer.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { join, resolve } from 'node:path'

const PORT = 7331 // plugin/manifest.json allows exactly this one
const URL_BASE = `http://127.0.0.1:${PORT}`
const JOB_TIMEOUT = 180_000

/** Stops with a message (thrown: Node on Windows can crash on process.exit mid-request). */
class Stop extends Error {}
const fail = (message) => {
  throw new Stop(message)
}

function parse(argv) {
  const flags = {}
  const rest = []
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a.startsWith('--')) flags[a.slice(2)] = argv[i + 1]?.startsWith('--') ? true : argv[++i]
    else rest.push(a)
  }
  return { flags, rest }
}

/** 279:51, 279-51, I12:3;4:5, or a Figma link with node-id. */
function toId(raw) {
  const fromUrl = /node-id=([^&#]+)/.exec(raw)
  const id = decodeURIComponent(fromUrl ? fromUrl[1] : raw)
  return /^I?\d+[-:]\d+/.test(id)
    ? id.replace(/^(I?\d+)-(\d+)/, '$1:$2')
    : fail(`Not a layer id: ${raw}`)
}

function save(out, files) {
  mkdirSync(out, { recursive: true })
  const paths = []
  for (const f of files) {
    const path = join(out, f.name)
    writeFileSync(path, f.base64 ? Buffer.from(f.base64, 'base64') : f.text)
    paths.push(path)
  }
  return paths
}

// ---------------------------------------------------------------------------------------------
// The bridge: a queue between the commands and the plugin window.

function serve(out) {
  const queue = []
  const pending = new Map()
  const pollers = new Set()
  let seen = 0
  let next = 1

  const send = (res, code, body, type = 'application/json') => {
    res.writeHead(code, {
      'content-type': type,
      'access-control-allow-origin': '*',
      'access-control-allow-headers': 'content-type',
      'access-control-allow-private-network': 'true',
    })
    res.end(typeof body === 'string' ? body : JSON.stringify(body))
  }
  const body = (req) =>
    new Promise((ok, no) => {
      const chunks = []
      req.on('data', (c) => chunks.push(c))
      req.on('end', () => {
        try {
          ok(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {})
        } catch (e) {
          no(e)
        }
      })
      req.on('error', no)
    })
  const online = () => Date.now() - seen < 25_000 || pollers.size > 0
  const hand = () => {
    while (queue.length && pollers.size) {
      const [poll] = pollers
      pollers.delete(poll)
      poll(queue.shift())
    }
  }

  const server = createServer(async (req, res) => {
    if (req.method === 'OPTIONS') return send(res, 204, '')
    try {
      const path = req.url.split('?')[0]

      // The plugin asks for work; held up to 20 s when there is none.
      if (path === '/next' && req.method === 'POST') {
        seen = Date.now()
        if (queue.length) return send(res, 200, queue.shift())
        const poll = (job) => {
          clearTimeout(timer)
          send(res, 200, job)
        }
        const timer = setTimeout(() => {
          pollers.delete(poll)
          seen = Date.now()
          send(res, 204, '')
        }, 20_000)
        pollers.add(poll)
        req.on('close', () => {
          clearTimeout(timer)
          pollers.delete(poll)
        })
        return
      }

      if (path.startsWith('/result/') && req.method === 'POST') {
        seen = Date.now()
        const id = path.slice('/result/'.length)
        const wait = pending.get(id)
        pending.delete(id)
        wait?.(await body(req))
        return send(res, 200, { ok: true })
      }

      if (path === '/inbox' && req.method === 'POST') {
        seen = Date.now()
        const { files = [] } = await body(req)
        const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
        const paths = save(join(out, 'inbox', stamp), files)
        console.log(`inbox: ${paths.length} files → ${join(out, 'inbox', stamp)}`)
        return send(res, 200, { ok: true, paths })
      }

      if (path === '/status') return send(res, 200, { plugin: online(), out })

      // A command queues a job and waits for the plugin's answer.
      if (path === '/job' && req.method === 'POST') {
        if (!online())
          return send(res, 503, {
            error: 'The plugin is not running: open Plugins → Development → Figma Bridge in Figma.',
          })
        const job = { id: String(next++), ...(await body(req)) }
        const answer = await new Promise((ok) => {
          const timer = setTimeout(() => {
            pending.delete(job.id)
            ok({ error: 'Figma did not answer in time (is the plugin window still open?)' })
          }, JOB_TIMEOUT)
          pending.set(job.id, (r) => {
            clearTimeout(timer)
            ok(r)
          })
          queue.push(job)
          hand()
        })
        console.log(`${answer.error ? '✗' : '✓'} ${job.kind}${job.label ? ` ${job.label}` : ''}`)
        return send(res, answer.error ? 422 : 200, answer)
      }

      send(res, 404, { error: 'Not found' })
    } catch (e) {
      send(res, 500, { error: String(e.message || e) })
    }
  })
  server.on('error', (e) => {
    console.error(
      e.code === 'EADDRINUSE'
        ? `Port ${PORT} is busy: a bridge is probably running already.`
        : e.message,
    )
    process.exitCode = 1
  })
  // Only this computer: nothing on the network can reach it.
  server.listen(PORT, '127.0.0.1', () => {
    console.log(`Figma Bridge on ${URL_BASE}, files in ${out}`)
    console.log('Open Plugins → Development → Figma Bridge in Figma; keep this terminal open.')
  })
}

// ---------------------------------------------------------------------------------------------
// Commands.

async function job(kind, params, label) {
  let res
  try {
    res = await fetch(`${URL_BASE}/job`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ kind, params, label }),
    })
  } catch {
    fail('The bridge is not running: start `node bridge.mjs serve` in another terminal.')
  }
  const data = await res.json()
  if (data.error) fail(data.error)
  return data.result
}

const HELP = `Figma Bridge: layers and pictures from the Figma file open on this computer.

  serve                                  start the bridge (keep it running)
  status                                 is the bridge up, is the plugin connected
  info                                   file, page and selection the plugin sees
  tree [ids] [--depth 2]                 outline: id, type, name, size, text
  nodes [ids] [--depth N]                full JSON of layers (styles, auto layout, text runs)
  render [ids] [--format png] [--scale 2]  pictures: png, jpg, svg or pdf
  originals [ids]                        photos as uploaded (image fills)
  find <text>                            layers on the current page by name or text

Ids: 279:51, 279-51 or a Figma link; none = the current selection. --out <dir> (default ./.figma).`

const [command, ...argv] = process.argv.slice(2)
const { flags, rest } = parse(argv)
// biome-ignore lint/suspicious/noUndeclaredEnvVars: a standalone tool, not a Turborepo task
const out = resolve(flags.out ?? process.env.FIGMA_BRIDGE_OUT ?? '.figma')
const ids = () => rest.map(toId)
const label = () => (rest.length ? rest.map(toId).join(' ') : '(selection)')

try {
  switch (command) {
    case 'serve':
      serve(out)
      break
    case 'status': {
      const s = await fetch(`${URL_BASE}/status`)
        .then((r) => r.json())
        .catch(() => null)
      console.log(
        !s
          ? 'Bridge: not running'
          : `Bridge: running, files in ${s.out}\nPlugin: ${s.plugin ? 'connected' : 'not connected'}`,
      )
      break
    }
    case 'info': {
      const r = await job('info', {}, '')
      console.log(`File: ${r.file}\nPage: ${r.page.name} (${r.page.id})`)
      console.log(
        r.selection.length
          ? `Selection:\n${r.selection.map((n) => `  ${n.id}  ${n.type}  ${n.name}`).join('\n')}`
          : 'Selection: none',
      )
      break
    }
    case 'tree':
      console.log(
        (await job('tree', { ids: ids(), depth: Number(flags.depth ?? 2) }, label())).text,
      )
      break
    case 'find':
      if (!rest.length) fail('What to look for? e.g. find "Remember the idea"')
      console.log((await job('find', { query: rest.join(' ') }, rest.join(' '))).text)
      break
    case 'nodes':
    case 'render':
    case 'originals': {
      const params = { ids: ids() }
      if (command === 'nodes' && flags.depth !== undefined) params.depth = Number(flags.depth)
      if (command === 'render') {
        params.format = String(flags.format ?? 'png')
        params.scale = Number(flags.scale ?? 2)
      }
      const r = await job(command, params, label())
      for (const p of save(out, r.files)) console.log(`  ${p}`)
      break
    }
    default:
      console.log(HELP)
      if (command && command !== 'help') process.exitCode = 1
  }
} catch (e) {
  if (!(e instanceof Stop)) throw e
  console.error(e.message)
  process.exitCode = 1
}
