import { negotiateProtocol, REMOTE_INSTRUCTIONS, remoteToolList } from '@fixnote/core/remote-mcp'
import type { ToolAnswer } from './hub'

export const SERVER_VERSION = '0.2.0'
export const MAX_MCP_BODY_BYTES = 128 * 1024
export const MAX_BATCH_SIZE = 10

/**
 * Reads a request body as UTF-8 up to `maxBytes`; returns null if Content-Length or streamed bytes
 * exceed the limit.
 */
export async function readLimitedText(
  req: Request,
  maxBytes = MAX_MCP_BODY_BYTES,
): Promise<string | null> {
  const declared = req.headers.get('content-length')
  if (declared !== null) {
    const len = Number(declared)
    if (Number.isFinite(len) && len > maxBytes) return null
  }
  if (!req.body) return ''
  const reader = req.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      total += value.byteLength
      if (total > maxBytes) {
        await reader.cancel().catch(() => undefined)
        return null
      }
      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }
  const joined = new Uint8Array(total)
  let offset = 0
  for (const c of chunks) {
    joined.set(c, offset)
    offset += c.byteLength
  }
  return new TextDecoder().decode(joined)
}

/**
 * The app icon for AI apps that show one next to the server's name (MCP 2025-11-25
 * `Implementation.icons`); the site serves them, and the relay serves the same ones from its host.
 */
export const SERVER_ICONS = [
  { src: 'https://fixnote.space/favicon.svg', mimeType: 'image/svg+xml', sizes: ['any'] },
  { src: 'https://fixnote.space/apple-touch-icon.png', mimeType: 'image/png', sizes: ['180x180'] },
]

type Id = string | number

interface JsonRpcRequest {
  jsonrpc: '2.0'
  id?: Id | null
  method: string
  params?: Record<string, unknown>
}

export type JsonRpcResponse =
  | { jsonrpc: '2.0'; id: Id | null; result: unknown }
  | { jsonrpc: '2.0'; id: Id | null; error: { code: number; message: string } }

/** What answering MCP needs from the account's Durable Object. */
export interface McpContext {
  /** Runs a tool on the account's device. */
  call(tool: string, args: Record<string, unknown>): Promise<ToolAnswer>
  /** The client said who it is (`initialize`): its name shows in the app and in Fixnote's log. */
  hello(name: string): Promise<void>
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

const fail = (id: Id | null, code: number, message: string): JsonRpcResponse => ({
  jsonrpc: '2.0',
  id,
  error: { code, message },
})

/**
 * One JSON-RPC message of MCP over Streamable HTTP, answered without a session: `initialize`,
 * `ping` and `tools/list` here, `tools/call` on the device. Notifications get no answer (null).
 */
export async function answer(message: unknown, ctx: McpContext): Promise<JsonRpcResponse | null> {
  if (!isRecord(message) || message.jsonrpc !== '2.0' || typeof message.method !== 'string') {
    return fail(null, -32600, 'Invalid request')
  }
  const req = message as unknown as JsonRpcRequest
  if (req.id === undefined || req.id === null) return null
  const id = req.id
  const params = isRecord(req.params) ? req.params : {}
  switch (req.method) {
    case 'initialize': {
      const info = isRecord(params.clientInfo) ? params.clientInfo : {}
      const name = typeof info.title === 'string' ? info.title : info.name
      if (typeof name === 'string' && name.trim()) {
        await ctx.hello(name.trim().slice(0, 80)).catch(() => undefined)
      }
      return {
        jsonrpc: '2.0',
        id,
        result: {
          protocolVersion: negotiateProtocol(params.protocolVersion),
          capabilities: { tools: { listChanged: false } },
          serverInfo: {
            name: 'fixnote',
            title: 'Fixnote',
            version: SERVER_VERSION,
            websiteUrl: 'https://fixnote.space/',
            icons: SERVER_ICONS,
          },
          instructions: REMOTE_INSTRUCTIONS,
        },
      }
    }
    case 'ping':
      return { jsonrpc: '2.0', id, result: {} }
    case 'tools/list':
      return { jsonrpc: '2.0', id, result: { tools: remoteToolList() } }
    case 'tools/call': {
      if (typeof params.name !== 'string') return fail(id, -32602, 'Missing tool name')
      const args = isRecord(params.arguments) ? params.arguments : {}
      return { jsonrpc: '2.0', id, result: await ctx.call(params.name, args) }
    }
    default:
      return fail(id, -32601, `Method not found: ${req.method}`)
  }
}

/** A POSTed body: one message or (older clients) a bounded batch. */
export async function answerBody(
  body: unknown,
  ctx: McpContext,
): Promise<JsonRpcResponse | JsonRpcResponse[] | null> {
  if (Array.isArray(body)) {
    if (body.length === 0 || body.length > MAX_BATCH_SIZE) {
      return fail(
        null,
        -32600,
        body.length === 0 ? 'Empty batch' : `Batch too large (max ${MAX_BATCH_SIZE})`,
      )
    }
    const out: JsonRpcResponse[] = []
    for (const m of body) {
      const r = await answer(m, ctx)
      if (r) out.push(r)
    }
    return out.length ? out : null
  }
  return answer(body, ctx)
}
