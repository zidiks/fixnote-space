import type { AiAction } from '@fixnote/core'
import { useTranslation } from '@fixnote/i18n'
import { Button, cn } from '@fixnote/ui'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Undo2 } from 'lucide-react'
import { toast } from 'sonner'
import { useDb } from '../../lib/db'
import { useInvalidateNotes } from '../../lib/queries'
import { formatRelative } from '../../lib/time'
import { McpSection } from './McpSection'
import { ProviderSection } from './ProviderSection'

const AUDIT_KEY = ['audit'] as const

/** The AI activity log: what the AI and connected apps changed, with Undo. */
function AuditLogList() {
  const { t, i18n } = useTranslation()
  const { audit } = useDb()
  const qc = useQueryClient()
  const invalidate = useInvalidateNotes()
  const actions = useQuery({ queryKey: AUDIT_KEY, queryFn: () => audit.list(200) }).data ?? []

  const undo = async (a: AiAction) => {
    const res = await audit.undo(a.id)
    if (!res.ok) toast(res.reason === 'changed' ? t('audit.changed') : t('audit.undone'))
    await Promise.all([invalidate(), qc.invalidateQueries({ queryKey: AUDIT_KEY })])
  }

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <h3 className="font-medium">{t('audit.title')}</h3>
        <p className="max-w-md text-sm text-muted-foreground">{t('audit.body')}</p>
      </div>
      {actions.length ? (
        <ul className="max-w-xl divide-y rounded-lg border">
          {actions.map((a) => (
            <li key={a.id} className="flex items-center gap-3 px-3 py-2.5">
              <div className="min-w-0 flex-1">
                <p
                  className={cn(
                    'truncate text-sm',
                    a.undoneAt && 'text-muted-foreground line-through',
                  )}
                >
                  {a.summary}
                </p>
                <p className="text-xs text-muted-foreground">
                  {formatRelative(a.createdAt, i18n.resolvedLanguage)} · {a.provider}
                </p>
              </div>
              {a.undoneAt ? (
                <span className="text-xs text-muted-foreground">{t('audit.undone')}</span>
              ) : (
                <Button size="sm" variant="ghost" onClick={() => void undo(a)}>
                  <Undo2 />
                  {t('audit.undo')}
                </Button>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">{t('audit.empty')}</p>
      )}
    </div>
  )
}

export function AiSection() {
  return (
    <div className="space-y-8">
      <ProviderSection />
      <McpSection />
      <AuditLogList />
    </div>
  )
}
