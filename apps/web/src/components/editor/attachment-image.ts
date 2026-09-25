import { attachmentIdFromUrl } from '@fixnote/core'
import Image, { type ImageOptions } from '@tiptap/extension-image'

export interface AttachmentImageOptions {
  /** Object URL and type of an attachment, or null when it is not available (yet). */
  resolve: (id: string) => Promise<{ url: string; mime: string } | null>
}

const SAFE_SRC = /^(https?:|data:image\/|blob:)/i

/**
 * Images (and voice messages) in notes. `attachment:<id>` sources are resolved from this device's
 * storage, or downloaded and decrypted on first view; an audio attachment, e.g. a voice message
 * from Telegram, shows a player. Plain web images load as they are.
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
      // A stable wrapper (ProseMirror keeps this element); the image or player goes inside.
      const dom = document.createElement('div')
      dom.className = 'fixnote-media'
      dom.contentEditable = 'false'
      const img = document.createElement('img')
      img.className = 'fixnote-image'
      img.alt = (node.attrs.alt as string | null) ?? ''
      img.draggable = false
      dom.append(img)
      const src = (node.attrs.src as string | null) ?? ''
      const id = attachmentIdFromUrl(src)
      if (id) {
        img.dataset.state = 'loading'
        void resolve(id).then((file) => {
          if (!file) {
            img.dataset.state = 'missing'
          } else if (file.mime.startsWith('audio/')) {
            const audio = document.createElement('audio')
            audio.className = 'fixnote-audio'
            audio.controls = true
            audio.preload = 'metadata'
            audio.src = file.url
            img.replaceWith(audio)
          } else {
            img.src = file.url
            img.dataset.state = 'ready'
          }
        })
      } else if (SAFE_SRC.test(src)) {
        img.src = src
        img.referrerPolicy = 'no-referrer'
      } else img.dataset.state = 'missing'
      return {
        dom,
        update: (next) => next.type === node.type && next.attrs.src === node.attrs.src,
      }
    }
  },
})
