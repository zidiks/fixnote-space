import {
  REMOTE_INSTRUCTIONS,
  WRITING_PROSE,
  WRITING_STYLE,
  WRITING_STYLE_SHORT,
} from '@fixnote/core'
import { describe, expect, it } from 'vitest'
import { agentSystem, buildAgentMessages } from './agent'
import { buildEditMessages } from './edit'
import { buildMessages } from './prompt'

const system = (messages: readonly { role: string; content?: unknown }[]) =>
  String(messages.find((m) => m.role === 'system')?.content ?? '')

describe('writing style', () => {
  it('is in the system prompt of everything that writes text for the user', () => {
    const scope = { kind: 'all' } as const
    expect(agentSystem()).toContain(WRITING_STYLE)
    expect(
      system(buildAgentMessages({ question: 'q', fragments: [], scope, history: [] })),
    ).toContain(WRITING_STYLE)
    expect(system(buildMessages({ question: 'q', fragments: [], scope }))).toContain(WRITING_STYLE)
    expect(system(buildEditMessages({ action: 'rewrite', text: 'x' }))).toContain(WRITING_STYLE)
  })

  it('stays in the static part of the agent prompt (cached), before the memory', () => {
    const a = agentSystem('likes short answers')
    expect(a.indexOf(WRITING_STYLE)).toBeLessThan(a.indexOf('likes short answers'))
  })

  it('keeps the prose rules apart from the Markdown ones', () => {
    expect(WRITING_STYLE.startsWith(WRITING_PROSE)).toBe(true)
    expect(WRITING_PROSE).not.toContain('Markdown')
  })

  it('reaches remote MCP clients', () => {
    expect(REMOTE_INSTRUCTIONS).toContain(WRITING_STYLE_SHORT)
  })
})
