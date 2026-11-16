import { describe, expect, it } from 'vitest'
import server from '../server.json'
import { SERVER_VERSION } from './mcp'

// server.json is the listing in the official MCP Registry (docs/mcp-directories.md). The registry
// keeps one entry per version, so it must say what the relay answers.
describe('MCP Registry listing', () => {
  it('matches the relay', () => {
    expect(server.version).toBe(SERVER_VERSION)
    expect(server.name).toBe('space.fixnote/fixnote')
    expect(server.remotes).toEqual([
      { type: 'streamable-http', url: 'https://mcp.fixnote.space/mcp' },
    ])
  })

  it('stays within the registry limits', () => {
    expect(server.description.length).toBeLessThanOrEqual(100)
    expect(server.title.length).toBeLessThanOrEqual(100)
  })
})
