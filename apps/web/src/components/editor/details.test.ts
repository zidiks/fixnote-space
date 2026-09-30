import { Editor } from '@tiptap/core'
import { describe, expect, it } from 'vitest'
import { noteSchema } from './schema'

const md = [
  '# Созвон',
  '## Кратко',
  'Обсудили релиз.',
  '<details>\n<summary>Расшифровка &amp; заметки</summary>\n\n**Я, 0:00.** Привет\n\n**Собеседники, 0:05.** Привет, начнём\n\n</details>',
  'После.',
].join('\n\n')

describe('folded sections', () => {
  it('read and write <details> Markdown unchanged', () => {
    const editor = new Editor({
      element: null,
      extensions: noteSchema(),
      content: { type: 'doc', content: [{ type: 'paragraph' }] },
    })
    const json = editor.markdown?.parse(md)
    const details = json?.content?.find((n) => n.type === 'details')
    expect(details?.content?.map((n) => n.type)).toEqual(['detailsSummary', 'detailsContent'])
    expect(details?.content?.[0]?.content?.[0]?.text).toBe('Расшифровка & заметки')
    expect(details?.content?.[1]?.content).toHaveLength(2)
    expect(json?.content?.at(-1)?.content?.[0]?.text).toBe('После.')
    const back = json ? editor.markdown?.serialize(json) : ''
    expect(back?.trim()).toBe(md)
    editor.destroy()
  })
})
