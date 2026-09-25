import { describe, expect, it } from 'vitest'
import { transliterate } from './translit'

describe('transliterate', () => {
  it('goes both ways for common brand and loan words', () => {
    expect(transliterate('телеграм')).toBe('telegram')
    expect(transliterate('Telegram')).toBe('телеграм')
    expect(transliterate('ноушн')).toBe('noushn')
    expect(transliterate('щука')).toBe('schuka')
  })

  it('leaves numbers and mixed tokens alone', () => {
    expect(transliterate('2026')).toBeNull()
    expect(transliterate('é')).toBeNull()
  })
})
