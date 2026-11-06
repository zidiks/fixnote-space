import { subtreeCounts } from '@fixnote/core'
import { useTranslation } from '@fixnote/i18n'
import { CalendarDays, Folder, Link2 } from 'lucide-react'
import { useMemo } from 'react'
import { type Route, useUi } from '../app/store'
import { listFilter } from '../lib/layout'
import { useCounts, useCreateNote, useFolders } from '../lib/queries'
import { startOfDay } from '../lib/time'
import { LinksBar } from './LinksBar'
import { EmptyState, NoteGrid, ViewMenu } from './NoteGrid'

/**
 * A folder, saved links, or Today (reached in this layout only through the history of the notes
 * layout).
 */
type ListRoute = Extract<Route, { kind: 'folder' | 'today' | 'links' }>

export function ListView({ route }: { route: ListRoute }) {
  const { t } = useTranslation()
  const folders = useFolders().data
  const createNote = useCreateNote()
  const navigate = useUi((s) => s.navigate)
  const linkCount = useCounts().data?.links

  const filter = useMemo(() => listFilter(route, startOfDay()), [route])
  const folderId = route.kind === 'folder' ? route.id : null
  const folder = folders?.find((f) => f.id === folderId)
  const title =
    route.kind === 'today'
      ? t('sidebar.daily')
      : route.kind === 'links'
        ? t('links.nav')
        : (folder?.name ?? '')
  const count =
    route.kind === 'links'
      ? linkCount
      : folder && folders
        ? subtreeCounts(folders).get(folder.id)
        : undefined
  const empty =
    route.kind === 'today'
      ? t('layout.emptyToday')
      : route.kind === 'links'
        ? t('links.empty')
        : t('list.emptyFolder')
  const Icon = route.kind === 'today' ? CalendarDays : route.kind === 'links' ? Link2 : Folder

  return (
    <div className="mx-auto w-full max-w-4xl px-6 pt-6 pb-24">
      <header className="flex items-baseline gap-3">
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <Icon className="size-5 text-muted-foreground" />
          {title}
        </h1>
        {count !== undefined ? (
          <span className="text-sm text-muted-foreground">{t('list.count', { count })}</span>
        ) : null}
        <ViewMenu className="ml-auto self-center" />
      </header>
      {route.kind === 'links' ? (
        <div className="mt-4 max-w-xl">
          <LinksBar list={route} />
        </div>
      ) : null}
      <NoteGrid
        filter={filter}
        empty={
          route.kind === 'folder' ? (
            // Under the "New note" card: a hint, not a second empty box.
            <p className="mt-3 text-sm text-muted-foreground">{empty}</p>
          ) : (
            <EmptyState body={empty} />
          )
        }
        pinnedFirst
        onNew={
          // View only: nothing is added to someone else's folder from here. Links are added above.
          route.kind !== 'links' && folder?.access !== 'view'
            ? () =>
                createNote.mutate(
                  { content: '', folderId },
                  { onSuccess: (n) => navigate({ kind: 'note', id: n.id }) },
                )
            : undefined
        }
      />
    </div>
  )
}
