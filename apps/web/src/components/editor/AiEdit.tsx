import type { EditAction } from '@fixnote/ai'
import { type DiffPart, diffWords } from '@fixnote/core'
import { useTranslation } from '@fixnote/i18n'
import {
  Button,
  cn,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  isApple,
  Kbd,
} from '@fixnote/ui'
import type { Editor } from '@tiptap/react'
import { BubbleMenu } from '@tiptap/react/menus'
import {
  ArrowUp,
  CheckCheck,
  FilePlus2,
  LayoutList,
  Scissors,
  Sparkles,
  SpellCheck,
  Trash2,
  WandSparkles,
} from 'lucide-react'
import { type ReactNode, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { useUi } from '../../app/store'
import { unavailableText } from '../../lib/assistant/assistant'
import { proposeEdit } from '../../lib/assistant/edit'
import type { LlmUnavailable } from '../../lib/assistant/llm'
import { useRepo } from '../../lib/db'
import { useInvalidateNotes } from '../../lib/queries'
import {
  type AiRange,
  getAiRange,
  rangeMarkdown,
  replaceWithMarkdown,
  setAiRange,
} from './ai-range'

type Target = 'selection' | 'note'

type Phase =
  | { kind: 'ask' }
  | { kind: 'running'; text: string }
  | { kind: 'review'; proposal: string }
  | { kind: 'error'; message: string }
  | { kind: 'unavailable'; reason: LlmUnavailable }

interface Session {
  target: Target
  original: string
  phase: Phase
  last?: { action: EditAction; instruction?: string }
}

export interface AiEditHandle {
  /** Opens the AI popover for the selection, or for the whole note when nothing is selected. */
  open(target?: Target, action?: EditAction): void
}

const CONTEXT_CHARS = 600

/**
 * The AI edit flow: select text (or take the whole note), pick an action or type an instruction,
 * review the suggestion as a word diff, accept or reject. Nothing touches the note before Accept,
 * and an accepted edit is one undo step.
 */
export function useAiEdit(
  editor: Editor | null,
  noteTitle: string,
  /** An accepted edit, as whole-note Markdown before and after (for the AI activity log). */
  onApplied?: (before: string, after: string) => void,
) {
  const { t } = useTranslation()
  const [session, setSession] = useState<Session | null>(null)
  const controller = useRef<AbortController | null>(null)
  const sessionRef = useRef(session)
  sessionRef.current = session

  const update = useCallback(
    (patch: Partial<Session>) => setSession((s) => (s ? { ...s, ...patch } : s)),
    [],
  )

  const close = useCallback(() => {
    controller.current?.abort()
    controller.current = null
    if (editor && !editor.isDestroyed) {
      setAiRange(editor, null)
      editor.commands.focus()
    }
    setSession(null)
  }, [editor])

  const run = useCallback(
    async (action: EditAction, instruction?: string) => {
      const s = sessionRef.current
      const range = editor ? getAiRange(editor) : null
      if (!editor || !s || !range) return
      controller.current?.abort()
      const ctrl = new AbortController()
      controller.current = ctrl
      update({ phase: { kind: 'running', text: '' }, last: { action, instruction } })
      const doc = editor.state.doc
      try {
        const result = await proposeEdit(
          {
            action,
            instruction,
            text: s.original,
            noteTitle,
            before: doc.textBetween(Math.max(0, range.from - CONTEXT_CHARS), range.from, '\n'),
            after: doc.textBetween(
              range.to,
              Math.min(doc.content.size, range.to + CONTEXT_CHARS),
              '\n',
            ),
          },
          {
            signal: ctrl.signal,
            onText: (text) => update({ phase: { kind: 'running', text } }),
          },
        )
        if (ctrl.signal.aborted) return
        update({
          phase:
            result.kind === 'ok'
              ? { kind: 'review', proposal: result.text }
              : { kind: 'unavailable', reason: result.reason },
        })
      } catch (err) {
        if (ctrl.signal.aborted) {
          if (controller.current === ctrl || controller.current === null)
            update({ phase: { kind: 'ask' } })
          return
        }
        update({
          phase: {
            kind: 'error',
            message: t('ai.error', { message: err instanceof Error ? err.message : String(err) }),
          },
        })
      } finally {
        if (controller.current === ctrl) controller.current = null
      }
    },
    [editor, noteTitle, t, update],
  )

  const open = useCallback(
    (target: Target = 'selection', action?: EditAction) => {
      if (!editor || editor.isDestroyed) return
      const { from, to, empty } = editor.state.selection
      const whole = target === 'note' || empty
      const range: AiRange = whole ? { from: 0, to: editor.state.doc.content.size } : { from, to }
      setAiRange(editor, range)
      const original = rangeMarkdown(editor, range)
      const next: Session = {
        target: whole ? 'note' : 'selection',
        original,
        phase: { kind: 'ask' },
      }
      sessionRef.current = next
      setSession(next)
      if (action) void run(action)
    },
    [editor, run],
  )

  const accept = useCallback(() => {
    const s = sessionRef.current
    if (!editor || !s || s.phase.kind !== 'review') return
    const range = getAiRange(editor)
    if (!range || rangeMarkdown(editor, range) !== s.original) {
      update({ phase: { kind: 'error', message: t('ai.changed') } })
      return
    }
    const before = editor.getMarkdown()
    replaceWithMarkdown(editor, range, s.phase.proposal)
    onApplied?.(before, editor.getMarkdown())
    setSession(null)
    editor.commands.focus()
  }, [editor, t, update, onApplied])

  const stop = useCallback(() => {
    controller.current?.abort()
  }, [])

  // Leaving the note closes the popover and cancels a request in flight.
  useEffect(() => () => controller.current?.abort(), [])

  return { session, open, run, accept, close, stop }
}

type AiEdit = ReturnType<typeof useAiEdit>

const mod = isApple ? '⌘' : 'Ctrl'

function DiffSpan({ part }: { part: DiffPart }) {
  if (part.kind === 'same') return <span>{part.text}</span>
  if (part.kind === 'del')
    return (
      <del className="rounded-sm bg-destructive/12 text-destructive line-through decoration-destructive/60">
        {part.text}
      </del>
    )
  return <ins className="rounded-sm bg-success/15 text-success no-underline">{part.text}</ins>
}

function DiffView({ parts }: { parts: DiffPart[] }) {
  return (
    <div className="max-h-72 overflow-y-auto whitespace-pre-wrap break-words px-3 py-2.5 text-sm leading-relaxed">
      {parts.map((p, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: diff parts have no identity and never reorder
        <DiffSpan key={i} part={p} />
      ))}
    </div>
  )
}

function ActionButton({
  icon: Icon,
  label,
  onClick,
  danger,
}: {
  icon: typeof Sparkles
  label: string
  onClick: () => void
  danger?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-sm outline-none hover:bg-accent focus-visible:bg-accent [&_svg]:size-4 [&_svg]:text-muted-foreground',
        danger && 'text-destructive [&_svg]:text-destructive',
      )}
    >
      <Icon />
      {label}
    </button>
  )
}

