import { detectSecrets } from '@fixnote/core/privacy/detect'
import { describe, expect, it } from 'vitest'
import { schemaEditor } from './headless'
import { changedScanRange, scanContext, scanNoteRange } from './privacy-scan'

const scan = async (value: string) => detectSecrets(value)

describe('privacy scan ranges', () => {
  it('maps findings back through formatted text and multiple paragraphs', async () => {
    const e = schemaEditor()
    const doc = e.schema.nodeFromJSON({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: '🔒 Password: ' },
            { type: 'text', text: 'local-', marks: [{ type: 'bold' }] },
            { type: 'text', text: 'sample' },
          ],
        },
        ...['-----BEGIN PRIVATE KEY-----', 'YWJj', '-----END PRIVATE KEY-----'].map((text) => ({
          type: 'paragraph',
          content: [{ type: 'text', text }],
        })),
      ],
    })
    const hits = await scanNoteRange(doc, { from: 0, to: doc.content.size }, scan, () => true)
    expect(hits.map((hit) => [hit.kind, doc.textBetween(hit.from, hit.to, '\n')])).toEqual([
      ['password', 'local-sample'],
      ['privateKey', '-----BEGIN PRIVATE KEY-----\nYWJj\n-----END PRIVATE KEY-----'],
    ])
  })

  it('limits a normal edit to nearby blocks in a long document', async () => {
    const e = schemaEditor()
    const paragraph = (text: string) => e.schema.node('paragraph', null, e.schema.text(text))
    const body = Array.from({ length: 2000 }, () => paragraph('An ordinary line ' + 'x'.repeat(40)))
    const doc = e.schema.node('doc', null, [
      paragraph('Password: old-example'),
      ...body,
      paragraph('Код домофона: 482'),
    ])
    const state = e.state.reconfigure({ plugins: [] })
    const tr = state.tr.replaceWith(0, state.doc.content.size, doc.content)
    const edited = state.apply(tr).tr
    edited.insertText('1', edited.doc.content.size - 1)
    const changed = changedScanRange(edited)
    expect(changed).not.toBeNull()
    if (!changed) return
    const range = scanContext(edited.doc, changed)
    expect(range.from).toBeGreaterThan(100_000)
    const hits = await scanNoteRange(edited.doc, range, scan, () => true)
    expect(hits.map((hit) => edited.doc.textBetween(hit.from, hit.to))).toEqual(['4821'])
  })
})
