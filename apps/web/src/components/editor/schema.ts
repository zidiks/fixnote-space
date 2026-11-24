import type { AnyExtension } from '@tiptap/core'
import { headlessNoteSchema, type NoteSchemaOptions } from './base-schema'
import { NoteCodeBlock } from './code-block'

/**
 * The extensions that make up a note's interactive editor document (nodes, marks, Markdown, and
 * syntax-highlighted code blocks).
 */
export function noteSchema(opts: NoteSchemaOptions = {}): AnyExtension[] {
  return headlessNoteSchema(opts, NoteCodeBlock)
}
