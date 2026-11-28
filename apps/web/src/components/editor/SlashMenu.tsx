import { useTranslation } from '@fixnote/i18n'
import { cn } from '@fixnote/ui'
import type { Editor } from '@tiptap/react'
import {
  ChevronRightSquare,
  Code2,
  Heading1,
  Heading2,
  Heading3,
  ImagePlus,
  List,
  ListChecks,
  ListOrdered,
  MessageSquareQuote,
  Minus,
  Paperclip,
  StickyNote,
  Table2,
} from 'lucide-react'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

interface SlashMatch {
  from: number
  to: number
  query: string
}

interface SlashItem {
  id: string
  icon: typeof Heading1
  label: string
  hint?: string
  keywords: string
  run: (editor: Editor, range: { from: number; to: number }) => void
}

const SLASH_RE = /(?:^|\s)\/([^\s/]{0,24})$/
const MENU_WIDTH = 248
const MENU_MAX_HEIGHT = 320

function matchSlash(editor: Editor): SlashMatch | null {
  if (!editor.isEditable || !editor.isFocused) return null
  const { selection } = editor.state
  if (!selection.empty) return null
  if (editor.isActive('codeBlock') || editor.isActive('code')) return null
  const { $from } = selection
  if (!$from.parent.isTextblock) return null
  const before = $from.parent.textBetween(0, $from.parentOffset, '\n', '\0')
  const m = before.match(SLASH_RE)
  if (!m) return null
  const query = m[1] ?? ''
  return {
    from: selection.from - query.length - 1,
    to: selection.from,
    query,
  }
}

/**
 * Notion-like `/` command menu for inserting and formatting blocks without leaving the keyboard.
 * Opens on `/` at the start of a line or after whitespace; filters by localized name or EN/RU/ES
 * keywords; renders through a portal so editor `contain: layout` never offsets it.
 */
