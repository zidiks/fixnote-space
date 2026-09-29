import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { prepareDatabase } from '@fixnote/core'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { expect, it } from 'vitest'
import { fileBlobStore } from './blobs'
import { createServer } from './server'
import { openNodeSqlite } from './sqlite'

it('serves the notes tools over MCP', async () => {
  const db = openNodeSqlite(':memory:')
  await prepareDatabase(db)
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair()
  const blobs = fileBlobStore(join(mkdtempSync(join(tmpdir(), 'fixnote-mcp-')), 'blobs'))
  await createServer(db, blobs).connect(serverSide)
  const client = new Client({ name: 'Test client', version: '1.0.0' })
  await client.connect(clientSide)

  const { tools } = await client.listTools()
  expect(tools.map((t) => t.name).sort()).toEqual([
    'append_to_note',
    'attach_file',
    'create_folder',
    'create_note',
    'daily_note',
    'delete_folder',
    'delete_note',
    'edit_note',
    'get_attachment',
    'get_note',
    'list_folders',
    'list_recent',
    'move_note',
    'rename_folder',
    'search_notes',
    'update_note',
  ])
  const denied = await client.callTool({ name: 'create_note', arguments: { content: 'x' } })
  expect(denied.isError).toBe(true)
  await db.execute("INSERT INTO kv (key, value) VALUES ('mcp.access', 'write')")
  const created = await client.callTool({
    name: 'create_note',
    arguments: { content: '# Встреча\n\nобсудить бота #work' },
  })
  expect(created.content).toEqual([
    { type: 'text', text: expect.stringMatching(/^Saved "Встреча"/) },
  ])
  const found = await client.callTool({ name: 'search_notes', arguments: { query: 'встреча бот' } })
  expect(JSON.stringify(found.content)).toContain('Встреча')
  const [first] = await db.query<{ id: string }>('SELECT id FROM notes')
  const edited = await client.callTool({
    name: 'edit_note',
    arguments: { id: first?.id, find: 'обсудить бота', replace: 'обсудить бота и сайт' },
  })
  expect(edited.content).toEqual([{ type: 'text', text: 'Edited "Встреча".' }])
  const bad = await client.callTool({ name: 'search_notes', arguments: {} })
  expect(bad.isError).toBe(true)
  const [log] = await db.query<{ provider: string }>('SELECT provider FROM ai_actions')
  expect(log?.provider).toBe('Test client (MCP)')

  // Files go through the protocol as an image to look at and as an embedded file.
  const [note] = await db.query<{ id: string }>('SELECT id FROM notes')
  const png =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='
  for (const [name, data] of [
    ['dot.png', png],
    ['plan.pdf', Buffer.from('%PDF-1.4 test').toString('base64')],
  ])
    await client.callTool({ name: 'attach_file', arguments: { note: note?.id, name, data } })
  const got = await client.callTool({ name: 'get_note', arguments: { id: note?.id } })
  const ids = [...JSON.stringify(got.content).matchAll(/\(id: ([\w-]{36})\)/g)].map((m) => m[1])
  const image = await client.callTool({ name: 'get_attachment', arguments: { id: ids[0] } })
  expect(image.content).toEqual([
    { type: 'text', text: expect.stringContaining('image/png') },
    { type: 'image', mimeType: 'image/png', data: png },
  ])
  const pdf = await client.callTool({ name: 'get_attachment', arguments: { id: ids[1] } })
  expect(pdf.content).toEqual([
    { type: 'text', text: expect.stringContaining('plan.pdf') },
    {
      type: 'resource',
      resource: {
        uri: `fixnote://attachment/${ids[1]}`,
        mimeType: 'application/pdf',
        blob: expect.any(String),
      },
    },
  ])
})
