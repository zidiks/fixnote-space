import { describe, expect, it } from 'vitest'
import { buildAgentMessages, nowLine } from './agent'
import {
  CLEARED_RESULT,
  historyAnswer,
  historyMessages,
  messagesTokens,
  overflow,
  type PastTurn,
  planContext,
  summaryBatches,
  turnText,
} from './context'

const turn = (at: number, result = 'x'.repeat(3000), over: Partial<PastTurn> = {}): PastTurn => ({
  at,
  question: `question ${at}`,
  answer: `answer ${at}`,
  trace: {
    steps: [
      {
        text: 'Let me read it.',
        calls: [
          { id: 'call_0', name: 'get_note', arguments: '{"id":"n1"}', result },
          {
            id: 'call_1',
            name: 'update_note',
            arguments: JSON.stringify({ id: 'n1', content: 'y'.repeat(900) }),
            result: 'Updated "Plan".',
          },
        ],
      },
    ],
    found: [{ n: 1, noteId: 'n1', title: 'Plan' }],
  },
  ...over,
})

describe('history', () => {
  it('sends earlier tool calls and results back as real messages', () => {
    const messages = historyMessages([turn(1, 'note text')], { clearedUpTo: 0, reasoning: false })
    expect(messages.map((m) => m.role)).toEqual(['user', 'assistant', 'tool', 'tool', 'assistant'])
    expect(messages[0]?.content).toContain('Notes found for this message: "Plan" (id: n1)')
    const call = messages[1]
    expect(call && 'tool_calls' in call ? call.tool_calls.map((c) => c.function.name) : []).toEqual(
      ['get_note', 'update_note'],
    )
    // Ids are the same on every turn and match their results.
    const ids = call && 'tool_calls' in call ? call.tool_calls.map((c) => c.id) : []
    expect(messages.slice(2, 4).map((m) => ('tool_call_id' in m ? m.tool_call_id : ''))).toEqual(
      ids,
    )
    expect(new Set(ids).size).toBe(2)
    expect(messages[2]?.content).toBe('note text')
    expect(historyMessages([turn(1, 'note text')], { clearedUpTo: 0, reasoning: false })).toEqual(
      messages,
    )
  })

  it('clears old results to a stub but keeps the latest turns whole', () => {
    const turns = [turn(1), turn(2), turn(3), turn(4)]
    const messages = historyMessages(turns, { clearedUpTo: 4, reasoning: false })
    const results = messages.filter((m) => m.role === 'tool').map((m) => m.content)
    // Two turns cleared (2 results each), the last two intact.
    expect(results.slice(0, 4).every((r) => r === CLEARED_RESULT)).toBe(true)
    expect(results.slice(4).every((r) => r !== CLEARED_RESULT)).toBe(true)
    const first = messages[1]
    const args =
      first && 'tool_calls' in first ? (first.tool_calls[1]?.function.arguments ?? '') : ''
    expect(JSON.parse(args).content).toContain('cleared to save space')
  })

  it('turns per-turn fragment numbers into note names and says what was undone', () => {
    const text = historyAnswer({
      at: 1,
      question: 'q',
      answer: 'Milk is on the list [1][2], see [docs](https://x.y) [3].',
      citations: [
        { n: 1, noteId: 'a', title: 'Shopping' },
        { n: 2, noteId: 'a', title: 'Shopping' },
      ],
      changes: { labels: ['Created «Shopping»'], undone: true },
    })
    expect(text).not.toMatch(/\[\d\]/)
    expect(text).toContain('[docs](https://x.y)')
    expect(text).toContain('Sources: "Shopping" (id: a)')
    expect(text).toContain('The user then undid all of these changes: Created «Shopping»')
  })

  it('gives a thinking model its reasoning back with every earlier answer', () => {
    const t = turn(1, 'r', {
      trace: { steps: [{ reasoning: 'look', calls: [] }], reasoning: 'answer it' },
    })
    const messages = historyMessages([t], { clearedUpTo: 0, reasoning: true })
    expect(messages.at(-1)).toMatchObject({ role: 'assistant', reasoning_content: 'answer it' })
    expect(historyMessages([t], { clearedUpTo: 0, reasoning: false }).at(-1)).not.toHaveProperty(
      'reasoning_content',
    )
  })
})

