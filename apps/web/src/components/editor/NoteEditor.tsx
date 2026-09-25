import type { Note } from '@fixnote/core'
import { i18n, useTranslation } from '@fixnote/i18n'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
  isApple,
  MenuShortcut,
} from '@fixnote/ui'
import { Extension } from '@tiptap/core'
import { TaskItem, TaskList } from '@tiptap/extension-list'
import { Placeholder } from '@tiptap/extensions'
import { Markdown } from '@tiptap/markdown'
import { type Editor, EditorContent, useEditor, useEditorState } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import {
  Bold,
  Clipboard,
  Code,
  Copy,
  Heading1,
  Heading2,
  Italic,
  List,
  ListChecks,
  Scissors,
  Sparkles,
  Strikethrough,
  TextSelect,
} from 'lucide-react'
import { type Ref, useEffect, useImperativeHandle, useRef } from 'react'
import { toast } from 'sonner'
import { type AiEditHandle, AiEditLayer, useAiEdit } from './AiEdit'

export interface NoteEditorHandle {
  openAi: AiEditHandle['open']
  /** Dictated text: at the cursor while typing, otherwise as a new paragraph at the end. */
  insertText(text: string): void
}

import { AiRangeExtension } from './ai-range'

export type SaveState = 'idle' | 'saving' | 'saved'