/** What the popover shows in each phase; shared by the selection popover and the note dialog. */
function AiEditBody({
  ai,
  onNewNote,
  onDelete,
}: {
  ai: AiEdit
  onNewNote: () => void
  onDelete: () => void
}) {
  const { t } = useTranslation()
  const openSettings = useUi((s) => s.openSettings)
  const [instruction, setInstruction] = useState('')
  const s = ai.session
  if (!s) return null
  const phase = s.phase
  const retry = () => (s.last ? void ai.run(s.last.action, s.last.instruction) : undefined)

  if (phase.kind === 'ask') {
    const submit = () => {
      const text = instruction.trim()
      if (text) void ai.run('custom', text)
    }
    return (
      <div className="p-1.5">
        <div className="flex items-center gap-2 rounded-lg px-2">
          <Sparkles className="size-4 shrink-0 text-brand" />
          <input
            // biome-ignore lint/a11y/noAutofocus: the popover opens on request and exists to take this input
            autoFocus
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                e.preventDefault()
                submit()
              }
            }}
            placeholder={s.target === 'note' ? t('ai.placeholderNote') : t('ai.placeholder')}
            aria-label={s.target === 'note' ? t('ai.placeholderNote') : t('ai.placeholder')}
            className="h-10 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          <Button
            size="icon-xs"
            variant={instruction.trim() ? 'default' : 'ghost'}
            disabled={!instruction.trim()}
            onClick={submit}
            aria-label={t('ai.button')}
          >
            <ArrowUp />
          </Button>
        </div>
        <div className="mt-1 border-t pt-1">
          {s.target === 'note' ? (
            <ActionButton
              icon={LayoutList}
              label={t('ai.structure')}
              onClick={() => void ai.run('structure')}
            />
          ) : null}
          <ActionButton
            icon={WandSparkles}
            label={t('ai.rewrite')}
            onClick={() => void ai.run('rewrite')}
          />
          <ActionButton
            icon={Scissors}
            label={t('ai.shorten')}
            onClick={() => void ai.run('shorten')}
          />
          {s.target === 'selection' ? (
            <ActionButton
              icon={LayoutList}
              label={t('ai.reformat')}
              onClick={() => void ai.run('reformat')}
            />
          ) : null}
          <ActionButton icon={SpellCheck} label={t('ai.fix')} onClick={() => void ai.run('fix')} />
        </div>
        {s.target === 'selection' ? (
          <div className="mt-1 border-t pt-1">
            <ActionButton icon={FilePlus2} label={t('ai.newNote')} onClick={onNewNote} />
            <ActionButton icon={Trash2} label={t('ai.delete')} danger onClick={onDelete} />
          </div>
        ) : null}
      </div>
    )
  }

  if (phase.kind === 'running') {
    return (
      <div>
        <div className="flex items-center gap-2 border-b px-3 py-2 text-sm text-muted-foreground">
          <Sparkles className="size-4 animate-pulse text-brand" />
          <span className="flex-1">{t('ai.thinking')}</span>
          <Button size="sm" variant="ghost" className="h-7" onClick={ai.stop}>
            {t('ai.stop')}
          </Button>
        </div>
        {phase.text ? (
          <div className="max-h-72 overflow-y-auto whitespace-pre-wrap px-3 py-2.5 text-sm text-muted-foreground">
            {phase.text}
          </div>
        ) : null}
      </div>
    )
  }

  if (phase.kind === 'review') {
    const unchanged = phase.proposal.trim() === s.original.trim()
    return (
      <div>
        {unchanged ? (
          <p className="px-3 py-3 text-sm text-muted-foreground">{t('ai.noChanges')}</p>
        ) : (
          <DiffView parts={diffWords(s.original, phase.proposal)} />
        )}
        <div className="flex flex-wrap items-center gap-1.5 border-t px-2 py-2">
          {unchanged ? null : (
            <Button size="sm" autoFocus onClick={ai.accept}>
              <CheckCheck />
              {t('ai.accept')}
              <Kbd className="ml-1 bg-white/20 text-inherit">↵</Kbd>
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={ai.close}>
            {t('ai.reject')}
            <Kbd className="ml-1">Esc</Kbd>
          </Button>
          <Button size="sm" variant="ghost" onClick={retry}>
            {t('ai.retry')}
          </Button>
          <span className="ml-auto hidden pr-1 text-xs text-muted-foreground sm:inline">
            {t('ai.hint')}
          </span>
        </div>
      </div>
    )
  }

  if (phase.kind === 'unavailable') {
    const signIn = phase.reason === 'signed-out'
    return (
      <div className="space-y-2 p-3">
        <p className="text-sm text-muted-foreground">
          {signIn ? t('ai.signIn') : unavailableText(phase.reason)}
        </p>
        <Button
          size="sm"
          onClick={() => {
            ai.close()
            openSettings(signIn ? 'account' : 'ai')
          }}
        >
          {signIn ? t('chat.signInButton') : t('aiProvider.openSettings')}
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-2 p-3">
      <p className="text-sm text-destructive">{phase.message}</p>
      <div className="flex gap-1.5">
        {s.last ? (
          <Button size="sm" onClick={retry}>
            {t('ai.retry')}
          </Button>
        ) : null}
        <Button size="sm" variant="ghost" onClick={ai.close}>
          {t('ai.reject')}
        </Button>
      </div>
    </div>
  )
}

/** Fixed-position panel under (or above) the text being edited; follows scroll and edits. */
function FloatingPanel({ editor, children }: { editor: Editor; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ left: number; top?: number; bottom?: number } | null>(null)

  useLayoutEffect(() => {
    let frame = 0
    const place = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        const range = getAiRange(editor)
        if (!range || editor.isDestroyed) return
        const start = editor.view.coordsAtPos(range.from)
        const end = editor.view.coordsAtPos(range.to)
        const width = ref.current?.offsetWidth ?? 420
        const height = ref.current?.offsetHeight ?? 280
        const left = Math.max(8, Math.min(start.left, window.innerWidth - width - 8))
        const below = end.bottom + 8
        if (below + height > window.innerHeight - 8 && start.top - 8 - height > 8) {
          setPos({ left, bottom: window.innerHeight - start.top + 8 })
        } else {
          setPos({ left, top: Math.min(below, window.innerHeight - height - 8) })
        }
      })
    }
    place()
    const observer = new ResizeObserver(place)
    if (ref.current) observer.observe(ref.current)
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    editor.on('transaction', place)
    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
      editor.off('transaction', place)
    }
  }, [editor])

  return (
    <div
      ref={ref}
      role="dialog"
      aria-modal="false"
      style={{ left: pos?.left ?? -9999, top: pos?.top, bottom: pos?.bottom }}
      className="fixed z-40 w-[min(440px,calc(100vw-16px))] overflow-hidden rounded-xl border bg-popover text-popover-foreground shadow-float animate-in fade-in-0 zoom-in-95"
    >
      {children}
    </div>
  )
}

