/**
 * What MCP clients (Claude Desktop, Cursor…) may do with the notes, as the user set it in
 * FixNote → Settings → AI. Stored in the `kv` table, read by the MCP server on every call.
 */

/** off: nothing; read: search and read; write: also create and change; full: also delete. */
export type McpAccess = 'off' | 'read' | 'write' | 'full'

export const MCP_ACCESS_KEY = 'mcp.access'
export const MCP_SCOPE_KEY = 'mcp.scope'

/** Everything, or only the chosen folders (with their subfolders) and the chosen notes. */
export type McpScope = { kind: 'all' } | { kind: 'some'; folders: string[]; notes: string[] }

/** Not chosen yet: reading is fine, anything more needs a yes in the app. */
export function parseMcpAccess(value: string | null | undefined): McpAccess {
  return value === 'off' || value === 'write' || value === 'full' ? value : 'read'
}

export const mcpAllows = (access: McpAccess, need: 'read' | 'write' | 'full') =>
  access !== 'off' &&
  (need === 'read' || access === 'full' || (need === 'write' && access === 'write'))

export function parseMcpScope(value: string | null | undefined): McpScope {
  if (!value) return { kind: 'all' }
  try {
    const raw = JSON.parse(value) as { folders?: unknown; notes?: unknown }
    const ids = (v: unknown) =>
      Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
    return { kind: 'some', folders: ids(raw.folders), notes: ids(raw.notes) }
  } catch {
    return { kind: 'all' }
  }
}

export const serializeMcpScope = (scope: McpScope): string | null =>
  scope.kind === 'all' ? null : JSON.stringify({ folders: scope.folders, notes: scope.notes })

/**
 * The folders a scope reaches: the chosen ones and every folder inside them. `null` = all folders
 * (and notes without a folder).
 */
export function scopeFolderIds(
  scope: McpScope,
  folders: readonly { id: string; parentId: string | null }[],
): Set<string> | null {
  if (scope.kind === 'all') return null
  const children = new Map<string, string[]>()
  for (const f of folders) {
    if (!f.parentId) continue
    children.set(f.parentId, [...(children.get(f.parentId) ?? []), f.id])
  }
  const known = new Set(folders.map((f) => f.id))
  const out = new Set<string>()
  const stack = scope.folders.filter((id) => known.has(id))
  while (stack.length) {
    const id = stack.pop() as string
    if (out.has(id)) continue
    out.add(id)
    stack.push(...(children.get(id) ?? []))
  }
  return out
}
