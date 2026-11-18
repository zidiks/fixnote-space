import { Editor } from '@tiptap/core'
import { noteSchema } from './schema'

let headless: Editor | null = null

/**
 * An editor that is never shown: the note schema and its Markdown parser and serializer. Its
 * empty document is given as JSON, so it needs no DOM (tests, workers).
 */
export function schemaEditor(): Editor {
  headless ??= new Editor({
    element: null,
    extensions: noteSchema(),
    content: { type: 'doc', content: [{ type: 'paragraph' }] },
  })
  return headless
}
