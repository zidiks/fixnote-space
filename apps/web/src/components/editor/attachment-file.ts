import { attachmentUrl } from '@fixnote/core'
import { type JSONContent, mergeAttributes, Node } from '@tiptap/core'
import { attachmentBadge, attachmentKind } from '../../lib/attachment-kind'

export interface AttachmentFileOptions {
  onOpen?: (file: { id: string; name: string; size: string }) => void
  onDownload?: (file: { id: string; name: string }) => void
}

const GRIP_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="5" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="9" cy="19" r="1"/><circle cx="15" cy="5" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="19" r="1"/></svg>'

const DOWNLOAD_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg>'

const TRASH_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>'

/**
 * Draggable block card for an attached file (PDF, Word, Excel, CSV, etc.).
 * Serializes to standard Fixnote Markdown `[name](attachment:<id> "size")` so sync, search,
 * Yjs, MCP, and exports stay 100% compatible.
 */
export const AttachmentFile = Node.create<AttachmentFileOptions>({
  name: 'attachmentFile',
  group: 'block',
  atom: true,
  draggable: true,
  selectable: true,

  addOptions() {
    return {
      onOpen: undefined,
      onDownload: undefined,
    }
  },

  addAttributes() {
    return {
      id: {
        default: '',
        parseHTML: (el) => el.getAttribute('data-attachment-id') ?? '',
      },
      name: {
        default: 'file',
        parseHTML: (el) => el.getAttribute('data-attachment-name') ?? 'file',
      },
      size: {
        default: '',
        parseHTML: (el) => el.getAttribute('data-attachment-size') ?? '',
      },
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-attachment-file]' }]
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        'data-attachment-file': '',
        'data-attachment-id': String(node.attrs.id ?? ''),
        'data-attachment-name': String(node.attrs.name ?? 'file'),
        'data-attachment-size': String(node.attrs.size ?? ''),
      }),
      String(node.attrs.name ?? 'file'),
    ]
  },

  renderMarkdown(node: JSONContent) {
    const id = String(node.attrs?.id ?? '')
    const name = String(node.attrs?.name ?? 'file').replace(/[[\]\\]/g, '\\$&') || 'file'
    const size = String(node.attrs?.size ?? '').replace(/"/g, '\\"')
    if (!id) return ''
    return size ? `[${name}](${attachmentUrl(id)} "${size}")` : `[${name}](${attachmentUrl(id)})`
  },

  addNodeView() {
    const { onOpen, onDownload } = this.options
    return ({ node, editor, getPos }) => {
      const id = String(node.attrs.id ?? '')
      const name = String(node.attrs.name ?? 'file')
      const size = String(node.attrs.size ?? '')
      const kind = attachmentKind(name)
      const badgeText = attachmentBadge(name)

      const dom = document.createElement('div')
      dom.className = 'fixnote-file-card'
      dom.contentEditable = 'false'
      dom.setAttribute('data-attachment-file', '')
      dom.setAttribute('data-attachment-id', id)
      dom.setAttribute('data-attachment-name', name)
      dom.setAttribute('data-attachment-size', size)
      dom.setAttribute('data-kind', kind)
      dom.setAttribute('role', 'button')
      dom.tabIndex = 0

      // Drag handle for effortless reordering inside the note.
      const grip = document.createElement('span')
      grip.className = 'fixnote-file-card-grip'
      grip.setAttribute('data-drag-handle', '')
      grip.setAttribute('aria-hidden', 'true')
      grip.innerHTML = GRIP_SVG

      // File type badge (PDF, DOCX, XLSX, CSV, TXT...).
      const badge = document.createElement('span')
      badge.className = 'fixnote-file-card-badge'
      badge.setAttribute('data-kind', kind)
      badge.textContent = badgeText

      // Name + size info.
      const info = document.createElement('div')
      info.className = 'fixnote-file-card-info'
      const title = document.createElement('div')
      title.className = 'fixnote-file-card-name'
      title.textContent = name
      title.title = name
      info.append(title)
      if (size) {
        const meta = document.createElement('div')
        meta.className = 'fixnote-file-card-meta'
        meta.textContent = size
        info.append(meta)
      }

      // Quick actions: Download + Delete (when editable).
      const actions = document.createElement('div')
      actions.className = 'fixnote-file-card-actions'

      const dlBtn = document.createElement('button')
      dlBtn.type = 'button'
      dlBtn.className = 'fixnote-file-card-btn'
      dlBtn.innerHTML = DOWNLOAD_SVG
      dlBtn.addEventListener('mousedown', (e) => e.stopPropagation())
      dlBtn.addEventListener('click', (e) => {
        e.preventDefault()
        e.stopPropagation()
        if (id) onDownload?.({ id, name })
      })
      actions.append(dlBtn)

      if (editor.isEditable) {
        const delBtn = document.createElement('button')
        delBtn.type = 'button'
        delBtn.className = 'fixnote-file-card-btn is-danger'
        delBtn.innerHTML = TRASH_SVG
        delBtn.addEventListener('mousedown', (e) => e.stopPropagation())
        delBtn.addEventListener('click', (e) => {
          e.preventDefault()
          e.stopPropagation()
          const pos = typeof getPos === 'function' ? getPos() : undefined
          if (typeof pos === 'number') {
            editor
              .chain()
              .focus()
              .deleteRange({ from: pos, to: pos + node.nodeSize })
              .run()
          }
        })
        actions.append(delBtn)
      }

      dom.append(grip, badge, info, actions)

      const openCard = (e: Event) => {
        if (!id) return
        e.preventDefault()
        onOpen?.({ id, name, size })
      }
      dom.addEventListener('click', (e) => {
        if ((e.target as Element | null)?.closest('.fixnote-file-card-actions')) return
        openCard(e)
      })
      dom.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') openCard(e)
      })

      return {
        dom,
        update: (next) =>
          next.type === node.type &&
          next.attrs.id === node.attrs.id &&
          next.attrs.name === node.attrs.name &&
          next.attrs.size === node.attrs.size,
      }
    }
  },
})
