import type { NoteSummary } from '@fixnote/core'
import { useTranslation } from '@fixnote/i18n'
import { cn } from '@fixnote/ui'
import { CalendarDays, CheckSquare, FileText } from 'lucide-react'
import { useUi } from '../app/store'
import { formatCardDate } from '../lib/time'

export function NoteCard({ note }: { note: NoteSummary }) {
  const { t, i18n } = useTranslation()
  const navigate = useUi((s) => s.navigate)
  const Icon = note.type === 'daily' ? CalendarDays : FileText

  return (
    <button
      type="button"
      onClick={() => navigate({ kind: 'note', id: note.id })}
      className="group flex h-full max-h-60 min-h-32 w-full flex-col overflow-hidden rounded-xl border bg-card p-4 text-left shadow-xs transition-shadow outline-none hover:shadow-float focus-visible:ring-2 focus-visible:ring-ring/40"
    >
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Icon className="size-3.5" />
        <span>{formatCardDate(note.updatedAt, i18n.resolvedLanguage)}</span>
        {note.tasks ? (
          <span className="ml-auto flex items-center gap-1 tabular-nums">
            <CheckSquare className="size-3.5" />
            {note.tasks.done}/{note.tasks.total}
          </span>
        ) : null}
      </div>
      <p
        className={cn(
          'mt-2 line-clamp-2 font-medium leading-snug',
          !note.title && 'text-muted-foreground',
        )}
      >
        {note.title || t('common.untitled')}
      </p>
      {note.excerpt ? (
        <p className="mt-1.5 line-clamp-4 text-[13px] leading-relaxed text-muted-foreground">
          {note.excerpt}
        </p>
      ) : null}
      {note.tags.length ? (
        <div className="mt-auto flex flex-wrap gap-1 pt-2">
          {note.tags.slice(0, 3).map((tag) => (
            <span key={tag} className="rounded-full bg-brand/10 px-2 py-0.5 text-[11px] text-brand">
              #{tag}
            </span>
          ))}
        </div>
      ) : null}
    </button>
  )
}
