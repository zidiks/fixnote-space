import { Editor } from '@tiptap/core'
import { describe, expect, it } from 'vitest'
import { highlightCode, promoteInlineCodeToBlock } from './code-block'
import { noteSchema } from './schema'

describe('code blocks', () => {
  it('auto-detects programming languages and highlights tokens', () => {
    const py = highlightCode('def greet(name):\n    return f"Hello {name}"\n')
    expect(py.language).toBe('python')
    expect(py.tokens.length).toBeGreaterThan(0)

    const sql = highlightCode('SELECT id, title FROM notes WHERE deleted_at IS NULL;')
    expect(sql.language).toBe('sql')
    expect(sql.tokens.length).toBeGreaterThan(0)

    const json = highlightCode('{\n  "name": "fixnote",\n  "version": 1\n}')
    expect(json.language).toBe('json')
    expect(json.tokens.length).toBeGreaterThan(0)
  })

  it('respects explicit language over auto-detection', () => {
    const ts = highlightCode('const x = 1', 'typescript')
    expect(ts.language).toBe('typescript')
    expect(ts.tokens.length).toBeGreaterThan(0)
  })

  it('does not mislabel short plain text as a programming language', () => {
    const plain = highlightCode('вц\nВфћы')
    expect(plain.language).toBeNull()
    expect(plain.tokens).toEqual([])
  })

  it('round-trips fenced code blocks in Markdown', () => {
    const md = '```python\ndef add(a, b):\n    return a + b\n```'
    const editor = new Editor({
      element: null,
      extensions: noteSchema(),
      content: { type: 'doc', content: [{ type: 'paragraph' }] },
    })
    const json = editor.markdown?.parse(md)
    expect(json?.content?.[0]?.type).toBe('codeBlock')
    expect(json?.content?.[0]?.attrs?.language).toBe('python')
    expect(editor.markdown?.serialize(json ?? { type: 'doc' }).trim()).toBe(md)
    editor.destroy()
  })

  it('promotes inline code to a codeBlock on Shift+Enter', () => {
    const editor = new Editor({
      element: null,
      extensions: noteSchema(),
      content: {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: 'const x = 1', marks: [{ type: 'code' }] }],
          },
        ],
      },
    })
    // Place caret inside the inline code at the end (`const x = 1|`).
    editor.commands.setTextSelection(1 + 'const x = 1'.length)
    expect(promoteInlineCodeToBlock(editor)).toBe(true)

    const doc = editor.state.doc
    expect(doc.childCount).toBe(1)
    expect(doc.child(0).type.name).toBe('codeBlock')
    expect(doc.child(0).textContent).toBe('const x = 1\n')
    editor.destroy()
  })

  it('splits surrounding paragraph text when promoting embedded inline code on Shift+Enter', () => {
    const editor = new Editor({
      element: null,
      extensions: noteSchema(),
      content: {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              { type: 'text', text: 'Before ' },
              { type: 'text', text: 'foobar', marks: [{ type: 'code' }] },
              { type: 'text', text: ' after' },
            ],
          },
        ],
      },
    })
    // Place caret between `foo` and `bar`.
    editor.commands.setTextSelection(1 + 'Before '.length + 3)
    expect(promoteInlineCodeToBlock(editor)).toBe(true)

    const doc = editor.state.doc
    expect(doc.childCount).toBe(3)
    expect(doc.child(0).type.name).toBe('paragraph')
    expect(doc.child(0).textContent).toBe('Before ')
    expect(doc.child(1).type.name).toBe('codeBlock')
    expect(doc.child(1).textContent).toBe('foo\nbar')
    expect(doc.child(2).type.name).toBe('paragraph')
    expect(doc.child(2).textContent).toBe(' after')
    editor.destroy()
  })

  it('does not hijack Shift+Enter outside inline code', () => {
    const editor = new Editor({
      element: null,
      extensions: noteSchema(),
      content: {
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: 'plain text' }] }],
      },
    })
    editor.commands.setTextSelection(5)
    expect(promoteInlineCodeToBlock(editor)).toBe(false)
    editor.destroy()
  })
})
