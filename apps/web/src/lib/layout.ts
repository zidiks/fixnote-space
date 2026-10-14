import type { NoteFilter } from '@fixnote/core'
import { useShallow } from 'zustand/react/shallow'
import {
  type Docking,
  docking,
  isListRoute,
  type Layout,
  type ListRoute,
  listOf,
  useUi,
} from '../app/store'

/** The layout in use: the assistant layout until one is chosen on this device. */
export function useLayout(): Layout {
  return useUi((s) => s.layout ?? 'assistant')
}

/** Whether the sidebar and the assistant open beside the content or over it (`docking`). */
export function useDocking(): Docking {
  return useUi(useShallow((s) => docking(s)))
}

/**
 * The list of notes the person is in, for the sidebar's highlight and "New note": in the notes
 * layout also while a note is open beside it (`listOf`); in the assistant layout only when the
 * route is that list.
 */
export function useListRoute(): ListRoute | null {
  const layout = useLayout()
  const route = useUi((s) => s.route)
  const back = useUi((s) => s.back)
  if (layout === 'notes') return listOf(route, back)
  return isListRoute(route) ? route : null
}

/** The same, read once (outside React). */
export function currentListRoute(): ListRoute | null {
  const { layout, route, back } = useUi.getState()
  if (layout === 'notes') return listOf(route, back)
  return isListRoute(route) ? route : null
}

/** The folder a new note made now goes to (before `writableFolder`): the listed one, if any. */
export function listedFolderId(): string | null {
  const list = currentListRoute()
  return list?.kind === 'folder' ? list.id : null
}

/** What a list route shows, as a filter of notes. Today: what was edited since midnight. */
export function listFilter(list: ListRoute, midnight: number): NoteFilter {
  switch (list.kind) {
    case 'home':
      return { scope: list.filter === 'inbox' ? 'inbox' : 'all' }
    case 'folder':
      return { folderId: list.id }
    case 'today':
      return { updatedSince: midnight }
  }
}
