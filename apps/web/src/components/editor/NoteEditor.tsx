import type { Note } from '@fixnote/core'
import { useTranslation } from '@fixnote/i18n'
import { TaskItem, TaskList } from '@tiptap/extension-list'
import { Placeholder } from '@tiptap/extensions'
import { Markdown } from '@tiptap/markdown'
import { EditorContent, useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { useEffect, useRef } from 'react'

export type SaveState = 'idle' | 'saving' | 'saved'

const SAVE_DELAY = 400

/**
 * Markdown in, Markdown out. Mounted once per note (keyed by id): later query refreshes never reset
 * the document under the cursor. Saves are debounced and flushed on blur and unmount.
 */
export function NoteEditor({
  note,
  onSave,
  onStateChange,
  onLeave,
}: {
  note: Note
  onSave: (markdown: string) => Promise<void>
  onStateChange?: (state: SaveState) => void
  /** Called on unmount with the final Markdown. */
  onLeave?: (markdown: string) => void
}) {
  const { t } = useTranslation()
  const pending = useRef<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const latest = useRef(note.content)
  const callbacks = useRef({ onSave, onStateChange, onLeave })
  callbacks.current = { onSave, onStateChange, onLeave }

  const flush = useRef(async () => {
    clearTimeout(timer.current)
    const markdown = pending.current
    if (markdown === null) return
    pending.current = null
    callbacks.current.onStateChange?.('saving')
    await callbacks.current.onSave(markdown)
    if (pending.current === null) callbacks.current.onStateChange?.('saved')
  }).current

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        link: { openOnClick: false, autolink: true, linkOnPaste: true },
      }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Placeholder.configure({ placeholder: t('note.placeholder') }),
      Markdown,
    ],
    content: note.content,
    contentType: 'markdown',
    autofocus: note.content.trim() ? false : 'end',
    editorProps: {
      attributes: {
        class: 'fixnote-editor',
        spellcheck: 'true',
        'aria-label': note.title || t('common.untitled'),
      },
    },
    onUpdate: ({ editor: e }) => {
      const markdown = e.getMarkdown()
      latest.current = markdown
      pending.current = markdown
      clearTimeout(timer.current)
      timer.current = setTimeout(() => void flush(), SAVE_DELAY)
    },
    onBlur: () => void flush(),
  })

  useEffect(() => {
    const onHide = () => void flush()
    window.addEventListener('pagehide', onHide)
    document.addEventListener('visibilitychange', onHide)
    return () => {
      window.removeEventListener('pagehide', onHide)
      document.removeEventListener('visibilitychange', onHide)
      void flush().finally(() => callbacks.current.onLeave?.(latest.current))
    }
  }, [flush])

  return (
    // Clicks below the text land here and put the caret at the end, like in Bear. Done on
    // mousedown and synchronously, so a key pressed right after the click is not lost.
    // biome-ignore lint/a11y/noStaticElementInteractions: pointer convenience; the editor itself stays keyboard accessible
    <div
      className="min-h-[50vh] cursor-text pb-24"
      onMouseDown={(e) => {
        if (e.target !== e.currentTarget || !editor) return
        e.preventDefault()
        editor.commands.setTextSelection(editor.state.doc.content.size)
        editor.view.focus()
      }}
    >
      <EditorContent editor={editor} />
    </div>
  )
}
