import { useTranslation } from '@fixnote/i18n'
import { cn } from '@fixnote/ui'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { useUi } from '../app/store'
import { useDb, useRepo } from '../lib/db'
import { droppedMarkdown, dropSink, isExternalDrag } from '../lib/drop'
import { useInvalidateNotes, writableFolder } from '../lib/queries'

const isTextField = (el: EventTarget | null) =>
  el instanceof HTMLElement && el.closest('input, textarea') !== null

/**
 * Drop anything from outside onto the window: while dragging, a soft glow runs along the edges;
 * on drop the content goes into the open note, or into a new note (in the open folder) otherwise.
 * Text dragged inside the app (moving a line in a note) is left to the editor.
 */
export function DropLayer() {
  const { t } = useTranslation()
  const { attachments } = useDb()
  const repo = useRepo()
  const invalidate = useInvalidateNotes()
  const [active, setActive] = useState(false)
  const [intoNote, setIntoNote] = useState(false)
  const depth = useRef(0)
  const internal = useRef(false)
  const deps = useRef({ attachments, repo, invalidate, t })
  deps.current = { attachments, repo, invalidate, t }

  useEffect(() => {
    const reset = () => {
      depth.current = 0
      setActive(false)
    }
    const onDragStart = () => {
      internal.current = true
    }
    const onDragEnd = () => {
      internal.current = false
      reset()
    }
    const onEnter = (e: DragEvent) => {
      if (internal.current || !isExternalDrag(e.dataTransfer)) return
      depth.current += 1
      setIntoNote(dropSink() !== null)
      setActive(true)
    }
    const onLeave = (e: DragEvent) => {
      if (internal.current || !isExternalDrag(e.dataTransfer)) return
      depth.current = Math.max(0, depth.current - 1)
      if (depth.current === 0) setActive(false)
    }
    const onOver = (e: DragEvent) => {
      if (internal.current || !isExternalDrag(e.dataTransfer)) return
      // Without this the webview would open the file itself.
      e.preventDefault()
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'
    }
    const onDrop = (e: DragEvent) => {
      const data = e.dataTransfer
      if (internal.current || !data || !isExternalDrag(data)) return
      reset()
      // Text dropped onto a text field (the chat input) lands there as usual.
      if (isTextField(e.target) && !data.types.includes('Files')) return
      e.preventDefault()
      e.stopPropagation()
      const at = { x: e.clientX, y: e.clientY }
      const target = dropSink()
      const { attachments: files, repo: notes, invalidate: refresh, t: tr } = deps.current
      void droppedMarkdown(data, files).then(async ({ markdown, failed }) => {
        for (const reason of failed) toast.error(reason)
        if (!markdown) return
        if (target) {
          target.insert(markdown, at)
          return
        }
        const route = useUi.getState().route
        const note = await notes.createNote({
          content: markdown,
          folderId: await writableFolder(notes, route.kind === 'folder' ? route.id : null),
        })
        await refresh()
        useUi.getState().navigate({ kind: 'note', id: note.id })
        toast(tr('drop.created'))
      })
    }
    document.addEventListener('dragstart', onDragStart)
    document.addEventListener('dragend', onDragEnd)
    window.addEventListener('dragenter', onEnter, true)
    window.addEventListener('dragleave', onLeave, true)
    window.addEventListener('dragover', onOver, true)
    window.addEventListener('drop', onDrop, true)
    return () => {
      document.removeEventListener('dragstart', onDragStart)
      document.removeEventListener('dragend', onDragEnd)
      window.removeEventListener('dragenter', onEnter, true)
      window.removeEventListener('dragleave', onLeave, true)
      window.removeEventListener('dragover', onOver, true)
      window.removeEventListener('drop', onDrop, true)
    }
  }, [])

  return (
    <div
      aria-hidden={!active}
      className={cn(
        'fixnote-drop-glow pointer-events-none fixed inset-0 z-[100] transition-opacity duration-200',
        active ? 'opacity-100' : 'opacity-0',
      )}
    >
      <div className="absolute inset-x-0 bottom-8 flex justify-center">
        <span className="rounded-full border bg-popover/95 px-4 py-2 text-sm text-popover-foreground shadow-lg backdrop-blur">
          {intoNote ? t('drop.intoNote') : t('drop.newNote')}
        </span>
      </div>
    </div>
  )
}
