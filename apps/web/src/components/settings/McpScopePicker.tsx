import {
  type Folder,
  MCP_SCOPE_KEY,
  type McpScope,
  parseMcpScope,
  scopeFolderIds,
  serializeMcpScope,
} from '@fixnote/core'
import { useTranslation } from '@fixnote/i18n'
import { cn, Input } from '@fixnote/ui'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { FileText, Folder as FolderIcon, Plus, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useDb, useRepo } from '../../lib/db'
import { kvStore } from '../../lib/kv'
import { useFolders, useSearch } from '../../lib/queries'

const KEY = ['mcp', 'scope'] as const

/** Folders in tree order with their depth, for an indented list. */
function tree(folders: readonly Folder[]): { folder: Folder; depth: number }[] {
  const children = new Map<string | null, Folder[]>()
  for (const f of folders) children.set(f.parentId, [...(children.get(f.parentId) ?? []), f])
  const out: { folder: Folder; depth: number }[] = []
  const walk = (parent: string | null, depth: number) => {
    for (const f of children.get(parent) ?? []) {
      out.push({ folder: f, depth })
      walk(f.id, depth + 1)
    }
  }
  walk(null, 0)
  return out
}

/**
 * What MCP apps can see: every note, or chosen folders (with everything inside them) and chosen
 * single notes. Saved to kv right away; the MCP server reads it on every call.
 */
export function McpScopePicker() {
  const { t } = useTranslation()
  const { driver } = useDb()
  const repo = useRepo()
  const qc = useQueryClient()
  const kv = kvStore(driver)
  const folders = useFolders().data ?? []
  const scope = useQuery({
    queryKey: KEY,
    queryFn: async () => parseMcpScope(await kv.get(MCP_SCOPE_KEY)),
  }).data ?? { kind: 'all' as const }
  const [query, setQuery] = useState('')
  const found = useSearch(query).data ?? []
  const chosen: { folders: string[]; notes: string[] } =
    scope.kind === 'some' ? scope : { folders: [], notes: [] }
  const noteTitles = useQuery({
    queryKey: [...KEY, 'notes', chosen.notes],
    queryFn: async () =>
      Promise.all(chosen.notes.map(async (id) => ({ id, note: await repo.getNote(id) }))),
    enabled: chosen.notes.length > 0,
  }).data
  const covered = useMemo(
    () => scopeFolderIds(scope, folders) ?? new Set<string>(),
    [scope, folders],
  )

  const save = async (next: McpScope) => {
    qc.setQueryData(KEY, next)
    const value = serializeMcpScope(next)
    if (value === null) await kv.delete(MCP_SCOPE_KEY)
    else await kv.set(MCP_SCOPE_KEY, value)
  }
  const toggleFolder = (id: string, on: boolean) =>
    void save({
      kind: 'some',
      notes: chosen.notes,
      folders: on ? [...chosen.folders, id] : chosen.folders.filter((f) => f !== id),
    })
  const setNotes = (notes: string[]) => void save({ kind: 'some', folders: chosen.folders, notes })

  return (
    <div className="max-w-lg space-y-3">
      <div role="radiogroup" aria-label={t('mcp.scope')} className="space-y-1.5">
        <span className="text-sm">{t('mcp.scope')}</span>
        {(['all', 'some'] as const).map((kind) => (
          <label key={kind} className="flex items-center gap-2.5 text-sm">
            <input
              type="radio"
              name="mcp-scope"
              className="size-4 accent-brand"
              checked={scope.kind === kind}
              onChange={() =>
                void save(
                  kind === 'all' ? { kind: 'all' } : { kind: 'some', folders: [], notes: [] },
                )
              }
            />
            {t(`mcp.scope_${kind}`)}
          </label>
        ))}
      </div>

      {scope.kind === 'some' ? (
        <div className="space-y-3 rounded-lg border p-3">
          <div>
            <p className="mb-1.5 text-xs font-medium text-muted-foreground">{t('mcp.folders')}</p>
            {folders.length ? (
              <ul className="max-h-48 space-y-0.5 overflow-y-auto">
                {tree(folders).map(({ folder, depth }) => {
                  const direct = chosen.folders.includes(folder.id)
                  // Inside a chosen folder: shared already, the box shows it and cannot be cleared.
                  const inherited = !direct && covered.has(folder.id)
                  return (
                    <li key={folder.id}>
                      <label
                        className={cn(
                          'flex items-center gap-2 rounded-md py-1 pr-2 text-sm hover:bg-accent',
                          inherited && 'text-muted-foreground',
                        )}
                        style={{ paddingLeft: `${8 + depth * 18}px` }}
                      >
                        <input
                          type="checkbox"
                          className="size-4 accent-brand"
                          checked={direct || inherited}
                          disabled={inherited}
                          onChange={(e) => toggleFolder(folder.id, e.target.checked)}
                        />
                        <FolderIcon className="size-3.5 text-muted-foreground" />
                        <span className="truncate">{folder.name}</span>
                        <span className="ml-auto text-xs text-muted-foreground tabular-nums">
                          {folder.noteCount}
                        </span>
                      </label>
                    </li>
                  )
                })}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">{t('mcp.noFolders')}</p>
            )}
          </div>

          <div>
            <p className="mb-1.5 text-xs font-medium text-muted-foreground">{t('mcp.notes')}</p>
            {chosen.notes.length ? (
              <ul className="mb-2 flex flex-wrap gap-1.5">
                {chosen.notes.map((id) => {
                  const note = noteTitles?.find((n) => n.id === id)?.note
                  return (
                    <li
                      key={id}
                      className="flex items-center gap-1 rounded-full bg-accent py-0.5 pr-1 pl-2.5 text-[13px]"
                    >
                      <span className="max-w-48 truncate">
                        {note === null ? t('mcp.deletedNote') : note?.title || t('common.untitled')}
                      </span>
                      <button
                        type="button"
                        aria-label={t('mcp.removeNote')}
                        className="rounded-full p-0.5 text-muted-foreground hover:text-foreground"
                        onClick={() => setNotes(chosen.notes.filter((n) => n !== id))}
                      >
                        <X className="size-3.5" />
                      </button>
                    </li>
                  )
                })}
              </ul>
            ) : null}
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('mcp.findNote')}
              aria-label={t('mcp.findNote')}
              className="h-8"
            />
            {query.trim() ? (
              <ul className="mt-1.5 max-h-40 overflow-y-auto">
                {found
                  .filter((hit) => !chosen.notes.includes(hit.note.id))
                  .slice(0, 6)
                  .map((hit) => (
                    <li key={hit.note.id}>
                      <button
                        type="button"
                        className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent"
                        onClick={() => {
                          setNotes([...chosen.notes, hit.note.id])
                          setQuery('')
                        }}
                      >
                        <FileText className="size-3.5 shrink-0 text-muted-foreground" />
                        <span className="truncate">{hit.note.title || t('common.untitled')}</span>
                        <Plus className="ml-auto size-3.5 shrink-0 text-muted-foreground" />
                      </button>
                    </li>
                  ))}
              </ul>
            ) : null}
          </div>
          <p className="text-xs text-muted-foreground">{t('mcp.scopeNote')}</p>
        </div>
      ) : null}
    </div>
  )
}
