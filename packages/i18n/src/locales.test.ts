import { describe, expect, it } from 'vitest'
import en from './locales/en'
import es from './locales/es'
import ru from './locales/ru'

type Tree = { [key: string]: string | Tree }

function leaves(tree: Tree, prefix = ''): Map<string, string> {
  const out = new Map<string, string>()
  for (const [key, value] of Object.entries(tree)) {
    const path = prefix ? `${prefix}.${key}` : key
    if (typeof value === 'string') out.set(path, value)
    else for (const [k, v] of leaves(value, path)) out.set(k, v)
  }
  return out
}

const placeholders = (s: string) => [...s.matchAll(/{{\s*(\w+)\s*}}/g)].map((m) => m[1]).sort()

describe.each([
  ['es', es],
  ['ru', ru],
])('%s locale', (_name, locale) => {
  const base = leaves(en as unknown as Tree)
  const other = leaves(locale as unknown as Tree)

  it('has exactly the English keys', () => {
    expect([...other.keys()].sort()).toEqual([...base.keys()].sort())
  })

  it('keeps every interpolation placeholder', () => {
    for (const [key, text] of base) {
      expect(placeholders(other.get(key) ?? ''), key).toEqual(placeholders(text))
    }
  })

  it('has no empty strings', () => {
    for (const [key, text] of other) expect(text.trim(), key).not.toBe('')
  })
})
