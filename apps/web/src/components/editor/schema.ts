import type { AnyExtension } from '@tiptap/core'
import { TaskItem, TaskList } from '@tiptap/extension-list'
import { TableKit } from '@tiptap/extension-table'
import { Markdown } from '@tiptap/markdown'
import StarterKit from '@tiptap/starter-kit'
import { AttachmentImage } from './attachment-image'
import { Callout } from './callout'
import { NoteCodeBlock } from './code-block'
import { NoteDetails, NoteDetailsContent, NoteDetailsSummary } from './details'
import { ImageAwareParagraph } from './paragraph'

/**
 * The extensions that make up a note's document (nodes, marks, Markdown): the editor adds its
 * behaviour on top, and shared notes convert Markdown ⇄ Yjs with exactly these, so both agree.
 */
export function noteSchema(
  opts: {
    shouldAutoLink?: (url: string) => boolean
    resolveImage?: (id: string) => Promise<{ url: string; mime: string } | null>
    /** Undo comes from Yjs when the note is edited live. */
    live?: boolean
    /** A note only shown (a shared link's page): links open in a new tab. */
    readOnly?: boolean
  } = {},
): AnyExtension[] {
  return [
    StarterKit.configure({
      ...(opts.live ? { undoRedo: false as const } : {}),
      codeBlock: false,
      paragraph: false,
      heading: { levels: [1, 2, 3] },
      link: opts.readOnly
        ? {
            openOnClick: true,
            autolink: false,
            HTMLAttributes: { target: '_blank', rel: 'noopener noreferrer nofollow' },
          }
        : {
            openOnClick: false,
            autolink: true,
            linkOnPaste: true,
            // Files dropped into a note are links to attachment:<id>.
            protocols: ['attachment'],
            ...(opts.shouldAutoLink ? { shouldAutoLink: opts.shouldAutoLink } : {}),
          },
    }),
    ImageAwareParagraph,
    NoteCodeBlock,
    TaskList,
    TaskItem.configure({ nested: true }),
    // Markdown (GFM) tables, read and written as `| a | b |`.
    TableKit.configure({ table: { resizable: false } }),
    // Obsidian callouts, `> [!info] Title` in Markdown (notes imported from Obsidian).
    Callout,
    // Folded sections, `<details>` in Markdown (a call's transcript).
    NoteDetails,
    NoteDetailsSummary,
    NoteDetailsContent,
    Markdown,
    AttachmentImage.configure(opts.resolveImage ? { resolve: opts.resolveImage } : {}),
  ]
}
