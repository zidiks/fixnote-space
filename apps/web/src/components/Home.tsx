import { useTranslation } from '@fixnote/i18n'
import { Button, cn } from '@fixnote/ui'
import { ChevronDown, FileText, Search, SlidersHorizontal } from 'lucide-react'
import { useState } from 'react'
import { useUi } from '../app/store'
import { AssistantOrb } from './AssistantOrb'

type Filter = 'all' | 'inbox'

export function Home() {
  const { t, i18n } = useTranslation()
  const drafts = useUi((s) => s.drafts)
  const [filter, setFilter] = useState<Filter>('all')
  const time = new Intl.DateTimeFormat(i18n.resolvedLanguage, {
    dateStyle: 'medium',
    timeStyle: 'short',
  })

  return (
    <div className="mx-auto w-full max-w-4xl px-6 pt-16 pb-40">
      <div className="flex flex-col items-center gap-7 text-center">
        <AssistantOrb size={72} />
        <h1 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
          {t('home.greeting')}
        </h1>
      </div>

      <div className="mt-12 flex flex-wrap items-center gap-2">
        {(['all', 'inbox'] as const).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={cn(
              'h-8 rounded-full border px-3.5 text-[13px] font-medium transition-colors',
              filter === f
                ? 'border-foreground/15 bg-card shadow-xs'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {t(`home.filters.${f}`)}
          </button>
        ))}
        {(['folder', 'type', 'period'] as const).map((f) => (
          <button
            key={f}
            type="button"
            disabled
            className="flex h-8 items-center gap-1 rounded-full border border-transparent px-3 text-[13px] text-muted-foreground disabled:opacity-60"
          >
            {t(`home.filters.${f}`)}
            <ChevronDown className="size-3.5" />
          </button>
        ))}
        <div className="ml-auto flex items-center gap-1">
          <Button
            variant="outline"
            size="icon-sm"
            className="rounded-full"
            aria-label={t('home.filters.type')}
            disabled
          >
            <SlidersHorizontal />
          </Button>
          <Button
            variant="outline"
            size="icon-sm"
            className="rounded-full"
            aria-label={t('sidebar.search')}
            disabled
          >
            <Search />
          </Button>
        </div>
      </div>

      {drafts.length === 0 ? (
        <div className="mt-6 rounded-xl border border-dashed px-6 py-16 text-center">
          <p className="font-medium">{t('home.empty.title')}</p>
          <p className="mx-auto mt-1.5 max-w-md text-sm text-muted-foreground">
            {t('home.empty.body')}
          </p>
        </div>
      ) : (
        <ul className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {drafts.map((d) => (
            <li
              key={d.id}
              className="flex h-52 flex-col overflow-hidden rounded-xl border bg-card p-4 shadow-xs transition-shadow hover:shadow-float"
            >
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <FileText className="size-3.5" />
                {time.format(d.createdAt)}
              </div>
              <p className="mt-2 line-clamp-6 text-sm leading-relaxed whitespace-pre-wrap text-card-foreground/85">
                {d.text}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
