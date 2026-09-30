import { describe, expect, it } from 'vitest'
import { buildCallMessages, CALL_MARKER, parseCallReply, splitTranscript } from './call'

describe('call write-up', () => {
  it('keeps the marker and the transcript in the request', () => {
    const [system, user] = buildCallMessages('[0:00] Me: hi')
    expect(system?.content).toContain(CALL_MARKER)
    expect(user?.content).toContain('[0:00] Me: hi')
  })

  it('reads the JSON reply, dropping what is not text', () => {
    expect(
      parseCallReply(
        'Here:\n{"summary": " Обсудили релиз. ", "decisions": ["Релиз в среду", 3, " "], "tasks": ["Я: написать   Маше"]}',
      ),
    ).toEqual({
      summary: 'Обсудили релиз.',
      decisions: ['Релиз в среду'],
      tasks: ['Я: написать Маше'],
    })
    expect(parseCallReply('{"summary": ""}')).toEqual({ summary: '', decisions: [], tasks: [] })
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
