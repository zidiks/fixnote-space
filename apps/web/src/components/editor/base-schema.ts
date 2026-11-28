import type { LinkPreview } from '@fixnote/core'
import type { AnyExtension } from '@tiptap/core'
import { TaskItem, TaskList } from '@tiptap/extension-list'
import { TableKit } from '@tiptap/extension-table'
import { Markdown } from '@tiptap/markdown'
import StarterKit from '@tiptap/starter-kit'
import { AttachmentFile } from './attachment-file'
import { AttachmentImage } from './attachment-image'
import { Callout } from './callout'
import { NoteDetails, NoteDetailsContent, NoteDetailsSummary } from './details'
import { LinkMention } from './link-mention'
import { ImageAwareParagraph } from './paragraph'

export interface NoteSchemaOptions {
  shouldAutoLink?: (url: string) => boolean
  resolveImage?: (id: string) => Promise<{ url: string; mime: string } | null>
  releaseImage?: (id: string) => void
  allowExternalImages?: () => boolean
  openAttachment?: (file: { id: string; name: string; size?: string }) => void
  downloadAttachment?: (file: { id: string; name: string }) => void
  loadLinkPreview?: (url: string) => Promise<LinkPreview | null>
  openLink?: (url: string) => void
  /** Undo comes from Yjs when the note is edited live. */
  live?: boolean
  /** A note only shown (a shared link's page): links open in a new tab. */
  readOnly?: boolean
}

/**
 * Document schema without DOM/lowlight syntax highlighting — used by headless Markdown ⇄ Yjs
 * projection and background parsers so they don't pull highlight.js grammars into the bundle.
 */
export function headlessNoteSchema(
  opts: NoteSchemaOptions = {},
  customCodeBlock?: AnyExtension,
): AnyExtension[] {
  return [
    StarterKit.configure({
      ...(opts.live ? { undoRedo: false as const } : {}),
      ...(customCodeBlock ? { codeBlock: false as const } : {}),
      paragraph: false,
      heading: { levels: [1, 2, 3] },
      link: opts.readOnly
        ? {
            openOnClick: true,
            autolink: false,
            protocols: ['attachment', 'mention'],
            HTMLAttributes: { target: '_blank', rel: 'noopener noreferrer nofollow' },
          }
        : {
            openOnClick: false,
            autolink: true,
            linkOnPaste: true,
            // Files dropped into a note are links to attachment:<id>; team @mentions use mention:<email>.
            protocols: ['attachment', 'mention'],
            ...(opts.shouldAutoLink ? { shouldAutoLink: opts.shouldAutoLink } : {}),
          },
    }),
    ImageAwareParagraph,
    ...(customCodeBlock ? [customCodeBlock] : []),
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
    AttachmentImage.configure({
      ...(opts.resolveImage ? { resolve: opts.resolveImage } : {}),
      ...(opts.releaseImage ? { release: opts.releaseImage } : {}),
      ...(opts.allowExternalImages ? { allowExternal: opts.allowExternalImages } : {}),
      ...(opts.openAttachment ? { onOpen: opts.openAttachment } : {}),
    }),
    AttachmentFile.configure({
      ...(opts.openAttachment ? { onOpen: opts.openAttachment } : {}),
      ...(opts.downloadAttachment ? { onDownload: opts.downloadAttachment } : {}),
    }),
    LinkMention.configure({
      ...(opts.loadLinkPreview ? { load: opts.loadLinkPreview } : {}),
      ...(opts.openLink ? { open: opts.openLink } : {}),
      ...(opts.allowExternalImages ? { allowExternal: opts.allowExternalImages } : {}),
    }),
  ]
}
