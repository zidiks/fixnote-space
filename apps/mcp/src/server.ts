import type { SqlDriver } from '@fixnote/core'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { NotesTools } from './tools'

export const VERSION = '0.1.0'

/** The FixNote MCP server over an open notes database. */
export function createServer(db: SqlDriver): McpServer {
  const server = new McpServer(
    { name: 'fixnote', version: VERSION },
    {
      instructions:
        "FixNote holds the user's personal notes (Markdown). Search before answering questions about what the user wrote, and quote note titles. Create or append only when the user asks; every change is shown to the user in FixNote and can be undone there.",
    },
  )
  const tools = new NotesTools(db, () => server.server.getClientVersion()?.name ?? 'MCP client')

  const run = async (fn: () => Promise<string>) => {
    try {
      return { content: [{ type: 'text' as const, text: await fn() }] }
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
      description: 'The full Markdown of a note with its folder, tags and dates.',
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
      description: 'Folders with their note counts.',
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
        'Saves a new note (Markdown; the first line becomes its title; #tags work). Without a folder it lands on Home without a folder. The user sees it in FixNote and can undo it.',
      inputSchema: {
        content: z.string().min(1),
        folder: z.string().optional().describe('Name of an existing folder'),
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
