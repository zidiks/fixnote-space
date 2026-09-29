import { describe, expect, it } from 'vitest'
import { fillerFor, Sentences, speakable, yesNo, yesOrNo } from './speech'

describe('spoken answers', () => {
  it('says the text without citations, Markdown or links', () => {
    expect(speakable('**Купить** молоко [1][2] и `хлеб` [3, 4].')).toBe('Купить молоко и хлеб.')
    expect(speakable('- [ ] позвонить маме\n- [x] оплатить')).toBe('позвонить маме\nоплатить')
    expect(speakable('See [the plan](https://x.y/p) at https://a.b/c')).toBe('See the plan at')
  })

  it('hands out sentences as they complete, then the rest', () => {
    const s = new Sentences()
    expect(s.take('Нашёл две замет')).toEqual([])
    expect(s.take('Нашёл две заметки. В перв')).toEqual(['Нашёл две заметки.'])
    expect(s.take('Нашёл две заметки. В первой список покупок! Во второй')).toEqual([
      'В первой список покупок!',
    ])
    expect(s.rest('Нашёл две заметки. В первой список покупок! Во второй план [2]')).toEqual([
      'Во второй план',
    ])
    expect(s.rest('Нашёл две заметки. В первой список покупок! Во второй план [2]')).toEqual([])
  })

  it('treats a line break as the end of a sentence (lists)', () => {
    const s = new Sentences()
    expect(s.take('Покупки:\n- молоко\n- хлеб\n')).toEqual(['Покупки:', 'молоко', 'хлеб'])
  })

  it('understands yes and no in the three languages', () => {
    expect(yesNo('Да, удаляй')).toBe(true)
    expect(yesNo('нет')).toBe(false)
    expect(yesNo('Sí, claro')).toBe(true)
    expect(yesNo('No thanks')).toBe(false)
    expect(yesNo('может быть')).toBeNull()
  })

  it('has fillers and the yes/no question in each language', () => {
    expect(fillerFor('ru', 0)).toBe('Сейчас посмотрю.')
    expect(fillerFor('es-ES', 0.99)).toBe('Miro en tus notas.')
    expect(fillerFor('de')).toBeNull()
    expect(yesOrNo('en')).toBe('Yes or no?')
    expect(yesOrNo('de')).toBe('Yes or no?')
  })
})
