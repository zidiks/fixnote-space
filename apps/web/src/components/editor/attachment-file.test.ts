import { Editor } from '@tiptap/core'
import { describe, expect, it } from 'vitest'
import { headlessNoteSchema } from './base-schema'

function makeEditor(content = '# Note\n\nHello world') {
  return new Editor({
    extensions: headlessNoteSchema(),
    content,
    contentType: 'markdown',
  })
}

describe('attachment markdown parsing and insertion', () => {
  it('round-trips standalone file attachments as draggable attachmentFile blocks', () => {
    const md = '# Note\n\n[report.pdf](attachment:abc-123 "1.2 MB")\n\nAfter'
    const e = makeEditor(md)
    const types = e.state.doc.content.content.map((n) => n.type.name)
    expect(types).toEqual(['heading', 'attachmentFile', 'paragraph'])
    expect(e.getMarkdown().trim()).toBe(md)
    e.destroy()
  })

  it('inserts dropped image markdown via insertContentAt', () => {
    const e = makeEditor('# Note\n\nHello world')
    const pos = e.state.doc.content.size
    e.chain().insertContentAt(pos, '![](attachment:img-123)', { contentType: 'markdown' }).run()
    const types = e.state.doc.content.content.map((n) => n.type.name)
    expect(types).toContain('image')
    expect(e.getMarkdown()).toContain('![](attachment:img-123)')
    e.destroy()
  })

  it('inserts dropped image markdown when dropped between two blocks', () => {
    const e = makeEditor('# Note\n\nFirst\n\nSecond')
    // Insert right after "First" paragraph
    const $pos = e.state.doc.resolve(10)
    const pos = $pos.depth > 0 ? $pos.after(1) : 10
    e.chain().insertContentAt(pos, '![](attachment:img-456)', { contentType: 'markdown' }).run()
    const types = e.state.doc.content.content.map((n) => n.type.name)
    expect(types).toContain('image')
    e.destroy()
  })
})
