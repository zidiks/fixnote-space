import { prepareDatabase } from '@fixnote/core'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { expect, it } from 'vitest'
import { createServer } from './server'
import { openNodeSqlite } from './sqlite'

it('serves the notes tools over MCP', async () => {
  const db = openNodeSqlite(':memory:')
  await prepareDatabase(db)
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair()
  await createServer(db).connect(serverSide)
  const client = new Client({ name: 'Test client', version: '1.0.0' })
  await client.connect(clientSide)

  const { tools } = await client.listTools()
  expect(tools.map((t) => t.name).sort()).toEqual([
    'append_to_note',
    'create_note',
    'daily_note',
    'get_note',
    'list_folders',
    'list_recent',
    'search_notes',
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
  const bad = await client.callTool({ name: 'search_notes', arguments: {} })
  expect(bad.isError).toBe(true)
  const [log] = await db.query<{ provider: string }>('SELECT provider FROM ai_actions')
  expect(log?.provider).toBe('Test client (MCP)')
})
