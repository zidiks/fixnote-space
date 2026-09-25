import { attachmentIdFromUrl } from '@fixnote/core'
import Image, { type ImageOptions } from '@tiptap/extension-image'

export interface AttachmentImageOptions {
  /** Object URL for an attachment id, or null when it is not available (yet). */
  resolve: (id: string) => Promise<string | null>
}

const SAFE_SRC = /^(https?:|data:image\/|blob:)/i

/**
 * Images in notes. `attachment:<id>` sources are resolved from this device's storage (or
 * downloaded and decrypted on first view); plain web images load as they are.
 */
export const AttachmentImage = Image.extend<ImageOptions & AttachmentImageOptions>({
  // attachment: is not a URL the browser can load: in HTML (clipboard, drag) it travels as
  // data-attachment-src, so nothing tries to fetch it.
  addAttributes() {
    return {
      ...this.parent?.(),
      src: {
        default: null,
        parseHTML: (el) => el.getAttribute('data-attachment-src') ?? el.getAttribute('src'),
        renderHTML: (attrs) => {
          const src = attrs.src as string | null
          return src && attachmentIdFromUrl(src) ? { 'data-attachment-src': src } : { src }
        },
      },
    }
  },
  addOptions() {
    return { ...(this.parent?.() as ImageOptions), resolve: async () => null }
  },
  addNodeView() {
    const { resolve } = this.options
    return ({ node }) => {
      const dom = document.createElement('img')
      dom.className = 'fixnote-image'
      dom.alt = (node.attrs.alt as string | null) ?? ''
      dom.draggable = false
      const src = (node.attrs.src as string | null) ?? ''
      const id = attachmentIdFromUrl(src)
      if (id) {
        dom.dataset.state = 'loading'
        void resolve(id).then((url) => {
          if (url) {
            dom.src = url
            dom.dataset.state = 'ready'
          } else dom.dataset.state = 'missing'
        })
      } else if (SAFE_SRC.test(src)) {
        dom.src = src
        dom.referrerPolicy = 'no-referrer'
      } else dom.dataset.state = 'missing'
      return {
        dom,
        update: (next) => next.type === node.type && next.attrs.src === node.attrs.src,
      }
    }
  },
})
