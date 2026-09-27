import type { Editor } from '@tiptap/react'
import { relativePositionToAbsolutePosition, ySyncPluginKey } from '@tiptap/y-tiptap'
import { type CSSProperties, useEffect, useRef, useState } from 'react'
import type { Awareness } from 'y-protocols/awareness'
import * as Y from 'yjs'
import type { LiveUser } from '../../lib/collab/people'

interface Caret {
  id: number
  x: number
  y: number
  height: number
  name: string
  color: string
}

/**
 * Other people's carets in a shared note, drawn over the text instead of inside it so they glide
 * from place to place (CSS transitions) rather than jump with each batch of keystrokes. The
 * collaboration-caret extension still sends this person's caret and draws selections.
 */
export function LiveCarets({ editor, awareness }: { editor: Editor; awareness: Awareness }) {
  const box = useRef<HTMLDivElement>(null)
  const [carets, setCarets] = useState<Caret[]>([])

  useEffect(() => {
    let frame = 0
    const measure = () => {
      const origin = box.current?.getBoundingClientRect()
      const ystate = ySyncPluginKey.getState(editor.state)
      if (!origin || editor.isDestroyed || !ystate?.binding || !ystate.binding.mapping.size) {
        setCarets([])
        return
      }
      const next: Caret[] = []
      for (const [id, state] of awareness.getStates()) {
        const aw = state as { cursor?: { head: unknown }; user?: Partial<LiveUser> }
        if (id === awareness.clientID || !aw.cursor || !aw.user?.name) continue
        const head = relativePositionToAbsolutePosition(
          ystate.doc,
          ystate.type,
          Y.createRelativePositionFromJSON(aw.cursor.head),
          ystate.binding.mapping,
        )
        if (head == null) continue
        const pos = Math.min(Math.max(head, 0), editor.state.doc.content.size)
        let at: { left: number; top: number; bottom: number }
        try {
          at = editor.view.coordsAtPos(pos)
        } catch {
          continue
        }
        next.push({
          id,
          x: at.left - origin.left,
          y: at.top - origin.top,
          height: at.bottom - at.top,
          name: aw.user.name,
          color: aw.user.color ?? '#e8590c',
        })
      }
      setCarets(next)
    }
    const schedule = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(measure)
    }
    schedule()
    awareness.on('change', schedule)
    editor.on('transaction', schedule)
    const resize = new ResizeObserver(schedule)
    resize.observe(editor.view.dom)
    return () => {
      cancelAnimationFrame(frame)
      awareness.off('change', schedule)
      editor.off('transaction', schedule)
      resize.disconnect()
    }
  }, [editor, awareness])

  return (
    <div ref={box} aria-hidden className="pointer-events-none absolute inset-0">
      {carets.map((c) => (
        <div
          key={c.id}
          className="live-caret"
          style={
            {
              transform: `translate(${c.x}px, ${c.y}px)`,
              height: c.height,
              '--caret': c.color,
            } as CSSProperties
          }
        >
          <span className="live-caret__label">{c.name}</span>
        </div>
      ))}
    </div>
  )
}
