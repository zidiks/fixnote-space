import type { NoteFilter, NoteType } from '@fixnote/core'
import { useTranslation } from '@fixnote/i18n'
import {
  Button,
  cn,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@fixnote/ui'
import { Check, ChevronDown, MessageCircle, Mic, Search, SquarePen } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useUi } from '../app/store'
import { useCounts, useCreateNote, useFolders } from '../lib/queries'
import { startOfDay } from '../lib/time'
import { toggleVoice } from '../lib/voice/voice'
import { AssistantAvatar } from './AssistantAvatar'
import { EmptyState, NoteGrid } from './NoteGrid'

type Period = 'any' | 'today' | 'week' | 'month'

const DAY = 24 * 3600 * 1000

function periodStart(p: Period): number | undefined {
  if (p === 'today') return startOfDay()
  if (p === 'week') return startOfDay() - 6 * DAY
  if (p === 'month') return startOfDay() - 29 * DAY
  return undefined
}

function FilterMenu<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: T
  options: { value: T; label: string }[]
  onChange: (v: T) => void
}) {
  const active = options[0]?.value !== value
  const current = options.find((o) => o.value === value)
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            'flex h-8 items-center gap-1 rounded-full border px-3 text-[13px] transition-colors',
            active
              ? 'border-foreground/15 bg-card font-medium shadow-xs'
              : 'border-transparent text-muted-foreground hover:text-foreground',
          )}
        >
          {active ? current?.label : label}
          <ChevronDown className="size-3.5" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-80 overflow-y-auto">
        {options.map((o) => (
          <DropdownMenuItem key={o.value} onSelect={() => onChange(o.value)}>
            <Check className={cn('size-4', o.value !== value && 'invisible')} />
            {o.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function Home() {
  const { t } = useTranslation()
  const setSpotlightOpen = useUi((s) => s.setSpotlightOpen)
  const setChatOpen = useUi((s) => s.setChatOpen)
  const navigate = useUi((s) => s.navigate)
  const createNote = useCreateNote()
  const folders = useFolders().data ?? []
  const counts = useCounts().data
  const route = useUi((s) => s.route)
  // Kept in the route, so Back returns to the same view.
  const scope = route.kind === 'home' && route.filter === 'inbox' ? 'inbox' : 'all'
  const setScope = (s: 'all' | 'inbox') =>
    navigate(s === 'inbox' ? { kind: 'home', filter: 'inbox' } : { kind: 'home' }, {
      replace: true,
    })
  const [folderId, setFolderId] = useState('')
  const [type, setType] = useState<'' | NoteType>('')
  const [period, setPeriod] = useState<Period>('any')
  const [since, setSince] = useState<number | undefined>(undefined)

  const filter = useMemo<NoteFilter>(
    () => ({
      scope: folderId ? 'all' : scope,
      ...(folderId ? { folderId } : {}),
      ...(type ? { type } : {}),
      ...(since !== undefined ? { updatedSince: since } : {}),
    }),
    [scope, folderId, type, since],
  )
  const filtered = scope !== 'all' || folderId || type || period !== 'any'
  const noNotes = counts?.all === 0

  return (
    <div className="mx-auto w-full max-w-4xl px-6 pt-12 pb-24">
      <div className="flex flex-col items-center gap-7 text-center">
        <AssistantAvatar size={96} follow />
        <h1 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
          {t('home.greeting')}
        </h1>
        <div className="flex flex-wrap justify-center gap-2">
          <Button
            variant="brand"
            className="rounded-full"
            onClick={() =>
              createNote.mutate(
                { content: '' },
                { onSuccess: (n) => navigate({ kind: 'note', id: n.id }) },
              )
            }
          >
            <SquarePen />
            {t('sidebar.newNote')}
          </Button>
          <Button
            variant="outline"
            className="rounded-full"
            onClick={() => void toggleVoice('new-note')}
          >
            <Mic />
            {t('voice.note')}
          </Button>
          <Button variant="outline" className="rounded-full" onClick={() => setChatOpen(true)}>
            <MessageCircle />
            {t('home.ask')}
          </Button>
        </div>
      </div>

      <div className="mt-12 flex flex-wrap items-center gap-1.5">
        {(['all', 'inbox'] as const).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => {
              setScope(s)
              setFolderId('')
            }}
            className={cn(
              'h-8 rounded-full border px-3.5 text-[13px] font-medium transition-colors',
              scope === s && !folderId
                ? 'border-foreground/15 bg-card shadow-xs'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {t(`home.filters.${s}`)}
            {s === 'inbox' && counts?.inbox ? (
              <span className="ml-1.5 text-xs font-normal text-muted-foreground tabular-nums">
                {counts.inbox}
              </span>
            ) : null}
          </button>
        ))}
        <FilterMenu
          label={t('home.filters.folder')}
          value={folderId}
          onChange={setFolderId}
          options={[
            { value: '', label: t('home.filters.allFolders') },
            ...folders.map((f) => ({ value: f.id, label: f.name })),
          ]}
        />
        <FilterMenu
          label={t('home.filters.type')}
          value={type}
          onChange={setType}
          options={[
            { value: '', label: t('home.filters.allTypes') },
            { value: 'text', label: t('home.filters.notes') },
            { value: 'daily', label: t('home.filters.daily') },
          ]}
        />
        <FilterMenu
          label={t('home.filters.period')}
          value={period}
          onChange={(p) => {
            setPeriod(p)
            setSince(periodStart(p))
          }}
          options={[
            { value: 'any', label: t('home.filters.anyTime') },
            { value: 'today', label: t('home.filters.today') },
            { value: 'week', label: t('home.filters.week') },
            { value: 'month', label: t('home.filters.month') },
          ]}
        />
        <Button
          variant="outline"
          size="icon-sm"
          className="ml-auto rounded-full"
          aria-label={t('sidebar.search')}
          onClick={() => setSpotlightOpen(true)}
        >
          <Search />
        </Button>
      </div>

      <NoteGrid
        filter={filter}
        empty={
          noNotes || !filtered ? (
            <EmptyState title={t('home.empty.title')} body={t('home.empty.body')} />
          ) : (
            <EmptyState body={t('home.emptyFiltered')} />
          )
        }
      />
    </div>
  )
}
