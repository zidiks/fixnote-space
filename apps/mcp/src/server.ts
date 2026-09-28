import type { BlobStore, SqlDriver } from '@fixnote/core'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { NotesTools, type ToolContent } from './tools'

export const VERSION = '0.1.2'

/** The FixNote MCP server over an open notes database and, when given, the app's files. */
export function createServer(db: SqlDriver, blobs?: BlobStore): McpServer {
  const server = new McpServer(
    { name: 'fixnote', version: VERSION },
    {
      instructions:
        "FixNote holds the user's personal notes (Markdown). Search before answering questions about what the user wrote, and quote note titles. Notes can hold images and files: get_note lists them, get_attachment opens one, attach_file adds one. Create, change, move or delete notes and folders only when the user asks; every change is shown to the user in FixNote and can be undone there. The user decides in FixNote what this app may do and which folders and notes it can see.",
    },
  )
  const tools = new NotesTools(
    db,
    () => server.server.getClientVersion()?.name ?? 'MCP client',
    blobs,
  )

  const run = async (fn: () => Promise<string | ToolContent[]>) => {
    try {
      const out = await fn()
      return { content: typeof out === 'string' ? [{ type: 'text' as const, text: out }] : out }
    } catch (err) {
      return {
        content: [
          { type: 'text' as const, text: err instanceof Error ? err.message : String(err) },
        ],
        isError: true,
      }
    }
  }

  server.registerTool(
    'search_notes',
    {
      title: 'Search notes',
      description:
        'Full-text search over the notes (Russian, English, Spanish; word forms and the other alphabet match too). Returns the best passage of each matching note with its id. Notes mix languages: if nothing matches, try translations and synonyms (e.g. "giveaway" for "розыгрыш").',
      inputSchema: {
        query: z.string().min(1).describe('Words to look for'),
        limit: z.number().int().min(1).max(20).optional().describe('How many notes (default 8)'),
      },
      annotations: { readOnlyHint: true },
    },
    ({ query, limit }) => run(() => tools.search(query, limit)),
  )
  server.registerTool(
    'get_note',
    {
      title: 'Get a note',
      description:
        'The full Markdown of a note with its folder, dates and a list of its images and files (ids for get_attachment).',
      inputSchema: { id: z.string().min(1) },
      annotations: { readOnlyHint: true },
    },
    ({ id }) => run(() => tools.get(id)),
  )
  server.registerTool(
    'list_recent',
    {
      title: 'Recent notes',
      description: 'Most recently edited notes with a short excerpt.',
      inputSchema: { limit: z.number().int().min(1).max(50).optional() },
      annotations: { readOnlyHint: true },
    },
    ({ limit }) => run(() => tools.recent(limit)),
  )
  server.registerTool(
    'list_folders',
    {
      title: 'Folders',
      description: 'Folders this app can use, with their ids and note counts.',
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    () => run(() => tools.folders()),
  )
  server.registerTool(
    'create_note',
    {
      title: 'Create a note',
      description:
        'Saves a new note (Markdown; the first line becomes its title). Without a folder it lands on Home without a folder. The user sees it in FixNote and can undo it.',
      inputSchema: {
        content: z.string().min(1),
        folder: z.string().optional().describe('Folder id, name or path ("Work / Projects")'),
      },
    },
    ({ content, folder }) => run(() => tools.create(content, folder)),
  )
  server.registerTool(
    'append_to_note',
    {
      title: 'Append to a note',
      description: 'Adds Markdown to the end of an existing note.',
      inputSchema: { id: z.string().min(1), content: z.string().min(1) },
    },
    ({ id, content }) => run(() => tools.append(id, content)),
  )
  server.registerTool(
    'update_note',
    {
      title: 'Rewrite a note',
      description:
        'Replaces the whole Markdown of a note. Read it with get_note first and keep what the user did not ask to change.',
      inputSchema: { id: z.string().min(1), content: z.string().min(1) },
    },
    ({ id, content }) => run(() => tools.update(id, content)),
  )
  server.registerTool(
    'get_attachment',
    {
      title: 'Open an image or file',
      description:
        'An image or file from a note, by the id get_note lists: images come back to look at, text files as text, other files (PDF, documents) as a file.',
      inputSchema: { id: z.string().min(1).describe('Attachment id from get_note') },
      annotations: { readOnlyHint: true },
    },
    ({ id }) => run(() => tools.getAttachment(id)),
  )
  server.registerTool(
    'attach_file',
    {
      title: 'Attach a file to a note',
      description:
        'Adds an image or file to the end of a note: images show in the note, other files become a link. Give `path` (a file on this computer) or `data` (base64) with a `name`. Up to 20 MB.',
      inputSchema: {
        note: z.string().min(1).describe('Note id'),
        path: z.string().optional().describe('Full path of a file on this computer'),
        data: z.string().optional().describe('The file as base64, instead of `path`'),
        name: z.string().optional().describe('File name with extension; needed with `data`'),
        mime: z.string().optional().describe('MIME type, when the extension does not tell'),
      },
    },
    ({ note, path, data, name, mime }) => run(() => tools.attach(note, { path, data, name, mime })),
  )
  server.registerTool(
    'move_note',
    {
      title: 'Move a note',
      description: 'Moves a note to a folder, or out of any folder when `folder` is omitted.',
      inputSchema: {
        id: z.string().min(1),
        folder: z.string().optional().describe('Folder id, name or path'),
      },
    },
    ({ id, folder }) => run(() => tools.move(id, folder ?? null)),
  )
  server.registerTool(
    'delete_note',
    {
      title: 'Delete a note',
      description: 'Deletes a note. The user can restore it from the AI activity log in FixNote.',
      inputSchema: { id: z.string().min(1) },
      annotations: { destructiveHint: true },
    },
    ({ id }) => run(() => tools.remove(id)),
  )
  server.registerTool(
    'create_folder',
    {
      title: 'Create a folder',
      description: 'Creates a folder, at the top level or inside `parent`.',
      inputSchema: {
        name: z.string().min(1),
        parent: z.string().optional().describe('Parent folder id, name or path'),
      },
    },
    ({ name, parent }) => run(() => tools.createFolder(name, parent)),
  )
  server.registerTool(
    'rename_folder',
    {
      title: 'Rename a folder',
      description: 'Gives a folder a new name.',
      inputSchema: {
        folder: z.string().min(1).describe('Folder id, name or path'),
        name: z.string().min(1).describe('New name'),
      },
    },
    ({ folder, name }) => run(() => tools.renameFolder(folder, name)),
  )
  server.registerTool(
    'delete_folder',
    {
      title: 'Delete a folder',
      description:
        'Deletes a folder and the folders inside it. Their notes are kept and end up without a folder. The user can undo it in FixNote.',
      inputSchema: { folder: z.string().min(1).describe('Folder id, name or path') },
      annotations: { destructiveHint: true },
    },
    ({ folder }) => run(() => tools.deleteFolder(folder)),
  )
  server.registerTool(
    'daily_note',
    {
      title: 'Daily note',
      description:
        "Reads the daily note of a date (default today). With `append`, first adds text to it, creating the day's note if needed.",
      inputSchema: {
        date: z.string().optional().describe('YYYY-MM-DD'),
        append: z.string().optional(),
      },
    },
    ({ date, append }) => run(() => tools.daily(date, append)),
  )

  return server
}
