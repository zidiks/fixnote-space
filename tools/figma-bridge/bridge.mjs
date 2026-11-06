#!/usr/bin/env node
/**
 * Figma Bridge: read and write the Figma file open on this computer, with no API token and no rate
 * limits. A small plugin (./plugin, imported once into Figma desktop) asks this bridge for jobs and
 * runs them through the Plugin API; the commands below (or the MCP tools of `mcp`) queue the jobs.
 * Writing: variables, styles and layers from JSON specs, upserted by key; `push-kit` builds the
 * FixNote UI kit from the repository (kit.mjs). `node bridge.mjs help` lists every command.
 *
 *   node bridge.mjs serve                 keep running in a terminal (localhost:7331 only)
 *   node bridge.mjs mcp                   MCP server on stdio; starts the bridge when none runs
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
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { KIT_PARTS, pushKit } from './kit.mjs'

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

/** Bridge messages: stderr while stdout carries MCP. */
let say = (...a) => console.log(...a)

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
        say(`inbox: ${paths.length} files → ${join(out, 'inbox', stamp)}`)
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
        say(`${answer.error ? '✗' : '✓'} ${job.kind}${job.label ? ` ${job.label}` : ''}`)
        return send(res, answer.error ? 422 : 200, answer)
      }

      send(res, 404, { error: 'Not found' })
    } catch (e) {
      send(res, 500, { error: String(e.message || e) })
    }
  })
  return new Promise((ok, no) => {
    server.on('error', (e) => {
      say(
        e.code === 'EADDRINUSE'
          ? `Port ${PORT} is busy: a bridge is probably running already.`
          : e.message,
      )
      process.exitCode = 1
      no(e)
    })
    // Only this computer: nothing on the network can reach it.
    server.listen(PORT, '127.0.0.1', () => {
      say(`Figma Bridge on ${URL_BASE}, files in ${out}`)
      say('Open Plugins → Development → Figma Bridge in Figma and keep its window open.')
      ok(server)
    })
  })
}

// ---------------------------------------------------------------------------------------------
// Commands.

const PLUGIN_CODE = join(dirname(fileURLToPath(import.meta.url)), 'plugin', 'code.js')
let sentCode = null

/**
 * The plugin reads code.js only when it starts; when the file is newer than what this process last
 * sent, send it (`reload`), so edits take effect without restarting the plugin in Figma.
 */
async function syncPlugin() {
  let code
  try {
    code = readFileSync(PLUGIN_CODE, 'utf8')
  } catch {
    return
  }
  if (code === sentCode) return
  try {
    await send('reload', { code }, 'plugin code')
  } catch (e) {
    // A plugin from before `reload` existed: it runs what it has until it is restarted.
    if (!(e instanceof Stop) || !/Unknown job reload/.test(e.message)) throw e
  }
  sentCode = code
}

async function job(kind, params, label) {
  await syncPlugin()
  return send(kind, params, label)
}

