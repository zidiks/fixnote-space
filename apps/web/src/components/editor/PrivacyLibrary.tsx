import { maskProtectedReferences, toPlainText } from '@fixnote/core'
import type { SecretCandidate } from '@fixnote/core/privacy/detect'
import { i18n } from '@fixnote/i18n'
import { useEffect } from 'react'
import { toast } from 'sonner'
import { useDb } from '../../lib/db'
import { isPrivacyDismissed, privacyDismissalsEmpty } from '../../lib/privacy'
import { noteWasScanned, requestPrivacyReview } from '../../lib/privacy-review'

export default function PrivacyLibrary() {
  const { driver } = useDb()
  useEffect(() => {
    let active = true
    let worker: Worker | undefined
    let release: (() => void) | undefined
    let timer: ReturnType<typeof setTimeout>
    const run = async () => {
      worker = new Worker(new URL('./privacy.worker.ts', import.meta.url), { type: 'module' })
      let after = ''
      let first: string | undefined
      const analyze = (text: string) =>
        new Promise<SecretCandidate[]>((resolve) => {
          if (!worker || !active) return resolve([])
          release = () => resolve([])
          worker.onmessage = (event: MessageEvent<{ candidates: SecretCandidate[] }>) => {
            release = undefined
            resolve(event.data.candidates)
          }
          worker.onerror = () => {
            active = false
            resolve([])
          }
          worker.postMessage({ id: 0, text })
        })
      // Prime the shared dismissal cache once instead of querying kv per note.
      await privacyDismissalsEmpty(driver)
      while (active) {
        const batch = await driver.query<{ id: string; content: string }>(
          `SELECT n.id, n.content FROM notes n
             LEFT JOIN shared_docs d ON d.shared_id = n.shared_id
            WHERE n.id > ? AND n.deleted_at IS NULL AND coalesce(d.role, 'edit') <> 'view'
            ORDER BY n.id LIMIT 8`,
          [after],
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
            for (const hit of await analyze(sample)) {
              if (
                !(await isPrivacyDismissed(driver, id, hit.kind, sample.slice(hit.from, hit.to)))
              ) {
                found = true
                break
              }
            }
            if (found) {
              first ??= id
              break
            }
          }
        }
        await new Promise((resolve) => setTimeout(resolve, 40))
      }
      if (active && first && !noteWasScanned(first)) {
        const note = first
        toast(i18n.t('privacy.libraryOffer'), {
          id: 'privacy-library',
          action: { label: i18n.t('privacy.open'), onClick: () => requestPrivacyReview(note) },
        })
      }
    }
    timer = setTimeout(
      () =>
        void run()
          .catch(() => undefined)
          .finally(() => worker?.terminate()),
      2800,
    )
    return () => {
      active = false
      clearTimeout(timer)
      release?.()
      worker?.terminate()
    }
  }, [driver])
  return null
}
