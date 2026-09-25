import { buildExport } from '@fixnote/core'
import { useTranslation } from '@fixnote/i18n'
import { Button } from '@fixnote/ui'
import { strToU8, zipSync } from 'fflate'
import { Download } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { attachmentSync } from '../../lib/account/account'
import { useDb } from '../../lib/db'
import { usePlatform } from '../../lib/platform'
import { localDate } from '../../lib/queries'
import { ImportSection } from './ImportSection'

export function DataSection() {
  const { t } = useTranslation()
  const { driver, attachments } = useDb()
  const platform = usePlatform()
  const [busy, setBusy] = useState(false)

  const exportNotes = async () => {
    setBusy(true)
    try {
      const files = await buildExport(
        driver,
        {
          inbox: t('common.noFolder'),
          daily: t('home.filters.daily'),
          untitled: t('common.untitled'),
        },
        Date.now(),
        // Images from other devices are downloaded for the export when signed in.
        { load: (id) => attachments.load(id, attachmentSync()) },
      )
      const zip = zipSync(
        Object.fromEntries(files.map((f) => [f.path, f.data ?? strToU8(f.content)])),
        { level: 6 },
      )
      const result = await platform.saveFile(`fixnote-${localDate()}.zip`, zip, 'application/zip')
      if (result === 'saved') toast(t('data.exported'))
    } catch (err) {
      toast(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <h3 className="font-medium">{t('data.export')}</h3>
        <p className="max-w-md text-sm text-muted-foreground">{t('data.exportBody')}</p>
        <Button variant="outline" onClick={exportNotes} disabled={busy}>
          <Download />
          {busy ? t('data.exporting') : t('data.export')}
        </Button>
      </div>
      <ImportSection />
    </div>
  )
}
