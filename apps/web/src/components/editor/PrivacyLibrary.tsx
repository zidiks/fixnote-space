import { maskProtectedReferences, toPlainText } from '@fixnote/core'
import { i18n } from '@fixnote/i18n'
import { useEffect } from 'react'
import { toast } from 'sonner'
import { useDb } from '../../lib/db'
import { kvStore } from '../../lib/kv'
import { isPrivacyDismissed, privacyDismissalsEmpty } from '../../lib/privacy'
import { noteWasScanned, requestPrivacyReview } from '../../lib/privacy-review'
import { scanPrivacyText } from './privacy-worker'

const SCAN_WATERMARK_KEY = 'privacy.libraryScannedAt'

export default function PrivacyLibrary() {
  const { driver } = useDb()
  useEffect(() => {
    let active = true
    const run = async () => {
      if (document.hidden) return
      const kv = kvStore(driver)
      const since = Number((await kv.get(SCAN_WATERMARK_KEY)) ?? '0') || 0
      const startedAt = Date.now()
      let after = ''
      let first: string | undefined
      // Prime the shared dismissal cache once instead of querying kv per note.
      await privacyDismissalsEmpty(driver)
      while (active && !first) {
        if (document.hidden) return
        const batch = await driver.query<{ id: string; content: string }>(
          `SELECT n.id, n.content FROM notes n
             LEFT JOIN shared_docs d ON d.shared_id = n.shared_id
            WHERE n.id > ? AND n.deleted_at IS NULL AND n.updated_at >= ?
              AND coalesce(d.role, 'edit') <> 'view'
            ORDER BY n.id LIMIT 8`,
          [after, since],
        )
        if (!batch.length) break
        for (const { id, content } of batch) {
          after = id
          if (!active) return
          if (noteWasScanned(id)) continue
          // Working in windows keeps large imports from monopolizing worker messages. The
          // precise range is found again by the editor when opening the note.
          for (let start = 0; active && start < content.length; start += 32_768) {
            const sample = toPlainText(
              maskProtectedReferences(content.slice(start, start + 40_960)),
            )
            let found = false
            for (const hit of await scanPrivacyText(sample)) {
              if (
                !(await isPrivacyDismissed(driver, id, hit.kind, sample.slice(hit.from, hit.to)))
              ) {
                found = true
                break
              }
            }
            if (found) {
              first = id
              break
            }
          }
          if (first) break
        }
        if (first) break
        await new Promise((resolve) => setTimeout(resolve, 40))
      }
      if (!active) return
      if (first && !noteWasScanned(first)) {
        const note = first
        toast(i18n.t('privacy.libraryOffer'), {
          id: 'privacy-library',
          action: { label: i18n.t('privacy.open'), onClick: () => requestPrivacyReview(note) },
        })
      } else if (!first) {
        await kv.set(SCAN_WATERMARK_KEY, String(startedAt))
      }
    }
    const timer = setTimeout(() => void run().catch(() => undefined), 4000)
    return () => {
      active = false
      clearTimeout(timer)
    }
  }, [driver])
  return null
}