/** Long text with no Markdown structure: paragraphs of prose, no headings or lists. */
function looksLikeDump(text: string) {
  if (text.length < 500) return false
  return !/^\s*(#{1,6}\s|[-*+]\s|\d+[.)]\s|>\s|```)/m.test(text)
}

const SAVE_DELAY = 400

/** `Ctrl+Shift+S` on Windows, `⇧⌘S` on macOS. */
function combo(key: string, opts: { shift?: boolean; alt?: boolean } = {}) {
  if (isApple) return `${opts.alt ? '⌥' : ''}${opts.shift ? '⇧' : ''}⌘${key}`
  return ['Ctrl', opts.alt && 'Alt', opts.shift && 'Shift', key].filter(Boolean).join('+')
}

function selectedText(editor: Editor) {
  const { from, to } = editor.state.selection
  return editor.state.doc.textBetween(from, to, '\n')
}

/** Editor right-click menu: clipboard, formatting and blocks, like a native text view. */
function EditorMenu({ editor, onAskAi }: { editor: Editor; onAskAi: () => void }) {
  const { t } = useTranslation()
  // Subscribed, so the menu reflects the selection and marks at the moment it opens.
  const state = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      hasSelection: !e.state.selection.empty,
      bold: e.isActive('bold'),
      italic: e.isActive('italic'),
      strike: e.isActive('strike'),
      code: e.isActive('code'),
      h1: e.isActive('heading', { level: 1 }),
      h2: e.isActive('heading', { level: 2 }),
      bulletList: e.isActive('bulletList'),
      taskList: e.isActive('taskList'),
    }),
  })
  const hasSelection = state.hasSelection
  const chain = () => editor.chain().focus()

  const copy = async (cut: boolean) => {
    await navigator.clipboard.writeText(selectedText(editor))
    if (cut) chain().deleteSelection().run()
    else editor.commands.focus()
  }
  const paste = async () => {
    try {
      const text = await navigator.clipboard.readText()
      chain().insertContent(text, { contentType: 'markdown' }).run()
    } catch {
      toast(i18n.t('menu.pasteBlocked'))
      editor.commands.focus()
    }
  }

  const items: (
    | {
        icon: typeof Bold
        label: string
        hint: string
        run: () => void
        disabled?: boolean
        active?: boolean
      }
    | 'sep'
  )[] = [
    {
      icon: Sparkles,
      label: t('menu.askAi'),
      hint: combo('E', { shift: true }),
      run: onAskAi,
    },
    'sep',
    {
      icon: Scissors,
      label: t('menu.cut'),
      hint: combo('X'),
      run: () => void copy(true),
      disabled: !hasSelection,
    },
    {
      icon: Copy,
      label: t('menu.copy'),
      hint: combo('C'),
      run: () => void copy(false),
      disabled: !hasSelection,
    },
    { icon: Clipboard, label: t('menu.paste'), hint: combo('V'), run: () => void paste() },
    {
      icon: TextSelect,
      label: t('menu.selectAll'),
      hint: combo('A'),
      run: () => chain().selectAll().run(),
    },
    'sep',
    {
      icon: Bold,
      label: t('menu.bold'),
      hint: combo('B'),
      run: () => chain().toggleBold().run(),
      active: state.bold,
    },
    {
      icon: Italic,
      label: t('menu.italic'),
      hint: combo('I'),
      run: () => chain().toggleItalic().run(),
      active: state.italic,
    },
    {
      icon: Strikethrough,
      label: t('menu.strike'),
      hint: combo('S', { shift: true }),
      run: () => chain().toggleStrike().run(),
      active: state.strike,
    },
    {
      icon: Code,
      label: t('menu.code'),
      hint: combo('E'),
      run: () => chain().toggleCode().run(),
      active: state.code,
    },
    'sep',
    {
      icon: Heading1,
      label: t('menu.heading1'),
      hint: combo('1', { alt: true }),
      run: () => chain().toggleHeading({ level: 1 }).run(),
      active: state.h1,
    },
    {
      icon: Heading2,
      label: t('menu.heading2'),
      hint: combo('2', { alt: true }),
      run: () => chain().toggleHeading({ level: 2 }).run(),
      active: state.h2,
    },
    {
      icon: List,
      label: t('menu.bulletList'),
      hint: combo('8', { shift: true }),
      run: () => chain().toggleBulletList().run(),
      active: state.bulletList,
    },
    {
      icon: ListChecks,
      label: t('menu.taskList'),
      hint: combo('9', { shift: true }),
      run: () => chain().toggleTaskList().run(),
      active: state.taskList,
    },
  ]

  return (
    <ContextMenuContent className="min-w-64 whitespace-nowrap">
      {items.map((it, i) =>
        it === 'sep' ? (
          // biome-ignore lint/suspicious/noArrayIndexKey: static list
          <ContextMenuSeparator key={i} />
        ) : (
          <ContextMenuItem
            key={it.label}
            disabled={it.disabled}
            onSelect={it.run}
            className={it.active ? 'text-brand [&_svg]:opacity-100' : undefined}
          >
            <it.icon />
            {it.label}
            <MenuShortcut>{it.hint}</MenuShortcut>
          </ContextMenuItem>
        ),
      )}
    </ContextMenuContent>
  )
}

/**
 * Live editor instances per note. React may unmount and remount the same editor right away
 * (StrictMode in dev, Suspense), so "the user left the note" is only true once no instance
 * remains after the current task.
 */
const mounted = new Map<string, number>()

/**
 * Markdown in, Markdown out. Mounted once per note (keyed by id): later query refreshes never reset
 * the document under the cursor. Saves are debounced and flushed on blur and unmount.
 */
