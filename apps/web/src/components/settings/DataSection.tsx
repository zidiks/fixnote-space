import { buildExport } from '@fixnote/core'
import { useTranslation } from '@fixnote/i18n'
import { Button } from '@fixnote/ui'
import { strToU8, zipSync } from 'fflate'
import { Download } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { useDb } from '../../lib/db'
import { usePlatform } from '../../lib/platform'
import { localDate } from '../../lib/queries'

export function DataSection() {
  const { t } = useTranslation()
  const { driver } = useDb()
  const platform = usePlatform()
  const [busy, setBusy] = useState(false)

  const exportNotes = async () => {
    setBusy(true)
    try {
      const files = await buildExport(driver, {
        inbox: t('sidebar.inbox'),
        daily: t('home.filters.daily'),
        untitled: t('common.untitled'),
      })
      const zip = zipSync(Object.fromEntries(files.map((f) => [f.path, strToU8(f.content)])), {
        level: 6,
      })
      const result = await platform.saveFile(`fixnote-${localDate()}.zip`, zip, 'application/zip')
      if (result === 'saved') toast(t('data.exported'))
    } catch (err) {
      toast(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-3">
      <h3 className="font-medium">{t('data.export')}</h3>
      <p className="max-w-md text-sm text-muted-foreground">{t('data.exportBody')}</p>
      <Button variant="outline" onClick={exportNotes} disabled={busy}>
        <Download />
        {busy ? t('data.exporting') : t('data.export')}
      </Button>
    </div>
  )
}