describe('planContext', () => {
  const turns = Array.from({ length: 12 }, (_, i) => turn(i + 1))
  const size = (cleared: number) =>
    messagesTokens(historyMessages(turns, { clearedUpTo: cleared, reasoning: false }))

  it('does nothing while the thread fits', () => {
    expect(
      planContext(turns, { fixed: 1000, prompt: 100_000, clearedUpTo: 0, reasoning: false }),
    ).toEqual({ clearedUpTo: 0, compact: 0 })
  })

  it('clears old tool results first, and the mark only moves forward', () => {
    const prompt = Math.ceil(size(0) / 0.65)
    const plan = planContext(turns, { fixed: 0, prompt, clearedUpTo: 0, reasoning: false })
    expect(plan.compact).toBe(0)
    expect(plan.clearedUpTo).toBeGreaterThan(0)
    expect(size(plan.clearedUpTo)).toBeLessThanOrEqual(prompt * 0.45)
    // Next turn, a little bigger: the same mark, so the prompt's start is unchanged (cache).
    const next = planContext([...turns, turn(13, 'short')], {
      fixed: 0,
      prompt,
      clearedUpTo: plan.clearedUpTo,
      reasoning: false,
    })
    expect(next.clearedUpTo).toBe(plan.clearedUpTo)
  })

  it('summarizes the oldest turns when clearing is not enough, keeping the latest', () => {
    const cleared = turns.at(-3)?.at ?? 0
    const prompt = Math.ceil(size(cleared) / 0.8)
    const plan = planContext(turns, { fixed: 0, prompt, clearedUpTo: 0, reasoning: false })
    expect(plan.compact).toBeGreaterThan(0)
    expect(plan.compact).toBeLessThan(turns.length)
  })

  it('does not summarize when the rules alone fill a tiny window', () => {
    const plan = planContext([turn(1, 'a'), turn(2, 'b')], {
      fixed: 6000,
      prompt: 6144,
      clearedUpTo: 0,
      reasoning: false,
    })
    expect(plan.compact).toBe(0)
  })

  it('leaves the oldest turns out of one request when nothing else helps', () => {
    const skip = overflow(turns, {
      fixed: 0,
      prompt: Math.ceil(size(0) / 2),
      clearedUpTo: 0,
      reasoning: false,
    })
    expect(skip).toBeGreaterThan(0)
    expect(skip).toBeLessThan(turns.length)
  })
})

describe('summaries', () => {
  it('cuts long threads into rounds a small model can read', () => {
    const turns = Array.from({ length: 6 }, (_, i) => turn(i + 1))
    const one = turnText(turns[0] as PastTurn).length
    const batches = summaryBatches(turns, one * 2 + 10)
    expect(batches.map((b) => b.length)).toEqual([2, 2, 2])
    expect(turnText(turns[0] as PastTurn)).toContain('Assistant called get_note')
  })
})

describe('agent messages', () => {
  it('says the local time with the weekday and the time zone', () => {
    const line = nowLine(new Date(2026, 9, 15, 9, 5), 'Europe/Moscow')
    expect(line).toMatch(/^Now: Thursday, 2026-10-15 09:05 \(Europe\/Moscow, UTC[+-]\d\d:\d\d\)\.$/)
  })

  it('keeps the start of the prompt the same from turn to turn', () => {
    const input = {
      question: 'and the second one?',
      fragments: [],
      scope: { kind: 'all' } as const,
      history: [turn(1), turn(2)],
      summary: 'Earlier: groceries.',
      memory: '- Call me Sasha',
    }
    const a = buildAgentMessages(input)
    const b = buildAgentMessages({ ...input, history: [...input.history, turn(3)] })
    expect(b.slice(0, a.length - 1)).toEqual(a.slice(0, -1))
    expect(a[0]?.content).toContain('- Call me Sasha')
    expect(a[1]?.content).toMatch(/^Summary of the conversation before this point:\nEarlier/)
  })

  it('falls back to the history as text, and says when only the start of a note is shown', () => {
    const messages = buildAgentMessages({
      question: 'tidy it',
      fragments: [
        {
          noteId: 'n1',
          title: 'Plan',
          ord: 0,
          text: 'start',
          updatedAt: 0,
          via: { keyword: true, semantic: false },
          score: 1,
          partial: true,
        },
      ],
      scope: { kind: 'note', id: 'n1', title: 'Plan' },
      history: [turn(1, 'r')],
      historyAsText: true,
    })
    expect(messages).toHaveLength(2)
    expect(messages[1]?.content).toContain('The conversation so far:')
    expect(messages[1]?.content).toContain('read all of it with get_note')
  })
})
