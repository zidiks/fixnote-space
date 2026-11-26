import { emailDisplayName, type SharedMember } from '@fixnote/core'
import { useTranslation } from '@fixnote/i18n'
import { cn } from '@fixnote/ui'
import type { Editor } from '@tiptap/react'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { colorFor, initials, onColor } from '../../lib/collab/people'

interface MentionMatch {
  from: number
  to: number
  query: string
}

const MENTION_RE = /(?:^|[\s([{])@([^\s@]{0,32})$/
const MENU_WIDTH = 264
const MENU_MAX_HEIGHT = 280

function matchMention(editor: Editor): MentionMatch | null {
  if (!editor.isEditable || !editor.isFocused) return null
  const { selection } = editor.state
  if (!selection.empty) return null
  if (editor.isActive('codeBlock') || editor.isActive('code')) return null
  const { $from } = selection
  if (!$from.parent.isTextblock) return null
  const before = $from.parent.textBetween(0, $from.parentOffset, '\n', '\0')
  const m = before.match(MENTION_RE)
  if (!m) return null
  const query = m[1] ?? ''
  return {
    from: selection.from - query.length - 1,
    to: selection.from,
    query,
  }
}

/**
 * Inline `@` team-member mention picker for shared notes. Opens when typing `@` at the start of a
 * line or after whitespace; inserts a styled `[@Name](mention:<email>)` chip.
 */
export function MentionMenu({
  editor,
  collaborators,
  currentUserId,
}: {
  editor: Editor
  collaborators: SharedMember[]
  currentUserId: string
}) {
  const { t } = useTranslation()
  const [match, setMatch] = useState<MentionMatch | null>(null)
  const [selected, setSelected] = useState(0)
  const [pos, setPos] = useState<{ left: number; top?: number; bottom?: number } | null>(null)
  const dismissedAt = useRef<number | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  const allEmails = useMemo(
    () => collaborators.map((c) => c.email).filter(Boolean),
    [collaborators],
  )

  const mentionable = useMemo(
    () =>
      collaborators
        .filter((c) => c.userId !== currentUserId)
        .map((member) => ({ member, display: emailDisplayName(member.email, allEmails) })),
    [allEmails, collaborators, currentUserId],
  )

  const items = useMemo(() => {
    const q = match?.query.trim().toLowerCase() ?? ''
    if (!q) return mentionable.slice(0, 8)
    return mentionable
      .filter(
        ({ member, display }) =>
          display.toLowerCase().includes(q) || member.email.toLowerCase().includes(q),
      )
      .slice(0, 8)
  }, [match?.query, mentionable])

  const open = Boolean(match && items.length)

  const insert = useCallback(
    (range: { from: number; to: number }, member: SharedMember, display: string) => {
      const { schema } = editor.state
      const link = schema.marks.link?.create({ href: `mention:${member.email}` })
      const nodes = link
        ? [schema.text(`@${display}`, [link]), schema.text(' ')]
        : [schema.text(`@${display} `)]
      const tr = editor.state.tr.replaceWith(range.from, range.to, nodes)
      // Ensure typing after the mention space does not inherit the mention link mark.
      tr.setStoredMarks([])
      editor.view.dispatch(tr)
      editor.view.focus()
    },
    [editor],
  )

  useEffect(() => {
    const sync = () => {
      const next = matchMention(editor)
      if (!next) {
        dismissedAt.current = null
        setMatch(null)
        return
      }
      if (dismissedAt.current === next.from) {
        setMatch(null)
        return
      }
      dismissedAt.current = null
      setMatch((prev) => {
        if (prev && prev.from === next.from && prev.to === next.to && prev.query === next.query)
          return prev
        setSelected(0)
        return next
      })
    }
    const onTransaction = ({
      transaction,
    }: {
      transaction: { docChanged: boolean; selectionSet: boolean }
    }) => {
      if (!transaction.docChanged && !transaction.selectionSet) return
      sync()
    }
    const onBlur = () => setMatch(null)
    editor.on('transaction', onTransaction)
    editor.on('blur', onBlur)
    return () => {
      editor.off('transaction', onTransaction)
      editor.off('blur', onBlur)
    }
  }, [editor])

  useLayoutEffect(() => {
    if (!open || !match) {
      setPos(null)
      return
    }
    const place = () => {
      if (editor.isDestroyed) return
      const coords = editor.view.coordsAtPos(match.from)
      const height = Math.min(menuRef.current?.offsetHeight ?? MENU_MAX_HEIGHT, MENU_MAX_HEIGHT)
      const left = Math.max(8, Math.min(coords.left, window.innerWidth - MENU_WIDTH - 8))
      const below = coords.bottom + 6
      if (below + height > window.innerHeight - 8 && coords.top - 6 - height > 8) {
        setPos({ left, bottom: window.innerHeight - coords.top + 6 })
      } else {
        setPos({ left, top: Math.max(8, Math.min(below, window.innerHeight - height - 8)) })
      }
    }
    place()
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => {
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
    }
  }, [editor, open, match])

  useEffect(() => {
    if (!open || !match) return
    const pickAt = (index: number) => {
      const pick = items[index]
      if (!pick) return
      setMatch(null)
      insert({ from: match.from, to: match.to }, pick.member, pick.display)
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        e.stopPropagation()
        setSelected((i) => (i + 1) % items.length)
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        e.stopPropagation()
        setSelected((i) => (i - 1 + items.length) % items.length)
      } else if ((e.key === 'Enter' || e.key === 'Tab') && !e.isComposing) {
        e.preventDefault()
        e.stopPropagation()
        pickAt(selected)
      } else if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        dismissedAt.current = match.from
        setMatch(null)
      }
    }
    const onPointerDown = (e: PointerEvent) => {
      if (!(e.target as Element | null)?.closest('[data-mention-menu]')) {
        dismissedAt.current = match.from
        setMatch(null)
      }
    }
    window.addEventListener('keydown', onKeyDown, true)
    window.addEventListener('pointerdown', onPointerDown, true)
    return () => {
      window.removeEventListener('keydown', onKeyDown, true)
      window.removeEventListener('pointerdown', onPointerDown, true)
    }
  }, [insert, open, match, items, selected])

  useEffect(() => {
    if (!open) return
    menuRef.current
      ?.querySelector<HTMLElement>(`[data-mention-index="${selected}"]`)
      ?.scrollIntoView({ block: 'nearest' })
  }, [open, selected])

  if (!open || !match || !pos) return null

  return createPortal(
    <div
      ref={menuRef}
      data-mention-menu
      role="listbox"
      aria-label={t('comments.mentionHint')}
      style={{ left: pos.left, top: pos.top, bottom: pos.bottom, width: MENU_WIDTH }}
      className="fixed z-50 max-h-70 overflow-y-auto rounded-xl border bg-popover p-1 text-popover-foreground shadow-float animate-in fade-in-0 zoom-in-[0.97] duration-[var(--duration-spring-fast)] ease-[var(--ease-apple)]"
      onMouseDown={(e) => e.preventDefault()}
    >
      {items.map(({ member, display }, i) => {
        const active = i === selected
        const bg = colorFor(member.userId)
        const fg = onColor(bg)
        return (
          <button
            key={member.userId}
            type="button"
            role="option"
            aria-selected={active}
            data-mention-index={i}
            onMouseEnter={() => setSelected(i)}
            onClick={() => {
              setMatch(null)
              insert({ from: match.from, to: match.to }, member, display)
            }}
            className={cn(
              'flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left outline-none transition-colors',
              active && 'bg-accent text-accent-foreground',
            )}
          >
            <span
              className="flex size-6 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold"
              style={{ background: bg, color: fg }}
            >
              {initials(member.email)}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-medium leading-tight">
                {display}
              </span>
              <span className="block truncate text-[11px] text-muted-foreground leading-tight">
                {member.email}
              </span>
            </span>
          </button>
        )
      })}
    </div>,
    document.body,
  )
}
