import { negotiateProtocol, REMOTE_INSTRUCTIONS, remoteToolList } from '@fixnote/core/remote-mcp'
import type { ToolAnswer } from './hub'

export const SERVER_VERSION = '0.2.0'

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
  /** The client said who it is (`initialize`): its name shows in the app and in FixNote's log. */
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
          serverInfo: { name: 'fixnote', title: 'FixNote', version: SERVER_VERSION },
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

/** A POSTed body: one message or (older clients) a batch. */
export async function answerBody(
  body: unknown,
  ctx: McpContext,
): Promise<JsonRpcResponse | JsonRpcResponse[] | null> {
  if (Array.isArray(body)) {
    const out: JsonRpcResponse[] = []
    for (const m of body) {
      const r = await answer(m, ctx)
      if (r) out.push(r)
    }
    return out.length ? out : null
  }
  return answer(body, ctx)
}
