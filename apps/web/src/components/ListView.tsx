import type { NoteFilter } from '@fixnote/core'
import { useTranslation } from '@fixnote/i18n'
import { Folder, Hash, Inbox, Layers } from 'lucide-react'
import { useMemo } from 'react'
import type { Route } from '../app/store'
import { useCounts, useFolders } from '../lib/queries'
import { EmptyState, NoteGrid } from './NoteGrid'

type ListRoute = Extract<Route, { kind: 'all' | 'inbox' | 'folder' | 'tag' }>

export function ListView({ route }: { route: ListRoute }) {
  const { t } = useTranslation()
  const folders = useFolders().data
  const counts = useCounts().data

  const filter = useMemo<NoteFilter>(() => {
    switch (route.kind) {
      case 'inbox':
        return { scope: 'inbox' }
      case 'folder':
        return { folderId: route.id }
      case 'tag':
        return { tag: route.name }
      default:
        return {}
    }
  }, [route])

  const folder = route.kind === 'folder' ? folders?.find((f) => f.id === route.id) : undefined
  const {
    icon: Icon,
    title,
    count,
    empty,
  } = {
    all: {
      icon: Layers,
      title: t('sidebar.recents'),
      count: counts?.all,
      empty: t('home.empty.body'),
    },
    inbox: {
      icon: Inbox,
      title: t('sidebar.inbox'),
      count: counts?.inbox,
      empty: t('home.empty.body'),
    },
    folder: {
      icon: Folder,
      title: folder?.name ?? '',
      count: folder?.noteCount,
      empty: t('list.emptyFolder'),
    },
    tag: {
      icon: Hash,
      title: route.kind === 'tag' ? route.name : '',
      count: undefined,
      empty: t('list.emptyTag'),
    },
  }[route.kind]

  return (
    <div className="mx-auto w-full max-w-4xl px-6 pt-6 pb-40">
      <header className="flex items-baseline gap-3">
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <Icon className="size-5 text-muted-foreground" />
          {title}
        </h1>
        {count !== undefined ? (
          <span className="text-sm text-muted-foreground">{t('list.count', { count })}</span>
        ) : null}
      </header>
      <NoteGrid filter={filter} empty={<EmptyState body={empty} />} />
    </div>
  )
}
