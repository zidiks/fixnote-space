import type { NoteTools, ToolLevel } from './notes-tools'

/** JSON Schema of a tool's arguments (the subset the tools use). */
export interface ToolParameters {
  type: 'object'
  properties: Record<string, { type: 'string' | 'integer'; description?: string }>
  required?: string[]
  additionalProperties?: false
}

/** A tool as a model sees it (OpenAI function calling, MCP), with the access it needs. */
export interface ToolSpec {
  name: string
  description: string
  parameters: ToolParameters
  level: ToolLevel
}

const params = (
  properties: ToolParameters['properties'],
  required: string[] = [],
): ToolParameters => ({ type: 'object', properties, required, additionalProperties: false })

const FOLDER = 'Folder id, name or path ("Work / Projects")'

/** The note tools of the MCP server and the assistant, one description for both. */
export const NOTE_TOOL_SPECS: readonly ToolSpec[] = [
  {
    name: 'search_notes',
    description:
      'Full-text search over the notes (Russian, English, Spanish; word forms and the other alphabet match too). Returns the best passage of each matching note with its id and folder. Notes mix languages: if nothing matches, try translations and synonyms (e.g. "giveaway" for "розыгрыш").',
    parameters: params(
      {
        query: { type: 'string', description: 'Words to look for' },
        limit: { type: 'integer', description: 'How many notes, 1 to 20 (default 8)' },
        folder: { type: 'string', description: `Only this folder and its subfolders. ${FOLDER}` },
      },
      ['query'],
    ),
    level: 'read',
  },
  {
    name: 'get_note',
    description:
      'The full Markdown of a note with its folder, dates and a list of its images and files.',
    parameters: params({ id: { type: 'string' } }, ['id']),
    level: 'read',
  },
  {
    name: 'list_recent',
    description:
      'Notes with a short excerpt and their folder, most recently edited first. With `folder`: what is in that folder and its subfolders.',
    parameters: params({
      limit: { type: 'integer', description: '1 to 50 (default 10)' },
      folder: { type: 'string', description: FOLDER },
    }),
    level: 'read',
  },
  {
    name: 'list_folders',
    description: 'Folders you can use, with their ids and note counts.',
    parameters: params({}),
    level: 'read',
  },
  {
    name: 'daily_note',
    description:
      "Reads the daily note of a date (default today). With `append`, first adds text to it, creating the day's note if needed.",
    parameters: params({
      date: { type: 'string', description: 'YYYY-MM-DD' },
      append: { type: 'string', description: 'Markdown to add' },
    }),
    level: 'read',
  },
  {
    name: 'create_note',
    description:
      'Saves a new note (Markdown; the first line becomes its title). Without a folder it lands on Home without a folder. The user sees it in FixNote and can undo it.',
    parameters: params(
      { content: { type: 'string' }, folder: { type: 'string', description: FOLDER } },
      ['content'],
    ),
    level: 'write',
  },
  {
    name: 'append_to_note',
    description: 'Adds Markdown to the end of an existing note.',
    parameters: params({ id: { type: 'string' }, content: { type: 'string' } }, ['id', 'content']),
    level: 'write',
  },
  {
    name: 'edit_note',
    description:
      'Changes part of a note: replaces the exact passage `find` (it must occur once) with `replace`. Prefer it to update_note for small changes. Read the note with get_note first.',
    parameters: params(
      {
        id: { type: 'string' },
        find: { type: 'string', description: 'The exact text to replace, copied from the note' },
        replace: { type: 'string', description: 'The new text (empty to remove the passage)' },
      },
      ['id', 'find', 'replace'],
    ),
    level: 'write',
  },
  {
    name: 'update_note',
    description:
      'Replaces the whole Markdown of a note. Read it with get_note first and keep what the user did not ask to change.',
    parameters: params({ id: { type: 'string' }, content: { type: 'string' } }, ['id', 'content']),
    level: 'write',
  },
  {
    name: 'move_note',
    description: 'Moves a note to a folder, or out of any folder when `folder` is omitted.',
    parameters: params(
      { id: { type: 'string' }, folder: { type: 'string', description: FOLDER } },
      ['id'],
    ),
    level: 'write',
  },
  {
    name: 'delete_note',
    description: 'Deletes a note. The user can restore it from the AI activity log in FixNote.',
    parameters: params({ id: { type: 'string' } }, ['id']),
    level: 'full',
  },
  {
    name: 'create_folder',
    description: 'Creates a folder, at the top level or inside `parent`.',
    parameters: params(
      {
        name: { type: 'string' },
        parent: { type: 'string', description: 'Parent folder id, name or path' },
      },
      ['name'],
    ),
    level: 'write',
  },
  {
    name: 'rename_folder',
    description: 'Gives a folder a new name.',
    parameters: params(
      {
        folder: { type: 'string', description: FOLDER },
        name: { type: 'string', description: 'New name' },
      },
      ['folder', 'name'],
    ),
    level: 'write',
  },
  {
    name: 'delete_folder',
    description:
      'Deletes a folder and the folders inside it. Their notes are kept and end up without a folder. The user can undo it in FixNote.',
    parameters: params({ folder: { type: 'string', description: FOLDER } }, ['folder']),
    level: 'full',
  },
]

export function noteToolSpec(name: string): ToolSpec {
  const spec = NOTE_TOOL_SPECS.find((s) => s.name === name)
  if (!spec) throw new Error(`Unknown tool ${name}`)
  return spec
}

/** Tools that change notes or folders (anything but reading). */
export function changesNotes(name: string, args: Record<string, unknown>): boolean {
  if (name === 'daily_note') return Boolean(str(args.append)?.trim())
  const spec = NOTE_TOOL_SPECS.find((s) => s.name === name)
  return spec ? spec.level !== 'read' : false
}

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