export function SlashMenu({
  editor,
  onInsertImage,
  onInsertFile,
}: {
  editor: Editor
  onInsertImage: () => void
  onInsertFile: () => void
}) {
  const { t } = useTranslation()
  const [match, setMatch] = useState<SlashMatch | null>(null)
  const [selected, setSelected] = useState(0)
  const [pos, setPos] = useState<{ left: number; top?: number; bottom?: number } | null>(null)
  const dismissedAt = useRef<number | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const imageRef = useRef(onInsertImage)
  imageRef.current = onInsertImage
  const fileRef = useRef(onInsertFile)
  fileRef.current = onInsertFile

  const allItems = useMemo<SlashItem[]>(
    () => [
      {
        id: 'h1',
        icon: Heading1,
        label: t('slash.h1'),
        hint: '#',
        keywords: 'h1 heading title заголовок 1 большой titulo',
        run: (e, r) => e.chain().focus().deleteRange(r).setHeading({ level: 1 }).run(),
      },
      {
        id: 'h2',
        icon: Heading2,
        label: t('slash.h2'),
        hint: '##',
        keywords: 'h2 heading subtitle заголовок 2 средний subtitulo',
        run: (e, r) => e.chain().focus().deleteRange(r).setHeading({ level: 2 }).run(),
      },
      {
        id: 'h3',
        icon: Heading3,
        label: t('slash.h3'),
        hint: '###',
        keywords: 'h3 heading заголовок 3 малый',
        run: (e, r) => e.chain().focus().deleteRange(r).setHeading({ level: 3 }).run(),
      },
      {
        id: 'taskList',
        icon: ListChecks,
        label: t('slash.taskList'),
        hint: '[]',
        keywords: 'todo task checkbox checklist задача чеклист чекбокс tarea',
        run: (e, r) => e.chain().focus().deleteRange(r).toggleTaskList().run(),
      },
      {
        id: 'bulletList',
        icon: List,
        label: t('slash.bulletList'),
        hint: '-',
        keywords: 'bullet list ul список маркированный lista',
        run: (e, r) => e.chain().focus().deleteRange(r).toggleBulletList().run(),
      },
      {
        id: 'orderedList',
        icon: ListOrdered,
        label: t('slash.orderedList'),
        hint: '1.',
        keywords: 'numbered ordered list ol нумерованный список numerada',
        run: (e, r) => e.chain().focus().deleteRange(r).toggleOrderedList().run(),
      },
      {
        id: 'quote',
        icon: MessageSquareQuote,
        label: t('slash.quote'),
        hint: '>',
        keywords: 'quote blockquote цитата cita',
        run: (e, r) => e.chain().focus().deleteRange(r).toggleBlockquote().run(),
      },
      {
        id: 'codeBlock',
        icon: Code2,
        label: t('slash.codeBlock'),
        hint: '```',
        keywords: 'code block snippet код блок codigo',
        run: (e, r) => e.chain().focus().deleteRange(r).toggleCodeBlock().run(),
      },
      {
        id: 'callout',
        icon: StickyNote,
        label: t('slash.callout'),
        hint: '!note',
        keywords: 'callout note info warning блок выноска заметка nota aviso',
        run: (e, r) =>
          e
            .chain()
            .focus()
            .deleteRange(r)
            .insertContent({
              type: 'callout',
              attrs: { type: 'note', title: '', fold: '' },
              content: [{ type: 'paragraph' }],
            })
            .run(),
      },
      {
        id: 'details',
        icon: ChevronRightSquare,
        label: t('slash.details'),
        keywords: 'toggle details collapse spoiler спойлер свернуть детали desplegable',
        run: (e, r) => e.chain().focus().deleteRange(r).setDetails().run(),
      },
      {
        id: 'table',
        icon: Table2,
        label: t('slash.table'),
        keywords: 'table grid таблица tabla',
        run: (e, r) =>
          e
            .chain()
            .focus()
            .deleteRange(r)
            .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
            .run(),
      },
      {
        id: 'divider',
        icon: Minus,
        label: t('slash.divider'),
        hint: '---',
        keywords: 'divider hr line separator разделитель линия separador',
        run: (e, r) => e.chain().focus().deleteRange(r).setHorizontalRule().run(),
      },
      {
        id: 'image',
        icon: ImagePlus,
        label: t('slash.image'),
        keywords: 'image photo picture картинка изображение фото imagen',
        run: (e, r) => {
          e.chain().focus().deleteRange(r).run()
          imageRef.current()
        },
      },
      {
        id: 'file',
        icon: Paperclip,
        label: t('slash.file'),
        keywords:
          'file attachment pdf doc docx word excel csv table файл вложение документ таблица пдф ворд archivo adjunto',
        run: (e, r) => {
          e.chain().focus().deleteRange(r).run()
          fileRef.current()
        },
      },
    ],
    [t],
  )

  const items = useMemo(() => {
    const q = match?.query.trim().toLowerCase() ?? ''
    if (!q) return allItems
    return allItems.filter(
      (it) =>
        it.label.toLowerCase().includes(q) ||
        it.keywords.includes(q) ||
        it.hint?.toLowerCase().includes(q),
    )
  }, [allItems, match?.query])

  const open = Boolean(match && items.length)

  useEffect(() => {
    const sync = () => {
      const next = matchSlash(editor)
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
    const runAt = (index: number) => {
      const item = items[index]
      if (!item) return
      setMatch(null)
      item.run(editor, { from: match.from, to: match.to })
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
        runAt(selected)
      } else if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        dismissedAt.current = match.from
        setMatch(null)
      }
    }
    const onPointerDown = (e: PointerEvent) => {
      if (!(e.target as Element | null)?.closest('[data-slash-menu]')) {
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
  }, [editor, open, match, items, selected])

  useEffect(() => {
    if (!open) return
    menuRef.current
      ?.querySelector<HTMLElement>(`[data-slash-index="${selected}"]`)
      ?.scrollIntoView({ block: 'nearest' })
  }, [open, selected])

  if (!open || !match || !pos) return null

  return createPortal(
    <div
      ref={menuRef}
      data-slash-menu
      role="listbox"
      aria-label={t('slash.title')}
      style={{ left: pos.left, top: pos.top, bottom: pos.bottom, width: MENU_WIDTH }}
      className="fixed z-50 max-h-80 overflow-y-auto rounded-xl border bg-popover p-1 text-popover-foreground shadow-float animate-in fade-in-0 zoom-in-[0.97] duration-[var(--duration-spring-fast)] ease-[var(--ease-apple)]"
      onMouseDown={(e) => e.preventDefault()}
    >
      {items.map((item, i) => {
        const Icon = item.icon
        const active = i === selected
        return (
          <button
            key={item.id}
            type="button"
            role="option"
            aria-selected={active}
            data-slash-index={i}
            onMouseEnter={() => setSelected(i)}
            onClick={() => {
              setMatch(null)
              item.run(editor, { from: match.from, to: match.to })
            }}
            className={cn(
              'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-[13px] outline-none [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:opacity-70',
              active && 'bg-accent text-accent-foreground [&_svg]:opacity-100',
            )}
          >
            <Icon />
            <span className="flex-1 truncate">{item.label}</span>
            {item.hint ? (
              <span className="font-mono text-[11px] text-muted-foreground">{item.hint}</span>
            ) : null}
          </button>
        )
      })}
    </div>,
    document.body,
  )
}