export function NoteEditor({
  note,
  onSave,
  onStateChange,
  onLeave,
  ref,
}: {
  note: Note
  /** Lets the note header open the AI popover for the whole note. */
  ref?: Ref<NoteEditorHandle>
  /** Persists `markdown`, an edit that started from `base`; resolves with what was stored. */
  onSave: (markdown: string, base: string) => Promise<Note>
  onStateChange?: (state: SaveState) => void
  /** Called on unmount with the final Markdown. */
  onLeave?: (markdown: string) => void
}) {
  const { t } = useTranslation()
  const pending = useRef<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const latest = useRef(note.content)
  /** The stored text the current edit started from. */
  const base = useRef(note.content)
  const editorRef = useRef<Editor | null>(null)
  const openAi = useRef<AiEditHandle['open']>(() => undefined)
  const callbacks = useRef({ onSave, onStateChange, onLeave })
  callbacks.current = { onSave, onStateChange, onLeave }

  /** Swaps the document without firing a save, keeping the caret roughly where it was. */
  const replaceContent = useRef((markdown: string) => {
    const e = editorRef.current
    if (!e || e.isDestroyed) return
    const { from } = e.state.selection
    e.commands.setContent(markdown, { contentType: 'markdown', emitUpdate: false })
    e.commands.setTextSelection(Math.min(from, e.state.doc.content.size))
    latest.current = markdown
  }).current

  const flush = useRef(async () => {
    clearTimeout(timer.current)
    const markdown = pending.current
    if (markdown === null) return
    pending.current = null
    callbacks.current.onStateChange?.('saving')
    const saved = await callbacks.current.onSave(markdown, base.current)
    base.current = saved.content
    // The save merged in a change from another device: show it, unless the user kept typing.
    if (pending.current === null && saved.content !== markdown) replaceContent(saved.content)
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
      AiRangeExtension,
      Extension.create({
        name: 'aiShortcut',
        addKeyboardShortcuts: () => ({
          'Mod-Shift-e': () => {
            openAi.current('selection')
            return true
          },
        }),
      }),
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
      // A long unformatted paste (a dump from a chat or a dictation): offer to tidy it up.
      handlePaste: (_view, event) => {
        const text = event.clipboardData?.getData('text/plain') ?? ''
        if (looksLikeDump(text)) {
          setTimeout(() => {
            toast(t('ai.structureOffer'), {
              action: {
                label: t('ai.structureAction'),
                onClick: () => openAi.current('note', 'structure'),
              },
            })
          }, 0)
        }
        return false
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
  editorRef.current = editor
  const ai = useAiEdit(editor, note.title)
  openAi.current = ai.open
  useImperativeHandle(
    ref,
    () => ({
      openAi: (target, action) => openAi.current(target, action),
      insertText: (text) => {
        const e = editorRef.current
        if (!e || e.isDestroyed) return
        const { doc, selection } = e.state
        if (e.isFocused) {
          const before = selection.$from.parent.textBetween(0, selection.$from.parentOffset)
          const spaced = before && !/\s$/.test(before) ? ` ${text}` : text
          e.chain().focus().insertContent(spaced).run()
          return
        }
        const last = doc.lastChild
        if (last?.isTextblock && last.content.size === 0) {
          e.chain()
            .insertContentAt(doc.content.size - 1, text)
            .focus('end')
            .run()
        } else {
          e.chain()
            .insertContentAt(doc.content.size, {
              type: 'paragraph',
              content: [{ type: 'text', text }],
            })
            .focus('end')
            .run()
        }
      },
    }),
    [],
  )

  // Sync brought a newer version of this note: show it if there is no unsaved typing.
  useEffect(() => {
    if (pending.current !== null || note.content === base.current) return
    base.current = note.content
    replaceContent(note.content)
  }, [note.content, replaceContent])

  useEffect(() => {
    mounted.set(note.id, (mounted.get(note.id) ?? 0) + 1)
    return () => {
      mounted.set(note.id, (mounted.get(note.id) ?? 1) - 1)
      setTimeout(() => {
        if (mounted.get(note.id)) return
        mounted.delete(note.id)
        callbacks.current.onLeave?.(latest.current)
      }, 0)
    }
  }, [note.id])

  useEffect(() => {
    const onHide = () => void flush()
    window.addEventListener('pagehide', onHide)
    document.addEventListener('visibilitychange', onHide)
    return () => {
      window.removeEventListener('pagehide', onHide)
      document.removeEventListener('visibilitychange', onHide)
      void flush()
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
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <EditorContent editor={editor} />
        </ContextMenuTrigger>
        {editor ? <EditorMenu editor={editor} onAskAi={() => ai.open('selection')} /> : null}
      </ContextMenu>
      {editor ? <AiEditLayer editor={editor} ai={ai} /> : null}
    </div>
  )
}
