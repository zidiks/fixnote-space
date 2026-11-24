import {
  attachmentIdFromUrl,
  containsProtectedReference,
  type Note,
  noteTasks,
  type ProtectedReference,
  type ProtectionChange,
  parseProtectedReference,
  protectedReference,
  type Recurrence,
  redactProtectedReferences,
} from '@fixnote/core'
import { detectSecrets } from '@fixnote/core/privacy/detect'
import { i18n, useTranslation } from '@fixnote/i18n'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
  MenuShortcut,
} from '@fixnote/ui'
import { Extension, getMarkRange } from '@tiptap/core'
import Collaboration from '@tiptap/extension-collaboration'
import CollaborationCaret from '@tiptap/extension-collaboration-caret'
import { Placeholder } from '@tiptap/extensions'
import { Fragment, type Node as PmNode, Slice } from '@tiptap/pm/model'
import { type Editor, EditorContent, useEditor, useEditorState } from '@tiptap/react'
import { updateYFragment, yUndoPluginKey } from '@tiptap/y-tiptap'
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
  MessageSquarePlus,
  Repeat,
  ScanText,
  Scissors,
  Shield,
  ShieldOff,
  Sparkles,
  Strikethrough,
  TextSelect,
  Trash2,
} from 'lucide-react'
import { type Ref, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { toast } from 'sonner'
import * as Y from 'yjs'
import { useAccount } from '../../lib/account/account'
import { providerLabel, refreshAfterProtection, stop } from '../../lib/assistant/assistant'
import { useLlm } from '../../lib/assistant/llm'
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
import {
  discardProtectedFragment,
  dismissPrivacyFinding,
  loadProtectedFragment,
  protectedFragmentSaved,
  stageProtectedFragment,
} from '../../lib/privacy'
import { type AiEditHandle, AiEditLayer, useAiEdit } from './AiEdit'

export interface NoteEditorHandle {
  openAi: AiEditHandle['open']
  toggleComments(): void
  /** Dictated text: at the cursor while typing, otherwise as a new paragraph at the end. */
  insertText(text: string): void
  /**
   * Markdown dropped onto the window (images, files, links, text): as blocks next to the block
   * under the pointer, or at the end when the drop was not over the text.
   */
  insertDropped(markdown: string, at: { x: number; y: number } | null): void
}

import { AiRangeExtension, rangeMarkdown } from './ai-range'
import { AiTyping, aiTypingKey, changedRange, revealRange } from './ai-typing'
import { CommentsPanel } from './CommentsPanel'
import { CollapsibleLists } from './collapsible-lists'
import { combo } from './combo'
import { CommentsHighlight } from './comments-highlight'
import { ImageTextDialog } from './ImageTextDialog'
import { LiveCarets } from './LiveCarets'
import { LinkCards, retryLinkCards } from './link-cards'
import { type LinkPaste, LinkPasteMenu, pastedUrl, pasteUrl } from './link-paste'
import { PrivacyHighlight, PrivacyReview } from './PrivacyReview'
import type { ScanRange } from './privacy-scan'
import { ProtectedDisplay, type ProtectedTarget, protectedAt } from './protected-display'
import { protectedRangeText } from './protected-text'
import { RepeatDialog } from './RepeatDialog'
import { RecurringTasks, repeatOf, setRepeat, type TaskTarget, taskAt } from './recurring'
import { RemoteFade } from './remote-fade'
import { SlashMenu } from './SlashMenu'
import { noteSchema } from './schema'
import { useNoteComments } from './use-comments'

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

function selectedText(editor: Editor) {
  const { from, to } = editor.state.selection
  return redactProtectedReferences(editor.state.doc.textBetween(from, to, '\n'))
}

function redactClipboard(fragment: Fragment): Fragment {
  const children: PmNode[] = []
  fragment.forEach((node) => {
    if (node.isText && node.text && containsProtectedReference(node.text))
      children.push(node.type.schema.text(redactProtectedReferences(node.text), node.marks))
    else children.push(node.isLeaf ? node : node.copy(redactClipboard(node.content)))
  })
  return Fragment.fromArray(children)
}

/** Editor right-click menu: clipboard, formatting and blocks, like a native text view. */
function EditorMenu({
  editor,
  onAskAi,
  onComment,
  onInsertImage,
  onRepeat,
  onRemove,
  onImageText,
  onProtect,
  onUnprotect,
  readOnly,
}: {
  editor: Editor
  /** View only: the menu offers copying and selecting, nothing that changes the note. */
  readOnly: boolean
  onAskAi: () => void
  onComment: () => void
  onInsertImage: () => void
  onProtect: () => void
  /** Set when the menu was opened on a protected fragment. */
  onUnprotect?: () => void
  /** Set when the menu was opened on a task of a daily note. */
  onRepeat?: () => void
  /** Set when the menu was opened on an attached file or an image. */
  onRemove?: { label: string; run: () => void }
  /** Set when the menu was opened on an image: shows the text in it. */
  onImageText?: () => void
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
  // Reading the text changes nothing: offered in notes shared to view too.
  if (onImageText)
    items.unshift({ icon: ScanText, label: t('ocr.menu'), hint: '', run: onImageText }, 'sep')

  return (
    <ContextMenuContent className="min-w-64 whitespace-nowrap">
      {!readOnly && onUnprotect ? (
        <>
          <ContextMenuItem onSelect={onUnprotect}>
            <ShieldOff />
            {t('privacy.unprotect')}
          </ContextMenuItem>
          <ContextMenuSeparator />
        </>
      ) : null}
      {!readOnly && hasSelection ? (
        <ContextMenuItem onSelect={onComment}>
          <MessageSquarePlus />
          {t('comments.add')}
          <MenuShortcut>{combo('M', { alt: true })}</MenuShortcut>
        </ContextMenuItem>
      ) : null}
      {!readOnly && hasSelection && !onUnprotect ? (
        <ContextMenuItem onSelect={onProtect}>
          <Shield />
          {t('privacy.protect')}
        </ContextMenuItem>
      ) : null}
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
  onCommentCount,
  onLeave,
  onRepeat,
  onProtected,
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
  onSave: (markdown: string, base: string, protect?: ProtectionChange) => Promise<Note>
  onProtected: () => void
  onStateChange?: (state: SaveState) => void
  onCommentCount?: (openCount: number) => void
  /** Called on unmount with the final Markdown. */
  onLeave?: (markdown: string) => void
}) {
  const { t } = useTranslation()
  // Keep immutable document snapshots while typing; serialize only at the save boundary.
  const pending = useRef<PmNode | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const latest = useRef<string | PmNode>(note.content)
  const saves = useRef<Promise<unknown>>(Promise.resolve())
  const saving = useRef(0)
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
  const stopInlineAi = useRef<() => void>(() => undefined)
  const selectCommentRef = useRef<(threadId: string) => void>(() => undefined)
  const startCommentRef = useRef<() => void>(() => undefined)
  const toggleCommentsRef = useRef<() => void>(() => undefined)
  const platform = usePlatform()
  const loadPreview = useLoadPreview()
  const { attachments, audit, driver, repo } = useDb()
  const [manualPrivacy, setManualPrivacy] = useState<ScanRange | null>(null)
  const protectRef = useRef<
    (
      range: ScanRange,
      audience: ProtectedReference['audience'],
      edit?: { reference: string; text: string },
    ) => Promise<void>
  >(async () => undefined)
  const protecting = useRef(false)
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
  /** The protected fragment right-clicked (to restore it as ordinary text). */
  const [menuProtected, setMenuProtected] = useState<ProtectedTarget | null>(null)
  /** The image whose text is shown (its attachment id). */
  const [imageText, setImageText] = useState<string | null>(null)
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
    const doc = pending.current
    const manager = editorRef.current?.markdown
    if (doc === null || !manager) return
    const markdown = manager.serialize(doc.toJSON())
    if (latest.current === doc) latest.current = markdown
    pending.current = null
    saving.current++
    // A slow save may overlap the next pause/blur. Queue writes so each starts from the result
    // of the preceding save, and an older response never replaces newer typing.
    const write = saves.current
      .then(async () => {
        callbacks.current.onStateChange?.('saving')
        const saved = await callbacks.current.onSave(markdown, base.current)
        base.current = saved.content
        if (
          !liveRef.current &&
          saving.current === 1 &&
          pending.current === null &&
          latest.current === markdown &&
          saved.content !== markdown
        )
          replaceContent(saved.content)
        if (saving.current === 1 && pending.current === null)
          callbacks.current.onStateChange?.('saved')
      })
      .finally(() => {
        saving.current--
      })
    saves.current = write.catch(() => undefined)
    await write
  }).current

  const editor = useEditor({
    // Toolbar state uses useEditorState; typing need not render the whole editor's React tree.
    shouldRerenderOnTransaction: false,
    extensions: [
      ...noteSchema({
        // Live, undo is Yjs's own (only this device's changes are undone).
        live: Boolean(live),
        shouldAutoLink: (url) => !plainUrls.current.has(url),
        resolveImage: (id) => attachmentObjectUrl(images.current, id),
      }),
      Placeholder.configure({ placeholder: t('note.placeholder') }),
      AiRangeExtension,
      PrivacyHighlight,
      ProtectedDisplay.configure({
        canEdit: () => !readOnlyRef.current,
        save: (ref, from, text) => {
          const reference = protectedReference(ref)
          return protectRef.current({ from, to: from + reference.length }, ref.audience, {
            text,
            reference,
          })
        },
        load: (ref) =>
          loadProtectedFragment(
            ref,
            noteRef.current.sharedId ?? undefined,
            !useLlm.getState().localOnly,
          ),
      }),
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
      CommentsHighlight.configure({
        onSelectThread: (threadId) => selectCommentRef.current(threadId),
      }),
      CollapsibleLists.configure({ noteId: note.id }),
      Extension.create({
        name: 'aiShortcut',
        addKeyboardShortcuts: () => ({
          'Mod-Shift-e': () => {
            openAi.current('selection')
            return true
          },
          'Mod-Alt-m': () => {
            startCommentRef.current()
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
      transformCopied: (slice) =>
        new Slice(redactClipboard(slice.content), slice.openStart, slice.openEnd),
      clipboardTextSerializer: (_slice, view) => {
        const { from, to } = view.state.selection
        const text = view.state.doc.textBetween(from, to, '\n\n')
        // The default Tiptap serializer reads the original selection from the view.
        return containsProtectedReference(text) ? redactProtectedReferences(text) : ''
      },
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
      if (protecting.current) return
      latest.current = e.state.doc
      pending.current = e.state.doc
      clearTimeout(timer.current)
      timer.current = setTimeout(() => void flush(), SAVE_DELAY)
    },
    onBlur: () => void flush(),
  })
  editorRef.current = editor

  const protect = async (
    range: ScanRange,
    audience: ProtectedReference['audience'],
    edit?: { reference: string; text: string },
  ) => {
    const e = editorRef.current
    if (!e || e.isDestroyed || !e.isEditable || protecting.current) throw new Error('Cannot edit')
    if (audience === 'members' && !live) throw new Error('Missing shared note')
    const original = e.state.doc
    const previousValue = protectedRangeText(original, range)
    const clear = edit?.text ?? previousValue
    const selected = edit ? edit.text : rangeMarkdown(e, range)
    if (
      !clear.trim() ||
      (edit ? previousValue !== edit.reference : containsProtectedReference(selected))
    )
      throw new Error('Invalid selection')
    // Crypto and the save are asynchronous. Keep the captured range tied to this exact document.
    e.setEditable(false, false)
    stop()
    stopInlineAi.current()
    let ref: ProtectedReference | undefined
    let savingReference = false
    try {
      await flush()
      await saves.current
      if (e.isDestroyed || e.state.doc !== original) throw new Error('Note changed')
      ref = await stageProtectedFragment(
        driver,
        { text: clear, markdown: selected },
        audience,
        live?.sharedId,
      )
      if (e.isDestroyed || e.state.doc !== original) throw new Error('Note changed')
      const tr = e.state.tr
        .replaceWith(range.from, range.to, e.schema.text(protectedReference(ref)))
        .setMeta('privacyReferenceChange', true)
        .setMeta('addToHistory', false)
        .setMeta('preventUpdate', true)
      const markdown = e.markdown?.serialize(tr.doc.toJSON())
      if (!markdown?.includes(protectedReference(ref)))
        throw new Error('Invalid fragment reference')
      const change = {
        fragmentId: ref.fragmentId,
        reference: protectedReference(ref),
        values: edit ? [] : [clear, selected],
        retiredShared: (() => {
          const old = edit ? parseProtectedReference(edit.reference) : null
          return old?.audience === 'members' && live && edit && !markdown.includes(edit.reference)
            ? { fragmentId: old.fragmentId, sharedId: live.sharedId }
            : undefined
        })(),
      }
      const previous = base.current
      protecting.current = true
      savingReference = true
      if (live) {
        // Clone first, then save and apply the reference-bearing Yjs update after the commit.
        const draft = new Y.Doc()
        try {
          Y.applyUpdate(draft, Y.encodeStateAsUpdate(live.session.doc))
          updateYFragment(draft, draft.getXmlFragment(LIVE_FIELD), tr.doc, {
            mapping: new Map(),
            isOMark: new Map(),
          })
          yUndoPluginKey.getState(e.state)?.undoManager.clear()
          await live.persistProtection(markdown, Y.encodeStateAsUpdate(draft), previous, change)
          yUndoPluginKey.getState(e.state)?.undoManager.clear()
          const saved = await repo.getNote(note.id)
          if (saved) base.current = saved.content
          onProtected()
        } finally {
          draft.destroy()
        }
      } else {
        const saved = await callbacks.current.onSave(markdown, previous, change)
        base.current = saved.content
        pending.current = null
        latest.current = saved.content
        if (!e.isDestroyed) e.view.dispatch(tr)
        onProtected()
      }
      latest.current = base.current
      pending.current = null
      protectedFragmentSaved()
      void refreshAfterProtection(note.id)
    } catch (error) {
      if (ref && !savingReference)
        await discardProtectedFragment(driver, ref).catch(() => undefined)
      throw error
    } finally {
      protecting.current = false
      if (!e.isDestroyed && !readOnlyRef.current) e.setEditable(true, false)
    }
  }
  protectRef.current = protect

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
  stopInlineAi.current = ai.close
  openAi.current = (target, action) => {
    if (readOnlyRef.current) toast(i18n.t('people.viewOnly'))
    else ai.open(target, action)
  }
  const comments = useNoteComments({
    editor,
    note,
    live,
    readOnly,
    onOpenCountChange: onCommentCount,
  })
  selectCommentRef.current = comments.selectThread
  startCommentRef.current = comments.startDraft
  toggleCommentsRef.current = comments.toggleOpen

  useImperativeHandle(
    ref,
    () => ({
      openAi: (target, action) => openAi.current(target, action),
      toggleComments: () => toggleCommentsRef.current(),
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
          // Stored with the note's new text at once, so it is not taken in a second time as an
          // edit made outside the editor.
          void lv.persist(e.getMarkdown(), { taken: true })
          if (start !== undefined) revealRange(e.view, start)
          return true
        }
        // Unsaved typing: the save merges the change in, as with any other.
        if (pending.current !== null || saving.current > 0) return false
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
  // room is the source: the stored text is what the leading device wrote from it. A change made
  // outside the editor (MCP, Telegram) comes in with a save, here at once when nothing is typed.)
  useEffect(() => {
    if (saving.current > 0) return
    const lv = liveRef.current
    if (lv) {
      base.current = note.content
      if (
        !lv.readOnly &&
        pending.current === null &&
        typeof latest.current === 'string' &&
        note.content !== latest.current
      )
        void lv.persist(latest.current)
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
        const value = latest.current
        const markdown =
          typeof value === 'string' ? value : editorRef.current?.markdown?.serialize(value.toJSON())
        if (markdown !== undefined) callbacks.current.onLeave?.(markdown)
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

  const unprotect = async (target: ProtectedTarget) => {
    const e = editorRef.current
    if (!e || e.isDestroyed || !e.isEditable || protecting.current) return
    const plain = await loadProtectedFragment(
      target.ref,
      live?.sharedId,
      !useLlm.getState().localOnly,
    ).catch(() => null)
    if (plain === null) {
      toast.error(t('privacy.unavailable'))
      return
    }
    if (e.isDestroyed) return
    const current = protectedRangeText(e.state.doc, { from: target.from, to: target.to })
    if (current !== target.reference) return
    // Suppress automatic re-detection of the passage the user just explicitly unprotected.
    for (const hit of detectSecrets(plain)) {
      void dismissPrivacyFinding(driver, note.id, hit.kind, plain.slice(hit.from, hit.to)).catch(
        () => undefined,
      )
    }
    const lines = plain.replace(/\r\n?/g, '\n').split('\n')
    const nodes: PmNode[] = []
    const hardBreak = e.schema.nodes.hardBreak
    lines.forEach((line, i) => {
      if (i > 0 && hardBreak) nodes.push(hardBreak.create())
      if (line) nodes.push(e.schema.text(line))
    })
    const tr = e.state.tr
      .replaceWith(target.from, target.to, nodes.length ? nodes : e.schema.text(plain))
      .setMeta('privacyReferenceChange', true)
    e.view.dispatch(tr)
    e.view.focus()
  }

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
            setMenuProtected(editor ? protectedAt(editor, e.target) : null)
          }}
        >
          <EditorContent editor={editor} />
        </ContextMenuTrigger>
        {editor ? (
          <EditorMenu
            editor={editor}
            readOnly={readOnly}
            onAskAi={() => ai.open('selection')}
            onComment={comments.startDraft}
            onInsertImage={() => fileInput.current?.click()}
            onProtect={() => {
              const { from, to } = editor.state.selection
              setManualPrivacy({ from, to })
            }}
            onUnprotect={menuProtected ? () => void unprotect(menuProtected) : undefined}
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
            onImageText={
              menuAttachment?.kind === 'image' && platform.ocr
                ? () => {
                    const src = editor.state.doc.nodeAt(menuAttachment.from)?.attrs.src
                    const id = typeof src === 'string' ? attachmentIdFromUrl(src) : null
                    // After the menu has closed, so the dialog gets focus.
                    if (id) setTimeout(() => setImageText(id), 0)
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
      {imageText ? <ImageTextDialog id={imageText} onClose={() => setImageText(null)} /> : null}
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
      {editor ? (
        <AiEditLayer
          editor={editor}
          ai={ai}
          onComment={!readOnly ? comments.startDraft : undefined}
        />
      ) : null}
      <CommentsPanel
        open={comments.open}
        readOnly={readOnly}
        isShared={Boolean(live)}
        currentUserId={comments.currentUserId}
        threads={comments.threads}
        activeThreadId={comments.activeThreadId}
        unreadThreadIds={comments.unreadThreadIds}
        orphanThreadIds={comments.orphanThreadIds}
        collaborators={comments.collaborators}
        draft={comments.draft}
        onClose={comments.close}
        onSelectThread={comments.selectThread}
        onCreateThread={comments.createThread}
        onCancelDraft={comments.cancelDraft}
        onReply={comments.reply}
        onSetStatus={comments.setStatus}
        onDeleteMessage={comments.deleteMessage}
      />
      {editor && !readOnly ? (
        <SlashMenu editor={editor} onInsertImage={() => fileInput.current?.click()} />
      ) : null}
      {editor && !readOnly ? (
        <PrivacyReview
          editor={editor}
          noteId={note.id}
          shared={Boolean(live)}
          manual={manualPrivacy}
          onProtect={protect}
        />
      ) : null}
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
