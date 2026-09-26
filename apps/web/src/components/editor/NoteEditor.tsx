import { attachmentIdFromUrl, type Note } from '@fixnote/core'
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
  ImagePlus,
  Italic,
  List,
  ListChecks,
  Scissors,
  Sparkles,
  Strikethrough,
  TextSelect,
} from 'lucide-react'
import { type Ref, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { toast } from 'sonner'
import { useAccount } from '../../lib/account/account'
import { providerLabel } from '../../lib/assistant/assistant'
import {
  attachmentObjectUrl,
  ImageTooLargeError,
  saveAttachment,
  storeImage,
} from '../../lib/attachments'
import { useDb } from '../../lib/db'
import { useLoadPreview } from '../../lib/links'
import { usePlatform } from '../../lib/platform'
import { type AiEditHandle, AiEditLayer, useAiEdit } from './AiEdit'

export interface NoteEditorHandle {
  openAi: AiEditHandle['open']
  /** Dictated text: at the cursor while typing, otherwise as a new paragraph at the end. */
  insertText(text: string): void
  /**
   * Markdown dropped onto the window (images, files, links, text): as blocks next to the block
   * under the pointer, or at the end when the drop was not over the text.
   */
  insertDropped(markdown: string, at: { x: number; y: number } | null): void
}

import { AiRangeExtension } from './ai-range'
import { AttachmentImage } from './attachment-image'
import { LinkCards, retryLinkCards } from './link-cards'
import { type LinkPaste, LinkPasteMenu, pastedUrl, pasteUrl } from './link-paste'
import { ImageAwareParagraph } from './paragraph'

export type SaveState = 'idle' | 'saving' | 'saved'

/** Images in a paste or drop. Some webviews list a pasted image only under `items`. */
function imageFiles(data: DataTransfer | null): File[] {
  if (!data) return []
  const files = [...data.files].filter((f) => f.type.startsWith('image/'))
  if (files.length) return files
  return [...data.items]
    .filter((item) => item.kind === 'file' && item.type.startsWith('image/'))
    .map((item) => item.getAsFile())
    .filter((f): f is File => f !== null)
}

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
function EditorMenu({
  editor,
  onAskAi,
  onInsertImage,
}: {
  editor: Editor
  onAskAi: () => void
  onInsertImage: () => void
}) {
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
    { icon: ImagePlus, label: t('menu.insertImage'), hint: '', run: onInsertImage },
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
            {it.hint ? <MenuShortcut>{it.hint}</MenuShortcut> : null}
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
  const noteRef = useRef(note)
  noteRef.current = note
  const openAi = useRef<AiEditHandle['open']>(() => undefined)
  const platform = usePlatform()
  const loadPreview = useLoadPreview()
  const { attachments, audit } = useDb()
  const images = useRef(attachments)
  images.current = attachments
  const links = useRef({
    load: loadPreview,
    open: (url: string) => void platform.openExternal(url),
  })
  links.current = { load: loadPreview, open: (url: string) => void platform.openExternal(url) }
  const [linkPaste, setLinkPaste] = useState<LinkPaste | null>(null)
  const closeLinkPaste = useCallback(() => setLinkPaste(null), [])
  /** URLs kept as plain text: typing a space after one must not turn it back into a link. */
  const plainUrls = useRef(new Set<string>())
  const changeLinkPaste = useCallback((next: LinkPaste) => {
    if (next.mode === 'text') plainUrls.current.add(next.url)
    setLinkPaste(next)
  }, [])
  const fileInput = useRef<HTMLInputElement>(null)
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
        paragraph: false,
        heading: { levels: [1, 2, 3] },
        link: {
          openOnClick: false,
          autolink: true,
          linkOnPaste: true,
          // Files dropped into a note are links to attachment:<id>.
          protocols: ['attachment'],
          shouldAutoLink: (url) => !plainUrls.current.has(url),
        },
      }),
      ImageAwareParagraph,
      TaskList,
      TaskItem.configure({ nested: true }),
      Placeholder.configure({ placeholder: t('note.placeholder') }),
      Markdown,
      AiRangeExtension,
      AttachmentImage.configure({
        resolve: (id) => attachmentObjectUrl(images.current, id),
      }),
      LinkCards.configure({
        load: (url) => links.current.load(url),
        open: (url) => links.current.open(url),
      }),
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
    onCreate: ({ editor: e }) => {
      // URLs stored as plain text stay text when the user types next to them.
      e.state.doc.descendants((node) => {
        if (!node.isText || node.marks.some((m) => m.type.name === 'link')) return
        for (const url of node.text?.match(/https?:\/\/[^\s<>"]+/g) ?? [])
          plainUrls.current.add(url)
      })
    },
    autofocus: note.content.trim() ? false : 'end',
    editorProps: {
      attributes: {
        class: 'fixnote-editor',
        spellcheck: 'true',
        'aria-label': note.title || t('common.untitled'),
      },
      // A click opens a link in the browser (an attached file: saves it); Alt/Option+click places
      // the caret in the link to edit it.
      handleClick: (_view, _pos, event) => {
        if (event.altKey || event.button !== 0) return false
        const target = event.target instanceof Element ? event.target : null
        const anchor = target?.closest('a[href]')
        const href = anchor?.getAttribute('href')
        if (!href) return false
        const fileId = attachmentIdFromUrl(href)
        if (fileId) {
          void saveAttachment(images.current, fileId, anchor?.textContent?.trim() || 'file')
          return true
        }
        if (!/^https?:\/\//i.test(href)) return false
        links.current.open(href)
        return true
      },
      // A long unformatted paste (a dump from a chat or a dictation): offer to tidy it up.
      handlePaste: (_view, event) => {
        const files = imageFiles(event.clipboardData)
        if (files.length) {
          void insertImages(files)
          return true
        }
        const text = event.clipboardData?.getData('text/plain') ?? ''
        // A lone URL: inserted as a bookmark or a link, with a menu to pick another form.
        const url = pastedUrl(text)
        const e = editorRef.current
        if (url && e && !e.isActive('code') && !e.isActive('codeBlock')) {
          setLinkPaste(pasteUrl(e, url))
          return true
        }
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

  const insertImages = async (files: File[], at?: number) => {
    for (const file of files) {
      try {
        const src = await storeImage(images.current, file)
        const e = editorRef.current
        if (!e || e.isDestroyed) return
        // An empty paragraph after it, so text typed next goes below the image.
        const node = [{ type: 'image', attrs: { src, alt: '' } }, { type: 'paragraph' }]
        if (at === undefined) e.chain().focus().insertContent(node).run()
        else e.chain().focus().insertContentAt(at, node).run()
      } catch (err) {
        toast.error(
          err instanceof ImageTooLargeError
            ? t('note.imageTooLarge')
            : t('note.imageFailed', { message: err instanceof Error ? err.message : String(err) }),
        )
      }
    }
  }
  const ai = useAiEdit(
    editor,
    note.title,
    useCallback(
      (before: string, after: string) => {
        const folderId = noteRef.current.folderId
        void audit.record(
          {
            kind: 'edit',
            summary: t('tidy.logEdit', { note: noteRef.current.title || t('common.untitled') }),
            provider: providerLabel(),
          },
          [
            {
              noteId: noteRef.current.id,
              before: { content: before, folderId },
              after: { content: after, folderId },
            },
          ],
        )
      },
      [audit, t],
    ),
  )
  openAi.current = ai.open
  useImperativeHandle(
    ref,
    () => ({
      openAi: (target, action) => openAi.current(target, action),
      insertDropped: (markdown, at) => {
        const e = editorRef.current
        if (!e || e.isDestroyed || !markdown.trim()) return
        const { doc } = e.state
        // After the top-level block under the pointer, so text is never split mid-line.
        const hit = at ? e.view.posAtCoords({ left: at.x, top: at.y }) : null
        let pos = doc.content.size
        if (hit) {
          const $pos = doc.resolve(hit.pos)
          pos = $pos.depth > 0 ? $pos.after(1) : hit.pos
        }
        const last = doc.lastChild
        // An empty last line takes the drop instead of staying below it.
        if (!hit && last?.type.name === 'paragraph' && last.content.size === 0) {
          pos = doc.content.size - last.nodeSize
        }
        e.chain().insertContentAt(pos, markdown.trim(), { contentType: 'markdown' }).run()
        // One empty line at the end, to keep typing below what was dropped.
        const end = e.state.doc.lastChild
        if (end?.type.name !== 'paragraph' || end.content.size > 0) {
          e.chain().insertContentAt(e.state.doc.content.size, { type: 'paragraph' }).run()
        }
        e.commands.focus()
      },
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

  // Signing in lets the web app read pages: fill in the link cards that could not load before.
  const accountPhase = useAccount((s) => s.phase)
  useEffect(() => {
    if (accountPhase === 'ready' && editor && !editor.isDestroyed) retryLinkCards(editor.view)
  }, [accountPhase, editor])

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
        {editor ? (
          <EditorMenu
            editor={editor}
            onAskAi={() => ai.open('selection')}
            onInsertImage={() => fileInput.current?.click()}
          />
        ) : null}
      </ContextMenu>
      {editor ? <AiEditLayer editor={editor} ai={ai} /> : null}
      {editor && linkPaste ? (
        <LinkPasteMenu
          editor={editor}
          paste={linkPaste}
          onChange={changeLinkPaste}
          onClose={closeLinkPaste}
        />
      ) : null}
      <input
        ref={fileInput}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => {
          const files = [...(e.currentTarget.files ?? [])].filter((f) =>
            f.type.startsWith('image/'),
          )
          e.currentTarget.value = ''
          if (files.length) void insertImages(files)
        }}
      />
    </div>
  )
}
