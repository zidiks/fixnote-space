import { describe, expect, it } from 'vitest'
import {
  negotiateProtocol,
  parseFromDevice,
  parseToDevice,
  REMOTE_TOOLS,
  remoteToolList,
} from './protocol'

describe('remote MCP protocol', () => {
  it('lists only reading tools, daily_note without append', () => {
    const tools = remoteToolList()
    expect(tools.map((t) => t.name)).toEqual([...REMOTE_TOOLS])
    for (const t of tools) expect(t.annotations.readOnlyHint).toBe(true)
    const daily = tools.find((t) => t.name === 'daily_note')
    expect(Object.keys(daily?.inputSchema.properties ?? {})).toEqual(['date'])
  })

  it('parses only well-formed messages', () => {
    expect(parseToDevice('nope')).toBeNull()
    expect(parseToDevice('{"type":"call","id":"1"}')).toBeNull()
    expect(parseToDevice('{"type":"call","id":"1","tool":"get_note","args":[1]}')).toEqual({
      type: 'call',
      id: '1',
      tool: 'get_note',
      args: {},
      client: { id: '', name: '' },
    })
    expect(
      parseFromDevice(
        '{"type":"result","id":"1","content":[{"type":"text","text":"ok"},{"type":"image"}]}',
      ),
    ).toEqual({ type: 'result', id: '1', content: [{ type: 'text', text: 'ok' }], isError: false })
    expect(parseFromDevice('{"type":"hello","device":"PC"}')).toEqual({
      type: 'hello',
      device: 'PC',
    })
  })

  it('answers initialize with a version both sides know', () => {
    expect(negotiateProtocol('2025-06-18')).toBe('2025-06-18')
    expect(negotiateProtocol('1999-01-01')).toBe('2025-11-25')
  })
})
