import { describe, expect, it } from 'vitest'
import { type CallPiece, callNoteMarkdown, callTurns, clock, dropEcho } from './transcript'

const labels = {
  me: 'Я',
  them: 'Собеседники',
  summary: 'Кратко',
  decisions: 'Решения',
  tasks: 'Задачи',
  transcript: 'Расшифровка',
}

const piece = (speaker: 'me' | 'them', startMs: number, text: string): CallPiece => ({
  speaker,
  startMs,
  endMs: startMs + 4000,
  text,
})

describe('call transcript', () => {
  it('drops my pieces that repeat the others from the speakers', () => {
    const kept = dropEcho([
      piece('them', 0, 'Давайте перенесём релиз на следующую среду.'),
      piece('me', 300, 'давайте перенесём релиз на следующую среду'),
      piece('me', 6000, 'Хорошо, я предупрежу команду.'),
      piece('them', 30_000, 'Отлично, тогда до среды.'),
      // Same words but long after: not an echo.
      piece('me', 60_000, 'Давайте перенесём релиз'),
    ])
    expect(kept.map((p) => `${p.speaker}@${p.startMs}`)).toEqual([
      'them@0',
      'me@6000',
      'them@30000',
      'me@60000',
    ])
  })

  it('merges consecutive pieces of one speaker into turns, in time order', () => {
    const turns = callTurns([
      piece('them', 5000, 'Вторая часть.'),
      piece('me', 0, 'Привет.'),
      piece('them', 2000, 'Первая часть.'),
      piece('me', 9000, ' '),
    ])
    expect(turns).toEqual([
      { speaker: 'me', startMs: 0, text: 'Привет.' },
      { speaker: 'them', startMs: 2000, text: 'Первая часть. Вторая часть.' },
    ])
  })

  it('formats time like a player', () => {
    expect(clock(65_000)).toBe('1:05')
    expect(clock(3_725_000)).toBe('1:02:05')
  })

  it('writes only the parts the call had, the transcript folded below', () => {
    const md = callNoteMarkdown({
      title: 'Созвон · 30 сент., 14:05 · 42 мин',
      summary: { summary: 'Обсудили релиз.', decisions: [], tasks: ['Маша: отправить макет'] },
      turns: [{ speaker: 'them', startMs: 12_000, text: '- это не список' }],
      labels,
    })
    expect(md).toBe(
      [
        '# Созвон · 30 сент., 14:05 · 42 мин',
        '## Кратко',
        'Обсудили релиз.',
        '## Задачи',
        '- [ ] Маша: отправить макет',
        '<details>\n<summary>Расшифровка</summary>\n\n**Собеседники, 0:12.** \\- это не список\n\n</details>',
      ].join('\n\n') + '\n',
    )
    expect(md).not.toContain('Решения')
  })

  it('shows the transcript open when there is no summary', () => {
    const md = callNoteMarkdown({
      title: 'Созвон',
      summary: null,
      turns: [{ speaker: 'me', startMs: 0, text: 'Проверка связи' }],
      labels,
    })
    expect(md).toBe('# Созвон\n\n## Расшифровка\n\n**Я, 0:00.** Проверка связи\n')
  })
})
