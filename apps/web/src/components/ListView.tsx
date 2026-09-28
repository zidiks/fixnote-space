import { subtreeCounts } from '@fixnote/core'
import { useTranslation } from '@fixnote/i18n'
import { Folder } from 'lucide-react'
import { useMemo } from 'react'
import { type Route, useUi } from '../app/store'
import { useCreateNote, useFolders } from '../lib/queries'
import { EmptyState, NoteGrid, ViewMenu } from './NoteGrid'

type ListRoute = Extract<Route, { kind: 'folder' }>

export function ListView({ route }: { route: ListRoute }) {
  const { t } = useTranslation()
  const folders = useFolders().data
  const createNote = useCreateNote()
  const navigate = useUi((s) => s.navigate)

  const filter = useMemo(() => ({ folderId: route.id }), [route.id])
  const folder = folders?.find((f) => f.id === route.id)
  const title = folder?.name ?? ''
  const count = folder && folders ? subtreeCounts(folders).get(folder.id) : undefined
  const empty = t('list.emptyFolder')

  return (
    <div className="mx-auto w-full max-w-4xl px-6 pt-6 pb-24">
      <header className="flex items-baseline gap-3">
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <Folder className="size-5 text-muted-foreground" />
          {title}
        </h1>
        {count !== undefined ? (
          <span className="text-sm text-muted-foreground">{t('list.count', { count })}</span>
        ) : null}
        <ViewMenu className="ml-auto self-center" />
      </header>
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
          // View only: nothing is added to someone else's folder from here.
          folder?.access !== 'view'
            ? () =>
                createNote.mutate(
                  { content: '', folderId: route.id },
                  { onSuccess: (n) => navigate({ kind: 'note', id: n.id }) },
                )
            : undefined
        }
      />
    </div>
  )
}
