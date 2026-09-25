import { useTranslation } from '@fixnote/i18n'
import { TriangleAlert } from 'lucide-react'
import { useDb } from '../lib/db'

/** Shown only when notes would not survive a reload (second tab, or a browser without OPFS). */
export function StorageBanner() {
  const { t } = useTranslation()
  const { storage } = useDb()
  if (!storage || storage.persistent) return null
  return (
    <div
      role="alert"
      className="flex items-center justify-center gap-2 border-b bg-highlight/60 px-4 py-2 text-[13px]"
    >
      <TriangleAlert className="size-4" />
      {storage.detail === 'locked' ? t('storage.locked') : t('storage.noOpfs')}
    </div>
  )
}
