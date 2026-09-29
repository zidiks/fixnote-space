import { attachmentIdFromUrl, type Note, noteTasks, type Recurrence } from '@fixnote/core'
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
import { Extension, getMarkRange } from '@tiptap/core'
import Collaboration from '@tiptap/extension-collaboration'
import CollaborationCaret from '@tiptap/extension-collaboration-caret'
import { Placeholder } from '@tiptap/extensions'
import { type Editor, EditorContent, useEditor, useEditorState } from '@tiptap/react'
import { updateYFragment } from '@tiptap/y-tiptap'
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
  Repeat,
  Scissors,
  Sparkles,
  Strikethrough,
  TextSelect,
  Trash2,
} from 'lucide-react'
import { type Ref, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { toast } from 'sonner'
import { useAccount } from '../../lib/account/account'
import { providerLabel } from '../../lib/assistant/assistant'
import { registerOpenNote } from '../../lib/assistant/open-notes'
import {
  attachmentObjectUrl,
  ImageTooLargeError,
  saveAttachment,
  storeImage,
} from '../../lib/attachments'
import { LIVE_FIELD, type LiveEditing } from '../../lib/collab/live'
import { AI_FIELD, aiIn } from '../../lib/collab/people'
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
import { AiTyping, aiTypingKey, changedRange, revealRange } from './ai-typing'
import { LiveCarets } from './LiveCarets'
import { LinkCards, retryLinkCards } from './link-cards'
import { type LinkPaste, LinkPasteMenu, pastedUrl, pasteUrl } from './link-paste'
import { RepeatDialog } from './RepeatDialog'
import { RecurringTasks, repeatOf, setRepeat, type TaskTarget, taskAt } from './recurring'
import { RemoteFade } from './remote-fade'
import { noteSchema } from './schema'

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

/** A GFM table: a `| a | b |` row followed by its `| --- | --- |` rule. */
const MD_TABLE = /^\s*\|.*\|\s*\r?\n\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)+\|?\s*$/m

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
  onRepeat,
  onRemove,
  readOnly,
}: {
  editor: Editor
  /** View only: the menu offers copying and selecting, nothing that changes the note. */
  readOnly: boolean
  onAskAi: () => void
  onInsertImage: () => void
  /** Set when the menu was opened on a task of a daily note. */
  onRepeat?: () => void
  /** Set when the menu was opened on an attached file or an image. */
  onRemove?: { label: string; run: () => void }
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
  if (readOnly) {
    const keep = new Set<string>([t('menu.copy'), t('menu.selectAll')])
    items.splice(0, items.length, ...items.filter((it) => it !== 'sep' && keep.has(it.label)))
  } else {
    if (onRepeat)
      items.unshift({ icon: Repeat, label: t('repeat.menu'), hint: '', run: onRepeat }, 'sep')
    if (onRemove) items.unshift({ icon: Trash2, hint: '', ...onRemove }, 'sep')
  }

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

interface AttachmentRange {
  kind: 'file' | 'image'
  from: number
  to: number
}

/** The attached file chip or image under a right-click, as the document range it takes. */
function attachmentAt(editor: Editor, target: EventTarget | null): AttachmentRange | null {
  if (!(target instanceof Element)) return null
  const { view, state } = editor
  const chip = target.closest('a[href^="attachment:"]')
  const link = state.schema.marks.link
  if (chip && link) {
    const range = getMarkRange(state.doc.resolve(view.posAtDOM(chip, 0)), link)
    return range ? { kind: 'file', ...range } : null
  }
  const img = target.closest('img')
  if (!img) return null
  const pos = view.posAtDOM(img, 0)
  for (const at of [pos, pos - 1]) {
    const node = at >= 0 ? state.doc.nodeAt(at) : null
    if (node?.type.name === 'image') return { kind: 'image', from: at, to: at + node.nodeSize }
  }
  return null
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
  onRepeat,
  live,
  ref,
}: {
  note: Note
  /**
   * A shared note: the content comes from its Yjs document (and live room), not from
   * `note.content`. Fixed for the editor's lifetime (NoteView remounts it to switch).
   */
  live?: LiveEditing
  /** A task of this daily note got a new repeat rule (null: stopped repeating). */
  onRepeat?: (task: string, rule: Recurrence | null) => void
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
  const liveRef = useRef(live)
  /** This device is writing the assistant's change into the live document right now. */
  const aiApplying = useRef(false)
  // Shared with this account to view only: nothing here may change the note.
  const readOnly = Boolean(live?.readOnly || note.readOnly)
  const readOnlyRef = useRef(readOnly)
  readOnlyRef.current = readOnly
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
  const callbacks = useRef({ onSave, onStateChange, onLeave, onRepeat })
  callbacks.current = { onSave, onStateChange, onLeave, onRepeat }
  /** The task right-clicked in a daily note, and the one whose repeat is being edited. */
  const [menuTask, setMenuTask] = useState<TaskTarget | null>(null)
  /** The attached file or image right-clicked, as the range that removes it. */
  const [menuAttachment, setMenuAttachment] = useState<AttachmentRange | null>(null)
  const [repeatTask, setRepeatTask] = useState<(TaskTarget & { rule: Recurrence | null }) | null>(
    null,
  )

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
    // (Live, the room is what the editor shows; the database follows it.)
    if (!liveRef.current && pending.current === null && saved.content !== markdown)
      replaceContent(saved.content)
    if (pending.current === null) callbacks.current.onStateChange?.('saved')
  }).current

  const editor = useEditor({
    extensions: [
      ...noteSchema({
        // Live, undo is Yjs's own (only this device's changes are undone).
        live: Boolean(live),
        shouldAutoLink: (url) => !plainUrls.current.has(url),
        resolveImage: (id) => attachmentObjectUrl(images.current, id),
      }),
      Placeholder.configure({ placeholder: t('note.placeholder') }),
      AiRangeExtension,
      AiTyping.configure({
        // A shared note: the assistant's text types in for everyone in it.
        aiWriting: () =>
          aiApplying.current || Boolean(live && aiIn(live.session.awareness).some((a) => !a.self)),
      }),
      RecurringTasks,
      LinkCards.configure({
        load: (url) => links.current.load(url),
        open: (url) => links.current.open(url),
      }),
      ...(live
        ? [
            Collaboration.configure({ document: live.session.doc, field: LIVE_FIELD }),
            CollaborationCaret.configure({
              provider: live.session,
              user: live.user,
              // Drawn by LiveCarets over the text, so they can glide. The anchor stays in the
              // line (a zero-width character) so the caret's place can still be measured.
              render: () => {
                const el = document.createElement('span')
                el.className = 'live-caret-anchor'
                el.textContent = '\u2060'
                return el
              },
            }),
            RemoteFade.configure({
              aiWriting: () =>
                aiApplying.current || aiIn(live.session.awareness).some((a) => !a.self),
            }),
          ]
        : []),
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
    ...(live ? {} : { content: note.content, contentType: 'markdown' as const }),
    editable: !readOnly,
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
        // A Markdown table copied as plain text (from a chat, a README) becomes a table.
        if (e && !event.clipboardData?.getData('text/html') && MD_TABLE.test(text)) {
          e.chain().focus().insertContent(text, { contentType: 'markdown' }).run()
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
  openAi.current = (target, action) => {
    if (readOnlyRef.current) toast(i18n.t('people.viewOnly'))
    else ai.open(target, action)
  }
  useImperativeHandle(
    ref,
    () => ({
      openAi: (target, action) => openAi.current(target, action),
      insertDropped: (markdown, at) => {
        const e = editorRef.current
        if (!e || e.isDestroyed || !markdown.trim()) return
        if (readOnlyRef.current) {
          toast(i18n.t('people.viewOnly'))
          return
        }
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
        if (readOnlyRef.current) {
          toast(i18n.t('people.viewOnly'))
          return
        }
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

  // The assistant changes this note: the change types in where it happens. Solo, it is one step of
  // the editor (not saved again: it is stored already); in a shared note it goes into the live
  // document, so the others get it at once and nothing typed meanwhile overwrites it.
  useEffect(() => {
    if (readOnly) return
    let idle: ReturnType<typeof setTimeout> | undefined
    const awareness = () => liveRef.current?.session.awareness
    const unregister = registerOpenNote(note.id, {
      aiStarts: () => {
        clearTimeout(idle)
        const lv = liveRef.current
        lv?.session.awareness.setLocalStateField(AI_FIELD, { by: lv.user.name })
      },
      aiEnds: () => {
        clearTimeout(idle)
        // A moment longer, so the others see who wrote what they just saw appear.
        idle = setTimeout(() => awareness()?.setLocalStateField(AI_FIELD, null), 2500)
      },
      aiChanged: (after) => {
        const e = editorRef.current
        if (!e || e.isDestroyed) return false
        const parsed = e.markdown?.parse(after)
        if (!parsed) return false
        const next = e.schema.nodeFromJSON(parsed)
        const lv = liveRef.current
        if (lv) {
          const start = changedRange(e.state.doc, next)?.from
          aiApplying.current = true
          try {
            lv.session.doc.transact(() => {
              updateYFragment(lv.session.doc, lv.session.doc.getXmlFragment(LIVE_FIELD), next, {
                mapping: new Map(),
                isOMark: new Map(),
              })
            }, 'ai')
          } finally {
            aiApplying.current = false
          }
          if (start !== undefined) revealRange(e.view, start)
          return true
        }
        // Unsaved typing: the save merges the change in, as with any other.
        if (pending.current !== null) return false
        const range = changedRange(e.state.doc, next)
        base.current = after
        latest.current = after
        if (!range) return true
        const tr = e.state.tr
          .replace(range.from, range.toBefore, next.slice(range.from, range.toAfter))
          .setMeta('preventUpdate', true)
          .setMeta(aiTypingKey, { start: { from: range.from, to: range.toAfter } })
        e.view.dispatch(tr)
        revealRange(e.view, range.from)
        return true
      },
    })
    return () => {
      unregister()
      clearTimeout(idle)
      awareness()?.setLocalStateField(AI_FIELD, null)
    }
  }, [note.id, readOnly])

  // Sync brought a newer version of this note: show it if there is no unsaved typing. (Live, the
  // room is the source: the stored text is what the leading device wrote from it.)
  useEffect(() => {
    if (liveRef.current) {
      base.current = note.content
      return
    }
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
      className="relative min-h-[50vh] cursor-text pb-24"
      onMouseDown={(e) => {
        if (e.target !== e.currentTarget || !editor) return
        e.preventDefault()
        editor.commands.setTextSelection(editor.state.doc.content.size)
        editor.view.focus()
      }}
    >
      <ContextMenu>
        <ContextMenuTrigger
          asChild
          onContextMenu={(e) => {
            setMenuTask(editor && note.dailyDate ? taskAt(editor, e.clientX, e.clientY) : null)
            setMenuAttachment(editor ? attachmentAt(editor, e.target) : null)
          }}
        >
          <EditorContent editor={editor} />
        </ContextMenuTrigger>
        {editor ? (
          <EditorMenu
            editor={editor}
            readOnly={readOnly}
            onAskAi={() => ai.open('selection')}
            onInsertImage={() => fileInput.current?.click()}
            onRemove={
              menuAttachment
                ? {
                    label: t(
                      menuAttachment.kind === 'file' ? 'menu.deleteFile' : 'menu.deleteImage',
                    ),
                    run: () =>
                      editor
                        .chain()
                        .focus()
                        .deleteRange({ from: menuAttachment.from, to: menuAttachment.to })
                        .run(),
                  }
                : undefined
            }
            onRepeat={
              menuTask
                ? () => {
                    const target = { ...menuTask, rule: repeatOf(editor, menuTask.pos) }
                    // After the menu has closed, so the dialog gets focus.
                    setTimeout(() => setRepeatTask(target), 0)
                  }
                : undefined
            }
          />
        ) : null}
      </ContextMenu>
      {editor && live ? <LiveCarets editor={editor} awareness={live.session.awareness} /> : null}
      {editor && repeatTask && note.dailyDate ? (
        <RepeatDialog
          date={note.dailyDate}
          rule={repeatTask.rule}
          onClose={() => setRepeatTask(null)}
          onSave={(rule) => {
            setRepeatTask(null)
            if (editor.state.doc.nodeAt(repeatTask.pos)?.type.name !== 'taskItem') return
            setRepeat(editor, repeatTask.pos, rule)
            const task = noteTasks(editor.getMarkdown())[repeatTask.index]
            if (task) callbacks.current.onRepeat?.(task.text, rule)
          }}
        />
      ) : null}
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
