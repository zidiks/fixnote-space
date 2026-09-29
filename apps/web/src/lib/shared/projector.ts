import type { DocProjector } from '@fixnote/core'
import { updateYFragment, yXmlFragmentToProsemirrorJSON } from '@tiptap/y-tiptap'
import * as Y from 'yjs'
import { schemaEditor } from '../../components/editor/headless'
import { LIVE_FIELD } from '../collab/live'

/**
 * Markdown ⇄ a shared note's Yjs document, with the editor's own schema. Going to Yjs changes as
 * little as possible (a diff against what the document has), so an edit made outside the editor
 * merges with others' edits instead of replacing the note.
 */
export const projector: DocProjector = {
  toMarkdown(state) {
    const doc = new Y.Doc()
    Y.applyUpdate(doc, state)
    const json = yXmlFragmentToProsemirrorJSON(doc.getXmlFragment(LIVE_FIELD))
    return schemaEditor().markdown?.serialize(json) ?? ''
  },
  fromMarkdown(state, markdown) {
    const editor = schemaEditor()
    const doc = new Y.Doc()
    if (state) Y.applyUpdate(doc, state)
    const json = editor.markdown?.parse(markdown) ?? { type: 'doc', content: [] }
    updateYFragment(doc, doc.getXmlFragment(LIVE_FIELD), editor.schema.nodeFromJSON(json), {
      mapping: new Map(),
      isOMark: new Map(),
    })
    return Y.encodeStateAsUpdate(doc)
  },
}