/**
 * The selection pill ("Ask AI") and the popover or dialog it opens. Rendered next to the editor.
 */
export function AiEditLayer({ editor, ai }: { editor: Editor; ai: AiEdit }) {
  const { t } = useTranslation()
  const repo = useRepo()
  const invalidate = useInvalidateNotes()
  const navigate = useUi((s) => s.navigate)
  const s = ai.session
  const activeRef = useRef(false)
  activeRef.current = s !== null

  const newNote = async () => {
    const content = s?.original.trim()
    ai.close()
    if (!content) return
    const note = await repo.createNote({ content })
    void invalidate()
    toast(t('ai.noteCreated'), {
      description: note.title,
      action: { label: t('ai.open'), onClick: () => navigate({ kind: 'note', id: note.id }) },
    })
  }

  const deleteSelection = () => {
    const range = getAiRange(editor)
    ai.close()
    if (range) editor.chain().focus().deleteRange(range).run()
  }

  // Esc and Mod+Enter work wherever focus is while the popover is open: after an action button
  // disappears, focus falls back to the page.
  const phaseKind = s?.phase.kind
  useEffect(() => {
    if (!phaseKind) return
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        if (phaseKind === 'running') ai.stop()
        else ai.close()
      } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && phaseKind === 'review') {
        e.preventDefault()
        ai.accept()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [phaseKind, ai.stop, ai.close, ai.accept])

  return (
    <>
      <BubbleMenu
        editor={editor}
        shouldShow={({ editor: e, state }) =>
          !activeRef.current && e.isEditable && e.isFocused && !state.selection.empty
        }
        options={{ placement: 'top-start', offset: 8 }}
      >
        <button
          type="button"
          // Keep the editor selection: a mousedown here would otherwise blur it.
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => ai.open('selection')}
          title={`${t('ai.shortcut')} (${mod}+Shift+E)`}
          className="flex items-center gap-1.5 rounded-full border bg-popover px-3 py-1 text-[13px] font-medium text-foreground shadow-float hover:bg-accent [&_svg]:size-3.5 [&_svg]:text-brand"
        >
          <Sparkles />
          {t('ai.button')}
        </button>
      </BubbleMenu>

      {s?.target === 'selection' ? (
        <FloatingPanel editor={editor}>
          <AiEditBody ai={ai} onNewNote={() => void newNote()} onDelete={deleteSelection} />
        </FloatingPanel>
      ) : null}

      <Dialog open={s?.target === 'note'} onOpenChange={(o) => (o ? undefined : ai.close())}>
        <DialogContent className="max-w-2xl" onEscapeKeyDown={(e) => e.preventDefault()}>
          <DialogTitle className="sr-only">{t('ai.title')}</DialogTitle>
          <DialogDescription className="sr-only">{t('ai.hint')}</DialogDescription>
          <AiEditBody ai={ai} onNewNote={() => void newNote()} onDelete={deleteSelection} />
        </DialogContent>
      </Dialog>
    </>
  )
}
