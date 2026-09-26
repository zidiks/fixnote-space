import { useTranslation } from '@fixnote/i18n'
import { cn } from '@fixnote/ui'
import type { Editor } from '@tiptap/core'
import type { Node as PmNode } from '@tiptap/pm/model'
import { TextSelection, type Transaction } from '@tiptap/pm/state'
import type { Step } from '@tiptap/pm/transform'
import { Bookmark, Link2, Type } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

export type PasteMode = 'bookmark' | 'link' | 'text'

const URL_ONLY = /^https?:\/\/[^\s<>"]+$/i

/** The clipboard text when it is a single web address, else null. */
export function pastedUrl(text: string): string | null {
  const url = text.trim()
  return URL_ONLY.test(url) ? url : null
}

/** A bookmark needs a top-level paragraph: only those show a card. */
function canBookmark(doc: PmNode, at: number) {
  const $at = doc.resolve(at)
  return $at.depth === 1 && $at.parent.type.name === 'paragraph'
}

/**
 * Inserts `url` at `at` in the chosen form and puts the caret after it:
 * - bookmark: the URL alone on its line, which shows a card; typing continues on the next line
 * - link: a link where the caret is, no card even when it is alone on its line
 * - text: plain text, not a link
 */
function insert(tr: Transaction, at: number, url: string, mode: PasteMode) {
  const { schema } = tr.doc.type
  const link = schema.marks.link?.create({ href: url })
  const $at = tr.doc.resolve(at)
  if (mode === 'text' || !link) {
    tr.insertText(url, at)
    return at + url.length
  }
  if (mode === 'link') {
    tr.insert(at, schema.text(url, [link]))
    const para = $at.parent
    if (para.type.name === 'paragraph' && para.content.size === 0) {
      tr.setNodeMarkup($at.before(), undefined, { ...para.attrs, plainLink: true })
    }
    return at + url.length
  }
  // Bookmark: split so the URL gets a line of its own, then continue on the line below.
  let start = at
  if ($at.parentOffset > 0) {
    tr.split(start)
    start += 2
  }
  tr.insert(start, schema.text(url, [link]))
  const end = start + url.length
  const rest = tr.doc.resolve(end)
  if (rest.parentOffset < rest.parent.content.size) {
    tr.split(end)
    return end + 2
  }
  const paragraph = schema.nodes.paragraph
  if (!paragraph) return end
  const after = rest.after()
  tr.insert(after, paragraph.create())
  return after + 1
}

export interface LinkPaste {
  url: string
  mode: PasteMode
  modes: PasteMode[]
  /** Where the menu opens (viewport coordinates of the caret). */
  left: number
  top: number
  /** Undoes the insertion, so another form can replace it. */
  inverse: Step[]
  at: number
}

/** Inserts a pasted URL in its default form and returns what the menu needs to change it. */
export function pasteUrl(editor: Editor, url: string): LinkPaste {
  const { state, view } = editor
  let tr = state.tr
  if (!tr.selection.empty) tr = tr.deleteSelection()
  const at = tr.selection.from
  const modes: PasteMode[] = canBookmark(tr.doc, at)
    ? ['bookmark', 'link', 'text']
    : ['link', 'text']
  const $at = tr.doc.resolve(at)
  // Bookmark on an empty line, like Anytype; inside text a link fits better.
  const mode: PasteMode =
    modes[0] === 'bookmark' && $at.parent.content.size === 0 ? 'bookmark' : 'link'
  const first = tr.steps.length
  const caret = insert(tr, at, url, mode)
  tr.setSelection(TextSelection.create(tr.doc, caret)).setMeta('linkPaste', true).scrollIntoView()
  const inverse = tr.steps
    .slice(first)
    .map((step, i) => step.invert(tr.docs[first + i] as PmNode))
    .reverse()
  view.dispatch(tr)
  const coords = view.coordsAtPos(Math.min(at + url.length, view.state.doc.content.size))
  return { url, mode, modes, left: coords.left, top: coords.bottom, inverse, at }
}

/** Replaces the pasted URL with another form of it. */
function switchMode(editor: Editor, paste: LinkPaste, mode: PasteMode): LinkPaste {
  const { view } = editor
  const tr = view.state.tr
  for (const step of paste.inverse) tr.step(step)
  const first = tr.steps.length
  const caret = insert(tr, paste.at, paste.url, mode)
  tr.setSelection(TextSelection.create(tr.doc, caret)).setMeta('linkPaste', true)
  const inverse = tr.steps
    .slice(first)
    .map((step, i) => step.invert(tr.docs[first + i] as PmNode))
    .reverse()
  view.dispatch(tr)
  view.focus()
  return { ...paste, mode, inverse }
}

const ICONS = { bookmark: Bookmark, link: Link2, text: Type } as const

/**
 * "Paste as" menu under a pasted URL: bookmark (a card), link or plain text. Arrow keys and Enter
 * pick; any other key, a click elsewhere or another edit closes it and keeps the current form.
 */
export function LinkPasteMenu({
  editor,
  paste,
  onChange,
  onClose,
}: {
  editor: Editor
  paste: LinkPaste
  onChange: (next: LinkPaste) => void
  onClose: () => void
}) {
  const { t } = useTranslation()
  const [active, setActive] = useState(paste.modes.indexOf(paste.mode))
  const activeRef = useRef(active)
  activeRef.current = active

  useEffect(() => {
    const pick = (mode: PasteMode | undefined) => {
      if (mode && mode !== paste.mode) onChange(switchMode(editor, paste, mode))
      onClose()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault()
        e.stopPropagation()
        const step = e.key === 'ArrowDown' ? 1 : -1
        setActive((i) => (i + step + paste.modes.length) % paste.modes.length)
      } else if (e.key === 'Enter') {
        e.preventDefault()
        e.stopPropagation()
        pick(paste.modes[activeRef.current])
      } else if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        onClose()
      } else if (!['Shift', 'Control', 'Alt', 'Meta'].includes(e.key)) onClose()
    }
    const onTransaction = ({ transaction }: { transaction: Transaction }) => {
      if (transaction.docChanged && !transaction.getMeta('linkPaste')) onClose()
    }
    const onPointer = (e: PointerEvent) => {
      if (!(e.target as Element | null)?.closest('[data-link-paste-menu]')) onClose()
    }
    window.addEventListener('keydown', onKey, true)
    window.addEventListener('pointerdown', onPointer, true)
    editor.on('transaction', onTransaction)
    return () => {
      window.removeEventListener('keydown', onKey, true)
      window.removeEventListener('pointerdown', onPointer, true)
      editor.off('transaction', onTransaction)
    }
  }, [editor, paste, onChange, onClose])

  return (
    <div
      data-link-paste-menu
      role="menu"
      aria-label={t('linkPaste.title')}
      className="fixed z-50 w-52 rounded-xl border bg-popover p-1 text-popover-foreground shadow-lg"
      style={{ left: paste.left, top: paste.top + 6 }}
      // Keep the editor focused: the menu is driven by the keyboard as well as the mouse.
      onMouseDown={(e) => e.preventDefault()}
    >
      <div className="px-2 pt-1 pb-1.5 text-xs text-muted-foreground">{t('linkPaste.title')}</div>
      {paste.modes.map((mode, i) => {
        const Icon = ICONS[mode]
        return (
          <button
            key={mode}
            type="button"
            role="menuitemradio"
            aria-checked={mode === paste.mode}
            onMouseEnter={() => setActive(i)}
            onClick={() => {
              if (mode !== paste.mode) onChange(switchMode(editor, paste, mode))
              onClose()
            }}
            className={cn(
              'flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm [&_svg]:size-4 [&_svg]:text-muted-foreground',
              i === active && 'bg-accent text-accent-foreground',
            )}
          >
            <Icon />
            {t(`linkPaste.${mode}`)}
          </button>
        )
      })}
    </div>
  )
}
