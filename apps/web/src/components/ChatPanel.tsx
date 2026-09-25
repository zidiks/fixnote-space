import type { ChatEntry, ChatScope, StoredCitation } from '@fixnote/core'
import { useTranslation } from '@fixnote/i18n'
import {
  Button,
  ConfirmDialog,
  cn,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Kbd,
  shortcutLabel,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@fixnote/ui'
import {
  ArrowUp,
  Check,
  ChevronDown,
  FileText,
  Folder,
  Layers,
  RotateCcw,
  Square,
  Trash2,
  X,
} from 'lucide-react'
import { type KeyboardEvent, useEffect, useMemo, useRef, useState } from 'react'
import { useUi } from '../app/store'
import { useAccount } from '../lib/account/account'
import {
  ask,
  clearChat,
  enableSemantic,
  setScopeMode,
  stop,
  useAssistant,
} from '../lib/assistant/assistant'
import { useFolders, useNote } from '../lib/queries'
import { AssistantAvatar } from './AssistantAvatar'
import { AnswerText } from './chat/AnswerText'

/** Scope that follows what is open: the note, the folder, or everything. */
function useRouteScope(): ChatScope {
  const route = useUi((s) => s.route)
  const folders = useFolders().data
  const note = useNote(route.kind === 'note' ? route.id : '', { enabled: route.kind === 'note' })
  return useMemo(() => {
    if (route.kind === 'note' && note.data)
      return { kind: 'note', id: note.data.id, title: note.data.title }
    if (route.kind === 'folder') {
      const f = folders?.find((x) => x.id === route.id)
      if (f) return { kind: 'folder', id: f.id, name: f.name }
    }
    return { kind: 'all' }
  }, [route, folders, note.data])
}

function useScopeLabel() {
  const { t } = useTranslation()
  return (scope: ChatScope) =>
    scope.kind === 'note'
      ? t('chat.scope.note', { name: scope.title || t('common.untitled') })
      : scope.kind === 'folder'
        ? t('chat.scope.folder', { name: scope.name })
        : t('chat.scope.all')
}

const ScopeIcon = ({ scope }: { scope: ChatScope }) =>
  scope.kind === 'note' ? <FileText /> : scope.kind === 'folder' ? <Folder /> : <Layers />

function Sources({ citations }: { citations: StoredCitation[] }) {
  const { t } = useTranslation()
  const navigate = useUi((s) => s.navigate)
  const unique = citations.filter((c, i) => citations.findIndex((x) => x.noteId === c.noteId) === i)
  if (!unique.length) return null
  return (
    <div className="mt-2 space-y-1">
      <div className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
        {t('chat.sources')}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {unique.map((c) => (
          <button
            key={c.noteId}
            type="button"
            onClick={() => navigate({ kind: 'note', id: c.noteId })}
            title={c.quote}
            className="flex max-w-full items-center gap-1.5 rounded-md border bg-card px-2 py-1 text-xs hover:bg-accent"
          >
            <span className="font-semibold text-brand tabular-nums">{c.n}</span>
            <span className="truncate">{c.title || t('common.untitled')}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

function Message({ m, onRetry }: { m: ChatEntry; onRetry: () => void }) {
  const { t } = useTranslation()
  const navigate = useUi((s) => s.navigate)
  const label = useScopeLabel()
  const error = useAssistant((s) => s.error)

  if (m.kind === 'divider') {
    return (
      <div className="flex items-center gap-2 py-1 text-[11px] text-muted-foreground">
        <div className="h-px flex-1 bg-border" />
        <span className="flex items-center gap-1 [&_svg]:size-3">
          <ScopeIcon scope={m.scope} />
          {t('chat.scopeChanged', { scope: label(m.scope) })}
        </span>
        <div className="h-px flex-1 bg-border" />
      </div>
    )
  }
  if (m.kind === 'user') {
    return (
      <div
        data-selectable
        className="ml-auto max-w-[85%] rounded-2xl rounded-br-md bg-muted px-3 py-2 text-[14px] whitespace-pre-wrap"
      >
        {m.content}
      </div>
    )
  }
  const streaming = m.status === 'streaming'
  return (
    <div className="max-w-full">
      {streaming && !m.content ? (
        <p className="animate-pulse text-sm text-muted-foreground">{t('chat.thinking')}</p>
      ) : (
        <AnswerText
          text={m.content + (streaming ? ' ▍' : '')}
          citations={m.citations}
          onCite={(c) => navigate({ kind: 'note', id: c.noteId })}
        />
      )}
      {m.status === 'done' ? (
        <>
          <Sources citations={m.citations} />
          {m.confidence ? (
            <p
              className={cn(
                'mt-2 text-[11px]',
                m.confidence === 'high'
                  ? 'text-muted-foreground'
                  : m.confidence === 'medium'
                    ? 'text-brand'
                    : 'text-muted-foreground italic',
              )}
            >
              {t(`chat.confidence.${m.confidence}`)}
            </p>
          ) : null}
        </>
      ) : null}
      {m.status === 'stopped' ? (
        <p className="mt-1 text-[11px] text-muted-foreground">{t('chat.stopped')}</p>
      ) : null}
      {m.status === 'error' ? (
        <div className="mt-1 flex items-center gap-2">
          <p className="text-xs text-destructive">{t('chat.error', { message: error ?? '' })}</p>
          <Button variant="ghost" size="sm" className="h-7" onClick={onRetry}>
            <RotateCcw />
            {t('chat.retry')}
          </Button>
        </div>
      ) : null}
    </div>
  )
}

function IndexStatus() {
  const { t } = useTranslation()
  const semantic = useAssistant((s) => s.semantic)
  const progress = useAssistant((s) => s.modelProgress)
  const pending = useAssistant((s) => s.pending)
  const text =
    semantic === 'loading'
      ? t('chat.index.preparing', { percent: Math.round(progress * 100) })
      : semantic === 'ready' && pending > 0
        ? t('chat.index.indexing', { count: pending })
        : semantic === 'unavailable'
          ? t('chat.index.unavailable')
          : null
  if (!text) return null
  return <div className="border-b px-4 py-1.5 text-[11px] text-muted-foreground">{text}</div>
}

/**
 * Single app-wide assistant thread. The scope badge shows which notes answers draw from; a scope
 * change leaves a divider in the thread.
 */
export function ChatPanel() {
  const { t } = useTranslation()
  const setChatOpen = useUi((s) => s.setChatOpen)
  const openSettings = useUi((s) => s.openSettings)
  const draft = useUi((s) => s.chatDraft)
  const setDraft = useUi((s) => s.setChatDraft)
  const phase = useAccount((s) => s.phase)
  const messages = useAssistant((s) => s.messages)
  const status = useAssistant((s) => s.status)
  const scopeMode = useAssistant((s) => s.scopeMode)
  const routeScope = useRouteScope()
  const label = useScopeLabel()
  const scope: ChatScope = scopeMode === 'all' ? { kind: 'all' } : routeScope
  const [confirmClear, setConfirmClear] = useState(false)
  const list = useRef<HTMLDivElement>(null)
  const input = useRef<HTMLTextAreaElement>(null)
  const busy = status === 'thinking' || status === 'answering'
  const last = messages.at(-1)

  // Opening the assistant is the moment to prepare search by meaning (first time: model download).
  useEffect(() => {
    void enableSemantic()
    input.current?.focus()
  }, [])

  // biome-ignore lint/correctness/useExhaustiveDependencies: re-run to follow new messages and streamed text
  useEffect(() => {
    const el = list.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages.length, last?.content])

  const send = () => {
    const q = draft.trim()
    if (!q || busy) return
    setDraft('')
    void ask(q, scope)
  }

  const retry = (m: ChatEntry) => {
    const i = messages.findIndex((x) => x.id === m.id)
    const question = messages
      .slice(0, i)
      .reverse()
      .find((x) => x.kind === 'user')
    if (question) void ask(question.content, question.scope)
  }

  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      send()
    }
  }

  return (
    <aside
      className="flex h-full w-[380px] shrink-0 flex-col border-l bg-background"
      aria-label={t('chat.title')}
    >
      <header className="flex h-12 items-center gap-2.5 border-b px-4">
        <AssistantAvatar size={24} />
        <span className="flex-1 text-sm font-medium">{t('chat.title')}</span>
        {messages.length ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={() => setConfirmClear(true)}
                aria-label={t('chat.clear')}
              >
                <Trash2 />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t('chat.clear')}</TooltipContent>
          </Tooltip>
        ) : null}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={() => setChatOpen(false)}
              aria-label={t('chat.close')}
            >
              <X />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            {t('chat.close')}{' '}
            <Kbd className="border-transparent bg-primary-foreground/15 text-primary-foreground">
              {shortcutLabel('J')}
            </Kbd>
          </TooltipContent>
        </Tooltip>
      </header>
      <IndexStatus />

      <div ref={list} className="flex-1 overflow-y-auto px-4 py-4">
        {messages.length ? (
          <div className="space-y-4">
            {messages.map((m) => (
              <Message key={m.id} m={m} onRetry={() => retry(m)} />
            ))}
          </div>
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-3 px-4 text-center">
            <AssistantAvatar size={48} />
            <p className="text-sm text-muted-foreground">{t('chat.empty')}</p>
          </div>
        )}
      </div>

      <div className="border-t p-3">
        {phase === 'disabled' ? (
          <p className="text-sm text-muted-foreground">{t('chat.notConfigured')}</p>
        ) : phase !== 'ready' ? (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">{t('chat.signIn')}</p>
            <Button size="sm" onClick={() => openSettings('account')}>
              {t('chat.signInButton')}
            </Button>
          </div>
        ) : (
          <>
            <div className="mb-2 flex items-center gap-1.5 text-xs text-muted-foreground">
              <span>{t('chat.scope.label')}</span>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="flex max-w-[260px] items-center gap-1 rounded-full border bg-card px-2 py-0.5 font-medium text-foreground hover:bg-accent [&_svg]:size-3"
                  >
                    <ScopeIcon scope={scope} />
                    <span className="truncate">{label(scope)}</span>
                    <ChevronDown className="opacity-60" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-64">
                  <DropdownMenuItem onSelect={() => setScopeMode('auto')}>
                    <ScopeIcon scope={routeScope} />
                    <span className="flex-1 truncate">
                      {t('chat.scopeAuto')}
                      {routeScope.kind !== 'all' ? ` · ${label(routeScope)}` : ''}
                    </span>
                    <Check className={cn(scopeMode !== 'auto' && 'invisible')} />
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => setScopeMode('all')}>
                    <Layers />
                    <span className="flex-1">{t('chat.scope.all')}</span>
                    <Check className={cn(scopeMode !== 'all' && 'invisible')} />
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            <div className="flex items-end gap-1.5 rounded-xl border bg-card p-1.5 focus-within:ring-2 focus-within:ring-ring/30">
              <textarea
                ref={input}
                rows={2}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={onKey}
                placeholder={t('chat.placeholder')}
                aria-label={t('chat.placeholder')}
                className="max-h-40 flex-1 resize-none bg-transparent px-1.5 py-1 text-sm outline-none placeholder:text-muted-foreground"
              />
              {busy ? (
                <Button
                  size="icon-xs"
                  variant="secondary"
                  className="rounded-lg"
                  onClick={stop}
                  aria-label={t('chat.stop')}
                >
                  <Square className="fill-current" />
                </Button>
              ) : (
                <Button
                  size="icon-xs"
                  className="rounded-lg"
                  onClick={send}
                  disabled={!draft.trim()}
                  aria-label={t('chat.send')}
                >
                  <ArrowUp />
                </Button>
              )}
            </div>
          </>
        )}
      </div>
      <ConfirmDialog
        open={confirmClear}
        onOpenChange={setConfirmClear}
        title={t('chat.clearTitle')}
        description={t('chat.clearBody')}
        confirmLabel={t('chat.clear')}
        cancelLabel={t('common.cancel')}
        destructive
        onConfirm={() => void clearChat()}
      />
    </aside>
  )
}
