import type { ChatEntry } from '@fixnote/core'
import { useTranslation } from '@fixnote/i18n'
import { Button, cn, Spinner, Tooltip, TooltipContent, TooltipTrigger } from '@fixnote/ui'
import { ChevronDown, Undo2 } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { answerConfirm, undoAnswer, useAssistant } from '../../lib/assistant/assistant'

/** What the assistant is doing right now, under the answer it is writing. */
export function AgentActivity() {
  const activity = useAssistant((s) => s.activity)
  // While a change waits for a yes, the question below says what is going on.
  const waiting = useAssistant((s) => s.confirm !== null)
  if (!activity || waiting) return null
  return (
    <p className="mt-1.5 flex items-center gap-1.5 text-xs text-muted-foreground">
      <Spinner className="size-3" />
      <span className="truncate">{activity}</span>
    </p>
  )
}

/** "Changes: 3 · Undo all" under an answer, with the list of changes on click. */
export function AnswerChanges({ m }: { m: ChatEntry }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const actions = m.actions
  if (!actions?.items.length) return null
  const streaming = m.status === 'streaming'

  const undo = async () => {
    setBusy(true)
    try {
      if ((await undoAnswer(m.id)) === 'changed') toast(t('audit.changed'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mt-2 rounded-lg border bg-muted/40 px-2.5 py-1.5 text-xs">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="flex min-w-0 flex-1 items-center gap-1 text-left text-muted-foreground hover:text-foreground"
        >
          <span className={cn(actions.undone && 'line-through')}>
            {t('agent.changes', { count: actions.items.length })}
          </span>
          <ChevronDown className={cn('size-3 transition-transform', open && 'rotate-180')} />
        </button>
        {actions.undone ? (
          <span className="text-muted-foreground">{t('agent.undone')}</span>
        ) : streaming ? null : (
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-xs"
            loading={busy}
            onClick={undo}
          >
            <Undo2 />
            {t('agent.undoAll')}
          </Button>
        )}
      </div>
      {open ? (
        <ul className="mt-1.5 space-y-0.5 text-muted-foreground">
          {actions.items.map((a) => (
            <li key={a.id} className={cn('truncate', actions.undone && 'line-through')}>
              {a.label}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}

/** A change waiting for a yes: deletions always, every change in "ask" mode. */
export function AgentConfirm() {
  const { t } = useTranslation()
  const confirm = useAssistant((s) => s.confirm)
  if (!confirm) return null
  return (
    <div
      role="alertdialog"
      aria-label={confirm.text}
      className="mb-2 rounded-xl border bg-card p-3 shadow-sm"
    >
      <p className="text-sm">{confirm.text}</p>
      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        <Button
          size="sm"
          className={cn(confirm.danger && 'bg-destructive text-white hover:bg-destructive/90')}
          onClick={() => answerConfirm('allow')}
          autoFocus
        >
          {confirm.danger ? t('agent.delete') : t('agent.allow')}
        </Button>
        {confirm.many ? (
          <Button size="sm" variant="outline" onClick={() => answerConfirm('all')}>
            {t('agent.allowAll')}
          </Button>
        ) : null}
        <Button size="sm" variant="ghost" onClick={() => answerConfirm('deny')}>
          {t('agent.deny')}
        </Button>
      </div>
    </div>
  )
}

/** How full the chat's memory is: a small ring by the input, the numbers on hover. */
export function ContextRing() {
  const { t } = useTranslation()
  const context = useAssistant((s) => s.context)
  const hasMessages = useAssistant((s) => s.messages.length > 0)
  if (!hasMessages) return null
  const r = 6
  const length = 2 * Math.PI * r
  const percent = Math.max(1, Math.round(context * 100))
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className="ml-auto flex shrink-0 items-center gap-1 rounded-full pr-0.5 pl-1 tabular-nums"
          aria-label={t('agent.context', { percent })}
        >
          <svg viewBox="0 0 16 16" className="size-4 -rotate-90" aria-hidden>
            <circle cx="8" cy="8" r={r} fill="none" strokeWidth="2" className="stroke-border" />
            <circle
              cx="8"
              cy="8"
              r={r}
              fill="none"
              strokeWidth="2"
              strokeLinecap="round"
              strokeDasharray={`${(length * percent) / 100} ${length}`}
              className={cn(context > 0.8 ? 'stroke-brand' : 'stroke-muted-foreground')}
            />
          </svg>
          {percent}%
        </button>
      </TooltipTrigger>
      <TooltipContent
        side="top"
        align="end"
        className="max-w-64 flex-col items-start gap-0.5 px-2.5 py-2"
      >
        <p className="font-medium">{t('agent.context', { percent })}</p>
        <p className="opacity-80">{t('agent.contextHint')}</p>
      </TooltipContent>
    </Tooltip>
  )
}
