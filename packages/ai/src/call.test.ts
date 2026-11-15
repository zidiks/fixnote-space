import { describe, expect, it } from 'vitest'
import {
  buildCallMergeMessages,
  buildCallMessages,
  CALL_MARKER,
  callDepth,
  parseCallReply,
  splitTranscript,
} from './call'

describe('call write-up', () => {
  it('keeps the marker and the transcript in the request', () => {
    const [system, user] = buildCallMessages('[0:00] Me: hi', { minutes: 3, depth: 'brief' })
    expect(system?.content).toContain(CALL_MARKER)
    expect(user?.content).toContain('[0:00] Me: hi')
    expect(user?.content).toContain('3 min')
  })

  it('asks for more detail the longer and denser the call', () => {
    expect(callDepth(5, 40_000)).toBe('brief')
    expect(callDepth(60, 2_000)).toBe('brief')
    expect(callDepth(20, 15_000)).toBe('standard')
    expect(callDepth(90, 15_000)).toBe('standard')
    expect(callDepth(90, 120_000)).toBe('detailed')
    const brief = buildCallMessages('x', { minutes: 3, depth: 'brief' })[0]?.content ?? ''
    const detailed = buildCallMessages('x', { minutes: 90, depth: 'detailed' })[0]?.content ?? ''
    expect(brief).toContain('short call')
    expect(detailed).toContain('long call')
  })

  it('says which part of a long call it is and keeps topics when merging', () => {
    const call = { minutes: 90, depth: 'detailed' as const }
    const [, user] = buildCallMessages('x', call, { index: 1, count: 3 })
    expect(user?.content).toContain('part 2 of 3')
    const [, merge] = buildCallMergeMessages(
      [
        {
          summary: 'A',
          topics: [{ title: 'Бюджет', points: ['300 тыс. на Q1'] }],
          decisions: [],
          tasks: [],
          questions: ['Кто ведёт?'],
        },
      ],
      call,
    )
    expect(merge?.content).toContain('Бюджет')
    expect(merge?.content).toContain('300 тыс. на Q1')
    expect(merge?.content).toContain('Кто ведёт?')
  })

  it('reads the JSON reply, dropping what is not text', () => {
    expect(
      parseCallReply(
        'Here:\n{"summary": " Обсудили релиз. ", "topics": [{"title": " Релиз ", "points": ["Тесты   зелёные", 1]}, {"title": ""}, 2], "decisions": ["Релиз в среду", 3, " "], "tasks": ["Я: написать   Маше"], "questions": ["Кто дежурит?"]}',
      ),
    ).toEqual({
      summary: 'Обсудили релиз.',
      topics: [{ title: 'Релиз', points: ['Тесты зелёные'] }],
      decisions: ['Релиз в среду'],
      tasks: ['Я: написать Маше'],
      questions: ['Кто дежурит?'],
    })
    expect(parseCallReply('{"summary": ""}')).toEqual({
      summary: '',
      topics: [],
      decisions: [],
      tasks: [],
      questions: [],
    })
    expect(parseCallReply('no json')).toBeNull()
  })

  it('splits a long transcript at line ends', () => {
    const lines = Array.from({ length: 10 }, (_, i) => `line ${i} ${'x'.repeat(20)}`)
    const chunks = splitTranscript(lines.join('\n'), 70)
    expect(chunks.join('\n')).toBe(lines.join('\n'))
    expect(chunks.every((c) => c.length <= 70)).toBe(true)
    expect(chunks.length).toBeGreaterThan(1)
  })
})
