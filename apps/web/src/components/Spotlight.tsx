import { MARK_END, MARK_START, type NoteSummary } from '@fixnote/core'
import { useTranslation } from '@fixnote/i18n'
import { Dialog, DialogContent, DialogTitle, Kbd } from '@fixnote/ui'
import { Command } from 'cmdk'
import { CalendarDays, FileText, Search, SquarePen } from 'lucide-react'
import { type ReactNode, useDeferredValue, useState } from 'react'
import { useUi } from '../app/store'
import { useCreateNote, useOpenDaily, useRecents, useSearch } from '../lib/queries'
import { formatCardDate } from '../lib/time'

/** Renders an FTS snippet, turning the private-use markers into <mark> without any HTML parsing. */
function Snippet({ text }: { text: string }) {
  const parts: ReactNode[] = []
  let rest = text
  let key = 0
  while (rest) {
    const start = rest.indexOf(MARK_START)
    if (start < 0) {
      parts.push(rest)
      break
    }
    const end = rest.indexOf(MARK_END, start)
    if (end < 0) {
      parts.push(rest.replace(MARK_START, ''))
      break
    }
    parts.push(rest.slice(0, start))
    parts.push(
      <mark key={key++} className="rounded-sm bg-highlight px-0.5 text-inherit">
        {rest.slice(start + 1, end)}
      </mark>,
    )
    rest = rest.slice(end + 1)
  }
  return <>{parts}</>
}

const itemClass =
  'flex cursor-default items-center gap-3 rounded-lg px-3 py-2 text-sm outline-none data-[selected=true]:bg-accent [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-muted-foreground'
const groupClass =
  '[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pt-3 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground'

export function Spotlight() {
  const { t, i18n } = useTranslation()
  const open = useUi((s) => s.spotlightOpen)
  const setOpen = useUi((s) => s.setSpotlightOpen)
  const navigate = useUi((s) => s.navigate)
  const [q, setQ] = useState('')
  const query = useDeferredValue(q)
  const recents = useRecents(8)
  const search = useSearch(query)
  const createNote = useCreateNote()
  const openDaily = useOpenDaily()

  const close = () => {
    setOpen(false)
    setQ('')
  }
  const openNote = (n: NoteSummary) => {
    close()
    navigate({ kind: 'note', id: n.id })
  }

  const commands = [
    {
      id: 'new',
      icon: SquarePen,
      label: t('spotlight.newNote'),
      run: () =>
        createNote.mutate(
          { content: '' },
          { onSuccess: (n) => navigate({ kind: 'note', id: n.id }) },
        ),
    },
    {
      id: 'today',
      icon: CalendarDays,
      label: t('spotlight.today'),
      run: () =>
        openDaily.mutate(undefined, { onSuccess: (n) => navigate({ kind: 'note', id: n.id }) }),
    },
  ].filter((c) => !q.trim() || c.label.toLowerCase().includes(q.trim().toLowerCase()))

  const hits = query.trim() ? (search.data ?? []) : []
  const lang = i18n.resolvedLanguage

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? setOpen(true) : close())}>
      <DialogContent aria-describedby={undefined}>
        <DialogTitle className="sr-only">{t('sidebar.search')}</DialogTitle>
        <Command shouldFilter={false} loop className="flex max-h-[min(70vh,520px)] flex-col">
          <div className="flex items-center gap-3 border-b px-4">
            <Search className="size-4 shrink-0 text-muted-foreground" />
            <Command.Input
              value={q}
              onValueChange={setQ}
              placeholder={t('spotlight.placeholder')}
              className="h-12 flex-1 bg-transparent text-[15px] outline-none placeholder:text-muted-foreground"
            />
            <Kbd>Esc</Kbd>
          </div>
          <Command.List className="overflow-y-auto p-1.5">
            {q.trim() && !hits.length && !commands.length && !search.isFetching ? (
              <Command.Empty className="px-3 py-8 text-center text-sm text-muted-foreground">
                {t('spotlight.noResults')}
              </Command.Empty>
            ) : null}

            {q.trim() ? (
              hits.length ? (
                <Command.Group heading={t('spotlight.results')} className={groupClass}>
                  {hits.map(({ note, snippet }) => (
                    <Command.Item
                      key={note.id}
                      value={`note-${note.id}`}
                      onSelect={() => openNote(note)}
                      className={`${itemClass} items-start`}
                    >
                      <FileText className="mt-0.5" />
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-medium">
                          {note.title || t('common.untitled')}
                        </div>
                        <div className="line-clamp-2 text-[13px] text-muted-foreground">
                          <Snippet text={snippet} />
                        </div>
                      </div>
                    </Command.Item>
                  ))}
                </Command.Group>
              ) : null
            ) : recents.data?.length ? (
              <Command.Group heading={t('spotlight.recents')} className={groupClass}>
                {recents.data.map((note) => (
                  <Command.Item
                    key={note.id}
                    value={`recent-${note.id}`}
                    onSelect={() => openNote(note)}
                    className={itemClass}
                  >
                    {note.type === 'daily' ? <CalendarDays /> : <FileText />}
                    <span className="flex-1 truncate">{note.title || t('common.untitled')}</span>
                    <span className="text-xs text-muted-foreground">
                      {formatCardDate(note.updatedAt, lang)}
                    </span>
                  </Command.Item>
                ))}
              </Command.Group>
            ) : null}

            {commands.length ? (
              <Command.Group heading={t('spotlight.commands')} className={groupClass}>
                {commands.map((c) => (
                  <Command.Item
                    key={c.id}
                    value={`cmd-${c.id}`}
                    onSelect={() => {
                      close()
                      c.run()
                    }}
                    className={itemClass}
                  >
                    <c.icon />
                    {c.label}
                  </Command.Item>
                ))}
              </Command.Group>
            ) : null}
          </Command.List>
        </Command>
      </DialogContent>
    </Dialog>
  )
}
