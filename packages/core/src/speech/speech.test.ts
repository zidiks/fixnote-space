import { describe, expect, it } from 'vitest'
import { quietestCut, SPEECH_RATE, splitAtQuiet } from './audio'
import { cleanTranscript, collapseRepeats } from './clean'
import { speechPrompt, speechVocabulary } from './vocabulary'

describe('cleanTranscript', () => {
  it('drops what Whisper writes over silence', () => {
    expect(cleanTranscript('Субтитры сделал DimaTorzok')).toBe('')
    expect(cleanTranscript('Продолжение следует...')).toBe('')
    expect(cleanTranscript('Купить молоко. Спасибо за просмотр!')).toBe('Купить молоко.')
    expect(cleanTranscript('[музыка] Позвонить маме')).toBe('Позвонить маме')
    expect(cleanTranscript('Thanks for watching!')).toBe('')
    expect(cleanTranscript('Subtítulos realizados por la comunidad de Amara.org')).toBe('')
    expect(cleanTranscript('♪ ♪')).toBe('')
  })

  it('keeps real speech as it is', () => {
    const text = 'Завтра в 10 созвон с Олегом, обсудить бюджет. Потом спортзал!'
    expect(cleanTranscript(text)).toBe(text)
    // The phrase inside a longer sentence is speech.
    expect(cleanTranscript('Скажи ему спасибо за просмотр квартиры.')).toBe(
      'Скажи ему спасибо за просмотр квартиры.',
    )
  })

  it('collapses loops', () => {
    expect(collapseRepeats('и и и и и и')).toBe('и')
    expect(collapseRepeats('да, да, да')).toBe('да, да, да')
    expect(collapseRepeats('купить хлеб купить хлеб купить хлеб купить хлеб')).toBe('купить хлеб')
    expect(collapseRepeats('очень-очень хорошо')).toBe('очень-очень хорошо')
    expect(cleanTranscript('Я думаю, что. Я думаю, что. Я думаю, что.')).toBe('Я думаю, что.')
  })
})

describe('quietestCut', () => {
  it('finds the pause', () => {
    const s = new Float32Array(SPEECH_RATE * 3).map((_, i) => Math.sin(i / 3) * 0.5)
    s.fill(0, SPEECH_RATE * 2, SPEECH_RATE * 2 + 1600)
    const cut = quietestCut(s, SPEECH_RATE, SPEECH_RATE * 3)
    expect(cut).toBeGreaterThanOrEqual(SPEECH_RATE * 2)
    expect(cut).toBeLessThan(SPEECH_RATE * 2 + 1600)
  })

  it('splits a long recording into whole pieces', () => {
    const s = new Float32Array(SPEECH_RATE * 61).map((_, i) => Math.sin(i / 5))
    const parts = splitAtQuiet(s, 20)
    expect(parts.reduce((n, p) => n + p.length, 0)).toBe(s.length)
    for (const p of parts) expect(p.length).toBeLessThanOrEqual(SPEECH_RATE * 20)
    expect(splitAtQuiet(new Float32Array(10), 20)).toHaveLength(1)
  })
})

describe('speechVocabulary', () => {
  it('takes folders and names that come up, not words capitalized by a sentence', () => {
    const notes = [
      'Встреча с Олегом в Тинькофф. Обсудили Kubernetes и бюджет.',
      'Позвонить Олегом? Нет, написать Олегом в Telegram. Тинькофф ждёт.\n- [ ] Купить хлеб',
      '# Планы\nНовый кластер Kubernetes в Тинькофф, Telegram бот',
    ]
    const words = speechVocabulary(notes, ['Работа', 'FixNote'])
    expect(words.slice(0, 2)).toEqual(['Работа', 'FixNote'])
    expect(words).toContain('Олегом')
    expect(words).toContain('Тинькофф')
    expect(words).toContain('Kubernetes')
    expect(words).toContain('Telegram')
    expect(words).not.toContain('Встреча')
    expect(words).not.toContain('Купить')
    expect(words).not.toContain('Планы')
  })

  it('builds a prompt from the words and the end of what was said', () => {
    expect(speechPrompt(['FixNote', 'Олег'], 'Позвонить Олегу')).toBe(
      'FixNote, Олег. Позвонить Олегу',
    )
    expect(speechPrompt([], 'раз два три', 7)).toBe('три')
    expect(speechPrompt([], '')).toBe('')
  })
})
