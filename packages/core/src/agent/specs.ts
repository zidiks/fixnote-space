import type { NoteTools } from './notes-tools'

export * from './tool-specs'

const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined)
const int = (v: unknown): number | undefined =>
  typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : undefined
const need = (args: Record<string, unknown>, key: string): string => {
  const v = str(args[key])
  if (v === undefined) throw new Error(`\`${key}\` is required.`)
  return v
}

/** Runs a note tool by name with the arguments a model sent; errors come back as exceptions. */
export async function runNoteTool(
  tools: NoteTools,
  name: string,
  args: Record<string, unknown>,
): Promise<string> {
  switch (name) {
    case 'search_notes':
      return tools.search(
        need(args, 'query'),
        Math.min(Math.max(int(args.limit) ?? 8, 1), 20),
        str(args.folder) || undefined,
      )
    case 'get_note':
      return tools.get(need(args, 'id'))
    case 'list_recent':
      return tools.recent(int(args.limit), str(args.folder) || undefined)
    case 'list_folders':
      return tools.folders()
    case 'daily_note':
      return tools.daily(str(args.date) || undefined, str(args.append))
    case 'create_note':
      return tools.create(need(args, 'content'), str(args.folder))
    case 'append_to_note':
      return tools.append(need(args, 'id'), need(args, 'content'))
    case 'edit_note':
      return tools.edit(need(args, 'id'), need(args, 'find'), str(args.replace) ?? '')
    case 'update_note':
      return tools.update(need(args, 'id'), need(args, 'content'))
    case 'move_note':
      return tools.move(need(args, 'id'), str(args.folder) || null)
    case 'delete_note':
      return tools.remove(need(args, 'id'))
    case 'create_folder':
      return tools.createFolder(need(args, 'name'), str(args.parent))
    case 'rename_folder':
      return tools.renameFolder(need(args, 'folder'), need(args, 'name'))
    case 'delete_folder':
      return tools.deleteFolder(need(args, 'folder'))
    default:
      throw new Error(`There is no tool named ${name}.`)
  }
}
