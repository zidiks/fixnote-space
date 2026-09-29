import { Editor } from '@tiptap/core'
import { noteSchema } from './schema'

let headless: Editor | null = null

/** An editor that is never shown: the note schema and its Markdown parser and serializer. */
export function schemaEditor(): Editor {
  headless ??= new Editor({ element: null, extensions: noteSchema() })
  return headless
}