async function send(kind, params, label) {
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

const readJson = (file) => {
  if (!file) fail('Which file? e.g. build spec.json')
  try {
    return JSON.parse(readFileSync(file, 'utf8'))
  } catch (e) {
    fail(`Cannot read ${file}: ${e.message}`)
  }
}

/** How a layer spec looks: the same text goes to MCP clients in the figma_build description. */
const SPEC = `A layer spec is JSON:
{ type: FRAME | COMPONENT | COMPONENT_SET | INSTANCE | TEXT | RECTANGLE | ELLIPSE | SVG,
  key (required at the top level: the same key updates the same layer on the next push),
  name, hidden, opacity, x, y, w, h (number | "hug" | "fill"), minW, maxW, minH, maxH,
  layout: "row" | "col", gap, rowGap, wrap, pad (n | [v, h] | [t, r, b, l]),
  justify: start|center|end|between, align: start|center|end|baseline,
  fill, stroke: "$variable" | "#hex" | {var, opacity} | {color, opacity} | [..] | null,
  strokeWidth (n | [t, r, b, l]), strokeAlign, radius (n | [tl, tr, br, bl]),
  effects: "effect style name" | [{type: DROP_SHADOW|INNER_SHADOW, x, y, blur, spread, color}],
  clip, absolute, center (centred absolute child), constraints {h, v},
  children: [specs] (FRAME, COMPONENT),
  TEXT: text, textStyle ("text/sm") or size, weight ("Medium"), family, lineHeight (px | "150%"),
    letterSpacing, upper, underline, textAlign, maxLines, fill (text colour),
  COMPONENT: props {Label: "Button", Icon: false} (TEXT/BOOLEAN properties), description,
  COMPONENT_SET: variants: [component specs with variant {size: "sm", state: "hover"}], props,
  inside components: bind {characters: "Label", visible: "Icon"},
  INSTANCE: of (key or id of a component or set), variant {..}, props {Label: "Save"},
    color (paints the vectors inside, e.g. an icon),
  SVG: svg (markup), color }
Numbers such as gap, pad, radius and strokeWidth can be "$variable" to bind a FLOAT variable.
Children are matched by key, else by type + name, so layers keep their ids across pushes.`

/** The tools an MCP client sees; each runs one or more plugin jobs. */
const TOOLS = [
  {
    name: 'figma_status',
    description: 'Is the bridge up and is the Figma plugin connected.',
    input: {},
    run: async () => {
      const s = await fetch(`${URL_BASE}/status`).then((r) => r.json())
      return s.plugin
        ? 'Bridge running, plugin connected.'
        : 'Bridge running, plugin not connected: open Plugins → Development → Figma Bridge (local) in Figma.'
    },
  },
  {
    name: 'figma_info',
    description: 'The open file, current page and selection.',
    input: {},
    run: async () => JSON.stringify(await job('info', {}, ''), null, 2),
  },
  {
    name: 'figma_tree',
    description: 'Outline of layers: id, type, name, size, text. No ids = the selection.',
    input: { ids: { type: 'array', items: { type: 'string' } }, depth: { type: 'number' } },
    run: async (a) =>
      (await job('tree', { ids: (a.ids ?? []).map(toId), depth: a.depth ?? 2 }, 'mcp')).text,
  },
  {
    name: 'figma_find',
    description: 'Layers on the current page whose name or text contains the query.',
    input: { query: { type: 'string' } },
    required: ['query'],
    run: async (a) => (await job('find', { query: a.query }, a.query)).text,
  },
  {
    name: 'figma_nodes',
    description:
      'Full JSON of layers (fills, auto layout, text runs, variables). No ids = selection.',
    input: { ids: { type: 'array', items: { type: 'string' } }, depth: { type: 'number' } },
    run: async (a) => {
      const params = { ids: (a.ids ?? []).map(toId) }
      if (a.depth !== undefined) params.depth = a.depth
      const r = await job('nodes', params, 'mcp')
      const text = r.files.map((f) => f.text).join('\n')
      return text.length > 120_000
        ? `${text.slice(0, 120_000)}\n… (cut; ask for a smaller depth)`
        : text
    },
  },
  {
    name: 'figma_render',
    description:
      'Picture of layers (png, jpg, svg, pdf); saved to the bridge folder, PNG/JPG shown.',
    input: {
      ids: { type: 'array', items: { type: 'string' } },
      format: { type: 'string', enum: ['png', 'jpg', 'svg', 'pdf'] },
      scale: { type: 'number' },
    },
    run: async (a, out) => {
      const format = a.format ?? 'png'
      const r = await job(
        'render',
        { ids: (a.ids ?? []).map(toId), format, scale: a.scale ?? 1 },
        'mcp',
      )
      const paths = save(out, r.files)
      const content = [{ type: 'text', text: paths.join('\n') }]
      for (const f of r.files)
        if ((format === 'png' || format === 'jpg') && f.base64.length < 1_400_000)
          content.push({
            type: 'image',
            data: f.base64,
            mimeType: format === 'png' ? 'image/png' : 'image/jpeg',
          })
      return content
    },
  },
  {
    name: 'figma_variables',
    description:
      'Create or update one variable collection by name: modes (e.g. ["Light","Dark"]) and variables ' +
      '{name: "color/primary", type: COLOR|FLOAT|STRING|BOOLEAN, values: {Light: "#fff", Dark: {alias: "color/foreground"}} ' +
      'or value (all modes), scopes, code (CSS syntax), description}. prune removes variables not listed. ' +
      'On plans with fewer modes the result says which modes were not added.',
    input: {
      collection: { type: 'string' },
      modes: { type: 'array', items: { type: 'string' } },
      variables: { type: 'array', items: { type: 'object' } },
      prune: { type: 'boolean' },
    },
    required: ['collection', 'variables'],
    run: async (a) => JSON.stringify(await job('variables', a, a.collection), null, 2),
  },
  {
    name: 'figma_styles',
    description:
      'Create or update local styles by name. text: [{name: "text/sm", size: 14, lineHeight: 20, weight: "Medium", family, letterSpacing, upper}], ' +
      'effect: [{name: "shadow/float", effects: [{type: "DROP_SHADOW", x, y, blur, spread, color: "#0000001f" | "$variable"}]}].',
    input: {
      text: { type: 'array', items: { type: 'object' } },
      effect: { type: 'array', items: { type: 'object' } },
    },
    run: async (a) => JSON.stringify(await job('styles', a, 'styles'), null, 2),
  },
  {
    name: 'figma_page',
    description: 'Make sure a page with this name exists; show: true switches to it.',
    input: { name: { type: 'string' }, show: { type: 'boolean' } },
    required: ['name'],
    run: async (a) => JSON.stringify(await job('page', a, a.name)),
  },
  {
    name: 'figma_build',
    description: `Create or update layers from specs on a page (or inside parent: a key or id). Push variables, styles and the components an INSTANCE uses first. ${SPEC}`,
    input: {
      page: { type: 'string' },
      parent: { type: 'string' },
      nodes: { type: 'array', items: { type: 'object' } },
      show: { type: 'boolean' },
    },
    required: ['nodes'],
    run: async (a) =>
      JSON.stringify(await job('build', a, a.nodes.map((n) => n.key).join(' ')), null, 2),
  },
  {
    name: 'figma_keys',
    description: 'Layers this bridge has pushed to the open file: key, id, type, name.',
    input: {},
    run: async () => (await job('keys', {}, '')).text,
  },
  {
    name: 'figma_remove',
    description: 'Delete pushed layers by key, or any layers by id.',
    input: {
      keys: { type: 'array', items: { type: 'string' } },
      ids: { type: 'array', items: { type: 'string' } },
    },
    run: async (a) =>
      JSON.stringify(
        await job('remove', { keys: a.keys ?? [], ids: (a.ids ?? []).map(toId) }, 'remove'),
      ),
  },
  {
    name: 'figma_show',
    description: 'Select layers (by key or id) and zoom to them in Figma.',
    input: {
      keys: { type: 'array', items: { type: 'string' } },
      ids: { type: 'array', items: { type: 'string' } },
    },
    run: async (a) =>
      JSON.stringify(
        await job('show', { keys: a.keys ?? [], ids: (a.ids ?? []).map(toId) }, 'show'),
      ),
  },
  {
    name: 'figma_script',
    description:
      'Escape hatch: run Plugin API JavaScript in the open file (`figma` in scope, await allowed, `return` a JSON value). ' +
      'Prefer figma_build: layers made here have no keys and are not updated by later pushes.',
    input: { code: { type: 'string' } },
    required: ['code'],
    run: async (a) =>
      JSON.stringify((await job('script', { code: a.code }, 'script')).value, null, 2),
  },
  {
    name: 'figma_push_kit',
    description:
      'Push the FixNote UI kit from the repository: tokens from packages/ui/src/styles.css as variables (Light/Dark), ' +
      'text and shadow styles, lucide icons, and components bound to them (Button, Input, Badge, Kbd, Dialog, note row, title bar, Spotlight, two app screens, ' +
      'note card, note snippet, sidebar). Re-running updates the same components. parts: any of ' +
      `${KIT_PARTS.join(', ')} (default all, in that order; later parts need the earlier ones in the file).`,
    input: {
      parts: { type: 'array', items: { type: 'string', enum: KIT_PARTS } },
      page: { type: 'string' },
    },
    run: async (a) => (await pushKit(job, { parts: a.parts, page: a.page })).join('\n'),
  },
]

// ---------------------------------------------------------------------------------------------
// MCP over stdio (newline-delimited JSON-RPC). Starts the bridge itself when none is running, so an
// MCP client needs only `node bridge.mjs mcp`.

async function ensureBridge(out) {
  const up = await fetch(`${URL_BASE}/status`)
    .then((r) => r.ok)
    .catch(() => false)
  if (up) return
  await serve(out).catch(() => {
    // Port taken by a bridge that started meanwhile: fine, the calls go there.
  })
}

async function mcp(out) {
  say = (...a) => console.error(...a)
  await ensureBridge(out)
  const reply = (id, result, error) =>
    process.stdout.write(
      `${JSON.stringify(error ? { jsonrpc: '2.0', id, error } : { jsonrpc: '2.0', id, result })}\n`,
    )

  async function handle(msg) {
    const { id, method, params } = msg
    if (id === undefined) return // notifications
    if (method === 'initialize')
      return reply(id, {
        protocolVersion: params?.protocolVersion ?? '2025-06-18',
        capabilities: { tools: {} },
        serverInfo: { name: 'figma-bridge', version: '2.0.0' },
        instructions:
          'Reads and writes the Figma file open in Figma desktop through the Figma Bridge plugin. ' +
          'Writes are idempotent by key: push the same specs again to update. Order: figma_variables, ' +
          'figma_styles, components, then layers that use them; figma_push_kit does all of it for FixNote.',
      })
    if (method === 'ping') return reply(id, {})
    if (method === 'tools/list')
      return reply(id, {
        tools: TOOLS.map((t) => ({
          name: t.name,
          description: t.description,
          inputSchema: { type: 'object', properties: t.input, required: t.required ?? [] },
        })),
      })
    if (method === 'tools/call') {
      const tool = TOOLS.find((t) => t.name === params?.name)
      if (!tool) return reply(id, null, { code: -32602, message: `Unknown tool ${params?.name}` })
      try {
        await ensureBridge(out)
        const r = await tool.run(params.arguments ?? {}, out)
        return reply(id, { content: typeof r === 'string' ? [{ type: 'text', text: r }] : r })
      } catch (e) {
        return reply(id, {
          content: [{ type: 'text', text: String(e.message || e) }],
          isError: true,
        })
      }
    }
    reply(id, null, { code: -32601, message: `Unknown method ${method}` })
  }

  let buffer = ''
  process.stdin.setEncoding('utf8')
  process.stdin.on('data', (chunk) => {
    buffer += chunk
    let at = buffer.indexOf('\n')
    while (at >= 0) {
      const line = buffer.slice(0, at).trim()
      buffer = buffer.slice(at + 1)
      at = buffer.indexOf('\n')
      if (!line) continue
      let msg
      try {
        msg = JSON.parse(line)
      } catch {
        reply(null, null, { code: -32700, message: 'Parse error' })
        continue
      }
      handle(msg).catch((e) => say(e))
    }
  })
  process.stdin.on('end', () => process.exit(0))
}

const HELP = `Figma Bridge: read and write the Figma file open on this computer.

  serve                                  start the bridge (keep it running)
  mcp                                    MCP server on stdio (starts the bridge if needed)
  status                                 is the bridge up, is the plugin connected
  info                                   file, page and selection the plugin sees
  tree [ids] [--depth 2]                 outline: id, type, name, size, text
  nodes [ids] [--depth N]                full JSON of layers (styles, auto layout, text runs)
  render [ids] [--format png] [--scale 2]  pictures: png, jpg, svg or pdf
  originals [ids]                        photos as uploaded (image fills)
  find <text>                            layers on the current page by name or text

  push-kit [parts] [--page "FixNote UI"] the FixNote UI kit as variables, styles, components
                                         parts: ${KIT_PARTS.join(' ')}
  variables <file.json>                  upsert a variable collection (figma_variables shape)
  styles <file.json>                     upsert text/effect styles
  build <file.json> [--page name]        upsert layers: {page?, nodes: [specs]} or [specs]
  keys                                   layers pushed to this file, by key
  remove <keys…>                         delete pushed layers
  script <file.js>                       run Plugin API code in the file

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
      await serve(out).catch(() => {})
      break
    case 'mcp':
      await mcp(out)
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
    case 'push-kit':
      await pushKit(job, {
        parts: rest.length ? rest : undefined,
        page: flags.page,
        log: (l) => console.log(l),
      })
      break
    case 'variables':
    case 'styles': {
      const spec = readJson(rest[0])
      console.log(JSON.stringify(await job(command, spec, rest[0]), null, 2))
      break
    }
    case 'build': {
      const spec = readJson(rest[0])
      const params = Array.isArray(spec) ? { nodes: spec } : spec
      if (flags.page) params.page = flags.page
      const r = await job('build', params, rest[0])
      console.log(`${r.made} new, ${r.updated} updated`)
      for (const n of r.nodes) console.log(`  ${n.key}  ${n.id}  ${n.type}  ${n.name}`)
      break
    }
    case 'keys':
      console.log((await job('keys', {}, '')).text)
      break
    case 'remove':
      console.log(JSON.stringify(await job('remove', { keys: rest }, rest.join(' '))))
      break
    case 'script': {
      if (!rest[0]) fail('Which file? e.g. script make.js')
      const r = await job('script', { code: readFileSync(rest[0], 'utf8') }, rest[0])
      console.log(JSON.stringify(r.value, null, 2))
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
